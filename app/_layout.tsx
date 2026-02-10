import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import { Platform, Text, View } from 'react-native';
import 'react-native-reanimated';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { useBackgroundAudio } from '@/hooks/useBackgroundAudio';

import { SetupScreen } from '@/components/SetupScreen';
import { dbService } from '@/services/database';
import { graphService } from '@/services/graph/GraphService';
import { useInitializationStore } from '@/stores/InitializationStore';

export const unstable_settings = {
  anchor: '(tabs)',
};

class RootErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  state = { hasError: false, error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError && this.state.error) {
      return (
        <View style={{ flex: 1, justifyContent: 'center', padding: 20, backgroundColor: '#111' }}>
          <Text style={{ color: '#f44', fontSize: 16, marginBottom: 8 }}>App error</Text>
          <Text style={{ color: '#ccc', fontFamily: 'monospace', fontSize: 12 }}>
            {this.state.error.message}
          </Text>
        </View>
      );
    }
    return this.props.children;
  }
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const { step, setStep } = useInitializationStore();

  useBackgroundAudio();

  useEffect(() => {
    if (Platform.OS === 'web') return;
    import('@/BackgroundTask').then((m) => m.registerBackgroundTask().catch(() => {})).catch(() => {});
  }, []);

  // At init: if auth is ready and graph is empty, show setup so liked-songs ingestion runs
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = await dbService.getServiceToken('spotify');
        if (!token || cancelled) return;
        const populated = await graphService.isGraphPopulated();
        if (!cancelled && !populated) setStep('GRAPH');
      } catch {
        // ignore; SetupScreen checkStatus will handle flow
      }
    })();
    return () => { cancelled = true; };
  }, [setStep]);

  return (
    <RootErrorBoundary>
      <SafeAreaProvider>
        <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
          <Stack>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="callback" options={{ headerShown: false }} />
            <Stack.Screen name="queue" options={{ presentation: 'modal', title: 'Queue' }} />
            <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
          </Stack>
          {step !== 'READY' && <SetupScreen />}
          <StatusBar style="auto" />
        </ThemeProvider>
      </SafeAreaProvider>
    </RootErrorBoundary>
  );
}
