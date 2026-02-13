/**
 * Settings Screen - Modern Redesign
 * Features: Gradient background, glassmorphism cards, model selector, theme selector
 */

import { GlassCard } from '@/components/ui/GlassCard';
import { MODERN_THEMES, THEMES, ThemeName } from '@/constants/theme';
import {
  gemini,
  useGeminiStore,
  GEMINI_MODELS,
  MODEL_PRIORITY,
  ModelId,
} from '@/services/gemini/GeminiService';
import { useSpotifyAuth } from '@/services/spotify/SpotifyAuthService';
import { usePlayerStore } from '@/stores/PlayerStore';
import { useSettingsStore } from '@/stores/SettingsStore';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, {
  FadeInDown,
  SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// Modern theme names only
const MODERN_THEME_NAMES: ThemeName[] = ['midnight', 'aurora', 'sunset', 'neon', 'ocean'];

// Theme display info
const THEME_INFO: Record<ThemeName, { icon: keyof typeof Ionicons.glyphMap; description: string }> = {
  midnight: { icon: 'moon', description: 'Deep purple vibes' },
  aurora: { icon: 'sparkles', description: 'Northern lights' },
  sunset: { icon: 'sunny', description: 'Warm gradients' },
  neon: { icon: 'flash', description: 'Cyberpunk pink' },
  ocean: { icon: 'water', description: 'Deep blue waves' },
};

export default function SettingsScreen() {
  const {
    theme,
    setTheme,
    autoTheme,
    setAutoTheme,
    geminiApiKey,
    setGeminiApiKey,
    spotifyClientId,
    setSpotifyClientId,
    loadSettings,
    isLoading,
    isConnected,
    checkConnection,
  } = useSettingsStore();

  const activeTheme = THEMES[theme] || THEMES.midnight;

  // Gemini store
  const { selectedModel, modelStatuses, setSelectedModel } = useGeminiStore();

  const [localGeminiKey, setLocalGeminiKey] = useState('');
  const [localSpotifyClientId, setLocalSpotifyClientId] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isTestingModels, setIsTestingModels] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [saveMessage, setSaveMessage] = useState('');
  const [geminiValid, setGeminiValid] = useState<boolean | null>(null);
  const [spotifyValid, setSpotifyValid] = useState<boolean | null>(null);

  // Spotify auth hook
  const { state: authState, login: spotifyLogin } = useSpotifyAuth();

  // Button animations
  const saveScale = useSharedValue(1);
  const spotifyScale = useSharedValue(1);
  const testScale = useSharedValue(1);

  useEffect(() => {
    loadSettings();
  }, []);

  useEffect(() => {
    if (geminiApiKey) setLocalGeminiKey(geminiApiKey);
  }, [geminiApiKey]);

  useEffect(() => {
    if (spotifyClientId) setLocalSpotifyClientId(spotifyClientId);
  }, [spotifyClientId]);

  useEffect(() => {
    checkConnection();
  }, []);

  useEffect(() => {
    if (saveStatus !== 'idle') {
      const timer = setTimeout(() => {
        setSaveStatus('idle');
        setSaveMessage('');
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [saveStatus]);

  const handleSave = async () => {
    setIsSaving(true);
    setSaveStatus('idle');
    setSaveMessage('');
    setGeminiValid(null);
    setSpotifyValid(null);

    try {
      // Validate Gemini Key if provided
      if (localGeminiKey) {
        console.log('Validating Gemini Key...');
        const validation = await gemini.validateKey(localGeminiKey);

        if (!validation.valid) {
          setGeminiValid(false);
          setSaveStatus('error');
          setSaveMessage(`Gemini API Key invalid: ${validation.error || 'Validation failed'}`);
          setIsSaving(false);
          return;
        }
        setGeminiValid(true);
      }

      // Validate Spotify Client ID format
      if (localSpotifyClientId) {
        const spotifyIdRegex = /^[a-f0-9]{32}$/i;
        if (!spotifyIdRegex.test(localSpotifyClientId)) {
          setSpotifyValid(false);
          setSaveStatus('error');
          setSaveMessage('Spotify Client ID should be 32 hex characters');
          setIsSaving(false);
          return;
        }
        setSpotifyValid(true);
      }

      // Save keys
      await setGeminiApiKey(localGeminiKey);
      await setSpotifyClientId(localSpotifyClientId);

      setSaveStatus('success');
      setSaveMessage('API Keys saved & verified!');
    } catch (e) {
      console.error('Save error:', e);
      setSaveStatus('error');
      setSaveMessage('Failed to save keys. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestModels = async () => {
    if (!localGeminiKey) {
      Alert.alert('No API Key', 'Please enter your Gemini API key first.');
      return;
    }

    setIsTestingModels(true);
    try {
      const results = await gemini.testAllModels(localGeminiKey);
      const working = results.filter((r) => r.available).length;
      Alert.alert('Model Test Complete', `${working}/${results.length} models available`);
    } catch (e) {
      Alert.alert('Error', 'Failed to test models');
    } finally {
      setIsTestingModels(false);
    }
  };

  const handleSelectModel = async (modelId: ModelId) => {
    await gemini.setModel(modelId);
    setSelectedModel(modelId);
  };

  const handleThemeSelect = (t: ThemeName) => {
    setTheme(t);
  };

  const handleSpotifyLogin = async () => {
    if (!authState.isReady) {
      Alert.alert('Not Ready', 'Please save your Spotify Client ID first.');
      return;
    }

    const result = await spotifyLogin();

    if (result.success) {
      checkConnection();
      // Start playback sync so Home and Graph have current state
      usePlayerStore.getState().syncFromSpotify().catch(() => {});
      usePlayerStore.getState().startAutoSync(5000);
      Alert.alert('Success', 'Spotify connected!');
    } else if (result.cancelled) {
      // User cancelled
    } else if (result.error) {
      Alert.alert('Error', result.error);
    }
  };

  const createPressHandlers = (scaleValue: SharedValue<number>) => ({
    onPressIn: () => {
      scaleValue.value = withSpring(0.95, { damping: 15, stiffness: 400 });
    },
    onPressOut: () => {
      scaleValue.value = withSpring(1, { damping: 15, stiffness: 400 });
    },
  });

  const saveButtonStyle = useAnimatedStyle(() => ({ transform: [{ scale: saveScale.value }] }));
  const spotifyButtonStyle = useAnimatedStyle(() => ({ transform: [{ scale: spotifyScale.value }] }));
  const testButtonStyle = useAnimatedStyle(() => ({ transform: [{ scale: testScale.value }] }));

  const getModelStatusIcon = (modelId: ModelId) => {
    const status = modelStatuses[modelId];
    if (!status) return null;
    if (status.available) {
      return <Ionicons name="checkmark-circle" size={16} color="#4ADE80" />;
    }
    return <Ionicons name="close-circle" size={16} color="#FF6B6B" />;
  };

  const getModelLatency = (modelId: ModelId) => {
    const status = modelStatuses[modelId];
    if (status?.available && status.latency) {
      return `${status.latency}ms`;
    }
    return null;
  };

  if (isLoading) {
    return (
      <LinearGradient
        colors={[activeTheme.gradientStart, activeTheme.gradientMid, activeTheme.gradientEnd]}
        style={[styles.container, styles.loadingContainer]}
      >
        <ActivityIndicator color={activeTheme.primary} size="large" />
      </LinearGradient>
    );
  }

  return (
    <LinearGradient
      colors={[activeTheme.gradientStart, activeTheme.gradientMid, activeTheme.gradientEnd]}
      style={styles.container}
    >
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <Animated.View entering={FadeInDown.delay(100).duration(500)}>
          <Text style={[styles.header, { color: activeTheme.text }]}>Settings</Text>
        </Animated.View>

        {/* API Keys Section */}
        <Animated.View entering={FadeInDown.delay(200).duration(500)} style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="key-outline" size={20} color={activeTheme.aiPurple} />
            <Text style={[styles.sectionTitle, { color: activeTheme.textSecondary }]}>API Keys</Text>
          </View>

          <GlassCard glowColor={activeTheme.primaryGlow} borderGlow={false} padding={16} borderRadius={16}>
            <View style={styles.labelRow}>
              <Text style={[styles.label, { color: activeTheme.text }]}>Gemini API Key</Text>
              {geminiValid === true && <Ionicons name="checkmark-circle" size={16} color="#4ADE80" />}
              {geminiValid === false && <Ionicons name="close-circle" size={16} color="#FF6B6B" />}
            </View>
            <TextInput
              style={[
                styles.input,
                {
                  color: activeTheme.text,
                  borderColor:
                    geminiValid === false ? '#FF6B6B' : geminiValid === true ? '#4ADE80' : activeTheme.border,
                  backgroundColor: 'rgba(0,0,0,0.2)',
                },
              ]}
              value={localGeminiKey}
              onChangeText={(text) => {
                setLocalGeminiKey(text);
                setGeminiValid(null);
              }}
              placeholder="Enter Gemini API Key"
              placeholderTextColor={activeTheme.textMuted}
              secureTextEntry
            />

            <View style={[styles.labelRow, { marginTop: 12 }]}>
              <Text style={[styles.label, { color: activeTheme.text }]}>Spotify Client ID</Text>
              {spotifyValid === true && <Ionicons name="checkmark-circle" size={16} color="#4ADE80" />}
              {spotifyValid === false && <Ionicons name="close-circle" size={16} color="#FF6B6B" />}
            </View>
            <TextInput
              style={[
                styles.input,
                {
                  color: activeTheme.text,
                  borderColor:
                    spotifyValid === false ? '#FF6B6B' : spotifyValid === true ? '#4ADE80' : activeTheme.border,
                  backgroundColor: 'rgba(0,0,0,0.2)',
                },
              ]}
              value={localSpotifyClientId}
              onChangeText={(text) => {
                setLocalSpotifyClientId(text);
                setSpotifyValid(null);
              }}
              placeholder="Enter Spotify Client ID"
              placeholderTextColor={activeTheme.textMuted}
              autoCapitalize="none"
            />

            <AnimatedPressable
              onPress={handleSave}
              disabled={isSaving}
              style={[saveButtonStyle, isSaving && styles.buttonDisabled]}
              {...createPressHandlers(saveScale)}
            >
              <LinearGradient
                colors={[activeTheme.aiPurple, activeTheme.accentGradientEnd]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.saveButton}
              >
                {isSaving ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Ionicons name="save-outline" size={18} color="#fff" />
                )}
                <Text style={styles.saveButtonText}>{isSaving ? 'Validating...' : 'Save Keys'}</Text>
              </LinearGradient>
            </AnimatedPressable>

            {saveStatus !== 'idle' && (
              <View
                style={[
                  styles.statusBanner,
                  {
                    backgroundColor:
                      saveStatus === 'success' ? 'rgba(74, 222, 128, 0.15)' : 'rgba(255, 107, 107, 0.15)',
                  },
                ]}
              >
                <Ionicons
                  name={saveStatus === 'success' ? 'checkmark-circle' : 'warning'}
                  size={18}
                  color={saveStatus === 'success' ? '#4ADE80' : '#FF6B6B'}
                />
                <Text style={[styles.statusText, { color: saveStatus === 'success' ? '#4ADE80' : '#FF6B6B' }]}>
                  {saveMessage}
                </Text>
              </View>
            )}
          </GlassCard>
        </Animated.View>

        {/* AI Model Section */}
        <Animated.View entering={FadeInDown.delay(250).duration(500)} style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="hardware-chip-outline" size={20} color={activeTheme.aiPurple} />
            <Text style={[styles.sectionTitle, { color: activeTheme.textSecondary }]}>AI Model</Text>
            <View style={styles.modelBadge}>
              <Text style={[styles.modelBadgeText, { color: activeTheme.aiPurple }]}>
                {GEMINI_MODELS[selectedModel]?.name || 'Unknown'}
              </Text>
            </View>
          </View>

          <GlassCard glowColor={activeTheme.primaryGlow} borderGlow={false} padding={16} borderRadius={16}>
            {/* Test Models Button */}
            <AnimatedPressable
              onPress={handleTestModels}
              disabled={isTestingModels || !localGeminiKey}
              style={[testButtonStyle, (!localGeminiKey || isTestingModels) && styles.buttonDisabled]}
              {...createPressHandlers(testScale)}
            >
              <View
                style={[
                  styles.testButton,
                  { backgroundColor: activeTheme.surface, borderColor: activeTheme.border },
                ]}
              >
                {isTestingModels ? (
                  <ActivityIndicator color={activeTheme.text} size="small" />
                ) : (
                  <Ionicons name="refresh-outline" size={18} color={activeTheme.text} />
                )}
                <Text style={[styles.testButtonText, { color: activeTheme.text }]}>
                  {isTestingModels ? 'Testing...' : 'Test All Models'}
                </Text>
              </View>
            </AnimatedPressable>

            {/* Model List */}
            <View style={styles.modelList}>
              {MODEL_PRIORITY.map((modelId) => {
                const model = GEMINI_MODELS[modelId];
                const isSelected = selectedModel === modelId;
                const status = modelStatuses[modelId];
                const latency = getModelLatency(modelId);

                return (
                  <Pressable
                    key={modelId}
                    onPress={() => handleSelectModel(modelId)}
                    style={[
                      styles.modelCard,
                      {
                        backgroundColor: isSelected ? `${activeTheme.aiPurple}20` : activeTheme.surface,
                        borderColor: isSelected ? activeTheme.aiPurple : activeTheme.border,
                      },
                    ]}
                  >
                    <View style={styles.modelCardLeft}>
                      <View style={styles.modelNameRow}>
                        <Text style={[styles.modelName, { color: activeTheme.text }]}>{model.name}</Text>
                        {model.tier === 'pro' && (
                          <View style={[styles.tierBadge, { backgroundColor: '#8B5CF6' }]}>
                            <Text style={styles.tierBadgeText}>PRO</Text>
                          </View>
                        )}
                        {model.tier === 'flash' && (
                          <View style={[styles.tierBadge, { backgroundColor: '#F59E0B' }]}>
                            <Text style={styles.tierBadgeText}>FLASH</Text>
                          </View>
                        )}
                      </View>
                      <Text style={[styles.modelDesc, { color: activeTheme.textMuted }]}>
                        {model.description}
                      </Text>
                      {latency && (
                        <Text style={[styles.modelLatency, { color: '#4ADE80' }]}>{latency}</Text>
                      )}
                    </View>
                    <View style={styles.modelCardRight}>
                      {getModelStatusIcon(modelId)}
                      {isSelected && (
                        <View style={[styles.selectedDot, { backgroundColor: activeTheme.aiPurple }]} />
                      )}
                    </View>
                  </Pressable>
                );
              })}
            </View>

            <Text style={[styles.modelHint, { color: activeTheme.textMuted }]}>
              If selected model fails, app will automatically try other models
            </Text>
          </GlassCard>
        </Animated.View>

        {/* Account Section */}
        <Animated.View entering={FadeInDown.delay(300).duration(500)} style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="person-outline" size={20} color={activeTheme.aiPurple} />
            <Text style={[styles.sectionTitle, { color: activeTheme.textSecondary }]}>Account</Text>
            {isConnected && (
              <View style={styles.connectionStatus}>
                <Ionicons name="checkmark-circle" size={16} color="#4ADE80" />
                <Text style={[styles.connectionText, { color: '#4ADE80' }]}>Connected</Text>
              </View>
            )}
            {!isConnected && (
              <View style={styles.connectionStatus}>
                <Ionicons name="warning" size={16} color={activeTheme.error || '#FF4444'} />
                <Text style={[styles.connectionText, { color: activeTheme.error || '#FF4444' }]}>
                  Not Connected
                </Text>
              </View>
            )}
          </View>

          <AnimatedPressable
            onPress={handleSpotifyLogin}
            disabled={authState.isLoading}
            style={spotifyButtonStyle}
            {...createPressHandlers(spotifyScale)}
          >
            <LinearGradient
              colors={isConnected ? [activeTheme.surface, activeTheme.surface] : ['#1DB954', '#1ED760']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={[
                styles.spotifyButton,
                authState.isLoading && styles.buttonDisabled,
                isConnected && { borderWidth: 1, borderColor: activeTheme.border },
              ]}
            >
              {authState.isLoading ? (
                <ActivityIndicator color={isConnected ? activeTheme.text : '#000'} size="small" />
              ) : (
                <Ionicons name="musical-notes" size={22} color={isConnected ? activeTheme.text : '#000'} />
              )}
              <Text style={[styles.spotifyButtonText, isConnected && { color: activeTheme.text }]}>
                {authState.isLoading
                  ? 'Connecting...'
                  : isConnected
                  ? 'Reconnect Spotify'
                  : 'Log in with Spotify'}
              </Text>
            </LinearGradient>
          </AnimatedPressable>
        </Animated.View>

        {/* Theme Section */}
        <Animated.View entering={FadeInDown.delay(350).duration(500)} style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="color-palette-outline" size={20} color={activeTheme.aiPurple} />
            <Text style={[styles.sectionTitle, { color: activeTheme.textSecondary }]}>Theme</Text>
          </View>

          <Pressable
            onPress={() => setAutoTheme(!autoTheme)}
            style={[
              styles.autoThemeToggle,
              { backgroundColor: activeTheme.surface, borderColor: activeTheme.border },
            ]}
          >
            <View style={styles.toggleLeft}>
              <Ionicons name="color-wand-outline" size={18} color={activeTheme.aiPurple} />
              <View>
                <Text style={[styles.toggleTitle, { color: activeTheme.text }]}>Auto Theme</Text>
                <Text style={[styles.toggleDesc, { color: activeTheme.textMuted }]}>
                  Change theme based on mood
                </Text>
              </View>
            </View>
            <View
              style={[
                styles.toggleSwitch,
                { backgroundColor: autoTheme ? activeTheme.aiPurple : activeTheme.surfaceStrong },
              ]}
            >
              <View
                style={[
                  styles.toggleKnob,
                  { transform: [{ translateX: autoTheme ? 20 : 0 }], backgroundColor: '#fff' },
                ]}
              />
            </View>
          </Pressable>

          <View style={styles.themeGrid}>
            {MODERN_THEME_NAMES.map((t) => {
              const themeData = MODERN_THEMES[t];
              const info = THEME_INFO[t];
              const isSelected = theme === t;

              return (
                <Pressable
                  key={t}
                  onPress={() => handleThemeSelect(t)}
                  style={[
                    styles.themeCard,
                    {
                      borderColor: isSelected ? themeData.primaryGlow : 'transparent',
                      backgroundColor: isSelected ? `${themeData.primaryGlow}15` : activeTheme.surface,
                    },
                  ]}
                >
                  <LinearGradient
                    colors={[themeData.gradientStart, themeData.gradientEnd]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.themePreview}
                  >
                    <View style={[styles.themeAccent, { backgroundColor: themeData.primaryGlow }]} />
                  </LinearGradient>
                  <View style={styles.themeInfo}>
                    <View style={styles.themeNameRow}>
                      <Ionicons name={info.icon} size={14} color={themeData.primaryGlow} />
                      <Text style={[styles.themeName, { color: activeTheme.text }]}>
                        {t.charAt(0).toUpperCase() + t.slice(1)}
                      </Text>
                    </View>
                    <Text style={[styles.themeDesc, { color: activeTheme.textMuted }]}>{info.description}</Text>
                  </View>
                  {isSelected && (
                    <View style={[styles.checkmark, { backgroundColor: themeData.primaryGlow }]}>
                      <Ionicons name="checkmark" size={12} color="#000" />
                    </View>
                  )}
                </Pressable>
              );
            })}
          </View>
        </Animated.View>

        {/* About Section */}
        <Animated.View entering={FadeInDown.delay(400).duration(500)} style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="information-circle-outline" size={20} color={activeTheme.aiPurple} />
            <Text style={[styles.sectionTitle, { color: activeTheme.textSecondary }]}>About</Text>
          </View>

          <GlassCard glowColor={activeTheme.primaryGlow} borderGlow={false} padding={16} borderRadius={16}>
            <View style={styles.aboutRow}>
              <Text style={[styles.aboutLabel, { color: activeTheme.textSecondary }]}>Version</Text>
              <Text style={[styles.aboutValue, { color: activeTheme.text }]}>2.0.0</Text>
            </View>
            <View style={styles.aboutRow}>
              <Text style={[styles.aboutLabel, { color: activeTheme.textSecondary }]}>AI Engine</Text>
              <Text style={[styles.aboutValue, { color: activeTheme.text }]}>
                {GEMINI_MODELS[selectedModel]?.name || 'Gemini'}
              </Text>
            </View>
            <View style={styles.aboutRow}>
              <Text style={[styles.aboutLabel, { color: activeTheme.textSecondary }]}>Privacy</Text>
              <Text style={[styles.aboutValue, { color: activeTheme.spotifyGreen }]}>Local Data Only</Text>
            </View>
          </GlassCard>
        </Animated.View>
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingContainer: { justifyContent: 'center', alignItems: 'center' },
  content: { padding: 24, paddingTop: 60, paddingBottom: 120 },
  header: { fontSize: 32, fontWeight: '700', marginBottom: 32, letterSpacing: -0.5 },
  section: { marginBottom: 28 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 },
  sectionTitle: { fontSize: 13, textTransform: 'uppercase', letterSpacing: 1.2, fontWeight: '600' },
  connectionStatus: { flexDirection: 'row', alignItems: 'center', marginLeft: 'auto', gap: 4 },
  connectionText: { fontSize: 12, fontWeight: '600' },
  modelBadge: { marginLeft: 'auto', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, backgroundColor: 'rgba(139, 92, 246, 0.15)' },
  modelBadgeText: { fontSize: 11, fontWeight: '600' },
  label: { fontSize: 14, fontWeight: '500', marginBottom: 8 },
  labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  input: { borderWidth: 1, borderRadius: 12, padding: 14, fontSize: 15, marginBottom: 16 },
  saveButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 14, borderRadius: 12 },
  saveButtonText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  testButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 12, borderRadius: 10, borderWidth: 1, marginBottom: 16 },
  testButtonText: { fontSize: 14, fontWeight: '500' },
  modelList: { gap: 10 },
  modelCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14, borderRadius: 12, borderWidth: 1.5 },
  modelCardLeft: { flex: 1, gap: 2 },
  modelCardRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  modelNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  modelName: { fontSize: 15, fontWeight: '600' },
  modelDesc: { fontSize: 12 },
  modelLatency: { fontSize: 11, fontWeight: '500' },
  tierBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  tierBadgeText: { color: '#fff', fontSize: 9, fontWeight: '700' },
  selectedDot: { width: 8, height: 8, borderRadius: 4 },
  modelHint: { fontSize: 11, marginTop: 12, textAlign: 'center', fontStyle: 'italic' },
  spotifyButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, padding: 16, borderRadius: 14, shadowColor: '#1DB954', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 8 },
  spotifyButtonText: { color: '#000', fontSize: 16, fontWeight: '700' },
  buttonDisabled: { opacity: 0.5 },
  themeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  themeCard: { width: '47%', borderRadius: 16, borderWidth: 2, padding: 12, position: 'relative' },
  themePreview: { height: 50, borderRadius: 10, marginBottom: 10, overflow: 'hidden', position: 'relative' },
  themeAccent: { position: 'absolute', bottom: 8, right: 8, width: 16, height: 16, borderRadius: 8 },
  themeInfo: { gap: 2 },
  themeNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  themeName: { fontSize: 14, fontWeight: '600' },
  themeDesc: { fontSize: 11, marginLeft: 20 },
  checkmark: { position: 'absolute', top: 8, right: 8, width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  autoThemeToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14, borderRadius: 12, borderWidth: 1, marginBottom: 16 },
  toggleLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  toggleTitle: { fontSize: 15, fontWeight: '600' },
  toggleDesc: { fontSize: 12, marginTop: 2 },
  toggleSwitch: { width: 48, height: 28, borderRadius: 14, padding: 2, justifyContent: 'center' },
  toggleKnob: { width: 24, height: 24, borderRadius: 12 },
  aboutRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' },
  aboutLabel: { fontSize: 14 },
  aboutValue: { fontSize: 14, fontWeight: '600' },
  statusBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 10, marginTop: 12 },
  statusText: { fontSize: 13, fontWeight: '500', flex: 1 },
});
