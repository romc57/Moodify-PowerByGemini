import { THEMES } from '@/constants/theme';
import { dbService } from '@/services/database';
import { gemini } from '@/services/gemini/GeminiService';
import { graphService } from '@/services/graph/GraphService';
import { getRedirectUri, useSpotifyAuth } from '@/services/spotify/SpotifyAuthService';
import { useInitializationStore } from '@/stores/InitializationStore';
import { useSettingsStore } from '@/stores/SettingsStore';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export const SetupScreen = () => {
    const insets = useSafeAreaInsets();
    const { step, setStep, error, setError, setProgress, progress, setStatusMessage, statusMessage } = useInitializationStore();
    const { theme } = useSettingsStore();
    const activeTheme = THEMES[theme] || THEMES.midnight;

    // Use shared Spotify auth hook (single source of truth)
    const { state: authState, login: spotifyLogin } = useSpotifyAuth();

    const [inputValue, setInputValue] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isChecking, setIsChecking] = useState(true);
    const graphIngestionStarted = useRef(false);

    // Load initial preference or check status on mount
    useEffect(() => {
        checkStatus();
    }, []);

    // Single place that runs liked-songs ingestion when step is GRAPH (from checkStatus or root layout init)
    useEffect(() => {
        if (step !== 'GRAPH') {
            graphIngestionStarted.current = false;
            return;
        }
        if (graphIngestionStarted.current) return;
        graphIngestionStarted.current = true;
        startGraphIngestion();
    }, [step]);

    const checkStatus = async () => {
        try {
            // 1. Check Client ID
            const clientId = await dbService.getPreference('spotify_client_id');
            if (!clientId) {
                setStep('CLIENT_ID');
                setIsChecking(false);
                return;
            }

            // 2. Check Auth
            const token = await dbService.getServiceToken('spotify');
            if (!token) {
                setStep('AUTH');
                setIsChecking(false);
                return;
            }

            // 3. Check Gemini
            const geminiKey = await dbService.getPreference('gemini_api_key');
            if (!geminiKey) {
                setStep('GEMINI');
                setIsChecking(false);
                return;
            }

            // 4. Check Graph
            // 4. Check Graph
            const graphIngestedPref = await dbService.getPreference('graph_ingested_liked');
            const isGraphPopulated = await graphService.isGraphPopulated();

            // OPTIMIZATION: If data exists, trust it (and fix pref if missing)
            if (isGraphPopulated) {
                if (graphIngestedPref !== 'true') {
                    console.log('[Setup] Graph populated but pref missing. Auto-healing...');
                    await dbService.setPreference('graph_ingested_liked', 'true');
                }
                // Fall through to READY
            } else {
                // Graph EMPTY. Need ingestion.
                if (graphIngestedPref === 'true') {
                    console.log('[Setup] Graph preference true but DB empty. Re-ingesting...');
                    await dbService.setPreference('graph_ingested_liked', 'false');
                }
                setStep('GRAPH');
                setIsChecking(false);
                return;
            }

            setStep('READY');
        } catch (e) {
            console.error('Setup Check Error', e);
            setError('Failed to check initialization status');
            setIsChecking(false);
        }
    };

    const handleClientIdSubmit = async () => {
        if (!inputValue.trim()) {
            setError('Please enter a valid Client ID');
            return;
        }
        await dbService.setPreference('spotify_client_id', inputValue.trim());
        setInputValue('');
        setError(null);
        checkStatus();
    };

    const handleAuth = async () => {
        setIsLoading(true);
        setError(null);

        try {
            // Check if auth is ready (client ID is set)
            if (!authState.isReady) {
                setError('Please enter your Spotify Client ID first.');
                setStep('CLIENT_ID');
                setIsLoading(false);
                return;
            }

            console.log('[Setup] Starting Spotify Auth with PKCE...');
            console.log('[Setup] Redirect URI:', getRedirectUri());

            // Use the shared auth hook which handles PKCE properly
            const result = await spotifyLogin();

            if (result.success) {
                console.log('[Setup] Auth successful!');
                checkStatus();
            } else if (result.cancelled) {
                console.log('[Setup] Auth cancelled by user');
                setIsLoading(false);
            } else {
                setError(result.error || 'Authentication failed');
                setIsLoading(false);
            }
        } catch (e: any) {
            console.error('[Setup] Auth Error:', e);
            setError(e.message || 'Authentication failed');
            setIsLoading(false);
        }
    };

    const handleGeminiSubmit = async () => {
        setIsLoading(true);
        if (!inputValue.trim()) {
            setError('Please enter a valid API Key');
            setIsLoading(false);
            return;
        }

        const key = inputValue.trim();
        const { valid, error } = await gemini.validateKey(key);

        if (valid) {
            await dbService.setPreference('gemini_api_key', key);
            setInputValue('');
            setError(null);
            checkStatus();
        } else {
            setError(error || 'Invalid API Key');
        }
        setIsLoading(false);
    };

    const startGraphIngestion = async () => {
        setStatusMessage('Connecting to Spotify...');
        setProgress({ current: 0, total: 100 }); // Initial State

        try {
            // Check if we really have a token
            const token = await dbService.getServiceToken('spotify');
            if (!token) {
                setStep('AUTH');
                return;
            }

            setStatusMessage('Starting ingestion...');

            // Ingest songs. The Service is responsible for updating the store progress.
            await graphService.ingestLikedSongs();

            setStatusMessage('Graph ready!');

            setTimeout(() => {
                checkStatus();
            }, 1000);

        } catch (e) {
            console.error('Ingestion Error', e);
            setError('Failed to build graph. Please try again.');
            setStatusMessage('');
        }
    };

    const renderStepContent = () => {
        switch (step) {
            case 'CLIENT_ID':
                return (
                    <View style={styles.content}>
                        <Ionicons name="settings-outline" size={60} color={activeTheme.text} style={styles.icon} />
                        <Text style={[styles.title, { color: activeTheme.text }]}>Welcome to Moodify</Text>
                        <Text style={[styles.subtitle, { color: activeTheme.textMuted }]}>
                            To get started, we need to connect your Spotify account and configure AI services.
                            {"\n\n"}
                            First, please enter your Spotify Client ID.
                        </Text>

                        <TextInput
                            style={[styles.input, {
                                color: activeTheme.text,
                                borderColor: activeTheme.border,
                                backgroundColor: 'rgba(255,255,255,0.05)'
                            }]}
                            placeholder="Client ID"
                            placeholderTextColor={activeTheme.textMuted}
                            value={inputValue}
                            onChangeText={setInputValue}
                            autoCapitalize="none"
                        />

                        <TouchableOpacity
                            style={[styles.button, { backgroundColor: activeTheme.primary }]}
                            onPress={handleClientIdSubmit}
                        >
                            <Text style={[styles.buttonText, { color: activeTheme.background }]}>Next</Text>
                        </TouchableOpacity>

                        <TouchableOpacity onPress={() => Linking.openURL('https://developer.spotify.com/dashboard')}>
                            <Text style={[styles.link, { color: activeTheme.primary }]}>Get a Client ID</Text>
                        </TouchableOpacity>
                    </View>
                );

            case 'AUTH':
                const authLoading = isLoading || authState.isLoading;
                return (
                    <View style={styles.content}>
                        <Ionicons name="musical-notes" size={60} color={activeTheme.spotifyGreen} style={styles.icon} />
                        <Text style={[styles.title, { color: activeTheme.text }]}>Connect Spotify</Text>
                        <Text style={[styles.subtitle, { color: activeTheme.textMuted }]}>
                            Link your account to analyze your taste and generate vibes.
                        </Text>

                        <TouchableOpacity
                            style={[styles.button, { backgroundColor: activeTheme.spotifyGreen }, !authState.isReady && styles.buttonDisabled]}
                            onPress={handleAuth}
                            disabled={authLoading || !authState.isReady}
                        >
                            {authLoading ? (
                                <ActivityIndicator color="#fff" />
                            ) : (
                                <Text style={[styles.buttonText, { color: '#fff' }]}>Connect Spotify</Text>
                            )}
                        </TouchableOpacity>

                        {!authState.isReady && (
                            <Text style={[styles.hint, { color: activeTheme.textMuted }]}>
                                Waiting for Client ID...
                            </Text>
                        )}
                    </View>
                );

            case 'GEMINI':
                return (
                    <View style={styles.content}>
                        <Ionicons name="sparkles" size={60} color={activeTheme.primary} style={styles.icon} />
                        <Text style={[styles.title, { color: activeTheme.text }]}>Power up AI</Text>
                        <Text style={[styles.subtitle, { color: activeTheme.textMuted }]}>
                            Enter your Google Gemini API Key for intelligent music reasoning.
                        </Text>

                        <TextInput
                            style={[styles.input, {
                                color: activeTheme.text,
                                borderColor: activeTheme.border,
                                backgroundColor: 'rgba(255,255,255,0.05)'
                            }]}
                            placeholder="API Key"
                            placeholderTextColor={activeTheme.textMuted}
                            value={inputValue}
                            onChangeText={setInputValue}
                            autoCapitalize="none"
                            secureTextEntry
                        />

                        <TouchableOpacity
                            style={[styles.button, { backgroundColor: activeTheme.primary }]}
                            onPress={handleGeminiSubmit}
                            disabled={isLoading}
                        >
                            {isLoading ? (
                                <ActivityIndicator color={activeTheme.background} />
                            ) : (
                                <Text style={[styles.buttonText, { color: activeTheme.background }]}>Verify & Continue</Text>
                            )}
                        </TouchableOpacity>

                        <TouchableOpacity onPress={() => Linking.openURL('https://aistudio.google.com/app/apikey')}>
                            <Text style={[styles.link, { color: activeTheme.primary }]}>Get an API Key</Text>
                        </TouchableOpacity>
                    </View>
                );

            case 'GRAPH':
                const percentage = progress.total > 0 ? (progress.current / progress.total) * 100 : 0;
                return (
                    <View style={styles.content}>
                        <Ionicons name="analytics" size={60} color={activeTheme.secondary} style={styles.icon} />
                        <Text style={[styles.title, { color: activeTheme.text }]}>Building Graph</Text>
                        <Text style={[styles.subtitle, { color: activeTheme.textMuted }]}>
                            Analyzing your favorites to create your personal music map.
                        </Text>

                        <View style={[styles.progressContainer, { backgroundColor: activeTheme.surface }]}>
                            <View style={[styles.progressBar, { width: `${percentage}%`, backgroundColor: activeTheme.secondary }]} />
                        </View>

                        <Text style={[styles.status, { color: activeTheme.textMuted }]}>
                            {statusMessage}
                            {progress.total > 0 && ` (${progress.current} / ${progress.total})`}
                        </Text>

                        {error && (
                            <TouchableOpacity onPress={startGraphIngestion}>
                                <Text style={[styles.link, { color: activeTheme.error }]}>Retry</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                );

            default:
                return null;
        }
    };

    if (step === 'READY' || isChecking) return null;

    return (
        <View style={[styles.container, { paddingTop: insets.top }]}>
            <LinearGradient
                colors={['rgba(0,0,0,0.8)', 'rgba(0,0,0,0.95)']}
                style={StyleSheet.absoluteFill}
            />
            <BlurView intensity={90} tint="dark" style={StyleSheet.absoluteFill} />

            <View style={styles.inner}>
                {renderStepContent()}
                {error && <Text style={[styles.error, { color: activeTheme.error }]}>{error}</Text>}
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        ...StyleSheet.absoluteFillObject,
        zIndex: 9999,
        justifyContent: 'center',
        alignItems: 'center',
    },
    inner: {
        width: '90%',
        maxWidth: 400,
        alignItems: 'center',
    },
    content: {
        width: '100%',
        alignItems: 'center',
        padding: 20,
    },
    icon: {
        marginBottom: 20,
    },
    title: {
        fontSize: 28,
        fontWeight: 'bold',
        marginBottom: 10,
        textAlign: 'center',
    },
    subtitle: {
        fontSize: 16,
        textAlign: 'center',
        marginBottom: 30,
        lineHeight: 22,
    },
    input: {
        width: '100%',
        height: 50,
        borderWidth: 1,
        borderRadius: 12,
        paddingHorizontal: 15,
        fontSize: 16,
        marginBottom: 20,
    },
    button: {
        width: '100%',
        height: 50,
        borderRadius: 25,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 15,
    },
    buttonText: {
        fontSize: 16,
        fontWeight: '600',
    },
    link: {
        fontSize: 14,
        fontWeight: '500',
        marginTop: 10,
    },
    error: {
        marginTop: 20,
        textAlign: 'center',
    },
    progressContainer: {
        width: '100%',
        height: 6,
        borderRadius: 3,
        overflow: 'hidden',
        marginTop: 20,
        marginBottom: 10,
    },
    progressBar: {
        height: '100%',
        borderRadius: 3,
    },
    status: {
        fontSize: 14,
    },
    buttonDisabled: {
        opacity: 0.5,
    },
    hint: {
        fontSize: 12,
        marginTop: 8,
        textAlign: 'center',
    },
});
