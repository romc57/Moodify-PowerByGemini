import { GeminiErrors, SpotifyErrors } from '@/services/core/ServiceError';
import { dbService } from '@/services/database';
import { graphService } from '@/services/graph/GraphService';
import { appendToQueue, QueuedTrack, replaceQueue } from '@/services/spotify/QueueManager';
import { spotifyRemote } from '@/services/spotify/SpotifyRemoteService';
import { useErrorStore } from '@/stores/ErrorStore';
import { Alert } from 'react-native';
import { create } from 'zustand';

export interface Track {
    title: string;
    artist: string;
    uri: string;
    artwork?: string;
    duration_ms?: number;
    // Helper fields
    spotifyName?: string;
    reason?: string;
    query?: string;
    origin?: 'api' | 'sync' | 'optimistic';
}

interface PlayerState {
    isPlaying: boolean;
    currentMood: string | null;
    assessedMood: string | null;
    isLoading: boolean;
    isQueueModifying: boolean; // LOCK for queue operations

    // Queue State
    currentTrack: Track | null;
    progressMs: number; // Added for UI sync
    queue: Track[];
    currentIndex: number;

    // Auto-sync
    autoSyncInterval: NodeJS.Timeout | null;

    // Actions
    setMood: (mood: string | null) => void;
    setAssessedMood: (mood: string | null) => void;
    setPlaying: (isPlaying: boolean) => void;
    playTrack: (track: Track) => Promise<void>;
    playList: (tracks: Track[], startIndex: number) => Promise<void>;
    addToQueue: (track: Track) => Promise<void>;
    appendQueue: (tracks: Track[]) => Promise<void>;
    togglePlay: () => Promise<void>;
    pause: () => Promise<void>;
    next: () => Promise<void>;
    prev: () => Promise<void>;

    // State Sync
    commitCurrentVibe: () => Promise<void>;

    // State Sync
    setInternalState: (state: { isPlaying: boolean, track: Track | null, spotifyQueue?: Track[], progressMs?: number }) => void;
    syncFromSpotify: (fetchQueue?: boolean) => Promise<void>;
    startAutoSync: (intervalMs?: number) => void;
    stopAutoSync: () => void;

    // Session History (listenMs = time listened before skip/finish; graph commit only counts listens >= 1 min)
    sessionHistory: { uri: string, title: string, artist: string, status: 'played' | 'skipped', liked: boolean; listenMs?: number }[];
    addToHistory: (item: { uri: string, title: string, artist: string, status: 'played' | 'skipped', liked: boolean; listenMs?: number }) => void;
    lastActionTime: number;
}

/**
 * Error messages for Spotify playback errors
 */
const ERROR_MESSAGES = {
    NO_DEVICE: {
        title: "No Active Device Found",
        message: "Please open the Spotify app on your device and play any song manually to 'wake up' the connection."
    },
    PREMIUM_REQUIRED: {
        title: "Premium Required",
        message: "Spotify requires a Premium account for remote playback control."
    },
    NO_TOKEN: {
        title: "Not Connected",
        message: "Please go to Settings and connect your Spotify account to start listening."
    },
    AUTH_FAILED: {
        title: "Authentication Failed",
        message: "Spotify session expired. Please reconnect in Settings."
    },
    GEMINI_ERROR: {
        title: "AI Error",
        message: "Gemini AI encountered an error. Please try again."
    },
    GEMINI_RATE_LIMITED: {
        title: "AI Busy",
        message: "Gemini AI is currently busy. Please wait a moment."
    },
    NETWORK_ERROR: {
        title: "Network Error",
        message: "Unable to connect. Please check your internet connection."
    }
} as const;

/**
 * Handle Spotify playback errors with appropriate alerts and ErrorStore emission
 */
