import { create } from 'zustand';
import { mockVitals } from './providers/MockVitalsProvider';
import { VitalsData } from './types';

interface VitalsState {
    current: VitalsData;
    history: VitalsData[]; // For graphing
    isMonitoring: boolean;

    // Actions
    start: () => void;
    stop: () => void;

    // Dev Actions
    setSimulatedHR: (val: number) => void;
    setSimulatedStress: (val: number) => void;
}

export const useVitalsStore = create<VitalsState>((set, get) => ({
    current: { heartRate: 0, hrv: 0, stressLevel: 0, timestamp: 0 },
    history: [],
    isMonitoring: false,

    start: () => {
        if (get().isMonitoring) return;

        set({ isMonitoring: true });
        // Connect to Mock Provider by default for now
        mockVitals.startMonitoring((data) => {
            set((state) => {
                // Keep last 50 points for graph
                const newHistory = [...state.history, data].slice(-50);
                return { current: data, history: newHistory };
            });
        });
    },

    stop: () => {
        mockVitals.stopMonitoring();
        set({ isMonitoring: false });
    },

    setSimulatedHR: (val) => mockVitals.setHeartRate(val),
    setSimulatedStress: (val) => mockVitals.setStress(val),
}));
