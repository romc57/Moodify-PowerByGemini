/**
 * Test API Keys Utility
 * Loads test environment variables from process.env (loaded by dotenv in jest-env-setup.js)
 * Used for integration tests that require real API access
 */

import axios from 'axios';
import { gemini } from '../../services/gemini/GeminiService';
import { dbService } from '../../services/database';

interface TestApiKeys {
    geminiApiKey: string | null;
    spotifyClientId: string | null;
    spotifyAccessToken: string | null;
    spotifyRefreshToken: string | null;
    spotifyRedirectUri: string | null;
}

let cachedKeys: TestApiKeys | null = null;

/**
 * Load API keys from process.env (populated by dotenv from .env.test)
 * Returns null values if keys are missing
 */
export function loadTestApiKeys(): TestApiKeys {
    if (cachedKeys) {
        return cachedKeys;
    }

    // Load from .env.test (loaded by jest-env-setup.js)
    const keys: TestApiKeys = {
        geminiApiKey: process.env.GEMINI_API_KEY && 
                      process.env.GEMINI_API_KEY.trim() !== '' &&
                      process.env.GEMINI_API_KEY !== 'your_gemini_api_key_here'
            ? process.env.GEMINI_API_KEY.trim()
            : null,
        spotifyClientId: process.env.SPOTIFY_CLIENT_ID && 
                        process.env.SPOTIFY_CLIENT_ID.trim() !== '' &&
                        process.env.SPOTIFY_CLIENT_ID !== 'your_spotify_client_id_here'
            ? process.env.SPOTIFY_CLIENT_ID.trim()
            : null,
        spotifyAccessToken: process.env.SPOTIFY_ACCESS_TOKEN && 
                           process.env.SPOTIFY_ACCESS_TOKEN.trim() !== '' &&
                           process.env.SPOTIFY_ACCESS_TOKEN !== 'your_spotify_access_token_here'
            ? process.env.SPOTIFY_ACCESS_TOKEN.trim()
            : null,
        spotifyRefreshToken: process.env.SPOTIFY_REFRESH_TOKEN && 
                            process.env.SPOTIFY_REFRESH_TOKEN.trim() !== '' &&
                            process.env.SPOTIFY_REFRESH_TOKEN !== 'your_spotify_refresh_token_here'
            ? process.env.SPOTIFY_REFRESH_TOKEN.trim()
            : null,
        spotifyRedirectUri: process.env.SPOTIFY_REDIRECT_URI?.trim() || 'http://127.0.0.1:8081',
    };

    if (!keys.geminiApiKey && !keys.spotifyClientId) {
        console.warn('[TestUtils] No API keys found in .env.test. Integration tests will be skipped.');
    }

    cachedKeys = keys;
    return keys;
}

/**
 * Check if we have the required keys for Gemini integration tests
 */
export function hasGeminiKeys(): boolean {
    const keys = loadTestApiKeys();
    return !!keys.geminiApiKey;
}

/**
 * Check if we have the required keys for Spotify integration tests
 */
export function hasSpotifyKeys(): boolean {
    const keys = loadTestApiKeys();
    return !!keys.spotifyClientId && !!keys.spotifyAccessToken;
}

/**
 * Get Gemini API key for tests
 */
export function getGeminiApiKey(): string | null {
    return loadTestApiKeys().geminiApiKey;
}

/**
 * Get Spotify credentials for tests
 * If refresh token is not in .env.test, it will try to get it from the database at runtime
 */
export async function getSpotifyCredentials(): Promise<{ clientId: string | null; accessToken: string | null; refreshToken: string | null; redirectUri: string | null }> {
    const keys = loadTestApiKeys();
    
    // If refresh token not in env, try to get from database at runtime
    let refreshToken = keys.spotifyRefreshToken;
    if (!refreshToken && keys.spotifyAccessToken) {
        refreshToken = await dbService.getRefreshToken('spotify');
    }
    
    return {
        clientId: keys.spotifyClientId,
        accessToken: keys.spotifyAccessToken,
        refreshToken: refreshToken,
        redirectUri: keys.spotifyRedirectUri,
    };
}

