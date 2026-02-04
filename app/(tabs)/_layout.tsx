/**
 * Tab Layout - Modern Tab Bar with Blur and Animations
 * Features: Glassmorphism tab bar, animated icons, haptic feedback
 */

import { MiniPlayer } from '@/components/MiniPlayer';
import { THEMES } from '@/constants/theme';
import { useSettingsStore } from '@/stores/SettingsStore';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { Tabs } from 'expo-router';
import React, { useEffect } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

// Animated Tab Icon Component
const AnimatedTabIcon = ({
  name,
  focused,
  color,
}: {
  name: keyof typeof Ionicons.glyphMap;
  focused: boolean;
  color: string;
}) => {
  const scale = useSharedValue(1);
  const { theme } = useSettingsStore();
  const activeTheme = THEMES[theme] || THEMES.midnight;

  useEffect(() => {
    scale.value = withSpring(focused ? 1.15 : 1, {
      damping: 12,
      stiffness: 300,
    });
  }, [focused]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <View style={styles.iconWrapper}>
      <Animated.View style={[styles.iconContainer, animatedStyle]}>
        <Ionicons name={name} size={26} color={color} />
      </Animated.View>
      {focused && (
        <View
          style={[
            styles.activeIndicator,
            {
              backgroundColor: activeTheme.spotifyGreen,
              shadowColor: activeTheme.spotifyGreen,
            },
          ]}
        />
      )}
    </View>
  );
};

// Custom Tab Bar Button with Haptics
const HapticTabButton = (props: any) => {
  const { onPress, onLongPress, ...rest } = props;

  const handlePress = (e: any) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress?.(e);
  };

  return (
    <Pressable
      {...rest}
      onPress={handlePress}
      onLongPress={onLongPress}
      style={({ pressed }) => [
        rest.style,
        { opacity: pressed ? 0.7 : 1 },
      ]}
    />
  );
};

// Tab Bar Background Component
const TabBarBackground = () => {
  const { theme } = useSettingsStore();
  const activeTheme = THEMES[theme] || THEMES.midnight;

  if (Platform.OS === 'ios') {
    return (
      <BlurView
        intensity={80}
        tint="dark"
        style={[StyleSheet.absoluteFill, styles.blurContainer]}
      >
        <View
          style={[
            styles.borderTop,
            { backgroundColor: activeTheme.border },
          ]}
        />
      </BlurView>
    );
  }

  // Android fallback
  return (
    <LinearGradient
      colors={['rgba(10, 10, 20, 0.98)', 'rgba(5, 5, 15, 0.99)']}
      style={StyleSheet.absoluteFill}
    >
      <View
        style={[
          styles.borderTop,
          { backgroundColor: activeTheme.border },
        ]}
      />
    </LinearGradient>
  );
};

import { usePlayerStore } from '@/stores/PlayerStore';

export default function TabLayout() {
  const { theme } = useSettingsStore();
  const activeTheme = THEMES[theme] || THEMES.midnight;

  // Sync with Spotify on app load - always show current playback
  useEffect(() => {
    const initSync = async () => {
      console.log('[TabLayout] Syncing with Spotify...');
      await usePlayerStore.getState().syncFromSpotify();
      usePlayerStore.getState().startAutoSync(5000);
    };
    initSync();

    return () => {
      usePlayerStore.getState().stopAutoSync();
    };
  }, []);

  return (
    <>
      <Tabs
        screenOptions={{
          tabBarActiveTintColor: activeTheme.spotifyGreen,
          tabBarInactiveTintColor: activeTheme.textMuted,
          headerShown: false,
          tabBarStyle: styles.tabBar,
          tabBarBackground: TabBarBackground,
          tabBarButton: HapticTabButton,
          tabBarLabelStyle: styles.tabLabel,
          tabBarItemStyle: styles.tabItem,
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: 'Home',
            tabBarIcon: ({ color, focused }: { color: string; focused: boolean }) => (
              <AnimatedTabIcon
                name={focused ? 'home' : 'home-outline'}
                focused={focused}
                color={color}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="settings"
          options={{
            title: 'Settings',
            tabBarIcon: ({ color, focused }: { color: string; focused: boolean }) => (
              <AnimatedTabIcon
                name={focused ? 'settings' : 'settings-outline'}
                focused={focused}
                color={color}
              />
            ),
          }}
        />
      </Tabs>
      <MiniPlayer />
    </>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    position: 'absolute',
    borderTopWidth: 0,
    elevation: 0,
    backgroundColor: 'transparent',
    height: 70,
    paddingBottom: 8,
    paddingTop: 8,
  },
  blurContainer: {
    overflow: 'hidden',
  },
  borderTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1,
  },
  iconWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 40,
  },
  iconContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeIndicator: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    marginTop: 4,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 4,
    elevation: 4,
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },
  tabItem: {
    paddingTop: 4,
  },
});
