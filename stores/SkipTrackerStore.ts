import { dbService } from '@/services/database/DatabaseService';
import { create } from 'zustand';

interface SkipEvent {
    trackId: string;
    trackName: string;
    artist: string;
    listenDuration: number; // seconds
    timestamp: number;
    wasSkipped: boolean; // true if < 60 seconds
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
        const wasSkipped = duration < 30; // Changed to 30s as per requirement

        // Log to Database
        dbService.addHistoryItem(
            currentTrackId,
            currentTrackName || 'Unknown',
            currentArtist || 'Unknown',
            wasSkipped,
            { duration }
        );

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
        return consecutiveSkips >= 3;
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

        set({
            aiHistory: {
                triggerCount: newTriggerCount,
                lastTriggerTime: Date.now(),
                lastPickedTrack: pickedTrack,
                strategy: newTriggerCount === 1 ? 'exploratory' : newTriggerCount > 1 ? 'refined' : 'conservative'
            },
            consecutiveSkips: 0,
            consecutiveListens: 0
        });
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
            aiHistory: {
                triggerCount: 0,
                lastTriggerTime: 0,
                lastPickedTrack: null,
                strategy: 'conservative'
            }
        });
    }
}));
