/**
 * GlassCard - Glassmorphism Card Component
 * Features: Blur effect, glow border, animated scale
 */

import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { Platform, StyleSheet, View, ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

interface GlassCardProps {
  children: React.ReactNode;
  style?: ViewStyle;
  intensity?: number;
  tint?: 'light' | 'dark' | 'default';
  glowColor?: string;
  borderGlow?: boolean;
  padding?: number;
  borderRadius?: number;
}

export const GlassCard: React.FC<GlassCardProps> = ({
  children,
  style,
  intensity = 20,
  tint = 'dark',
  glowColor = '#667EEA',
  borderGlow = true,
  padding = 20,
  borderRadius = 24,
}) => {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const containerStyles = [
    styles.container,
    { borderRadius },
    borderGlow && {
      borderWidth: 1,
      borderColor: `${glowColor}40`,
    },
    style,
  ];

  const contentStyles = [
    styles.content,
    { padding },
  ];

  // iOS with native blur
  if (Platform.OS === 'ios') {
    return (
      <Animated.View style={[containerStyles, animatedStyle]}>
        <BlurView intensity={intensity} tint={tint} style={[styles.blur, { borderRadius }]}>
          {borderGlow && (
            <View
              style={[
                styles.glowBorder,
                {
                  borderRadius,
                  borderColor: `${glowColor}60`,
                  shadowColor: glowColor,
                },
              ]}
            />
          )}
          <View style={contentStyles}>{children}</View>
        </BlurView>
      </Animated.View>
    );
  }

  // Android fallback with semi-transparent background + gradient
  return (
    <Animated.View style={[containerStyles, animatedStyle]}>
      <LinearGradient
        colors={['rgba(255, 255, 255, 0.1)', 'rgba(255, 255, 255, 0.05)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.androidGradient, { borderRadius }]}
      >
        {borderGlow && (
          <View
            style={[
              styles.glowBorder,
              {
                borderRadius,
                borderColor: `${glowColor}40`,
                shadowColor: glowColor,
              },
            ]}
          />
        )}
        <View style={contentStyles}>{children}</View>
      </LinearGradient>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
  },
  blur: {
    flex: 1,
    overflow: 'hidden',
  },
  glowBorder: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 15,
    elevation: 5,
  },
  content: {
    flex: 1,
  },
  androidGradient: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
});
