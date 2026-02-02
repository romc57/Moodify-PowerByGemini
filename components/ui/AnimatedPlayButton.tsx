/**
 * AnimatedPlayButton - Animated Play/Pause Button with Glow
 * Features: Pulse animation, gradient fill, glow rings
 */

import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

interface AnimatedPlayButtonProps {
  isPlaying: boolean;
  onPress: () => void;
  size?: number;
  gradientColors?: readonly [string, string, ...string[]];
  glowColor?: string;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export const AnimatedPlayButton: React.FC<AnimatedPlayButtonProps> = ({
  isPlaying,
  onPress,
  size = 80,
  gradientColors = ['#1DB954', '#1ED760'] as const,
  glowColor = 'rgba(29, 185, 84, 0.5)',
}) => {
  const scale = useSharedValue(1);
  const pulseScale = useSharedValue(1);
  const pulseOpacity = useSharedValue(0.3);

  // Pulse animation when playing
  useEffect(() => {
    if (isPlaying) {
      pulseScale.value = withRepeat(
        withSequence(
          withTiming(1.15, { duration: 1000, easing: Easing.inOut(Easing.ease) }),
          withTiming(1, { duration: 1000, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        true
      );
      pulseOpacity.value = withRepeat(
        withSequence(
          withTiming(0.6, { duration: 1000, easing: Easing.inOut(Easing.ease) }),
          withTiming(0.2, { duration: 1000, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        true
      );
    } else {
      pulseScale.value = withTiming(1, { duration: 300 });
      pulseOpacity.value = withTiming(0.2, { duration: 300 });
    }
  }, [isPlaying]);

  const handlePressIn = () => {
    scale.value = withSpring(0.9, { damping: 15, stiffness: 400 });
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 15, stiffness: 400 });
  };

  const buttonStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const outerGlowStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
    opacity: pulseOpacity.value,
  }));

  const innerGlowStyle = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(pulseScale.value, [1, 1.15], [1, 1.08]) }],
    opacity: interpolate(pulseOpacity.value, [0.2, 0.6], [0.3, 0.5]),
  }));

  return (
    <View style={[styles.container, { width: size * 1.6, height: size * 1.6 }]}>
      {/* Outer glow ring */}
      <Animated.View
        style={[
          styles.glowRing,
          outerGlowStyle,
          {
            width: size * 1.5,
            height: size * 1.5,
            borderRadius: size * 0.75,
            backgroundColor: glowColor,
          },
        ]}
      />

      {/* Inner glow ring */}
      <Animated.View
        style={[
          styles.glowRing,
          innerGlowStyle,
          {
            width: size * 1.25,
            height: size * 1.25,
            borderRadius: size * 0.625,
            backgroundColor: glowColor,
          },
        ]}
      />

      {/* Main button */}
      <AnimatedPressable
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={[buttonStyle, styles.button]}
      >
        <LinearGradient
          colors={gradientColors}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[
            styles.gradient,
            {
              width: size,
              height: size,
              borderRadius: size / 2,
              shadowColor: gradientColors[0],
            },
          ]}
        >
          <Ionicons
            name={isPlaying ? 'pause' : 'play'}
            size={size * 0.4}
            color="#000"
            style={{ marginLeft: isPlaying ? 0 : size * 0.05 }}
          />
        </LinearGradient>
      </AnimatedPressable>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  glowRing: {
    position: 'absolute',
  },
  button: {
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 12,
  },
  gradient: {
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
});