function handlePlaybackError(error: any, context: string): void {
    console.error(`[PlayerStore] ${context} Error`, error);

    const errorType = error.message as keyof typeof ERROR_MESSAGES;
    const errorInfo = ERROR_MESSAGES[errorType];

    // Emit to ErrorStore for banner display
    switch (errorType) {
        case 'NO_DEVICE':
            useErrorStore.getState().setError(SpotifyErrors.noDevice());
            break;
        case 'PREMIUM_REQUIRED':
            useErrorStore.getState().setError(SpotifyErrors.premiumRequired());
            break;
        case 'NO_TOKEN':
            useErrorStore.getState().setError(SpotifyErrors.notAuthenticated());
            break;
        case 'AUTH_FAILED':
            useErrorStore.getState().setError(SpotifyErrors.authExpired(context));
            break;
        case 'NETWORK_ERROR':
            useErrorStore.getState().setError(SpotifyErrors.networkError(context));
            break;
        case 'GEMINI_ERROR':
            useErrorStore.getState().setError(GeminiErrors.unknown(context));
            break;
        case 'GEMINI_RATE_LIMITED':
            useErrorStore.getState().setError(GeminiErrors.rateLimited(context));
            break;
    }

    if (errorInfo) {
        Alert.alert(errorInfo.title, errorInfo.message, [{ text: "OK" }]);
    }
}

