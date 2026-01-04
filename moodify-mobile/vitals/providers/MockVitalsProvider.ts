import { IVitalsProvider, VitalsData, VitalsListener } from './types';

// Singleton mock provider
export class MockVitalsProvider implements IVitalsProvider {
    id = 'mock';
    name = 'Vitals Simulator';

    private currentData: VitalsData = {
        heartRate: 75,
        hrv: 50,
        stressLevel: 20,
        timestamp: Date.now()
    };

    private listener: VitalsListener | null = null;
    private intervalId: NodeJS.Timeout | null = null;

    async isAvailable(): Promise<boolean> {
        return true; // Always available in simulation
    }

    async requestPermissions(): Promise<boolean> {
        return true; // No permissions needed for mock
    }

    async getCurrentVitals(): Promise<VitalsData> {
        return { ...this.currentData, timestamp: Date.now() };
    }

    startMonitoring(listener: VitalsListener): void {
        this.listener = listener;
        console.log('[MockVitals] Monitoring Started');

        // Simulate "Alive" jitter (small fluctuations)
        this.intervalId = setInterval(() => {
            this.frameUpdate();
        }, 2000);
    }

    stopMonitoring(): void {
        if (this.intervalId) clearInterval(this.intervalId);
        this.listener = null;
    }

    // --- Simulation Controls (Dev Tools) ---

    public setHeartRate(bpm: number) {
        this.currentData.heartRate = bpm;
        // Simple heuristic: High HR often correlates with lower HRV and higher stress (in simulation)
        if (bpm > 100) {
            this.currentData.stressLevel = Math.min(100, this.currentData.stressLevel + 20);
        } else if (bpm < 70) {
            this.currentData.stressLevel = Math.max(0, this.currentData.stressLevel - 10);
        }
        this.emit();
    }

    public setStress(level: number) {
        this.currentData.stressLevel = level;
        this.emit();
    }

    private frameUpdate() {
        // Add small random noise to make the graph look alive
        const noise = Math.floor(Math.random() * 5) - 2; // -2 to +2
        this.currentData.heartRate += noise;

        // Clamp
        if (this.currentData.heartRate < 40) this.currentData.heartRate = 40;
        if (this.currentData.heartRate > 180) this.currentData.heartRate = 180;

        this.emit();
    }

    private emit() {
        if (this.listener) {
            this.listener({ ...this.currentData, timestamp: Date.now() });
        }
    }
}

export const mockVitals = new MockVitalsProvider();
