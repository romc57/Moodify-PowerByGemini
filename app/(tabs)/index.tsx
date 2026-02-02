/**
 * Home Screen - Modern Redesign
 * Features: Gradient background, animated components, glassmorphism
 */

import { AIReasoningChip } from '@/components/ui/AIReasoningChip';
import { AnimatedAlbumArt } from '@/components/ui/AnimatedAlbumArt';
import { AnimatedPlayButton } from '@/components/ui/AnimatedPlayButton';
import { WaveformProgress } from '@/components/ui/WaveformProgress';
import { VibeSelector } from '@/components/VibeSelector';
import { THEMES } from '@/constants/theme';
import { useAutoDJ } from '@/hooks/useAutoDJ';
import { recommendationService } from '@/services/core/RecommendationService';
import { validatedQueueService } from '@/services/core/ValidatedQueueService';
import { spotifyRemote } from '@/services/spotify/SpotifyRemoteService';
import { usePlayerStore } from '@/stores/PlayerStore';
import { useSkipTracker } from '@/stores/SkipTrackerStore';
import { useSettingsStore } from '@/stores/SettingsStore';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  Alert,
  Dimensions,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View
} from 'react-native';
import Animated, {
  FadeIn,
  FadeInDown,
  FadeInUp,
  SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const ALBUM_SIZE = Math.min(SCREEN_WIDTH * 0.75, 320);

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export default function HomeScreen() {
  const router = useRouter();
  const { theme } = useSettingsStore();
  const activeTheme = THEMES[theme] || THEMES.midnight;
  const insets = useSafeAreaInsets();

  const { isPlaying, currentTrack, togglePlay, next, prev, playList, playTrack, currentMood, assessedMood, setAssessedMood } = usePlayerStore();
  const { reset: resetSkipTracker, setRescueMode } = useSkipTracker();

  // Auto DJ Logic
  useAutoDJ();

  const [vibeOptions, setVibeOptions] = useState<any[]>([]);
  const [showVibeSelector, setShowVibeSelector] = useState(false);
  const [geminiReasoning, setGeminiReasoning] = useState<string | null>(null);

  // Animation Values
  const scale = useSharedValue(1);
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState('0:00');
  const [totalTime, setTotalTime] = useState('0:00');

  // Button animations
  const refreshScale = useSharedValue(1);
  const prevScale = useSharedValue(1);
  const nextScale = useSharedValue(1);
  const spinRotation = useSharedValue(0);

  // Spin animation for loading state
  React.useEffect(() => {
    if (isLoading) {
      spinRotation.value = withRepeat(
        withTiming(360, { duration: 1000, easing: Easing.linear }),
        -1, // Infinite repeats
        false
      );
    } else {
      spinRotation.value = 0;
    }
  }, [isLoading]);

  const spinStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${spinRotation.value}deg` }],
  }));

  // Format milliseconds to M:SS or H:MM:SS
  const formatTime = (ms: number | undefined | null): string => {
    if (!ms || isNaN(ms) || ms < 0) return '0:00';

    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;

    if (hours > 0) {
      return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const syncState = async () => {
    try {
      const state = await spotifyRemote.getCurrentState();
      if (state) {
        usePlayerStore.getState().setInternalState({ isPlaying: state.is_playing, track: state });

        // Update progress
        const progressMs = state.progress_ms || 0;
        const durationMs = state.duration_ms || 1;

        setProgress(durationMs > 0 ? progressMs / durationMs : 0);
        setCurrentTime(formatTime(progressMs));
        setTotalTime(formatTime(durationMs));
      } else {
        // No active playback - reset state to reflect reality
        usePlayerStore.getState().setInternalState({ isPlaying: false, track: null });
        setProgress(0);
        setCurrentTime('0:00');
        setTotalTime('0:00');
      }
    } catch (e) {
      console.warn('[HomeScreen] Sync state error:', e);
    }
  };

  useEffect(() => {
    syncState();
    const interval = setInterval(syncState, 1000);
    return () => clearInterval(interval);
  }, []);


  const handleRefreshVibe = async () => {
    setIsLoading(true);
    setGeminiReasoning("Gemini is analyzing your vibe options...");
    try {
      // 1. Get 8 Vibe Options
      const userInstruction = assessedMood
        ? `User's current mood: ${assessedMood}. Provide fresh vibe options.`
        : "Fresh vibe";

      const options = await recommendationService.getVibeOptions(userInstruction);

      if (options && options.length > 0) {
        setVibeOptions(options);
        setShowVibeSelector(true);
        setGeminiReasoning("Pick a vibe to start your journey.");
      } else {
        setGeminiReasoning("Couldn't find a new vibe right now.");
        Alert.alert("AI Error", "Could not generate vibe options. The models might be busy or hallucinating. Please try again.");
      }
    } catch (e) {
      Alert.alert("Error", "Failed to refresh vibe.");
      setGeminiReasoning("Error connecting to Gemini.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleVibeSelect = async (option: any) => {
    setShowVibeSelector(false);
    setIsLoading(true);
    setGeminiReasoning(`Setting the vibe: ${option.title}...`);

    // Clear seen URIs for fresh vibe (allows tracks from previous vibes)
    validatedQueueService.clearSession();

    // CRITICAL: Reset skip tracker and set rescue mode to prevent false skip detection
    // during vibe setup (track changes happen rapidly while building queue)
    resetSkipTracker();
    setRescueMode(true);

    if (option.description) {
      usePlayerStore.getState().setMood(option.description);
    }

    try {
      // 1. Use Verified Seed Track
      let seedTrack;

      // Check if we already have the URI from verification (Optimized)
      if (option.track.uri) {
        seedTrack = {
          title: option.track.title,
          artist: option.track.artist,
          uri: option.track.uri,
          artwork: option.track.artwork,
          reason: `Selected Vibe: ${option.title}`
        };
      } else {
        // Fallback logic (Should ideally not happen now with verification)
        const query = option.track.query || `${option.track.title} ${option.track.artist}`;
        const searchResults = await spotifyRemote.search(query, 'track');

        if (searchResults && searchResults.length > 0) {
          const track = searchResults[0];
          seedTrack = {
            title: track.name,
            artist: track.artists?.[0]?.name || 'Unknown',
            uri: track.uri,
            artwork: track.album?.images?.[0]?.url,
            reason: `Selected Vibe: ${option.title}`
          };
        } else {
          throw new Error('Seed track not found');
        }
      }

      // 1. Expand Vibe First (Atomic Operation)
      const { items: expandedItems, mood } = await recommendationService.expandVibe(
        { title: option.track.title, artist: option.track.artist },
        option.description
      );

      if (mood) {
        usePlayerStore.getState().setMood(mood);
      }

      // 2. Prepare Full Track List (Seed + Expansion)
      const fullList = [seedTrack];
      const uniqueSet = new Set([seedTrack.uri]);

      if (expandedItems && expandedItems.length > 0) {
        for (const item of expandedItems) {
          if (!uniqueSet.has(item.uri)) {
            uniqueSet.add(item.uri);
            fullList.push(item);
          }
        }
      }

      // 3. Play All At Once (Replaces Spotify Context & Queue)
      await playList(fullList, 0);

      recommendationService.recordPlay(seedTrack, false, { source: 'vibe_select' });

      if (expandedItems && expandedItems.length > 0) {
        setGeminiReasoning(`Vibe set: ${option.title}`);
      } else {
        setGeminiReasoning("Vibe set (Queue expansion failed).");
      }

      // Re-enable skip tracking after vibe is set (with delay for queue to settle)
      setTimeout(() => setRescueMode(false), 3000);

    } catch (e: any) {
      console.error("Vibe Selection Error:", e);

      // Detailed error message for debugging
      const errorMsg = e.message || "Unknown error";

      if (errorMsg.includes('Seed track')) {
        Alert.alert("Track Not Found", "Could not find the vibe's seed track on Spotify. Try another vibe.");
      } else {
        Alert.alert("Error", "Failed to load vibe. Please check your connection or try again.");
      }
      setGeminiReasoning("Error setting vibe.");
      setRescueMode(false); // Re-enable skip tracking on error
    } finally {
      setIsLoading(false);
    }
  };

  const createPressHandlers = (scaleValue: SharedValue<number>) => ({
    onPressIn: () => {
      scaleValue.value = withSpring(0.9, { damping: 15, stiffness: 400 });
    },
    onPressOut: () => {
      scaleValue.value = withSpring(1, { damping: 15, stiffness: 400 });
    },
  });

  const refreshButtonStyle = useAnimatedStyle(() => ({
    transform: [{ scale: refreshScale.value }],
  }));

  const prevButtonStyle = useAnimatedStyle(() => ({
    transform: [{ scale: prevScale.value }],
  }));

  const nextButtonStyle = useAnimatedStyle(() => ({
    transform: [{ scale: nextScale.value }],
  }));

  return (
    <LinearGradient
      colors={[activeTheme.gradientStart, activeTheme.gradientMid, activeTheme.gradientEnd]}
      style={[styles.gradient, { paddingTop: insets.top + 10 }]}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <Animated.View entering={FadeInDown.delay(100).duration(600)} style={styles.header}>
          <View style={styles.logoContainer}>
            <LinearGradient
              colors={[activeTheme.accentGradientStart, activeTheme.accentGradientEnd]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.logoBadge}
            >
              <Ionicons name="musical-notes" size={18} color="#fff" />
            </LinearGradient>
            <Text style={[styles.logoText, { color: activeTheme.text }]}>Moodify</Text>
            <View style={[styles.aiBadge, { backgroundColor: `${activeTheme.aiPurple}20`, borderColor: `${activeTheme.aiPurple}40` }]}>
              <Text style={[styles.aiText, { color: activeTheme.aiPurple }]}>AI</Text>
            </View>
          </View>

          <View style={styles.headerButtons}>
            <Pressable
              onPress={() => router.push('/queue')}
              style={[styles.settingsButton, { backgroundColor: activeTheme.surface, marginRight: 12 }]}
            >
              <Ionicons name="list" size={22} color={activeTheme.textSecondary} />
            </Pressable>
            <Pressable
              onPress={() => router.push('/settings')}
              style={[styles.settingsButton, { backgroundColor: activeTheme.surface }]}
            >
              <Ionicons name="settings-outline" size={22} color={activeTheme.textSecondary} />
            </Pressable>
          </View>
        </Animated.View>

        {/* Album Art Section */}
        <Animated.View entering={FadeIn.delay(200).duration(800)} style={styles.artSection}>
          <AnimatedAlbumArt
            uri={currentTrack?.artwork}
            size={ALBUM_SIZE}
            isPlaying={isPlaying}
            dominantColor={activeTheme.primaryGlow}
          />
        </Animated.View>

        {/* Track Info */}
        <Animated.View entering={FadeInUp.delay(300).duration(600)} style={styles.infoSection}>
          <Text style={[styles.trackTitle, { color: activeTheme.text }]} numberOfLines={1}>
            {currentTrack?.title || "Not Playing"}
          </Text>
          <Text style={[styles.artistName, { color: activeTheme.textSecondary }]} numberOfLines={1}>
            {currentTrack?.artist || "Tap refresh to discover music"}
          </Text>

          {/* Waveform Progress */}
          <View style={styles.progressContainer}>
            <WaveformProgress
              progress={progress}
              isPlaying={isPlaying}
              activeColor={activeTheme.spotifyGreen}
              inactiveColor={activeTheme.surface}
              currentTime={currentTime}
              totalTime={totalTime}
            />
          </View>

          {/* AI Reasoning Chip */}
          <View style={styles.chipContainer}>
            {geminiReasoning && (
              <View style={{ marginTop: 20 }}>
                <AIReasoningChip
                  text={geminiReasoning}
                  accentColor={activeTheme.aiPurple}
                />
              </View>
            )}
            {/* AI Mood Box - Always Visible */}
            <Animated.View
              entering={FadeInDown.springify()}
              style={[styles.moodContainer, { backgroundColor: activeTheme.surface, borderColor: activeTheme.primary }]}
            >
              <View style={styles.moodHeader}>
                <Ionicons name="sparkles" size={14} color={activeTheme.primary} />
                <Text style={[styles.moodLabel, { color: activeTheme.primary }]}>Active Vibe</Text>
              </View>
              <Text style={[styles.moodText, { color: activeTheme.text }]}>
                {currentMood || "Start Vibing"}
              </Text>
            </Animated.View>
          </View>
        </Animated.View>

        {/* Controls */}
        <Animated.View entering={FadeInUp.delay(400).duration(600)} style={styles.controlsSection}>
          <AnimatedPressable
            onPress={() => prev()}
            style={[styles.secondaryControl, { backgroundColor: activeTheme.surface }, prevButtonStyle]}
            {...createPressHandlers(prevScale)}
          >
            <Ionicons name="play-skip-back" size={28} color={activeTheme.text} />
          </AnimatedPressable>

          <AnimatedPlayButton
            isPlaying={isPlaying}
            onPress={() => togglePlay()}
            size={80}
            gradientColors={[activeTheme.spotifyGreen, '#1ED760']}
            glowColor={activeTheme.spotifyGreenGlow}
          />

          <AnimatedPressable
            onPress={() => next()}
            style={[styles.secondaryControl, { backgroundColor: activeTheme.surface }, nextButtonStyle]}
            {...createPressHandlers(nextScale)}
          >
            <Ionicons name="play-skip-forward" size={28} color={activeTheme.text} />
          </AnimatedPressable>
        </Animated.View>

        {/* Refresh Button */}
        <Animated.View entering={FadeInUp.delay(500).duration(600)} style={styles.footer}>
          <AnimatedPressable
            onPress={handleRefreshVibe}
            disabled={isLoading}
            style={refreshButtonStyle}
            {...createPressHandlers(refreshScale)}
          >
            <LinearGradient
              colors={[activeTheme.aiPurple, activeTheme.accentGradientEnd]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={[styles.refreshGradient, isLoading && styles.refreshDisabled]}
            >
              {isLoading ? (
                <>
                  <Animated.View style={spinStyle}>
                    <Ionicons name="sync" size={18} color="#fff" />
                  </Animated.View>
                  <Text style={styles.refreshText}>Analyzing...</Text>
                </>
              ) : (
                <>
                  <Ionicons name="sparkles" size={18} color="#fff" />
                  <Text style={styles.refreshText}>Refresh Vibe</Text>
                </>
              )}
            </LinearGradient>
          </AnimatedPressable>
        </Animated.View>
      </ScrollView>

      {/* Overlays */}
      <VibeSelector
        visible={showVibeSelector}
        options={vibeOptions}
        onSelect={handleVibeSelect}
        onClose={() => setShowVibeSelector(false)}
        isLoading={isLoading}
      />



    </LinearGradient >
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  gradient: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 100,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    marginTop: 20,
    marginBottom: 20,
  },
  // Logo & Header Styles
  logoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  logoBadge: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  logoText: {
    fontSize: 24,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: -1,
  },
  aiBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  aiText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fff',
  },
  headerButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  settingsButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  greeting: {
    fontSize: 28,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: -0.5,
  },
  date: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.7)',
    marginTop: 4,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  content: {
    flex: 1,
  },

  // Section Styles
  artSection: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 20,
    height: 320,
  },
  infoSection: {
    alignItems: 'center',
    marginTop: 20,
    width: '100%',
  },
  artistName: {
    fontSize: 18,
    color: 'rgba(255,255,255,0.7)',
    marginTop: 8,
    textAlign: 'center',
    width: '80%',
  },
  progressContainer: {
    marginTop: 32,
    width: '100%',
    paddingHorizontal: 16, // Reduced from 24/32 to make it wider
  },

  // Existing Styles
  visualizerContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
    height: 320,
  },
  albumArtContainer: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 20,
  },
  trackInfo: {
    alignItems: 'center',
    marginTop: 32,
    paddingHorizontal: 32,
  },
  trackTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 8,
    width: '80%',
  },
  trackArtist: {
    fontSize: 18,
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'center',
  },
  progressSection: {
    marginTop: 32,
    paddingHorizontal: 24,
  },
  timeContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  timeText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
    fontVariant: ['tabular-nums'],
  },
  controlsSection: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 32,
    gap: 32,
  },
  secondaryControl: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  footer: {
    marginTop: 'auto',
    marginBottom: 32,
    alignItems: 'center',
    paddingTop: 40, // Added spacing between playbar and button
  },
  refreshGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 32,
    gap: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  refreshDisabled: {
    opacity: 0.7,
  },
  refreshText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  spinIcon: {
    opacity: 0.8,
  },
  // AI Chip Styles
  aiChipContainer: {
    position: 'absolute',
    top: 120, // Adjust based on layout
    alignSelf: 'center',
    zIndex: 10,
  },
  chipContainer: {
    alignItems: 'center',
    width: '100%',
    paddingHorizontal: 24,
  },
  // Mood Styles
  moodContainer: {
    marginTop: 24,
    alignItems: 'center',
  },
  moodHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  moodLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.6)',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  moodText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    textAlign: 'center',
  }
});


