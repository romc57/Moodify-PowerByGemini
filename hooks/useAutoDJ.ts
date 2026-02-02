import { recommendationService } from '@/services/core/RecommendationService';
import { voiceService } from '@/services/core/VoiceService';
import { usePlayerStore } from '@/stores/PlayerStore';
import { useSkipTracker } from '@/stores/SkipTrackerStore';
import { useEffect, useRef } from 'react';
import { Alert } from 'react-native';

export function useAutoDJ() {
    const { consecutiveSkips, consecutiveListens, reset, recordAITrigger, recordExpansionTrigger, currentTrackId, onTrackChange, resetSkipCount, setRescueMode } = useSkipTracker();
    const { appendQueue, currentTrack, sessionHistory, queue } = usePlayerStore();

    // Use Promise-based lock to prevent race conditions with concurrent operations
    const processingLock = useRef<Promise<void> | null>(null);
    const lastProcessedSkipCount = useRef(0);
    const lastProcessedListenCount = useRef(0);
    const lastExpansionTime = useRef(0);
    const lastTrackIdRef = useRef<string | null>(null);

    // Track Change Listener for Skip Tracker & DB Recording
    useEffect(() => {
        if (currentTrack && currentTrack.uri !== lastTrackIdRef.current) {
            lastTrackIdRef.current = currentTrack.uri;
            onTrackChange(currentTrack.uri, currentTrack.title, currentTrack.artist);

            // Record Play in DB (Async)
            recommendationService.recordPlay(currentTrack, false, { source: 'auto_dj' });
        }
    }, [currentTrack]);

    // Reset processing lock when track changes (safety valve)
    useEffect(() => {
        processingLock.current = null;
    }, [currentTrackId]);

    // Rescue Loop (3 Skips)
    useEffect(() => {
        const handleRescue = async () => {
            // Skip if already handled this skip count
            if (consecutiveSkips < 3) return;

            console.log(`[AutoDJ] Rescue Check. Skips: ${consecutiveSkips}, Locked: ${processingLock.current ? 'YES' : 'NO'}`);



            // Double check locking (redundant but safe)
            if (processingLock.current) return;

            // Wait for any existing operation to complete
            if (processingLock.current) {
                console.warn('[AutoDJ] Rescue BLOCKED by existing operation lock.');
                await processingLock.current;
                return;
            }

            console.log(`[AutoDJ] >>> TRIGGERING RESCUE (Skips: ${consecutiveSkips}) <<<`);

            // LOCK: Reset immediately so we don't trigger again while fetching
            setRescueMode(true);
            resetSkipCount();
            lastProcessedSkipCount.current = 0;

            // Lock & Execute
            processingLock.current = (async () => {
                try {
                    // 1. Audio Feedback (Immediate)
                    await voiceService.playMoodAdjustmentIntro();
                    usePlayerStore.getState().setMood("Getting a new vibe...");

                    // Pause playback during fetch to prevent more skips/noise
                    // await usePlayerStore.getState().pause();
                    // UPDATE: User wants music to keep playing until new track is ready

                    // 2. Get Rescue Recommendation (Direct 10 tracks, New Vibe)
                    const result = await recommendationService.getRescueVibe(sessionHistory.slice(-5));

                    if (result && result.items.length > 0) {
                        const tracksToPlay = result.items;
                        const newVibe = result.vibe;
                        const firstTrack = tracksToPlay[0];

                        console.log(`[AutoDJ] Rescued! Vibe: ${newVibe}. Playing ${tracksToPlay.length} tracks. First: ${firstTrack.title}`);

                        // 3. Announce FIRST
                        // We do this before playing so the intro leads into the song
                        try {
                            await voiceService.playSongIntro(firstTrack.title, firstTrack.artist);
                        } catch (e) { console.warn('[AutoDJ] Voice intro failed:', e); }

                        // 4. Play List (Force context reset)
                        await usePlayerStore.getState().playList(tracksToPlay, 0);
                        usePlayerStore.getState().setMood(newVibe);

                        recordAITrigger(result.reasoning);

                        // Reset trackers
                        reset();
                        setRescueMode(false);
                    } else {
                        throw new Error("Rescue returned no items");
                    }
                } catch (e) {
                    console.error('[AutoDJ] Rescue failed', e);
                    setRescueMode(false);
                    resetSkipCount(); // Reset to allow retry
                } finally {
                    processingLock.current = null;
                    setRescueMode(false);
                }
            })();

            await processingLock.current;
        };

        handleRescue();
    }, [consecutiveSkips, sessionHistory]);

    // Expansion Loop (5 Listens / Keep the vibe / End of Queue)
    useEffect(() => {
        const handleExpansion = async () => {
            // TRIGGER CONDITIONS:
            // 1. 5 consecutive successful listens
            // 2. Queue running low (<= 5 tracks left)

            const isLowQueue = queue.length <= 5 && queue.length > 0;
            const isVibeLoop = consecutiveListens >= 5 && consecutiveListens !== lastProcessedListenCount.current;
            const isCooldown = Date.now() - lastExpansionTime.current < 15000;

            if (!(isLowQueue || isVibeLoop) || isCooldown) return;

            if (processingLock.current) {
                await processingLock.current;
                return;
            }

            console.log(`[AutoDJ] Triggering Expansion. Reason: ${isLowQueue ? 'Low Queue' : 'Keep the Vibe'}`);
            lastExpansionTime.current = Date.now();
            if (isVibeLoop) lastProcessedListenCount.current = consecutiveListens;

            processingLock.current = (async () => {
                try {
                    const seed = currentTrack ? { title: currentTrack.title, artist: currentTrack.artist } : { title: 'Unknown', artist: 'Unknown' };
                    const currentMood = usePlayerStore.getState().currentMood;

                    const result = await recommendationService.expandVibe(seed, currentMood || "Vibe");

                    if (result.items.length > 0) {
                        // Filter duplicates against queue & recent history
                        const existingUris = new Set([
                            ...queue.map(q => q.uri),
                            ...sessionHistory.slice(-50).map(h => h.uri),
                            currentTrack?.uri || ''
                        ]);

                        const uniqueTracks = result.items.filter(t => !existingUris.has(t.uri));

                        if (uniqueTracks.length > 0) {
                            console.log(`[AutoDJ] Appending ${uniqueTracks.length} tracks.`);
                            await appendQueue(uniqueTracks);
                            if (isVibeLoop) {
                                recordExpansionTrigger();
                                Alert.alert("Moodify", "Expanded the vibe with 10 more songs!");
                            }
                            if (result.mood) usePlayerStore.getState().setMood(result.mood);
                        }
                    }
                } catch (e) {
                    console.error('[AutoDJ] Expansion failed', e);
                } finally {
                    processingLock.current = null;
                }
            })();

            await processingLock.current;
        };

        handleExpansion();
    }, [consecutiveListens, sessionHistory, currentTrack, queue]);

    return {};
}
