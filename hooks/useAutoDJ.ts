import { recommendationService } from '@/services/core/RecommendationService';
import { voiceService } from '@/services/core/VoiceService';
import { usePlayerStore } from '@/stores/PlayerStore';
import { useSkipTracker } from '@/stores/SkipTrackerStore';
import { createAsyncLock } from '@/utils/AsyncLock';
import { useEffect, useRef } from 'react';
import { Alert } from 'react-native';

const EXPANSION_COOLDOWN_MS = 15_000;
const LOW_QUEUE_THRESHOLD = 5;
const RESCUE_SKIP_THRESHOLD = 3;
const VIBE_LOOP_LISTEN_THRESHOLD = 5;

export function useAutoDJ() {
    const { consecutiveSkips, consecutiveListens, reset, recordAITrigger, recordExpansionTrigger, currentTrackId, onTrackChange, resetSkipCount, setRescueMode } = useSkipTracker();
    const { appendQueue, currentTrack, sessionHistory, queue } = usePlayerStore();

    const lock = useRef(createAsyncLock());
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
        lock.current.reset();
    }, [currentTrackId]);

    // Rescue Loop (3 Skips)
    useEffect(() => {
        if (consecutiveSkips < RESCUE_SKIP_THRESHOLD) return;

        console.log(`[AutoDJ] Rescue Check. Skips: ${consecutiveSkips}, Locked: ${lock.current.isLocked ? 'YES' : 'NO'}`);

        if (lock.current.isLocked) {
            console.warn('[AutoDJ] Rescue BLOCKED by existing operation lock.');
            return;
        }

        console.log(`[AutoDJ] >>> TRIGGERING RESCUE (Skips: ${consecutiveSkips}) <<<`);

        // LOCK: Reset immediately so we don't trigger again while fetching
        setRescueMode(true);
        resetSkipCount();

        lock.current.acquire(async () => {
            try {
                // 1. Audio Feedback (Immediate)
                await voiceService.playMoodAdjustmentIntro(false, true);
                usePlayerStore.getState().setMood("Getting a new vibe...");

                // 2. Get Rescue Recommendation (Direct 10 tracks, New Vibe)
                const result = await recommendationService.getRescueVibe(sessionHistory.slice(-5));

                if (result && result.items.length > 0) {
                    const tracksToPlay = result.items;
                    const newVibe = result.vibe;
                    const firstTrack = tracksToPlay[0];

                    console.log(`[AutoDJ] Rescued! Vibe: ${newVibe}. Playing ${tracksToPlay.length} tracks. First: ${firstTrack.title}`);

                    // 3. Announce FIRST
                    try {
                        await voiceService.playSongIntro(firstTrack.title, firstTrack.artist, true, false);
                    } catch (e) { console.warn('[AutoDJ] Voice intro failed:', e); }

                    // 4. Play Vibe (Replaces Context completely). Do not commit to graph.
                    await usePlayerStore.getState().playVibe(tracksToPlay, { commitPreviousVibe: false });
                    usePlayerStore.getState().setMood(newVibe);

                    recordAITrigger(result.reasoning);
                    reset();
                } else {
                    throw new Error("Rescue returned no items");
                }
            } catch (e) {
                console.error('[AutoDJ] Rescue failed', e);
                resetSkipCount();
            } finally {
                setRescueMode(false);
            }
        });
    }, [consecutiveSkips, sessionHistory]);

    // Expansion Loop (5 Listens / Keep the vibe / End of Queue)
    useEffect(() => {
        const isLowQueue = queue.length <= LOW_QUEUE_THRESHOLD && queue.length > 0;
        const isVibeLoop = consecutiveListens >= VIBE_LOOP_LISTEN_THRESHOLD && consecutiveListens !== lastProcessedListenCount.current;
        const isCooldown = Date.now() - lastExpansionTime.current < EXPANSION_COOLDOWN_MS;

        if (!(isLowQueue || isVibeLoop) || isCooldown) return;

        if (lock.current.isLocked) {
            lock.current.wait();
            return;
        }

        console.log(`[AutoDJ] Triggering Expansion. Reason: ${isLowQueue ? 'Low Queue' : 'Keep the Vibe'}`);
        lastExpansionTime.current = Date.now();
        if (isVibeLoop) lastProcessedListenCount.current = consecutiveListens;

        lock.current.acquire(async () => {
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
            }
        });
    }, [consecutiveListens, sessionHistory, currentTrack, queue]);

    return {};
}
