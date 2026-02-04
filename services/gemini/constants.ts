/**
 * Gemini Service Constants
 * One source of truth for Gemini API configuration
 */

export const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-preview:generateContent';

export const DEFAULT_JSON_CONFIG = {
    responseMimeType: "application/json",
    maxOutputTokens: 2048,
    temperature: 0.7,
    topP: 0.9
} as const;
