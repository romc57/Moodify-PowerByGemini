/**
 * Modern Theme System for Moodify
 * Features: Gradients, Glassmorphism, Glow Effects
 */

import { Platform } from 'react-native';

// ============================================
// LEGACY COLORS (for backward compatibility)
// ============================================

const tintColorLight = '#0a7ea4';
const tintColorDark = '#fff';

export const Colors = {
  light: {
    text: '#11181C',
    background: '#fff',
    tint: tintColorLight,
    icon: '#687076',
    tabIconDefault: '#687076',
    tabIconSelected: tintColorLight,
  },
  dark: {
    text: '#ECEDEE',
    background: '#151718',
    tint: tintColorDark,
    icon: '#9BA1A6',
    tabIconDefault: '#9BA1A6',
    tabIconSelected: tintColorDark,
  },
};

export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    serif: 'ui-serif',
    rounded: 'ui-rounded',
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});

// ============================================
// MODERN THEME SYSTEM
// ============================================

export type ThemeName = 'midnight' | 'aurora' | 'sunset' | 'neon' | 'ocean';

export interface ModernTheme {
  // Gradient backgrounds
  gradientStart: string;
  gradientMid: string;
  gradientEnd: string;

  // Accent gradients
  accentGradientStart: string;
  accentGradientEnd: string;

  // Glow colors
  primaryGlow: string;
  secondaryGlow: string;

  // Surface colors (for glassmorphism)
  surface: string;
  surfaceStrong: string;
  surfaceElevated: string;
  glassBg: string;
  glassBlur: number;

  // Text colors
  text: string;
  textSecondary: string;
  textMuted: string;

  // Spotify integration
  spotifyGreen: string;
  spotifyGreenGlow: string;

  // AI accent
  aiPurple: string;
  aiPurpleGlow: string;

  // Shadows
  shadowColor: string;
  shadowOpacity: number;

  // Border
  border: string;

  // Legacy compatibility
  primary: string;
  background: string;
  secondaryText: string;
  accent: string;
}

