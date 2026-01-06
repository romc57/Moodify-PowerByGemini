import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { dbService } from '@/services/database/DatabaseService';
import { useSpotifyAuth } from '@/services/spotify/SpotifyAuthService';
import { useYouTubeAuth } from '@/services/youtube/YouTubeAuthService';
import { useEffect, useState } from 'react';
import { Alert, Button, ScrollView, StyleSheet, TextInput, View } from 'react-native';

export default function SettingsScreen() {
    // Configuration State
    const [geminiKey, setGeminiKey] = useState('');
    const [isGeminiSaving, setIsGeminiSaving] = useState(false);

    // Auth Hooks (Static IDs from code)
    const { request: requestSpotify, promptAsync: promptSpotify } = useSpotifyAuth();
    const { request: requestYouTube, promptAsync: promptYouTube } = useYouTubeAuth();

    useEffect(() => {
        loadSettings();
    }, []);

    const loadSettings = async () => {
        const gKey = await dbService.getSecret('gemini_api_key');
        if (gKey) setGeminiKey(gKey);
    };

    const saveSettings = async () => {
        setIsGeminiSaving(true);
        try {
            if (geminiKey.trim()) {
                await dbService.setSecret('gemini_api_key', geminiKey.trim());
                Alert.alert('Saved', 'Gemini Key saved.');
            }
        } catch (e) {
            Alert.alert('Error', 'Failed to save settings.');
        } finally {
            setIsGeminiSaving(false);
        }
    };

    return (
        <ThemedView style={styles.container}>
            <View style={styles.header}>
                <ThemedText type="title">Settings</ThemedText>
            </View>

            <ScrollView contentContainerStyle={styles.scroll}>

                {/* Credentials Section */}
                <ThemedView style={styles.section}>
                    <ThemedText type="subtitle">AI Configuration</ThemedText>
                    <ThemedText style={styles.description}>
                        Enter your Gemini API Key.
                    </ThemedText>

                    <TextInput
                        style={styles.input}
                        value={geminiKey}
                        onChangeText={setGeminiKey}
                        placeholder="Gemini API Key"
                        placeholderTextColor="#666"
                        secureTextEntry
                    />

                    <Button
                        title={isGeminiSaving ? "Saving..." : "Save API Key"}
                        onPress={saveSettings}
                        disabled={isGeminiSaving}
                    />
                </ThemedView>

                {/* Connections Section */}
                <ThemedView style={styles.section}>
                    <ThemedText type="subtitle">Service Connections</ThemedText>
                    <ThemedText style={styles.description}>
                        Configure Client IDs in .env file.
                    </ThemedText>

                    <View style={styles.connRow}>
                        <Button
                            disabled={!requestSpotify}
                            title="Connect Spotify"
                            onPress={() => promptSpotify()}
                            color="#1DB954"
                        />
                    </View>

                    <View style={styles.connRow}>
                        <Button
                            disabled={!requestYouTube}
                            title="Connect YouTube"
                            onPress={() => promptYouTube()}
                            color="#FF0000"
                        />
                    </View>
                </ThemedView>

            </ScrollView>
        </ThemedView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    header: {
        paddingTop: 60,
        paddingHorizontal: 20,
        paddingBottom: 20,
    },
    scroll: {
        padding: 20,
    },
    section: {
        marginBottom: 30,
        gap: 10,
        backgroundColor: 'rgba(0,0,0,0.03)',
        padding: 15,
        borderRadius: 12
    },
    description: {
        fontSize: 14,
        color: '#888',
        marginBottom: 5,
    },
    input: {
        backgroundColor: 'rgba(255,255,255,0.8)',
        borderRadius: 8,
        padding: 12,
        color: '#000',
        fontSize: 16,
        borderWidth: 1,
        borderColor: '#ccc',
        marginBottom: 10
    },
    connRow: {
        marginBottom: 10
    }
});
