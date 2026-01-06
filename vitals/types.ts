export interface VitalsData {
    heartRate: number; // bpm
    hrv: number;       // ms
    stressLevel: number; // 1-100
    timestamp: number;
}

export type VitalsListener = (data: VitalsData) => void;

export interface IVitalsProvider {
    id: string; // 'mock', 'healthkit', 'googlefit'
    name: string;

    // Connection
    isAvailable(): Promise<boolean>;
    requestPermissions(): Promise<boolean>;

    // Data
    getCurrentVitals(): Promise<VitalsData>;

    // Real-time
    startMonitoring(listener: VitalsListener): void;
    stopMonitoring(): void;
}
