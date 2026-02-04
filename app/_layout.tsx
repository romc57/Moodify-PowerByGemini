import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import 'react-native-reanimated';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { registerBackgroundTask } from '@/BackgroundTask';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useBackgroundAudio } from '@/hooks/useBackgroundAudio';

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  const colorScheme = useColorScheme();

  // Enable background audio persistence (CRITICAL for AutoDJ)
  useBackgroundAudio();

  // Register background task on app start
  useEffect(() => {
    registerBackgroundTask().catch(() => {
      // Silently ignore background task registration errors in dev
    });
  }, []);

  return (
    <SafeAreaProvider>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <Stack>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="queue" options={{ presentation: 'modal', title: 'Queue' }} />
          <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
        </Stack>
        <StatusBar style="auto" />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
