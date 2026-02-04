import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

/**
 * OAuth Callback Screen
 * Handles OAuth redirects on web platform.
 * On native (Android/iOS), WebBrowser.openAuthSessionAsync handles callbacks automatically.
 */
export default function CallbackScreen() {
    const router = useRouter();

    useEffect(() => {
        // Attempt to complete the auth session (web only)
        const result = WebBrowser.maybeCompleteAuthSession();

        if (result.type !== 'success') {
            // If not handled by auth session, redirect to settings
            // This happens when the callback page is opened directly
            const timer = setTimeout(() => {
                router.replace('/(tabs)/settings');
            }, 500);
            return () => clearTimeout(timer);
        }
    }, [router]);

    return (
        <View style={styles.container}>
            <ActivityIndicator size="large" color="#1DB954" />
            <Text style={styles.text}>Completing login...</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#121212',
        gap: 16,
    },
    text: {
        color: '#fff',
        fontSize: 16,
    },
});
