import { create } from 'zustand';

interface AIActivityState {
    isActive: boolean;
    label: string;
    startTime: number;
    setActive: (label: string) => void;
    setIdle: () => void;
}

export const useAIActivityStore = create<AIActivityState>((set) => ({
    isActive: false,
    label: '',
    startTime: 0,
    setActive: (label: string) => set({ isActive: true, label, startTime: Date.now() }),
    setIdle: () => set({ isActive: false, label: '', startTime: 0 }),
}));
