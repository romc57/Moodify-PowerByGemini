import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';

const BACKGROUND_VITALS_TASK = 'BACKGROUND_VITALS_TASK';

TaskManager.defineTask(BACKGROUND_VITALS_TASK, async () => {
    try {
        console.log('[Background] Checking Vitals...');
        // Note: In a real app, we would read from the hardware here.
        // In this simulation, we check if the store has a "high stress" state.
        // Since Zustand store might be reset in a new context, we rely on persisted storage or assume
        // the OS keeps the memory alive (Android Foreground Service).

        // For demo: Randomly trigger a check
        const now = Date.now(); // Dummy op

        // We can return outcome
        return BackgroundFetch.BackgroundFetchResult.NewData;
    } catch (error) {
        return BackgroundFetch.BackgroundFetchResult.Failed;
    }
});

export class BackgroundService {
    private static instance: BackgroundService;

    private constructor() { }

    static getInstance(): BackgroundService {
        if (!BackgroundService.instance) {
            BackgroundService.instance = new BackgroundService();
        }
        return BackgroundService.instance;
    }

    async init() {
        try {
            await BackgroundFetch.registerTaskAsync(BACKGROUND_VITALS_TASK, {
                minimumInterval: 60 * 15, // 15 minutes
                stopOnTerminate: false,
                startOnBoot: true,
            });
            console.log('[Background] Task registered');
        } catch (err) {
            console.log("Background fetch failed to register", err)
        }
    }
}

export const backgroundService = BackgroundService.getInstance();
