import { create } from 'zustand';
import { dbService } from '../services/database/DatabaseService';
import { mockVitals } from './providers/MockVitalsProvider';
import { VitalsData } from './types';

interface VitalsState {
    current: VitalsData;
    baseline: VitalsData | null; // Null means not calibrated
    history: VitalsData[]; // For graphing
    isMonitoring: boolean;
    isCalibrating: boolean;
    isMusicPlaying: boolean;

    // Actions
    start: () => void;
    stop: () => void;
    calibrateBaseline: () => Promise<void>; // 15-30s timer
    getRelativeVitals: () => { hrDiff: number; hrvDiff: number; stressDiff: number } | null;

    // Dev Actions
    setSimulatedHR: (val: number) => void;
    setSimulatedStress: (val: number) => void;
    setSimulationProfile: (profile: 'relaxed' | 'stressed' | 'active' | 'random') => void;
    setMusicState: (isPlaying: boolean) => void;
}


export const useVitalsStore = create<VitalsState>((set, get) => ({
    current: { heartRate: 0, hrv: 0, stressLevel: 0, timestamp: 0 },
    baseline: null,
    history: [],
    isMonitoring: false,
    isCalibrating: false,
    isMusicPlaying: false,

    start: () => {
        if (get().isMonitoring) return;

        set({ isMonitoring: true });
        // Connect to Mock Provider by default for now
        mockVitals.startMonitoring((data: VitalsData) => {
            set((state) => {
                // Log to DB
                dbService.logVital('heart_rate', data.heartRate, 'simulation');
                dbService.logVital('stress_level', data.stressLevel, 'simulation');

                // Keep last 50 points for graph
                const newHistory = [...state.history, data].slice(-50);
                return { current: data, history: newHistory };
            });
        });
    },

    stop: () => {
        mockVitals.stopMonitoring();
        set({ isMonitoring: false, isCalibrating: false });
    },

    calibrateBaseline: async () => {
        const { isMonitoring } = get();
        if (!isMonitoring) get().start();

        set({ isCalibrating: true });
        console.log('[Vitals] Starting Calibration...');

        // Simple calibration: Collect data for 15 seconds (mock)
        // In real app: accumulate array, average it.
        // Here we just wait and take the "current" value at the end as "resting" for simplicity 
        // or average the distinct values pushed to history during this time.

        return new Promise<void>((resolve) => {
            setTimeout(() => {
                const history = get().history;
                // Grab last 10 points or so
                const recent = history.slice(-20);
                if (recent.length > 0) {
                    const avgHR = recent.reduce((sum, v) => sum + v.heartRate, 0) / recent.length;
                    const avgHRV = recent.reduce((sum, v) => sum + v.hrv, 0) / recent.length;
                    const avgStress = recent.reduce((sum, v) => sum + v.stressLevel, 0) / recent.length;

                    set({
                        baseline: {
                            heartRate: Math.round(avgHR),
                            hrv: Math.round(avgHRV),
                            stressLevel: Math.round(avgStress),
                            timestamp: Date.now()
                        },
                        isCalibrating: false
                    });
                    console.log('[Vitals] Calibration Complete:', get().baseline);
                } else {
                    // Fallback if no data
                    set({ isCalibrating: false });
                }
                resolve();
            }, 10000); // 10s calibration for demo speed
        });
    },

    getRelativeVitals: () => {
        const { current, baseline } = get();
        if (!baseline) return null;

        return {
            hrDiff: current.heartRate - baseline.heartRate,
            hrvDiff: current.hrv - baseline.hrv,
            stressDiff: current.stressLevel - baseline.stressLevel // Absolute difference in stress score
        };
    },

    setSimulatedHR: (val) => mockVitals.setHeartRate(val),
    setSimulatedStress: (val) => mockVitals.setStress(val),
    setSimulationProfile: (profile) => mockVitals.setProfile(profile),
    setMusicState: (isPlaying) => {
        set({ isMusicPlaying: isPlaying });
        if (isPlaying) {
            mockVitals.setProfile('relaxed');
        } else {
            // Revert to 'random' or a default state if desired, or keep last
            mockVitals.setProfile('random');
        }
    },
}));