export const usePlayerStore = create<PlayerState>((set, get) => ({
    isPlaying: false,
    currentTrack: null,
    progressMs: 0,
    isLoading: false,
    isQueueModifying: false,
    queue: [],
    currentIndex: 0,
    sessionHistory: [],
    lastActionTime: 0,
    autoSyncInterval: null,

    currentMood: null,
    assessedMood: null,
    setMood: (mood) => set({ currentMood: mood }),
    setAssessedMood: (mood) => set({ assessedMood: mood }),

    addToHistory: (item) => set((state) => ({ sessionHistory: [...state.sessionHistory, item] })),

    setPlaying: (isPlaying) => set({ isPlaying }),

    // Auto-sync methods
    startAutoSync: (intervalMs = 1000) => { // Default to 1s for UI updates
        const existing = get().autoSyncInterval;
        if (existing) {
            clearInterval(existing);
        }

        // 1. Start Polling for Playback State (Position, Play/Pause)
        // This is cheap and can run often for UI
        const interval = setInterval(() => {
            get().syncFromSpotify();
        }, intervalMs);

        set({ autoSyncInterval: interval });
        console.log(`[PlayerStore] UI Sync started (${intervalMs}ms interval)`);

        // 2. Start Remote Polling for Track Changes (Skip/Finish)
        // This handles "backend" logic like recording plays
        const MIN_LISTEN_MS = 60_000;
        spotifyRemote.startPolling(async (type, track) => {
            const listenMs = track.listenMs ?? 0;
            console.log(`[PlayerStore] Track detected as ${type}: ${track.title} (listened ${Math.round(listenMs / 1000)}s)`);

            // Record to DB only when played more than 1 min
            if (listenMs >= MIN_LISTEN_MS) {
                await dbService.recordPlay(
                    track.uri,
                    track.title,
                    track.artist,
                    type === 'skip',
                    { mood: get().currentMood }
                );
            }

            // Record to Session (graph commit only includes songs listened >= 1 min)
            get().addToHistory({
                uri: track.uri,
                title: track.title,
                artist: track.artist,
                status: type === 'finish' ? 'played' : 'skipped',
                liked: false,
                listenMs
            });
        });
    },

    stopAutoSync: () => {
        const interval = get().autoSyncInterval;
        if (interval) {
            clearInterval(interval);
            set({ autoSyncInterval: null });
            console.log('[PlayerStore] Auto-sync stopped');
        }
        spotifyRemote.stopPolling();
    },

    // Sync state from Spotify - the source of truth
    syncFromSpotify: async () => {
        try {
            // Prevent sync race condition (Double Switch Fix)
            const timeSinceLastAction = Date.now() - get().lastActionTime;
            if (timeSinceLastAction < 1500) { // Reduced lockout
                return;
            }

            if (get().isLoading || get().isQueueModifying) {
                return;
            }

            // 1. Get Playback State
            const state = await spotifyRemote.getCurrentState();

            if (state) {
                // Only fetch queue occasionally or if track changed to save bandwidth
                // For now, we fetch it if we have a state

                // 2. Get Real Queue from Spotify
                const queueData = await spotifyRemote.getUserQueue();
                let synchronizedQueue: Track[] = [];

                if (queueData) {
                    // Map Spotify Queue to our Track format
                    synchronizedQueue = queueData.queue.map((item: any) => ({
                        title: item.name,
                        artist: item.artists?.[0]?.name || 'Unknown',
                        uri: item.uri,
                        artwork: item.album?.images?.[0]?.url,
                        duration_ms: item.duration_ms,
                        origin: 'sync'
                    }));
                }

                get().setInternalState({
                    isPlaying: state.is_playing,
                    progressMs: state.progress_ms,
                    track: {
                        title: state.title,
                        artist: state.artist,
                        uri: state.uri,
                        artwork: state.artwork,
                        duration_ms: state.duration_ms
                    },
                    spotifyQueue: synchronizedQueue
                });

                // 3. Queue Health Check (AutoDJ)
                // If queue is low (< 2 songs) and we have a Mood, keep the vibe alive
                if (get().currentMood && synchronizedQueue.length < 2 && !get().isQueueModifying && !get().isLoading) {
                    set({ isQueueModifying: true }); // Lock
                    try {
                        console.log('[PlayerStore] AutoDJ: Queue low. Looking for suggestions...');

                        // A. Try Graph First (Fastest)
                        if (state.title) {
                            const bareTrackId = state.uri?.replace(/^spotify:track:/, '') ?? '';
                            const currentNode = bareTrackId ? await graphService.getEffectiveNode('SONG', state.title, bareTrackId, { artist: state.artist }) : null;
                            if (currentNode) {
                                const nextNode = await graphService.getNextSuggestedNode(currentNode.id);

                                if (nextNode && nextNode.spotify_id) {
                                    console.log(`[PlayerStore] AutoDJ: Graph suggested '${nextNode.name}'`);
                                    const spotifyUri = nextNode.spotify_id.startsWith('spotify:') ? nextNode.spotify_id : `spotify:track:${nextNode.spotify_id}`;
                                    await get().appendQueue([{
                                        title: nextNode.name,
                                        artist: nextNode.data.artist || 'Unknown',
                                        uri: spotifyUri,
                                        origin: 'api'
                                    }]);
                                    set({ isQueueModifying: false });
                                    return;
                                }
                            }
                        }

                        // B. Fallback to Gemini (Slower but creative)
                        // We need a seed track method or just expand current vibe
                        // For now, let's assume we trigger expandVibe
                        // TODO: Implement expandVibe properly with Seed
                        // console.log('[PlayerStore] AutoDJ: Graph empty, triggering Gemini...');

                    } catch (e) {
                        console.error('[PlayerStore] AutoDJ Error', e);
                    } finally {
                        set({ isQueueModifying: false });
                    }
                }
            } else {
                // If no state (paused/inactive), we might still want to know if we are "paused"
                // But usually state is null only if 204 or error.
            }
        } catch (err) {
            // console.warn('[PlayerStore] Sync from Spotify error:', err);
        }
    },

    /** Commit session to graph: only songs listened >= 1 minute count as "visited" for the graph. */
    commitCurrentVibe: async () => {
        const { currentMood, sessionHistory } = get();
        if (!currentMood || sessionHistory.length === 0) return;

        const MIN_LISTEN_MS = 60_000;
        // Extract bare Spotify ID from URI (spotify:track:abc123 → abc123) so it matches ingested node IDs
        const bareId = (uri: string) => uri?.replace(/^spotify:track:/, '') ?? '';
        const songsToCommit = sessionHistory.map(h => ({
            name: h.title,
            artist: h.artist,
            spotifyId: bareId(h.uri),
            visited: (h.listenMs ?? 0) >= MIN_LISTEN_MS
        }));
        const visitedCount = songsToCommit.filter(s => s.visited).length;
        console.log(`[PlayerStore] Committing vibe '${currentMood}': ${sessionHistory.length} songs, ${visitedCount} listened >= 1 min`);

        await graphService.commitSession(currentMood, songsToCommit);

        // Clear history after commit to start fresh for next vibe
        // Note: dbService maintains daily history for exclusions, so we don't lose that context
        set({ sessionHistory: [] });
    },

    /** @param options.commitPreviousVibe - If true (default), commit current session to graph before playing. Set false for rescue/skip-induced vibe changes so session is cached until user picks a new vibe. */
    playVibe: async (tracks: Track[], options?: { commitPreviousVibe?: boolean }) => {
        if (!tracks.length) return;

        const commitPreviousVibe = options?.commitPreviousVibe !== false;
        if (commitPreviousVibe) {
            await get().commitCurrentVibe();
        } else {
            console.log('[PlayerStore] playVibe: skipping graph commit (vibe change not user-chosen; session cached)');
        }

        const { syncFromSpotify, setInternalState } = get();

        set({ isLoading: true, isQueueModifying: true, lastActionTime: Date.now() });

        // Log what we're about to play
        console.log(`[PlayerStore] playVibe called with ${tracks.length} tracks:`);
        tracks.forEach((t, i) => {
            console.log(`  ${i + 1}. "${t.title}" - ${t.artist} [${t.uri}]`);
        });

        try {
            const firstTrack = tracks[0];
            const remainingTracks = tracks.slice(1);

            // 1. Optimistic UI Update
            setInternalState({
                isPlaying: true,
                track: { ...firstTrack, origin: 'optimistic' },
                spotifyQueue: remainingTracks
            });

            // 2. Use QueueManager to properly replace queue
            const queueTracks: QueuedTrack[] = tracks.map(t => ({
                uri: t.uri,
                title: t.title,
                artist: t.artist
            }));

            const result = await replaceQueue(queueTracks);

            if (!result.success) {
                console.error('[PlayerStore] Queue replacement failed:', result.error);
                useErrorStore.getState().setError(SpotifyErrors.unknown(result.error || 'Failed to start vibe.'));
                return;
            }

            // 3. Sync state after queue is established
            setTimeout(() => syncFromSpotify(true), 1500);

        } catch (e: any) {
            console.error('[PlayerStore] playVibe Failed:', e);
            useErrorStore.getState().setError(SpotifyErrors.unknown('Failed to start vibe.'));
        } finally {
            setTimeout(() => set({ isLoading: false, isQueueModifying: false }), 2000);
        }
    },

    playTrack: async (track) => {
        set({ isLoading: true, lastActionTime: Date.now() });
        try {
            // Optimistic Update: Set track immediately so UI reflects choice
            const optimisiticTrack = { ...track, origin: 'optimistic' as const };
            set({ queue: [optimisiticTrack], currentIndex: 0, currentTrack: optimisiticTrack, isPlaying: true });

            // Use Lazy Validation / Self-Healing
            // We need to pass metadata for recovery search
            await spotifyRemote.playOrRecover(track.uri, {
                name: track.title,
                artist: track.artist,
                // We don't have nodeId here easily, but that's fine, it will update by name if needed
            });
        } catch (e: any) {
            handlePlaybackError(e, 'Play');
        } finally {
            set({ isLoading: false });
        }
    },

    playList: async (tracks, startIndex = 0) => {
        set({ isLoading: true, isQueueModifying: true, lastActionTime: Date.now() });

        try {
            const tracksToPlay = tracks.slice(startIndex);
            if (tracksToPlay.length === 0) return;

            const firstTrack = tracksToPlay[0];
            const remainingTracks = tracksToPlay.slice(1);

            // Optimistic UI update
            set({
                queue: remainingTracks,
                currentIndex: 0,
                currentTrack: { ...firstTrack, origin: 'optimistic' as const },
                isPlaying: true
            });

            // Use QueueManager to replace queue properly
            const queueTracks: QueuedTrack[] = tracksToPlay.map(t => ({
                uri: t.uri,
                title: t.title,
                artist: t.artist
            }));

            const result = await replaceQueue(queueTracks);

            if (!result.success) {
                handlePlaybackError(new Error(result.error || 'Queue replacement failed'), 'PlayList');
                return;
            }

            set({ lastActionTime: Date.now() });

            // Sync after queue is established
            setTimeout(() => get().syncFromSpotify(), 1500);

        } catch (e: any) {
            handlePlaybackError(e, 'PlayList');
        } finally {
            setTimeout(() => set({ isLoading: false, isQueueModifying: false }), 2000);
        }
    },

    addToQueue: async (track) => {
        try {
            await spotifyRemote.addToQueue(track.uri);
            set((state) => ({ queue: [...state.queue, track] }));
        } catch (e) {
            console.error('[PlayerStore] AddToQueue Error', e);
        }
    },

    appendQueue: async (tracks: Track[]) => {
        set({ isQueueModifying: true, lastActionTime: Date.now() });

        const { queue } = get();
        const existingUris = new Set(queue.map(t => t.uri));
        const uniqueTracks = tracks.filter(t => !existingUris.has(t.uri));

        if (uniqueTracks.length === 0) {
            set({ isQueueModifying: false });
            return;
        }

        try {
            const queueTracks: QueuedTrack[] = uniqueTracks.map(t => ({
                uri: t.uri,
                title: t.title,
                artist: t.artist
            }));

            const { added, failed } = await appendToQueue(queueTracks);

            if (failed.length > 0) {
                console.warn(`[PlayerStore] ${failed.length} tracks failed to queue`);
            }

            if (added.length > 0) {
                const addedTracks = uniqueTracks.filter(t =>
                    added.some(a => a.uri === t.uri)
                );
                set((state) => ({ queue: [...state.queue, ...addedTracks] }));
                setTimeout(() => get().syncFromSpotify(), 1000);
            }

        } catch (e: any) {
            console.error('[PlayerStore] AppendQueue Error', e);
        } finally {
            set({ isQueueModifying: false });
        }
    },

    togglePlay: async () => {
        set({ isLoading: true, lastActionTime: Date.now() });
        try {
            const { isPlaying } = get();
            console.log(`[PlayerStore] TogglePlay called. isPlaying: ${isPlaying}`);
            if (isPlaying) {
                await spotifyRemote.pause();
            } else {
                await spotifyRemote.play();
            }
        } catch (e: any) {
            // Ignore PREMIUM_REQUIRED errors during toggle if state was mismatched
            if (e.message !== 'PREMIUM_REQUIRED') {
                handlePlaybackError(e, 'TogglePlay');
            } else {
                console.warn('[PlayerStore] TogglePlay ignored PREMIUM_REQUIRED');
            }
        } finally {
            set({ isLoading: false });
        }
    },

    pause: async () => {
        set({ isLoading: true, lastActionTime: Date.now() });
        try {
            await spotifyRemote.pause();
            set({ isPlaying: false });
        } catch (e: any) {
            console.warn('[PlayerStore] Pause failed:', e);
        } finally {
            set({ isLoading: false });
        }
    },

    next: async () => {
        set({ isLoading: true, lastActionTime: Date.now() });
        try {
            await spotifyRemote.next();
        } catch (e: any) {
            handlePlaybackError(e, 'Next');
        } finally {
            set({ isLoading: false });
        }
    },

    prev: async () => {
        set({ isLoading: true, lastActionTime: Date.now() });
        try {
            await spotifyRemote.previous();
        } catch (e: any) {
            handlePlaybackError(e, 'Previous');
        } finally {
            set({ isLoading: false });
        }
    },

    setInternalState: ({ isPlaying, track, spotifyQueue, progressMs }) => {
        if (track) {
            track.origin = 'sync';
        }

        // Only update if provided
        const updates: any = { isPlaying, currentTrack: track };
        if (progressMs !== undefined) updates.progressMs = progressMs;
        if (spotifyQueue) {
            updates.queue = spotifyQueue;
        }

        set(updates);
    }
}));