/**
 * Validate Gemini API key by making a test request
 * Fails if key is invalid
 */
export async function validateGeminiApiKey(apiKey: string): Promise<{ valid: boolean; error?: string }> {
    if (!apiKey) {
        return { valid: false, error: 'API key is empty' };
    }

    try {
        const result = await gemini.validateKey(apiKey);
        
        if (!result || !result.valid) {
            return { valid: false, error: result?.error || 'Validation failed' };
        }
        
        return { valid: true };
    } catch (error: any) {
        return { valid: false, error: error.message || 'Validation failed' };
    }
}

/**
 * Validate Spotify credentials by making a test request
 * Fails if credentials are invalid
 */
export async function validateSpotifyCredentials(accessToken: string): Promise<{ valid: boolean; error?: string }> {
    if (!accessToken) {
        return { valid: false, error: 'Access token is empty' };
    }

    try {
        const response = await axios.get('https://api.spotify.com/v1/me', {
            headers: { Authorization: `Bearer ${accessToken}` },
            timeout: 10000
        });

        if (response.status === 200) {
            return { valid: true };
        } else {
            return { valid: false, error: `Unexpected status: ${response.status}` };
        }
    } catch (error: any) {
        if (error.response?.status === 401) {
            return { valid: false, error: 'Invalid or expired access token' };
        } else if (error.response?.status === 403) {
            return { valid: false, error: 'Insufficient permissions' };
        } else {
            return { valid: false, error: error.message || 'Validation failed' };
        }
    }
}

/**
 * Wait for an API call to complete with retry logic
 */
export async function waitForApiCall<T>(
    apiCall: () => Promise<T>,
    maxWaitMs: number = 30000,
    retryIntervalMs: number = 1000,
    description?: string
): Promise<T> {
    const desc = description || 'API call';
    const startTime = Date.now();
    let lastError: any;
    let attemptCount = 0;

    console.log(`[waitForApiCall] Starting: ${desc} (maxWait: ${maxWaitMs}ms, retryInterval: ${retryIntervalMs}ms)`);
    while (Date.now() - startTime < maxWaitMs) {
        attemptCount++;
        try {
            const result = await apiCall();
            console.log(`[waitForApiCall] Success: ${desc} (${Date.now() - startTime}ms, attempt ${attemptCount})`);
            return result;
        } catch (error: any) {
            lastError = error;
            const status = error.response?.status;
            const msg = error.message || String(error);
            console.log(`[waitForApiCall] Attempt ${attemptCount} failed: ${desc} | status=${status ?? 'N/A'} | ${msg}`);
            if (error.response?.data) {
                console.log('[waitForApiCall] Response data:', JSON.stringify(error.response.data, null, 2));
            }
            if (status === 401 || status === 403) {
                throw error;
            }
            await new Promise(resolve => setTimeout(resolve, retryIntervalMs));
        }
    }

    const errMsg = lastError?.message || 'Unknown error';
    const errStack = lastError?.stack ? `\n${lastError.stack}` : '';
    throw new Error(`API call timed out after ${maxWaitMs}ms: ${errMsg}${errStack}`);
}

/**
 * Log passed data, expected result, and actual result to terminal (full details).
 */
export function logTestData(testName: string, passed: unknown, expected: unknown, got: unknown): void {
    console.log('\n[TestData] ========== ' + testName + ' ==========');
    console.log('[TestData] PASSED (input):', JSON.stringify(passed, null, 2));
    console.log('[TestData] EXPECTED:', JSON.stringify(expected, null, 2));
    console.log('[TestData] GOT:', JSON.stringify(got, null, 2));
    console.log('[TestData] ========================================\n');
}
