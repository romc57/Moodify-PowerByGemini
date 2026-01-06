import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

// Configure global handler
Notifications.setNotificationHandler({
    handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: false,
        shouldSetBadge: false,
    }),
});

export class NotificationService {
    private static instance: NotificationService;

    private constructor() { }

    static getInstance(): NotificationService {
        if (!NotificationService.instance) {
            NotificationService.instance = new NotificationService();
            NotificationService.instance.init();
        }
        return NotificationService.instance;
    }

    async init() {
        if (Platform.OS === 'android') {
            await Notifications.setNotificationChannelAsync('music_player', {
                name: 'Music Player',
                importance: Notifications.AndroidImportance.LOW, // Silent, persistent
                vibrationPattern: [0, 250, 250, 250],
                lightColor: '#FF231F7C',
            });
            await Notifications.setNotificationChannelAsync('feedback', {
                name: 'Feedback',
                importance: Notifications.AndroidImportance.HIGH,
            });
        }

        // Request permissions
        const { status } = await Notifications.requestPermissionsAsync();
        if (status !== 'granted') {
            console.warn('[Notifications] Permission not granted');
        }
    }

    async showPlayerNotification(trackName: string, artistName: string, isPlaying: boolean) {
        // On Android, we can try to mimic a persistent player notification
        // Note: Real "Media Style" notifications require native code (expo-av or custom dev client)
        // Here we use standard notifications with actions.

        /* 
           Limitations:
           - Expo Go: Actions might close the notification shade.
           - We can't update the SAME notification ID repeatedly and smoothly without flickering on some devices,
             but we will try with a fixed ID.
        */
        const identifier = 'moodify-player';

        await Notifications.scheduleNotificationAsync({
            identifier,
            content: {
                title: trackName,
                body: `${artistName} • Moodify`,
                sticky: true, // Android specific: persistent
                autoDismiss: false,
                categoryIdentifier: 'player', // define category with actions
                data: { type: 'player_controls' }
            },
            trigger: null, // show immediately
        });
    }

    async showFeedbackNotification(trackName: string) {
        await Notifications.scheduleNotificationAsync({
            content: {
                title: "How was that?",
                body: `Rate "${trackName}" to improve recommendations.`,
                categoryIdentifier: 'feedback',
                data: { trackName, type: 'feedback_prompt' }
            },
            trigger: null,
        });
    }

    async registerCategories() {
        await Notifications.setNotificationCategoryAsync('player', [
            { identifier: 'prev', buttonTitle: 'Prev', options: { isDestructive: false } },
            { identifier: 'play_pause', buttonTitle: 'Play/Pause', options: { isDestructive: false } },
            { identifier: 'next', buttonTitle: 'Next', options: { isDestructive: false } },
            { identifier: 'feedback', buttonTitle: '❤️ / 👎', options: { isDestructive: false } },
        ]);

        await Notifications.setNotificationCategoryAsync('feedback', [
            { identifier: 'good', buttonTitle: 'Good Vibes', options: { isDestructive: false } },
            { identifier: 'bad', buttonTitle: 'Not for me', options: { isDestructive: true } },
        ]);
    }
}

export const notificationService = NotificationService.getInstance();
