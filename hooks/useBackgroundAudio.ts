import { Audio, InterruptionModeAndroid, InterruptionModeIOS } from 'expo-av';
import { useEffect } from 'react';
import { Platform } from 'react-native';

/**
 * Configures the audio session to allow background playback (native only).
 */
export function useBackgroundAudio() {
    useEffect(() => {
        if (Platform.OS === 'web') return;
        async function configureAudio() {
            try {
                await Audio.setAudioModeAsync({
                    // startsAudioSessionWait: false, // REMOVED: Invalid property in this SDK version
                    playsInSilentModeIOS: true,
                    interruptionModeIOS: InterruptionModeIOS.DoNotMix,
                    interruptionModeAndroid: InterruptionModeAndroid.DoNotMix,
                    shouldDuckAndroid: true,
                    staysActiveInBackground: true, // CRITICAL: Allows app to run in background
                    playThroughEarpieceAndroid: false,
                });
                console.log('[BackgroundAudio] Audio mode configured for background execution');
            } catch (error) {
                console.warn('[BackgroundAudio] Failed to configure audio mode:', error);
            }
        }

        configureAudio();
    }, []);
}
