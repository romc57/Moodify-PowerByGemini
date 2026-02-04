import { GeminiErrors, SpotifyErrors } from '@/services/core/ServiceError';
import { replaceQueue, appendToQueue, QueuedTrack } from '@/services/spotify/QueueManager';
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
    setInternalState: (state: { isPlaying: boolean, track: Track | null, spotifyQueue?: Track[], progressMs?: number }) => void;
    syncFromSpotify: (fetchQueue?: boolean) => Promise<void>;
    startAutoSync: (intervalMs?: number) => void;
    stopAutoSync: () => void;

    // Session History
    sessionHistory: { uri: string, title: string, artist: string, status: 'played' | 'skipped', liked: boolean }[];
    addToHistory: (item: { uri: string, title: string, artist: string, status: 'played' | 'skipped', liked: boolean }) => void;
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
        spotifyRemote.startPolling((type, track) => {
            console.log(`[PlayerStore] Track detected as ${type}: ${track.title}`);
            // TODO: Record play in DB
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
            } else {
                // If no state (paused/inactive), we might still want to know if we are "paused"
                // But usually state is null only if 204 or error.
            }
        } catch (err) {
            // console.warn('[PlayerStore] Sync from Spotify error:', err);
        }
    },

    playVibe: async (tracks: Track[]) => {
        if (!tracks.length) return;
        const { syncFromSpotify, setInternalState } = get();

        set({ isLoading: true, isQueueModifying: true, lastActionTime: Date.now() });

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
            console.error('[PlayerStore] Use Vibe Failed:', e);
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

            await spotifyRemote.play([track.uri]);
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
