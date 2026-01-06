import { IVitalsProvider, VitalsData, VitalsListener } from '../types';

export type SimulationProfile = 'relaxed' | 'stressed' | 'active' | 'random';

export class MockVitalsProvider implements IVitalsProvider {
    id = 'mock';
    name = 'Vitals Simulator';

    private currentData: VitalsData = {
        heartRate: 75,
        hrv: 50,
        stressLevel: 20,
        timestamp: Date.now()
    };

    private profile: SimulationProfile = 'random';
    private listener: VitalsListener | null = null;
    private intervalId: any = null;

    async isAvailable(): Promise<boolean> { return true; }
    async requestPermissions(): Promise<boolean> { return true; }
    async getCurrentVitals(): Promise<VitalsData> { return { ...this.currentData, timestamp: Date.now() }; }

    setProfile(profile: SimulationProfile) {
        this.profile = profile;
        console.log(`[MockVitals] Profile set to: ${profile}`);
        // Reset base values based on profile
        switch (profile) {
            case 'relaxed':
                this.currentData = { ...this.currentData, heartRate: 65, stressLevel: 10, hrv: 70 };
                break;
            case 'stressed':
                this.currentData = { ...this.currentData, heartRate: 95, stressLevel: 80, hrv: 20 };
                break;
            case 'active':
                this.currentData = { ...this.currentData, heartRate: 130, stressLevel: 50, hrv: 40 };
                break;
        }
        this.emit();
    }

    startMonitoring(listener: VitalsListener): void {
        this.listener = listener;
        this.intervalId = setInterval(() => this.frameUpdate(), 2000) as any;
    }

    stopMonitoring(): void {
        if (this.intervalId) clearInterval(this.intervalId);
        this.listener = null;
    }

    public setHeartRate(bpm: number) {
        this.currentData.heartRate = bpm;
        this.emit();
    }

    public setStress(level: number) {
        this.currentData.stressLevel = level;
        this.emit();
    }

    private frameUpdate() {
        let noise = Math.floor(Math.random() * 5) - 2;

        // Bias based on profile
        if (this.profile === 'relaxed' && this.currentData.heartRate > 70) noise = -1;
        if (this.profile === 'stressed' && this.currentData.stressLevel < 70) this.currentData.stressLevel += 2;

        this.currentData.heartRate += noise;
        this.currentData.heartRate = Math.max(40, Math.min(180, this.currentData.heartRate));

        this.emit();
    }

    private emit() {
        if (this.listener) {
            this.listener({ ...this.currentData, timestamp: Date.now() });
        }
    }
}

export const mockVitals = new MockVitalsProvider();
