import { create } from 'zustand';
import { DEFAULT_THEME, ThemeName } from '../constants/theme';
import { dbService } from '../services/database';

interface SettingsState {
    theme: ThemeName;
    autoTheme: boolean;
    geminiApiKey: string | null;
    spotifyClientId: string | null;
    isLoading: boolean;
    isConnected: boolean;

    // Actions
    setTheme: (theme: ThemeName) => Promise<void>;
    setAutoTheme: (enabled: boolean) => Promise<void>;
    setThemeFromMood: (mood: string, energyLevel: string) => Promise<void>;
    setGeminiApiKey: (key: string) => Promise<void>;
    setSpotifyClientId: (clientId: string) => Promise<void>;
    checkConnection: () => Promise<void>;
    loadSettings: () => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
    theme: DEFAULT_THEME,
    autoTheme: true, // Default to auto theme
    geminiApiKey: null,
    spotifyClientId: null,
    isLoading: true,
    isConnected: false,

    setTheme: async (theme) => {
        set({ theme });
        await dbService.setPreference('theme', theme);
    },

    setAutoTheme: async (enabled) => {
        set({ autoTheme: enabled });
        await dbService.setPreference('autoTheme', enabled ? 'true' : 'false');
    },

    setThemeFromMood: async (mood: string, energyLevel: string) => {
        const { autoTheme } = get();
        if (!autoTheme) return;

        // Map mood and energy to theme
        let selectedTheme: ThemeName = 'midnight';

        const moodLower = mood.toLowerCase();
        const energyLower = energyLevel.toLowerCase();

        // High energy moods
        if (energyLower === 'high' || moodLower.includes('energetic') || moodLower.includes('upbeat')) {
            selectedTheme = 'neon';
        }
        // Calm/chill moods
        else if (moodLower.includes('chill') || moodLower.includes('calm') || moodLower.includes('relaxed')) {
            selectedTheme = 'ocean';
        }
        // Focused/productive moods
        else if (moodLower.includes('focused') || moodLower.includes('productive')) {
            selectedTheme = 'aurora';
        }
        // Melancholic/emotional moods
        else if (moodLower.includes('melancholic') || moodLower.includes('sad') || moodLower.includes('emotional')) {
            selectedTheme = 'sunset';
        }
        // Default to midnight for neutral/other moods
        else {
            selectedTheme = 'midnight';
        }

        console.log(`[AutoTheme] Mood: ${mood}, Energy: ${energyLevel} -> Theme: ${selectedTheme}`);
        set({ theme: selectedTheme });
        await dbService.setPreference('theme', selectedTheme);
    },

    setGeminiApiKey: async (key) => {
        set({ geminiApiKey: key });
        await dbService.setPreference('gemini_api_key', key);
    },

    setSpotifyClientId: async (clientId) => {
        set({ spotifyClientId: clientId });
        await dbService.setPreference('spotify_client_id', clientId);
    },

    checkConnection: async () => {
        const token = await dbService.getServiceToken('spotify');
        set({ isConnected: !!token });
    },

    loadSettings: async () => {
        set({ isLoading: true });
        try {
            const storedTheme = await dbService.getPreference('theme');
            const storedAutoTheme = await dbService.getPreference('autoTheme');
            const storedGeminiKey = await dbService.getPreference('gemini_api_key');
            const storedSpotifyClientId = await dbService.getPreference('spotify_client_id');
            const token = await dbService.getServiceToken('spotify');

            set({
                theme: (storedTheme as ThemeName) || DEFAULT_THEME,
                autoTheme: storedAutoTheme !== 'false', // Default true if not set
                geminiApiKey: storedGeminiKey,
                spotifyClientId: storedSpotifyClientId,
                isConnected: !!token
            });
        } catch (e) {
            console.error('Failed to load settings', e);
        } finally {
            set({ isLoading: false });
        }
    },
}));
