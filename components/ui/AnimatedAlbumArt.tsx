/**
 * AnimatedAlbumArt - Album Art with Glow and Animations
 * Features: Background glow, subtle rotation when playing, reflection overlay
 */

import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

interface AnimatedAlbumArtProps {
  uri?: string;
  size?: number;
  isPlaying?: boolean;
  dominantColor?: string;
}

export const AnimatedAlbumArt: React.FC<AnimatedAlbumArtProps> = ({
  uri,
  size = 320,
  isPlaying = false,
  dominantColor = '#1DB954',
}) => {
  const glowScale = useSharedValue(1);
  const glowOpacity = useSharedValue(0.3);
  const imageScale = useSharedValue(1);

  useEffect(() => {
    if (isPlaying) {
      // Subtle pulsing glow when playing
      glowScale.value = withRepeat(
        withSequence(
          withTiming(1.08, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
          withTiming(1, { duration: 2000, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        true
      );
      glowOpacity.value = withRepeat(
        withSequence(
          withTiming(0.5, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
          withTiming(0.25, { duration: 2000, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        true
      );
      imageScale.value = withSpring(1, { damping: 15 });
    } else {
      glowScale.value = withTiming(1, { duration: 500 });
      glowOpacity.value = withTiming(0.2, { duration: 500 });
      imageScale.value = withSpring(0.95, { damping: 15 });
    }
  }, [isPlaying]);

  const glowStyle = useAnimatedStyle(() => ({
    transform: [{ scale: glowScale.value }],
    opacity: glowOpacity.value,
  }));

  const imageContainerStyle = useAnimatedStyle(() => ({
    transform: [{ scale: imageScale.value }],
  }));

  const borderRadius = size * 0.08;

  return (
    <View style={[styles.container, { width: size * 1.2, height: size * 1.2 }]}>
      {/* Background glow */}
      <Animated.View
        style={[
          styles.glow,
          glowStyle,
          {
            width: size * 1.1,
            height: size * 1.1,
            borderRadius: size * 0.12,
            backgroundColor: dominantColor,
          },
        ]}
      />

      {/* Second glow layer for depth */}
      <Animated.View
        style={[
          styles.glow,
          glowStyle,
          {
            width: size * 1.05,
            height: size * 1.05,
            borderRadius: size * 0.1,
            backgroundColor: dominantColor,
            opacity: 0.15,
          },
        ]}
      />

      {/* Main album art container */}
      <Animated.View style={[styles.imageContainer, imageContainerStyle]}>
        {uri ? (
          <Image
            source={{ uri }}
            style={[
              styles.image,
              {
                width: size,
                height: size,
                borderRadius,
              },
            ]}
            contentFit="cover"
            transition={500}
          />
        ) : (
          <LinearGradient
            colors={['#1a1a2e', '#16213e', '#0f0f1a']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[
              styles.placeholder,
              {
                width: size,
                height: size,
                borderRadius,
              },
            ]}
          >
            <Ionicons name="musical-notes" size={size * 0.3} color="rgba(255,255,255,0.3)" />
          </LinearGradient>
        )}

        {/* Reflection/shine overlay */}
        <LinearGradient
          colors={['rgba(255,255,255,0.15)', 'rgba(255,255,255,0.05)', 'transparent']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[
            styles.reflection,
            {
              width: size,
              height: size * 0.5,
              borderTopLeftRadius: borderRadius,
              borderTopRightRadius: borderRadius,
            },
          ]}
        />
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  glow: {
    position: 'absolute',
  },
  imageContainer: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.5,
    shadowRadius: 30,
    elevation: 20,
  },
  image: {
    backgroundColor: '#1a1a2e',
  },
  placeholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  reflection: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
});
