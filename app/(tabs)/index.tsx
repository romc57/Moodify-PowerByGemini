/**
 * Home Screen - Modern Redesign
 * Features: Gradient background, animated components, glassmorphism
 */

import { AIReasoningChip } from '@/components/ui/AIReasoningChip';
import { AnimatedAlbumArt } from '@/components/ui/AnimatedAlbumArt';
import { AnimatedPlayButton } from '@/components/ui/AnimatedPlayButton';
import { ServiceErrorBanner } from '@/components/ui/ServiceErrorBanner';
import { WaveformProgress } from '@/components/ui/WaveformProgress';
import { VibeSelector } from '@/components/VibeSelector';
import { THEMES } from '@/constants/theme';
import { useAutoDJ } from '@/hooks/useAutoDJ';
import { recommendationService } from '@/services/core/RecommendationService';
import { validatedQueueService } from '@/services/core/ValidatedQueueService';
import { voiceService } from '@/services/core/VoiceService';
import { spotifyRemote } from '@/services/spotify/SpotifyRemoteService';
import { usePlayerStore } from '@/stores/PlayerStore';
import { useSettingsStore } from '@/stores/SettingsStore';
import { useSkipTracker } from '@/stores/SkipTrackerStore';
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
  Easing,
  FadeIn,
  FadeInDown,
  FadeInUp,
  SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSpring,
  withTiming,
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

  const { isPlaying, currentTrack, togglePlay, next, prev, playVibe, playTrack, currentMood, assessedMood, setAssessedMood } = usePlayerStore();
  const { reset: resetSkipTracker, setRescueMode } = useSkipTracker();

  // Auto DJ Logic
  useAutoDJ();

  const [vibeOptions, setVibeOptions] = useState<any[]>([]);
  const [showVibeSelector, setShowVibeSelector] = useState(false);
  const [geminiReasoning, setGeminiReasoning] = useState<string | null>(null);
  const reasoningTimerRef = React.useRef<NodeJS.Timeout | null>(null);

  /** Set reasoning text with optional auto-clear (for error/status messages). */
  const setReasoningWithAutoClear = (text: string, autoClearMs?: number) => {
    if (reasoningTimerRef.current) clearTimeout(reasoningTimerRef.current);
    setGeminiReasoning(text);
    if (autoClearMs) {
      reasoningTimerRef.current = setTimeout(() => setGeminiReasoning(null), autoClearMs);
    }
  };

  const clearReasoning = () => {
    if (reasoningTimerRef.current) clearTimeout(reasoningTimerRef.current);
    setGeminiReasoning(null);
  };

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

  /* 
   * Sync Logic:
   * We now rely on PlayerStore's centralized auto-sync to keep state fresh.
   * This prevents double-polling and race conditions.
   */
  const { startAutoSync, stopAutoSync, progressMs } = usePlayerStore();

  useEffect(() => {
    // Fast sync on Home (1s); when leaving tab don't stop — fall back to 5s so background/settings still get skip detection
    startAutoSync(1000);
    return () => {
      usePlayerStore.getState().startAutoSync(5000);
    };
  }, []);

  // Update local UI state when store updates
  useEffect(() => {
    if (currentTrack?.duration_ms && progressMs !== undefined) {
      const duration = currentTrack.duration_ms || 1;
      const prog = progressMs;

      setProgress(Math.min(prog / duration, 1));
      setCurrentTime(formatTime(prog));
      setTotalTime(formatTime(duration));
    } else {
      setProgress(0);
      setCurrentTime('0:00');
      setTotalTime('0:00');
    }
  }, [progressMs, currentTrack]);


  const handleRefreshVibe = async () => {
    setIsLoading(true);

    // Show what we're sending to Gemini
    const promptBrief = [
      assessedMood ? `Mood: ${assessedMood}` : null,
      currentTrack ? `Now: ${currentTrack.title}` : null,
      'Taste profile + favorites',
    ].filter(Boolean).join(' · ');
    setGeminiReasoning(`Asking Gemini: ${promptBrief}`);

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
        setReasoningWithAutoClear("Couldn't find a new vibe right now.", 8000);
        Alert.alert("AI Error", "Could not generate vibe options. The models might be busy or hallucinating. Please try again.");
      }
    } catch (e) {
      Alert.alert("Error", "Failed to refresh vibe.");
      setReasoningWithAutoClear("Error connecting to Gemini.", 8000);
    } finally {
      setIsLoading(false);
    }
  };

  const handleVibeSelect = async (option: any) => {
    setShowVibeSelector(false);

    // 1. Immediate Feedback: Announce over music (Seamless Transition)
    // We do NOT pause here anymore per user request. 
    // The previous track continues playing while "Fetching..." happens.
    try {
      voiceService.speak("Getting your vibe ready...", false); // false = don't pause music
    } catch (e) {
      console.warn("[HomeScreen] Audio feedback failed", e);
    }

    setIsLoading(true);
    setGeminiReasoning(`Gemini: expand "${option.track.title}" · ${option.title}`);

    // Clear seen URIs for fresh vibe (allows tracks from previous vibes)
    validatedQueueService.clearSession();

    // Add seed track URI to seen list to prevent it from appearing in expansion
    if (option.track?.uri) {
      validatedQueueService.addToSeenUris([option.track.uri]);
    }

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
        // STRICT MODE: Fail if no validated URI. 
        // We do *not* want to blind search and play the wrong song anymore.
        setReasoningWithAutoClear("Vibe unavailable (Song not found).", 8000);
        Alert.alert("Song Not Found", "This vibe's seed song isn't available on Spotify right now. Please try another vibe.");
        setIsLoading(false);
        return;
      }

      // 1. Expand Vibe First (Atomic Operation)
      setGeminiReasoning(`Gemini → Spotify: validating tracks for "${option.title}"...`);
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

      console.log(`[HomeScreen] Building track list. Seed: "${seedTrack.title}" [${seedTrack.uri}]`);

      if (expandedItems && expandedItems.length > 0) {
        for (const item of expandedItems) {
          if (!item.uri) {
            console.log(`[HomeScreen] Skipping item without URI: "${item.title}"`);
            continue;
          }
          if (uniqueSet.has(item.uri)) {
            console.log(`[HomeScreen] Skipping duplicate: "${item.title}" [${item.uri}]`);
            continue;
          }
          uniqueSet.add(item.uri);
          fullList.push(item);
        }
      }

      // FALLBACK: If expansion failed (only seed track), fetch user's top tracks
      if (fullList.length < 3) {
        console.log('[HomeScreen] Expansion failed, fetching top tracks as fallback...');
        try {
          // Get session history URIs to exclude already-played tracks
          const sessionUris = new Set(usePlayerStore.getState().sessionHistory.map(h => h.uri));

          const topTracks = await spotifyRemote.getUserTopTracks(20, 'short_term'); // Fetch more to filter
          if (topTracks && topTracks.length > 0) {
            for (const t of topTracks) {
              // Skip if: no URI, already in our list, or in session history
              if (!t.uri || uniqueSet.has(t.uri) || sessionUris.has(t.uri)) continue;
              uniqueSet.add(t.uri);
              fullList.push({
                title: t.name,
                artist: t.artists?.[0]?.name || 'Unknown',
                uri: t.uri,
                artwork: t.album?.images?.[0]?.url,
                reason: 'Fallback favorite'
              });
              if (fullList.length >= 10) break; // Cap at 10 tracks
            }
          }
        } catch (e) {
          console.warn('[HomeScreen] Fallback fetch failed:', e);
        }
      }

      console.log(`[HomeScreen] Final track list: ${fullList.length} unique tracks:`);
      fullList.forEach((t, i) => console.log(`  ${i + 1}. "${t.title}" by ${t.artist} [${t.uri}]`));

      // 3. Play All At Once (Replaces Spotify Context & Queue)
      setGeminiReasoning(`Clearing queue & starting ${fullList.length} tracks...`);
      await usePlayerStore.getState().playVibe(fullList);

      recommendationService.recordPlay(seedTrack, false, { source: 'vibe_select' });

      if (fullList.length > 1) {
        setReasoningWithAutoClear(`Vibe set: ${option.title} · ${fullList.length} tracks`, 10000);
      } else {
        setReasoningWithAutoClear("Vibe set (Queue expansion failed).", 8000);
      }

      // Re-enable skip tracking after vibe is set (wait for queue to settle so we don't count rapid track changes)
      setTimeout(() => setRescueMode(false), 6000);

    } catch (e: any) {
      console.error("Vibe Selection Error:", e);

      // Detailed error message for debugging
      const errorMsg = e.message || "Unknown error";

      if (errorMsg.includes('Seed track')) {
        Alert.alert("Track Not Found", "Could not find the vibe's seed track on Spotify. Try another vibe.");
      } else {
        Alert.alert("Error", "Failed to load vibe. Please check your connection or try again.");
      }
      setReasoningWithAutoClear("Error setting vibe.", 8000);
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
      {/* Fixed top: header only (never scrolls away) */}
      <View style={styles.fixedTop}>
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
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
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

          {/* Refresh Vibe Button (inline, after waveform) */}
          <Animated.View entering={FadeInDown.delay(350).duration(500)} style={styles.vibeButtonInline}>
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
                    <Text style={styles.refreshText} numberOfLines={1}>
                      {geminiReasoning?.slice(0, 30) || 'Analyzing...'}
                    </Text>
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

          {/* AI Reasoning Chip */}
          <View style={styles.chipContainer}>
            {geminiReasoning && (
              <View style={{ marginTop: 20 }}>
                <AIReasoningChip
                  text={geminiReasoning}
                  isThinking={isLoading}
                  accentColor={activeTheme.aiPurple}
                  onDismiss={!isLoading ? clearReasoning : undefined}
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

      </ScrollView>

      {/* Overlays */}
      <VibeSelector
        visible={showVibeSelector}
        options={vibeOptions}
        onSelect={handleVibeSelect}
        onClose={() => setShowVibeSelector(false)}
        isLoading={isLoading}
      />

      {/* Service Error Banner - shows active errors */}
      <ServiceErrorBanner position="top" maxErrors={2} />

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
  fixedTop: {
    paddingHorizontal: 24,
  },
  scrollContent: {
    paddingBottom: 100,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 8,
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
  vibeButtonInline: {
    alignItems: 'center',
    marginTop: 24,
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