export const MODERN_THEMES: Record<ThemeName, ModernTheme> = {
  midnight: {
    gradientStart: '#0D0D0D',
    gradientMid: '#1A1A2E',
    gradientEnd: '#16213E',

    accentGradientStart: '#667EEA',
    accentGradientEnd: '#764BA2',

    primaryGlow: '#667EEA',
    secondaryGlow: '#764BA2',

    surface: 'rgba(255, 255, 255, 0.05)',
    surfaceStrong: 'rgba(255, 255, 255, 0.12)',
    surfaceElevated: 'rgba(255, 255, 255, 0.08)',
    glassBg: 'rgba(255, 255, 255, 0.1)',
    glassBlur: 20,

    text: '#FFFFFF',
    textSecondary: 'rgba(255, 255, 255, 0.7)',
    textMuted: 'rgba(255, 255, 255, 0.5)',

    spotifyGreen: '#1DB954',
    spotifyGreenGlow: 'rgba(29, 185, 84, 0.4)',

    aiPurple: '#A855F7',
    aiPurpleGlow: 'rgba(168, 85, 247, 0.4)',

    shadowColor: '#000000',
    shadowOpacity: 0.5,

    border: 'rgba(255, 255, 255, 0.1)',

    // Legacy
    primary: '#1DB954',
    background: '#0D0D0D',
    secondaryText: 'rgba(255, 255, 255, 0.7)',
    accent: '#667EEA',
  },

  aurora: {
    gradientStart: '#0F0F23',
    gradientMid: '#1a1a3e',
    gradientEnd: '#0a2540',

    accentGradientStart: '#00F5A0',
    accentGradientEnd: '#00D9F5',

    primaryGlow: '#00F5A0',
    secondaryGlow: '#00D9F5',

    surface: 'rgba(0, 245, 160, 0.05)',
    surfaceStrong: 'rgba(0, 245, 160, 0.12)',
    surfaceElevated: 'rgba(0, 245, 160, 0.08)',
    glassBg: 'rgba(0, 217, 245, 0.1)',
    glassBlur: 20,

    text: '#FFFFFF',
    textSecondary: 'rgba(255, 255, 255, 0.7)',
    textMuted: 'rgba(255, 255, 255, 0.5)',

    spotifyGreen: '#1DB954',
    spotifyGreenGlow: 'rgba(29, 185, 84, 0.4)',

    aiPurple: '#00F5A0',
    aiPurpleGlow: 'rgba(0, 245, 160, 0.4)',

    shadowColor: '#00D9F5',
    shadowOpacity: 0.3,

    border: 'rgba(0, 245, 160, 0.2)',

    // Legacy
    primary: '#00F5A0',
    background: '#0F0F23',
    secondaryText: 'rgba(255, 255, 255, 0.7)',
    accent: '#00D9F5',
  },

  sunset: {
    gradientStart: '#1A0A0A',
    gradientMid: '#2D1B1B',
    gradientEnd: '#1F1020',

    accentGradientStart: '#FA709A',
    accentGradientEnd: '#FEE140',

    primaryGlow: '#FA709A',
    secondaryGlow: '#FEE140',

    surface: 'rgba(250, 112, 154, 0.05)',
    surfaceStrong: 'rgba(250, 112, 154, 0.12)',
    surfaceElevated: 'rgba(250, 112, 154, 0.08)',
    glassBg: 'rgba(254, 225, 64, 0.1)',
    glassBlur: 20,

    text: '#FFFFFF',
    textSecondary: 'rgba(255, 255, 255, 0.7)',
    textMuted: 'rgba(255, 255, 255, 0.5)',

    spotifyGreen: '#1DB954',
    spotifyGreenGlow: 'rgba(29, 185, 84, 0.4)',

    aiPurple: '#FA709A',
    aiPurpleGlow: 'rgba(250, 112, 154, 0.4)',

    shadowColor: '#FA709A',
    shadowOpacity: 0.3,

    border: 'rgba(250, 112, 154, 0.2)',

    // Legacy
    primary: '#FA709A',
    background: '#1A0A0A',
    secondaryText: 'rgba(255, 255, 255, 0.7)',
    accent: '#FEE140',
  },

  neon: {
    gradientStart: '#000000',
    gradientMid: '#0a0a0a',
    gradientEnd: '#111111',

    accentGradientStart: '#FF0080',
    accentGradientEnd: '#7928CA',

    primaryGlow: '#FF0080',
    secondaryGlow: '#7928CA',

    surface: 'rgba(255, 0, 128, 0.05)',
    surfaceStrong: 'rgba(255, 0, 128, 0.12)',
    surfaceElevated: 'rgba(255, 0, 128, 0.08)',
    glassBg: 'rgba(255, 0, 128, 0.1)',
    glassBlur: 25,

    text: '#FFFFFF',
    textSecondary: 'rgba(255, 255, 255, 0.8)',
    textMuted: 'rgba(255, 255, 255, 0.5)',

    spotifyGreen: '#1DB954',
    spotifyGreenGlow: 'rgba(29, 185, 84, 0.5)',

    aiPurple: '#FF0080',
    aiPurpleGlow: 'rgba(255, 0, 128, 0.5)',

    shadowColor: '#FF0080',
    shadowOpacity: 0.4,

    border: 'rgba(255, 0, 128, 0.3)',

    // Legacy
    primary: '#FF0080',
    background: '#000000',
    secondaryText: 'rgba(255, 255, 255, 0.8)',
    accent: '#7928CA',
  },

  ocean: {
    gradientStart: '#0A1628',
    gradientMid: '#0F2744',
    gradientEnd: '#0A1F3A',

    accentGradientStart: '#2E3192',
    accentGradientEnd: '#1BFFFF',

    primaryGlow: '#1BFFFF',
    secondaryGlow: '#2E3192',

    surface: 'rgba(27, 255, 255, 0.05)',
    surfaceStrong: 'rgba(27, 255, 255, 0.12)',
    surfaceElevated: 'rgba(27, 255, 255, 0.08)',
    glassBg: 'rgba(27, 255, 255, 0.1)',
    glassBlur: 20,

    text: '#FFFFFF',
    textSecondary: 'rgba(255, 255, 255, 0.7)',
    textMuted: 'rgba(255, 255, 255, 0.5)',

    spotifyGreen: '#1DB954',
    spotifyGreenGlow: 'rgba(29, 185, 84, 0.4)',

    aiPurple: '#1BFFFF',
    aiPurpleGlow: 'rgba(27, 255, 255, 0.4)',

    shadowColor: '#1BFFFF',
    shadowOpacity: 0.3,

    border: 'rgba(27, 255, 255, 0.2)',

    // Legacy
    primary: '#1BFFFF',
    background: '#0A1628',
    secondaryText: 'rgba(255, 255, 255, 0.7)',
    accent: '#2E3192',
  },
};

// ============================================
// GRADIENT PRESETS
// ============================================

export const GRADIENTS = {
  primary: ['#667EEA', '#764BA2'] as const,
  spotify: ['#1DB954', '#1ED760'] as const,
  ai: ['#A855F7', '#EC4899'] as const,
  aurora: ['#00F5A0', '#00D9F5'] as const,
  sunset: ['#FA709A', '#FEE140'] as const,
  ocean: ['#2E3192', '#1BFFFF'] as const,
  neon: ['#FF0080', '#7928CA'] as const,
  dark: ['#0D0D0D', '#1A1A2E'] as const,
  glass: ['rgba(255,255,255,0.1)', 'rgba(255,255,255,0.05)'] as const,
};

// ============================================
// LEGACY THEME SUPPORT (backward compatibility)
// ============================================

export const THEMES: Record<string, ModernTheme> = {
  black: MODERN_THEMES.midnight,
  blue: MODERN_THEMES.ocean,
  red: MODERN_THEMES.sunset,
  white: MODERN_THEMES.midnight, // Use midnight for dark-first approach
  green: MODERN_THEMES.aurora,
  // New themes
  midnight: MODERN_THEMES.midnight,
  aurora: MODERN_THEMES.aurora,
  sunset: MODERN_THEMES.sunset,
  neon: MODERN_THEMES.neon,
  ocean: MODERN_THEMES.ocean,
};

export const DEFAULT_THEME: ThemeName = 'midnight';
