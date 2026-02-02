import { spotifyRemote } from '@/services/spotify/SpotifyRemoteService';
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
    queue: Track[];
    currentIndex: number;

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
    setInternalState: (state: { isPlaying: boolean, track: Track | null, spotifyQueue?: Track[] }) => void;
    syncFromSpotify: (fetchQueue?: boolean) => Promise<void>;

    // Session History
    sessionHistory: { uri: string, title: string, status: 'played' | 'skipped', liked: boolean }[];
    addToHistory: (item: { uri: string, title: string, status: 'played' | 'skipped', liked: boolean }) => void;
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
    }
} as const;

/**
 * Handle Spotify playback errors with appropriate alerts
 */
function handlePlaybackError(error: any, context: string): void {
    console.error(`[PlayerStore] ${context} Error`, error);

    const errorType = error.message as keyof typeof ERROR_MESSAGES;
    const errorInfo = ERROR_MESSAGES[errorType];

    if (errorInfo) {
        Alert.alert(errorInfo.title, errorInfo.message, [{ text: "OK" }]);
    }
}

export const usePlayerStore = create<PlayerState>((set, get) => ({
    isPlaying: false,
    currentTrack: null,
    isLoading: false,
    isQueueModifying: false,
    queue: [],
    currentIndex: 0,
    sessionHistory: [],
    lastActionTime: 0,

    currentMood: null,
    assessedMood: null,
    setMood: (mood) => set({ currentMood: mood }),
    setAssessedMood: (mood) => set({ assessedMood: mood }),

    addToHistory: (item) => set((state) => ({ sessionHistory: [...state.sessionHistory, item] })),

    setPlaying: (isPlaying) => set({ isPlaying }),

    // Sync state from Spotify - the source of truth
    syncFromSpotify: async () => {
        try {
            // Prevent sync race condition (Double Switch Fix)
            const timeSinceLastAction = Date.now() - get().lastActionTime;
            if (timeSinceLastAction < 5000) { // Increased to 5s to be safe
                return;
            }

            if (get().isLoading || get().isQueueModifying) {
                return;
            }

            // 1. Get Playback State
            const state = await spotifyRemote.getCurrentState();
            if (state) {
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
                    track: state,
                    spotifyQueue: synchronizedQueue // Pass this to update the store queue
                });
            }
        } catch (err) {
            console.warn('[PlayerStore] Sync from Spotify error:', err);
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

            // Optimistic Update: Set current track immediately
            set({
                queue: remainingTracks, // Queue is what's NEXT (not including current)
                currentIndex: 0,
                currentTrack: { ...firstTrack, origin: 'optimistic' as const },
                isPlaying: true
            });

            // STEP 1: Play ONLY the first track (clears Spotify's context)
            await spotifyRemote.play([firstTrack.uri]);

            // STEP 2: Add remaining tracks to Spotify's queue one by one
            // This ensures our tracks are next, not Spotify's old queue
            if (remainingTracks.length > 0) {
                console.log(`[PlayerStore] Adding ${remainingTracks.length} tracks to queue...`);
                for (const track of remainingTracks) {
                    try {
                        await spotifyRemote.addToQueue(track.uri);
                        await new Promise(r => setTimeout(r, 150)); // Rate limit
                    } catch (e) {
                        console.warn(`[PlayerStore] Failed to queue ${track.title}`);
                    }
                }
            }

            // Update last action time to prevent immediate sync overwriting our optimistic queue
            set({ lastActionTime: Date.now() });

            // Sync queue from Spotify after all tracks are added
            setTimeout(() => {
                get().syncFromSpotify();
            }, 1000);
        } catch (e: any) {
            handlePlaybackError(e, 'PlayList');
        } finally {
            // Keep the lock for a bit longer to let Spotify ensure it processed everything
            setTimeout(() => {
                set({ isLoading: false, isQueueModifying: false });
            }, 2000);
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
        set({ isQueueModifying: true });
        const { queue } = get();
        const existingUris = new Set(queue.map(t => t.uri));
        const uniqueTracks = tracks.filter(t => !existingUris.has(t.uri));

        if (uniqueTracks.length === 0) return;

        const successes: Track[] = [];

        try {
            for (const track of uniqueTracks) {
                try {
                    await spotifyRemote.addToQueue(track.uri);
                    successes.push(track);
                    await new Promise(r => setTimeout(r, 200)); // Rate limit 200ms
                } catch (e: any) {
                    console.warn(`[PlayerStore] Failed to queue ${track.title}:`, e.message);
                }
            }

            // Update last action time to prevent immediate sync
            set({ lastActionTime: Date.now() });

            if (successes.length > 0) {
                // Optimistic update first
                set((state) => ({ queue: [...state.queue, ...successes] }));

                // Then sync from Spotify to get accurate queue
                setTimeout(() => {
                    get().syncFromSpotify();
                }, 1000);
            }
        } catch (e: any) {
            console.error('[PlayerStore] AppendQueue Global Error', e);
        } finally {
            set({ isQueueModifying: false });
        }
    },

    togglePlay: async () => {
        set({ isLoading: true, lastActionTime: Date.now() });
        try {
            const { isPlaying } = get();
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

    setInternalState: ({ isPlaying, track, spotifyQueue }) => {
        if (track) {
            track.origin = 'sync';
        }

        // Only update if provided
        const updates: any = { isPlaying, currentTrack: track };
        if (spotifyQueue) {
            updates.queue = spotifyQueue;
        }

        set(updates);
    }
}));
