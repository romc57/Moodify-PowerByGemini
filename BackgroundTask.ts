import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
import { spotifyRemote } from './services/spotify/SpotifyRemoteService';

const BACKGROUND_TASK_NAME = 'BACKGROUND_MOODIFY_SYNC';

// Define the background task
TaskManager.defineTask(BACKGROUND_TASK_NAME, async () => {
    try {
        console.log('[Background] Syncing Spotify State...');

        const currentState = await spotifyRemote.getCurrentState();

        if (currentState) {
            // State synced successfully
            console.log('[Background] Spotify state synced');
        }

        return BackgroundTask.BackgroundTaskResult.Success;
    } catch (err) {
        console.error('[Background] Sync Failed', err);
        return BackgroundTask.BackgroundTaskResult.Failed;
    }
});

// Register the background task
export async function registerBackgroundTask() {
    try {
        const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_TASK_NAME);

        if (!isRegistered) {
            await BackgroundTask.registerTaskAsync(BACKGROUND_TASK_NAME, {
                minimumInterval: 60 * 15, // 15 minutes minimum
            });
            console.log('[Background] Task registered');
        }
    } catch (err: any) {
        // Silently handle errors in development
        if (__DEV__) {
            console.log('[Background] Skipping registration in dev mode:', err?.message || err);
        } else {
            console.warn('[Background] Register failed', err);
        }
    }
}

// Unregister task if needed
export async function unregisterBackgroundTask() {
    try {
        await BackgroundTask.unregisterTaskAsync(BACKGROUND_TASK_NAME);
        console.log('[Background] Task unregistered');
    } catch (err) {
        console.warn('[Background] Unregister failed', err);
    }
}
