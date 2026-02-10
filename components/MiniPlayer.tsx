/**
 * MiniPlayer - Modern Mini Player with Glassmorphism
 * Features: Blur background, proper icons, album art thumbnail, progress bar
 */

import { THEMES } from '@/constants/theme';
import { spotifyRemote } from '@/services/spotify/SpotifyRemoteService';
import { usePlayerStore } from '@/stores/PlayerStore';
import { useSettingsStore } from '@/stores/SettingsStore';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { usePathname } from 'expo-router';
import React, { useEffect, useRef } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export const MiniPlayer = () => {
  const { currentTrack, isPlaying, setPlaying, next, prev, queue, currentIndex } = usePlayerStore();
  const lastPlayedUri = useRef<string | null>(null);
  const pathname = usePathname();
  const { theme } = useSettingsStore();
  const activeTheme = THEMES[theme] || THEMES.midnight;

  // Button animations
  const playScale = useSharedValue(1);
  const prevScale = useSharedValue(1);
  const nextScale = useSharedValue(1);

  // Sync Store -> Spotify
  useEffect(() => {
    const syncSpotify = async () => {
      if (!currentTrack) return;

      if (currentTrack.uri !== lastPlayedUri.current) {
        lastPlayedUri.current = currentTrack.uri;

        if (currentTrack.origin === 'sync') {
          return;
        }

        try {
          const uris = queue.length > 0 ? queue.slice(currentIndex).map(t => t.uri) : [currentTrack.uri];
          await spotifyRemote.play(uris);
          usePlayerStore.getState().setPlaying(true);
        } catch (err) {
          console.warn('[MiniPlayer] Failed to sync playback:', err);
        }
      }
    };
    syncSpotify();
  }, [currentTrack, queue, currentIndex]);

  const handleTogglePlay = async () => {
    if (isPlaying) {
      await spotifyRemote.pause();
      setPlaying(false);
    } else {
      await spotifyRemote.play();
      setPlaying(true);
    }
  };

  const handleNext = async () => {
    next();
  };

  const handlePrev = async () => {
    prev();
  };

  const createPressHandlers = (scaleValue: Animated.SharedValue<number>) => ({
    onPressIn: () => {
      scaleValue.value = withSpring(0.85, { damping: 15, stiffness: 400 });
    },
    onPressOut: () => {
      scaleValue.value = withSpring(1, { damping: 15, stiffness: 400 });
    },
  });

  const playButtonStyle = useAnimatedStyle(() => ({
    transform: [{ scale: playScale.value }],
  }));

  const prevButtonStyle = useAnimatedStyle(() => ({
    transform: [{ scale: prevScale.value }],
  }));

  const nextButtonStyle = useAnimatedStyle(() => ({
    transform: [{ scale: nextScale.value }],
  }));

  // Hide on Home Screen (Main Player) and Graph Screen
  if (pathname === '/') return null;
  if (pathname === '/graph') return null;
  if (!currentTrack) return null;

  const MiniPlayerContent = () => (
    <View style={styles.innerContainer}>
      {/* Album Art Thumbnail */}
      {currentTrack.artwork ? (
        <Image
          source={{ uri: currentTrack.artwork }}
          style={styles.thumbnail}
          contentFit="cover"
        />
      ) : (
        <View style={[styles.thumbnailPlaceholder, { backgroundColor: activeTheme.surface }]}>
          <Ionicons name="musical-notes" size={20} color={activeTheme.textMuted} />
        </View>
      )}

      {/* Track Info */}
      <View style={styles.info}>
        <Text style={[styles.title, { color: activeTheme.text }]} numberOfLines={1}>
          {currentTrack.title}
        </Text>
        <Text style={[styles.artist, { color: activeTheme.textSecondary }]} numberOfLines={1}>
          {currentTrack.artist}
        </Text>
      </View>

      {/* Controls */}
      <View style={styles.controls}>
        <AnimatedPressable
          onPress={handlePrev}
          style={[styles.ctrlBtn, prevButtonStyle]}
          {...createPressHandlers(prevScale)}
        >
          <Ionicons name="play-skip-back" size={20} color={activeTheme.text} />
        </AnimatedPressable>

        <AnimatedPressable
          onPress={handleTogglePlay}
          style={playButtonStyle}
          {...createPressHandlers(playScale)}
        >
          <LinearGradient
            colors={[activeTheme.spotifyGreen, '#1ED760']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.playBtn}
          >
            <Ionicons
              name={isPlaying ? 'pause' : 'play'}
              size={18}
              color="#000"
              style={{ marginLeft: isPlaying ? 0 : 2 }}
            />
          </LinearGradient>
        </AnimatedPressable>

        <AnimatedPressable
          onPress={handleNext}
          style={[styles.ctrlBtn, nextButtonStyle]}
          {...createPressHandlers(nextScale)}
        >
          <Ionicons name="play-skip-forward" size={20} color={activeTheme.text} />
        </AnimatedPressable>
      </View>
    </View>
  );

  // iOS with native blur
  if (Platform.OS === 'ios') {
    return (
      <View style={[styles.container, { borderColor: activeTheme.border }]}>
        <BlurView intensity={80} tint="dark" style={styles.blur}>
          <MiniPlayerContent />
        </BlurView>
      </View>
    );
  }

  // Android fallback
  return (
    <View style={[styles.container, styles.androidContainer, { borderColor: activeTheme.border }]}>
      <LinearGradient
        colors={['rgba(20, 20, 30, 0.95)', 'rgba(10, 10, 20, 0.98)']}
        style={styles.androidGradient}
      >
        <MiniPlayerContent />
      </LinearGradient>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 75,
    left: 12,
    right: 12,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 8,
    },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 12,
    zIndex: 1000,
  },
  androidContainer: {
    backgroundColor: 'rgba(15, 15, 25, 0.95)',
  },
  blur: {
    flex: 1,
  },
  androidGradient: {
    flex: 1,
  },
  innerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  thumbnail: {
    width: 44,
    height: 44,
    borderRadius: 8,
    marginRight: 12,
  },
  thumbnailPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 8,
    marginRight: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: {
    flex: 1,
    marginRight: 12,
  },
  title: {
    fontWeight: '600',
    fontSize: 14,
    marginBottom: 2,
  },
  artist: {
    fontSize: 12,
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  ctrlBtn: {
    padding: 8,
  },
  playBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#1DB954',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 6,
  },
});
