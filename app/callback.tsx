import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect } from 'react';
import { Text, View } from 'react-native';

/**
 * OAuth callback route for web platform.
 * This handles the Spotify OAuth redirect on web.
 * It attempts to close the popup and pass the auth result back to the main window.
 */
export default function CallbackScreen() {
    const router = useRouter();

    useEffect(() => {
        // Build the current URL to pass to maybeCompleteAuthSession
        if (typeof window !== 'undefined') {
            const currentUrl = window.location.href;

            // This will close the popup and resolve the promptAsync promise in the parent window
            const handled = WebBrowser.maybeCompleteAuthSession({
                skipRedirectCheck: true, // We know this is a redirect
            });

            if (handled.type !== 'success') {
                // If not handled (e.g. opened directly), redirect to settings
                router.replace('/(tabs)/settings');
            }
        } else {
            // Native platform:
            // This screen is reached via deep link (moodifymobile://callback).
            // The expo-auth-session in SettingsScreen should allow the promptAsync promise to resolve.
            // We just need to redirect back to the app UI.
            const timer = setTimeout(() => {
                router.replace('/(tabs)/settings');
            }, 1000);
            return () => clearTimeout(timer);
        }
    }, []);

    return (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <Text>Completing login...</Text>
        </View>
    );
}
