/**
 * AIReasoningChip - AI Status/Reasoning Display Chip
 * Features: Glassmorphism, animated sparkle icon, gradient border
 */

import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';

interface AIReasoningChipProps {
  text: string;
  isThinking?: boolean;
  accentColor?: string;
}

export const AIReasoningChip: React.FC<AIReasoningChipProps> = ({
  text,
  isThinking = false,
  accentColor = '#A855F7',
}) => {
  const sparkleRotation = useSharedValue(0);
  const sparkleScale = useSharedValue(1);
  const shimmerPosition = useSharedValue(0);

  useEffect(() => {
    // Continuous sparkle animation
    sparkleRotation.value = withRepeat(
      withTiming(360, { duration: 3000, easing: Easing.linear }),
      -1,
      false
    );

    if (isThinking) {
      sparkleScale.value = withRepeat(
        withSequence(
          withTiming(1.2, { duration: 400, easing: Easing.inOut(Easing.ease) }),
          withTiming(1, { duration: 400, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        true
      );
      shimmerPosition.value = withRepeat(
        withTiming(1, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
        -1,
        false
      );
    } else {
      sparkleScale.value = withTiming(1, { duration: 300 });
    }
  }, [isThinking]);

  const sparkleStyle = useAnimatedStyle(() => ({
    transform: [
      { rotate: `${sparkleRotation.value}deg` },
      { scale: sparkleScale.value },
    ],
  }));

  const ChipContent = () => (
    <View style={styles.content}>
      <Animated.View style={[styles.iconContainer, sparkleStyle]}>
        <Ionicons name="sparkles" size={16} color={accentColor} />
      </Animated.View>
      <Text style={styles.text} numberOfLines={2}>
        {text}
      </Text>
    </View>
  );

  const gradientColors = [
    `${accentColor}20`,
    `${accentColor}10`,
  ] as const;

  if (Platform.OS === 'ios') {
    return (
      <View style={[styles.container, { borderColor: `${accentColor}40` }]}>
        <BlurView intensity={30} tint="dark" style={styles.blur}>
          <LinearGradient
            colors={gradientColors}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.gradient}
          >
            <ChipContent />
          </LinearGradient>
        </BlurView>
      </View>
    );
  }

  // Android fallback
  return (
    <View style={[styles.container, styles.androidContainer, { borderColor: `${accentColor}40` }]}>
      <LinearGradient
        colors={[`${accentColor}15`, `${accentColor}08`]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.gradient, styles.androidGradient]}
      >
        <ChipContent />
      </LinearGradient>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    maxWidth: '100%',
  },
  androidContainer: {
    backgroundColor: 'rgba(168, 85, 247, 0.08)',
  },
  blur: {
    overflow: 'hidden',
    borderRadius: 20,
  },
  gradient: {
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  androidGradient: {
    borderRadius: 20,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconContainer: {
    marginRight: 10,
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    flex: 1,
    color: 'rgba(255, 255, 255, 0.85)',
    fontSize: 14,
    fontStyle: 'italic',
    lineHeight: 20,
  },
});
