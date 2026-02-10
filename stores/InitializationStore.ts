import { create } from 'zustand';

export type InitStep = 'CLIENT_ID' | 'AUTH' | 'GEMINI' | 'GRAPH' | 'READY';

interface InitializationState {
    step: InitStep;
    progress: { current: number, total: number };
    statusMessage: string;
    error: string | null;

    setStep: (step: InitStep) => void;
    setProgress: (progress: { current: number, total: number }) => void;
    setStatusMessage: (message: string) => void;
    setError: (error: string | null) => void;
    reset: () => void;
}

export const useInitializationStore = create<InitializationState>((set) => ({
    step: 'CLIENT_ID',
    progress: { current: 0, total: 0 },
    statusMessage: '',
    error: null,

    setStep: (step) => set({ step, error: null }),
    setProgress: (progress) => set({ progress }),
    setStatusMessage: (statusMessage) => set({ statusMessage }),
    setError: (error) => set({ error }),
    reset: () => set({
        step: 'CLIENT_ID',
        progress: { current: 0, total: 0 },
        statusMessage: '',
        error: null
    })
}));
