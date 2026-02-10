/**
 * Gemini Service Constants
 * One source of truth for Gemini API configuration
 */

export type ModelId = 'gemini-3-pro' | 'gemini-2.5-pro' | 'gemini-2.0-flash' | 'gemini-2.5-flash';

export interface GeminiModel {
    id: ModelId;
    name: string;
    description: string;
    url: string;
    maxOutputTokens: number;
    tier: 'pro' | 'flash';
}

// Token limits for different operation types
export const TOKEN_LIMITS = {
    LARGE: 8192,       // For complex responses (getVibeOptions, generateRescueVibe)
    MEDIUM: 4096,      // For medium responses (expandVibe)
    STANDARD: 2048,    // For standard responses (generateDJRecommendation, backfill)
    SMALL: 1024,       // For simple responses (assessCurrentMood)
} as const;

// Available models
export const GEMINI_MODELS: Record<ModelId, GeminiModel> = {
    'gemini-3-pro': {
        id: 'gemini-3-pro',
        name: 'Gemini 3 Pro',
        description: 'Hackathon preview (check quota)',
        url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-preview:generateContent',
        maxOutputTokens: TOKEN_LIMITS.LARGE, // Use LARGE as model max capability default
        tier: 'pro',
    },
    'gemini-2.5-pro': {
        id: 'gemini-2.5-pro',
        name: 'Gemini 2.5 Pro',
        description: 'Latest stable pro model',
        url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent',
        maxOutputTokens: TOKEN_LIMITS.LARGE,
        tier: 'pro',
    },
    'gemini-2.0-flash': {
        id: 'gemini-2.0-flash',
        name: 'Gemini 2.0 Flash',
        description: 'Fast & reliable',
        url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
        maxOutputTokens: TOKEN_LIMITS.LARGE,
        tier: 'flash',
    },
    'gemini-2.5-flash': {
        id: 'gemini-2.5-flash',
        name: 'Gemini 2.5 Flash',
        description: 'Newest fast model',
        url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
        maxOutputTokens: TOKEN_LIMITS.LARGE,
        tier: 'flash',
    },
} as const;

// Model priority for fallback (in order)
export const MODEL_PRIORITY: ModelId[] = ['gemini-3-pro', 'gemini-2.5-pro', 'gemini-2.0-flash', 'gemini-2.5-flash'];

// Default model - Gemini 3 Pro
export const DEFAULT_MODEL: ModelId = 'gemini-3-pro';

// Legacy exports for backwards compatibility
export const GEMINI_API_URL = GEMINI_MODELS[DEFAULT_MODEL].url;

export const DEFAULT_JSON_CONFIG = {
    responseMimeType: "application/json",
    maxOutputTokens: TOKEN_LIMITS.STANDARD, // Default to standard (1024)
    temperature: 0.7,
    topP: 0.9,
} as const;
