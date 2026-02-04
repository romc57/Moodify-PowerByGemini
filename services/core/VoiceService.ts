import * as Speech from 'expo-speech';
import { spotifyRemote } from '../spotify/SpotifyRemoteService';

/**
 * VoiceService manages voice announcements for mood adjustments
 * Coordinates with Spotify playback to pause/resume during announcements
 * Uses expo-speech for TTS (no expo-av dependency needed)
 */
class VoiceService {
    private static instance: VoiceService;
    private wasPlaying: boolean = false;

    private constructor() { }

    static getInstance(): VoiceService {
        if (!VoiceService.instance) {
            VoiceService.instance = new VoiceService();
        }
        return VoiceService.instance;
    }

    /**
     * Pause Spotify playback before voice announcement
     */
    private async pauseSpotifyIfPlaying(): Promise<void> {
        try {
            const state = await spotifyRemote.getCurrentState();
            this.wasPlaying = state?.is_playing || false;

            if (this.wasPlaying) {
                await spotifyRemote.pause();
                // Give Spotify time to pause
                await new Promise(r => setTimeout(r, 300));
            }
        } catch (error) {
            console.warn('[VoiceService] Failed to pause Spotify:', error);
        }
    }

    /**
     * Resume Spotify playback after voice announcement
     */
    private async resumeSpotifyIfWasPlaying(): Promise<void> {
        try {
            if (this.wasPlaying) {
                // Wait a bit before resuming
                await new Promise(r => setTimeout(r, 500));
                await spotifyRemote.play();
            }
        } catch (error) {
            console.warn('[VoiceService] Failed to resume Spotify:', error);
        }
    }

    /**
     * Play hardcoded mood adjustment intro announcement
     */
    async playMoodAdjustmentIntro(shouldPause: boolean = true, autoResume: boolean = true): Promise<void> {
        const message = "I've noticed you're not feeling the vibe. Let me find something better for you.";
        await this.speak(message, shouldPause, autoResume);
    }

    /**
     * Play song intro announcement
     */
    async playSongIntro(songTitle: string, artistName: string, shouldPause: boolean = true, autoResume: boolean = true): Promise<void> {
        const message = `Here's ${songTitle} by ${artistName} to lift your mood.`;
        await this.speak(message, shouldPause, autoResume);
    }

    /**
     * Speak text with timeout protection
     */
    private speakWithTimeout(text: string, timeoutMs: number = 10000): Promise<void> {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                Speech.stop();
                console.warn('[VoiceService] Speech timed out');
                resolve(); // Resolve instead of reject to prevent blocking
            }, timeoutMs);

            Speech.speak(text, {
                language: 'en-US',
                pitch: 1.0,
                rate: 0.9,
                onDone: () => {
                    clearTimeout(timeout);
                    resolve();
                },
                onError: (error) => {
                    clearTimeout(timeout);
                    console.error('[VoiceService] Speech error:', error);
                    resolve(); // Resolve to prevent blocking
                }
            });
        });
    }

    /**
     * Speak text using TTS with Spotify coordination
     */
    private async speak(text: string, shouldPause: boolean = true, autoResume: boolean = true): Promise<void> {
        try {
            console.log('[VoiceService] Speaking:', text);

            // Pause Spotify
            if (shouldPause) {
                await this.pauseSpotifyIfPlaying();
            }

            // Speak the text with timeout protection
            await this.speakWithTimeout(text, 10000);

            // Small delay for natural transition
            await new Promise(r => setTimeout(r, 300));

        } finally {
            // Resume Spotify only if requested
            if (shouldPause && autoResume) {
                await this.resumeSpotifyIfWasPlaying();
            }
        }
    }

    /**
     * Play announcement with fade transition
     * This version includes a fade effect by gradually resuming Spotify
     */
    async playWithFade(text: string, autoResume: boolean = true): Promise<void> {
        try {
            console.log('[VoiceService] Speaking with fade:', text);

            // Pause Spotify
            await this.pauseSpotifyIfPlaying();

            // Speak the text with timeout protection
            await this.speakWithTimeout(text, 10000);

            // Fade transition: wait a bit longer before resuming
            await new Promise(r => setTimeout(r, 800));

        } catch (error) {
            console.error('[VoiceService] Speak with fade error:', error);
        } finally {
            // Resume Spotify
            if (autoResume) {
                await this.resumeSpotifyIfWasPlaying();
            }
        }
    }

    /**
     * Stop any ongoing speech
     */
    async stop(): Promise<void> {
        try {
            await Speech.stop();
        } catch (error) {
            console.error('[VoiceService] Stop error:', error);
        }
    }

    /**
     * Check if speech synthesis is currently active
     */
    async isSpeaking(): Promise<boolean> {
        try {
            return await Speech.isSpeakingAsync();
        } catch {
            return false;
        }
    }

    /**
     * Check if TTS is available on this device
     * Note: expo-speech doesn't provide a direct availability check,
     * so we assume it's available and handle errors gracefully
     */
    isSpeechAvailable(): boolean {
        return true; // expo-speech handles unavailability internally
    }
}

export const voiceService = VoiceService.getInstance();
