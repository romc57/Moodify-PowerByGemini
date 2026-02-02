/**
 * WaveformProgress - Animated Waveform Progress Bar
 * Features: Animated bars, progress indicator, glow effect
 */

import React, { useEffect, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

interface WaveformProgressProps {
  progress: number; // 0 to 1
  isPlaying: boolean;
  barCount?: number;
  activeColor?: string;
  inactiveColor?: string;
  currentTime?: string;
  totalTime?: string;
}

const WaveformBar: React.FC<{
  index: number;
  isActive: boolean;
  isPlaying: boolean;
  activeColor: string;
  inactiveColor: string;
  seed: number;
}> = ({ index, isActive, isPlaying, activeColor, inactiveColor, seed }) => {
  const heightValue = useSharedValue(0.3 + seed * 0.4);

  useEffect(() => {
    if (isPlaying && isActive) {
      const randomDuration = 300 + seed * 400;
      const minHeight = 0.25 + seed * 0.2;
      const maxHeight = 0.5 + seed * 0.5;

      heightValue.value = withRepeat(
        withSequence(
          withTiming(maxHeight, {
            duration: randomDuration,
            easing: Easing.inOut(Easing.ease),
          }),
          withTiming(minHeight, {
            duration: randomDuration * 0.8,
            easing: Easing.inOut(Easing.ease),
          })
        ),
        -1,
        true
      );
    } else {
      heightValue.value = withTiming(0.3, { duration: 400 });
    }
  }, [isPlaying, isActive]);

  const barStyle = useAnimatedStyle(() => ({
    height: `${heightValue.value * 100}%`,
    backgroundColor: isActive ? activeColor : inactiveColor,
    shadowColor: isActive ? activeColor : 'transparent',
    shadowOpacity: isActive ? 0.6 : 0,
    shadowRadius: isActive ? 4 : 0,
  }));

  return (
    <View style={styles.barContainer}>
      <Animated.View style={[styles.bar, barStyle]} />
    </View>
  );
};

export const WaveformProgress: React.FC<WaveformProgressProps> = ({
  progress,
  isPlaying,
  barCount = 40,
  activeColor = '#1DB954',
  inactiveColor = 'rgba(255, 255, 255, 0.15)',
  currentTime = '0:00',
  totalTime = '0:00',
}) => {
  // Generate random seeds for bar heights (memoized)
  const seeds = useMemo(() =>
    Array.from({ length: barCount }, () => Math.random()),
    [barCount]
  );

  const progressIndicatorStyle = useAnimatedStyle(() => ({
    left: `${progress * 100}%`,
  }));

  return (
    <View style={styles.wrapper}>
      <View style={styles.container}>
        {seeds.map((seed, index) => (
          <WaveformBar
            key={index}
            index={index}
            isActive={index / barCount <= progress}
            isPlaying={isPlaying}
            activeColor={activeColor}
            inactiveColor={inactiveColor}
            seed={seed}
          />
        ))}

        {/* Progress indicator line */}
        <Animated.View
          style={[
            styles.progressIndicator,
            progressIndicatorStyle,
            {
              backgroundColor: activeColor,
              shadowColor: activeColor,
            },
          ]}
        />
      </View>

      {/* Time labels */}
      <View style={styles.timeRow}>
        <Text style={styles.timeText}>{currentTime}</Text>
        <Text style={styles.timeText}>-{totalTime}</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    width: '100%',
  },
  container: {
    flexDirection: 'row',
    height: 50,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    position: 'relative',
  },
  barContainer: {
    flex: 1,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 1,
  },
  bar: {
    width: 3,
    borderRadius: 2,
    shadowOffset: { width: 0, height: 0 },
    elevation: 2,
  },
  progressIndicator: {
    position: 'absolute',
    width: 2,
    height: '110%',
    borderRadius: 1,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 6,
    elevation: 4,
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    marginTop: 8,
  },
  timeText: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.7)',
    fontVariant: ['tabular-nums'],
    fontWeight: '500',
  },
});
