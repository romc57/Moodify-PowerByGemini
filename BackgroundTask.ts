import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';
import { spotifyRemote } from './services/spotify/SpotifyRemoteService';

const BACKGROUND_TASK_NAME = 'BACKGROUND_MOODIFY_SYNC';

// 1. Define the task
TaskManager.defineTask(BACKGROUND_TASK_NAME, async () => {
    try {
        console.log('[Background] Syncing Spotify State...');

        // Perform a sync
        const currentState = await spotifyRemote.getCurrentState();

        if (currentState) {
            // We can manually trigger logic check here if needed, 
            // but mostly we want to ensure the stores are updated
            // or if we detect a condition, we might trigger a notification

            // Note: State updates in stores might not trigger React effects if component is unmounted,
            // but Zustand stores exist in memory if the JS bundle is alive.
        }

        // Force a polling check? 
        // SpotifyRemoteService polling uses setInterval, which might be paused.
        // We can manually call a "tick" function if we exposed it.

        return BackgroundFetch.BackgroundFetchResult.NewData;
    } catch (err) {
        console.error('[Background] Sync Failed', err);
        return BackgroundFetch.BackgroundFetchResult.Failed;
    }
});

// 2. Register the task
export async function registerBackgroundTask() {
    try {
        const status = await BackgroundFetch.getStatusAsync();

        // Check if background fetch is available
        if (status === BackgroundFetch.BackgroundFetchStatus.Restricted ||
            status === BackgroundFetch.BackgroundFetchStatus.Denied) {
            console.log('[Background] Background fetch not available, status:', status);
            return;
        }

        const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_TASK_NAME);
        if (!isRegistered) {
            await BackgroundFetch.registerTaskAsync(BACKGROUND_TASK_NAME, {
                minimumInterval: 60 * 15, // 15 minutes (OS minimum usually)
                stopOnTerminate: false, // Keep running after app close?
                startOnBoot: true, // Android only
            });
            console.log('[Background] Task registered');
        }
    } catch (err: any) {
        // Silently handle errors in development - background fetch often fails in dev builds
        if (__DEV__) {
            console.log('[Background] Skipping registration in dev mode:', err?.message || err);
        } else {
            console.warn('[Background] Register failed', err);
        }
    }
}
