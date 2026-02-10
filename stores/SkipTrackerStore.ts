import { dbService } from '@/services/database';
import { graphService } from '@/services/graph/GraphService';
import { create } from 'zustand';

/** Listening duration below this (seconds) counts as a "skip" */
const SKIP_THRESHOLD_SECONDS = 30;
/** Number of consecutive skips to trigger AI rescue */
const RESCUE_SKIP_THRESHOLD = 3;

interface SkipEvent {
    trackId: string;
    trackName: string;
    artist: string;
    listenDuration: number; // seconds
    timestamp: number;
    wasSkipped: boolean; // true if < 30 seconds
}

interface AITriggerHistory {
    triggerCount: number;
    lastTriggerTime: number;
    lastPickedTrack: string | null;
    strategy: 'conservative' | 'exploratory' | 'refined';
}

interface SkipTrackerState {
    // Current track monitoring
    currentTrackId: string | null;
    currentTrackName: string | null;
    currentArtist: string | null;
    listeningStartTime: number | null;

    // Skip tracking
    recentSkips: SkipEvent[];
    consecutiveSkips: number;
    consecutiveListens: number;

    // AI trigger history
    aiHistory: AITriggerHistory;

    // Locking
    isRescueMode: boolean;

    // Actions
    onTrackStart: (trackId: string, trackName: string, artist: string) => void;
    onTrackChange: (newTrackId: string, newTrackName: string, newArtist: string) => void;
    shouldTriggerAI: () => boolean;
    getAIStrategy: () => 'conservative' | 'exploratory' | 'refined';
    recordAITrigger: (pickedTrack: string) => void;
    recordExpansionTrigger: () => void;
    resetSkipCount: () => void;
    setRescueMode: (isLocked: boolean) => void;
    reset: () => void;
}

export const useSkipTracker = create<SkipTrackerState>((set, get) => ({
    currentTrackId: null,
    currentTrackName: null,
    currentArtist: null,
    listeningStartTime: null,
    recentSkips: [],
    consecutiveSkips: 0,
    consecutiveListens: 0,
    aiHistory: {
        triggerCount: 0,
        lastTriggerTime: 0,
        lastPickedTrack: null,
        strategy: 'conservative'
    },
    isRescueMode: false,

    onTrackStart: (trackId, trackName, artist) => {
        set({
            currentTrackId: trackId,
            currentTrackName: trackName,
            currentArtist: artist,
            listeningStartTime: Date.now()
        });
    },

    onTrackChange: (newTrackId, newTrackName, newArtist) => {
        const state = get();
        const { currentTrackId, currentTrackName, currentArtist, listeningStartTime } = state;

        if (!currentTrackId || !listeningStartTime) {
            // First track or invalid state
            get().onTrackStart(newTrackId, newTrackName, newArtist);
            return;
        }

        // LOCK CHECK: If in rescue mode, ignore skips
        if (state.isRescueMode) {
            console.log('[SkipTracker] Ignoring track change during Rescue Mode');
            get().onTrackStart(newTrackId, newTrackName, newArtist);
            return;
        }

        // Calculate listening duration
        const duration = (Date.now() - listeningStartTime) / 1000;
        const wasSkipped = duration < SKIP_THRESHOLD_SECONDS;

        // Log to Database
        dbService.addHistoryItem(
            currentTrackId,
            currentTrackName || 'Unknown',
            currentArtist || 'Unknown',
            wasSkipped,
            { duration }
        );

        // Update Graph (Real-time Learning)
        if (!wasSkipped && currentTrackName) {
            // we fire and forget to not block UI
            graphService.getEffectiveNode('SONG', currentTrackName, currentTrackId, { artist: currentArtist })
                .then(node => {
                    if (node) {
                        graphService.recordPlay(node.id);
                    }
                })
                .catch(e => console.error('[SkipTracker] Graph update failed', e));
        }

        // Record the event
        const skipEvent: SkipEvent = {
            trackId: currentTrackId,
            trackName: currentTrackName || 'Unknown',
            artist: currentArtist || 'Unknown',
            listenDuration: duration,
            timestamp: Date.now(),
            wasSkipped
        };

        // Update recent skips (keep last 10)
        const updatedSkips = [...state.recentSkips, skipEvent].slice(-10);

        let consecutiveSkips = 0;
        let consecutiveListens = 0;

        if (wasSkipped) {
            consecutiveSkips = state.consecutiveSkips + 1;
            consecutiveListens = 0;
        } else {
            consecutiveSkips = 0;
            consecutiveListens = state.consecutiveListens + 1;
        }

        set({
            recentSkips: updatedSkips,
            consecutiveSkips,
            consecutiveListens
        });

        // Start tracking new track
        get().onTrackStart(newTrackId, newTrackName, newArtist);
    },

    shouldTriggerAI: () => {
        const { consecutiveSkips } = get();
        return consecutiveSkips >= RESCUE_SKIP_THRESHOLD;
    },

    shouldExpandVibe: () => {
        const { consecutiveListens } = get();
        return consecutiveListens >= 5;
    },

    getAIStrategy: () => {
        const { aiHistory } = get();
        const { triggerCount } = aiHistory;

        if (triggerCount === 0) {
            return 'conservative'; // 1st trigger: safe, close to their style
        } else if (triggerCount === 1) {
            return 'exploratory'; // 2nd trigger: shoot in the air, try something different
        } else {
            return 'refined'; // 3rd+ trigger: center in based on their reactions
        }
    },

    recordAITrigger: (pickedTrack) => {
        const { aiHistory } = get();
        const newTriggerCount = aiHistory.triggerCount + 1;

        // Update triggerCount first, then derive strategy from getAIStrategy()
        // to ensure consistent strategy computation in one place
        set({
            aiHistory: {
                ...aiHistory,
                triggerCount: newTriggerCount,
                lastTriggerTime: Date.now(),
                lastPickedTrack: pickedTrack,
            },
            consecutiveSkips: 0,
            consecutiveListens: 0
        });

        // Derive strategy after state update so getAIStrategy() sees the new triggerCount
        const strategy = get().getAIStrategy();
        set(state => ({
            aiHistory: { ...state.aiHistory, strategy }
        }));
    },

    recordExpansionTrigger: () => {
        set({ consecutiveListens: 0 });
    },

    resetSkipCount: () => {
        set({ consecutiveSkips: 0 });
    },

    setRescueMode: (isLocked: boolean) => {
        set({ isRescueMode: isLocked });
    },

    reset: () => {
        set({
            currentTrackId: null,
            currentTrackName: null,
            currentArtist: null,
            listeningStartTime: null,
            recentSkips: [],
            consecutiveSkips: 0,
            consecutiveListens: 0,
            isRescueMode: false,
            aiHistory: {
                triggerCount: 0,
                lastTriggerTime: 0,
                lastPickedTrack: null,
                strategy: 'conservative'
            }
        });
    }
}));
