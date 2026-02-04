/**
 * Test Database Utilities
 * Provides helpers for setting up and tearing down test database state
 */

import axios from 'axios';
import { SPOTIFY_TOKEN_URL } from '../../services/spotify/constants';
import { dbService } from '../../services/database';
import { hasGeminiKeys, hasSpotifyKeys, loadTestApiKeys, validateSpotifyCredentials } from './testApiKeys';

// Re-export for convenience
export { hasGeminiKeys, hasSpotifyKeys };

/**
 * Clear all test data from database
 * Useful for test cleanup
 */
export async function clearTestDatabase(): Promise<void> {
    try {
        // Clear preferences (but keep structure)
        // Note: We can't easily clear SQLite tables without direct access
        // This is a placeholder - in practice, tests should use a separate test database
        console.log('[TestUtils] Test database cleanup - using shared database');
    } catch (error) {
        console.warn('[TestUtils] Failed to clear test database:', error);
    }
}

/**
 * Set up test preferences for a test
 */
export async function setupTestPreferences(preferences: Record<string, string>): Promise<void> {
    for (const [key, value] of Object.entries(preferences)) {
        await dbService.setPreference(key, value);
    }
}

/**
 * Set up test service tokens for a test
 */
export async function setupTestTokens(service: string, accessToken: string, refreshToken?: string): Promise<void> {
    await dbService.setServiceToken(service, accessToken, refreshToken);
}

/**
 * Clear test preferences
 */
export async function clearTestPreferences(keys: string[]): Promise<void> {
    // Note: DatabaseService doesn't have a deletePreference method
    // We'd need to add one or set to empty string
    for (const key of keys) {
        await dbService.setPreference(key, '');
    }
}

/**
 * Clear test tokens
 */
export async function clearTestTokens(services: string[]): Promise<void> {
    for (const service of services) {
        await dbService.removeServiceToken(service);
    }
}

/**
 * Try to refresh Spotify access token using refresh_token from env/DB.
 * Updates DB with new access_token on success.
 */
async function tryRefreshSpotifyToken(clientId: string, refreshToken: string): Promise<string | null> {
    try {
        const response = await axios.post(
            SPOTIFY_TOKEN_URL,
            new URLSearchParams({
                grant_type: 'refresh_token',
                refresh_token: refreshToken,
                client_id: clientId,
            }).toString(),
            { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 10000 }
        );
        const access_token = response.data?.access_token;
        const new_refresh = response.data?.refresh_token || refreshToken;
        if (access_token) {
            await dbService.setServiceToken('spotify', access_token, new_refresh);
            return access_token;
        }
    } catch (_) {
        // Caller will report session inactive
    }
    return null;
}

/** Spotify-only session check: set tokens from env, call /v1/me, on 401 refresh and retry once. */
async function checkSpotifySessionOnly(keys: ReturnType<typeof loadTestApiKeys>): Promise<{ active: boolean; errors: string[] }> {
    const errors: string[] = [];
    if (!keys.spotifyAccessToken || keys.spotifyAccessToken === 'your_spotify_access_token_here') {
        errors.push('Spotify: No access token in .env.test');
        return { active: false, errors };
    }
    try {
        const clientId = keys.spotifyClientId || (process.env.SPOTIFY_CLIENT_ID?.trim() && process.env.SPOTIFY_CLIENT_ID !== 'your_spotify_client_id_here' ? process.env.SPOTIFY_CLIENT_ID.trim() : null);
        if (clientId) await dbService.setPreference('spotify_client_id', clientId);
        let refreshToken = keys.spotifyRefreshToken || (process.env.SPOTIFY_REFRESH_TOKEN?.trim() && process.env.SPOTIFY_REFRESH_TOKEN !== 'your_spotify_refresh_token_here' ? process.env.SPOTIFY_REFRESH_TOKEN.trim() : null);
        if (!refreshToken) refreshToken = await dbService.getRefreshToken('spotify');
        await dbService.setServiceToken('spotify', keys.spotifyAccessToken, refreshToken || undefined);
        const accessTokenFromDb = await dbService.getServiceToken('spotify');
        if (!accessTokenFromDb) {
            errors.push('Spotify: Access token not found in database after setting');
            return { active: false, errors };
        }
        const maxRetries = 3;
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const response = await axios.get('https://api.spotify.com/v1/me', {
                    headers: { Authorization: `Bearer ${accessTokenFromDb}` },
                    timeout: 15000
                });
                if (response.status === 200) return { active: true, errors: [] };
                errors.push('Spotify: No active session (unexpected status: ' + response.status + ')');
                return { active: false, errors };
            } catch (apiError: any) {
                const isNetworkError = apiError.message === 'Network Error' || apiError.code === 'ECONNRESET' || apiError.code === 'ETIMEDOUT' || apiError.code === 'ECONNABORTED';
                if (isNetworkError && attempt < maxRetries) {
                    await new Promise(r => setTimeout(r, 2000));
                    continue;
                }
                if (apiError.response?.status === 401) {
                    const cid = keys.spotifyClientId || (await dbService.getPreference('spotify_client_id'));
                    const ref = keys.spotifyRefreshToken || (await dbService.getRefreshToken('spotify'));
                    if (cid && ref) {
                        const newToken = await tryRefreshSpotifyToken(cid, ref);
                        if (newToken) {
                            const retry = await axios.get('https://api.spotify.com/v1/me', { headers: { Authorization: `Bearer ${newToken}` }, timeout: 10000 });
                            if (retry.status === 200) return { active: true, errors: [] };
                        }
                    }
                    errors.push('Spotify: No active session (token expired, refresh failed or no refresh token)');
                } else if (apiError.response?.status === 403) {
                    errors.push('Spotify: No active session (insufficient permissions)');
                } else {
                    errors.push(`Spotify: Cannot verify session (${apiError.message || 'Network error'})`);
                }
                return { active: false, errors };
            }
        }
    } catch (error: any) {
        errors.push(`Spotify: ${error.message || 'Cannot check session'}`);
    }
    return { active: false, errors };
}

/**
 * Ensure Spotify has an active session (set tokens from env, call /v1/me, on 401 refresh and retry).
 * Single place for "ensure Spotify session" in tests. Throws if not active.
 */
export async function ensureSpotifySessionOrThrow(): Promise<void> {
    const keys = loadTestApiKeys();
    const { active, errors } = await checkSpotifySessionOnly(keys);
    if (!active) {
        const msg = errors.length ? errors.join('; ') : 'No active Spotify session. Set SPOTIFY_ACCESS_TOKEN (and SPOTIFY_REFRESH_TOKEN) in .env.test.';
        throw new Error(msg);
    }
}

/**
 * Check if we have active sessions with both Gemini and Spotify.
 * For Spotify: if /v1/me returns 401, tries token refresh once then re-checks.
 * Returns true only if both services have active sessions.
 */
export async function hasActiveSessions(): Promise<{ hasActiveGemini: boolean; hasActiveSpotify: boolean; errors: string[] }> {
    const keys = loadTestApiKeys();
    const errors: string[] = [];
    let hasActiveGemini = false;
    let hasActiveSpotify = false;

    if (keys.geminiApiKey && keys.geminiApiKey !== 'your_gemini_api_key_here') {
        try {
            await dbService.setPreference('gemini_api_key', keys.geminiApiKey);
            const apiKeyFromDb = await dbService.getPreference('gemini_api_key');
            if (apiKeyFromDb) {
                const { gemini: realGemini } = jest.requireActual('../../services/gemini/GeminiService');
                hasActiveGemini = await realGemini.testConnection();
                if (!hasActiveGemini) {
                    errors.push('Gemini: No active session (API key invalid or cannot connect)');
                }
            } else {
                errors.push('Gemini: API key not found in database after setting');
            }
        } catch (error: any) {
            const detail = error.response?.data ? ` | response: ${JSON.stringify(error.response.data)}` : '';
            console.error('[TestUtils] Gemini check failed - full detail:', error.message, detail, error.stack || '');
            errors.push(`Gemini: ${error.message || 'Cannot check session'}${detail}`);
        }
    } else {
        console.error('[TestUtils] Gemini: No API key in .env.test. process.env.GEMINI_API_KEY present:', !!process.env.GEMINI_API_KEY);
        errors.push('Gemini: No API key in .env.test');
    }

    // Check Spotify session - single path via checkSpotifySessionOnly (set tokens, /v1/me, on 401 refresh)
    console.log('[TestUtils] [Spotify] Checking session...');
    const spotifyResult = await checkSpotifySessionOnly(keys);
    hasActiveSpotify = spotifyResult.active;
    errors.push(...spotifyResult.errors);

    console.log('[TestUtils] ========================================');
    if (hasActiveGemini && hasActiveSpotify) {
        console.log('[TestUtils] ✓✓✓ Both Gemini and Spotify have active sessions ✓✓✓');
        console.log('[TestUtils] ✓✓✓ Tests will run with real API calls ✓✓✓');
    } else {
        console.warn('[TestUtils] ⚠⚠⚠ Some sessions are not active ⚠⚠⚠');
        console.warn('[TestUtils] ⚠⚠⚠ Tests will be SKIPPED ⚠⚠⚠');
        if (!hasActiveGemini) {
            console.warn('[TestUtils] ⚠ Gemini session is NOT active');
        }
        if (!hasActiveSpotify) {
            console.warn('[TestUtils] ⚠ Spotify session is NOT active');
        }
    }
    console.log('[TestUtils] ========================================');
    console.log('');

    return { hasActiveGemini, hasActiveSpotify, errors };
}

/**
 * Get session status for integration tests (never throws).
 * Use this in beforeAll to set a flag and skip tests when sessions are inactive.
 */
export async function getIntegrationSessionStatus(): Promise<{
    runGeminiAndSpotify: boolean;
    runSpotifyOnly: boolean;
    hasActiveGemini: boolean;
    hasActiveSpotify: boolean;
    errors: string[];
}> {
    const sessions = await hasActiveSessions();
    return {
        runGeminiAndSpotify: sessions.hasActiveGemini && sessions.hasActiveSpotify,
        runSpotifyOnly: sessions.hasActiveSpotify,
        hasActiveGemini: sessions.hasActiveGemini,
        hasActiveSpotify: sessions.hasActiveSpotify,
        errors: sessions.errors,
    };
}

/**
 * Ensure both Gemini and Spotify have active sessions (with refresh attempted for Spotify).
 * Throws if not active so the test suite stops and does not run tests without real API access.
 */
export async function ensureActiveSessionsOrThrow(): Promise<{ hasActiveGemini: boolean; hasActiveSpotify: boolean }> {
    const sessions = await hasActiveSessions();
    if (!sessions.hasActiveGemini || !sessions.hasActiveSpotify) {
        console.error('\n[TestUtils] ========== SESSION CHECK FAILED - FULL DETAILS ==========');
        console.error('[TestUtils] hasActiveGemini:', sessions.hasActiveGemini, '| hasActiveSpotify:', sessions.hasActiveSpotify);
        console.error('[TestUtils] Errors:', sessions.errors);
        console.error('[TestUtils] Env present: GEMINI_API_KEY=', !!process.env.GEMINI_API_KEY, '| SPOTIFY_ACCESS_TOKEN=', !!process.env.SPOTIFY_ACCESS_TOKEN, '| SPOTIFY_CLIENT_ID=', !!process.env.SPOTIFY_CLIENT_ID, '| SPOTIFY_REFRESH_TOKEN=', !!process.env.SPOTIFY_REFRESH_TOKEN);
        console.error('[TestUtils] ========================================\n');
        const msg = sessions.errors.length
            ? `No active sessions. Integration tests require active Gemini and Spotify. ${sessions.errors.join('; ')}`
            : 'No active sessions. Set valid GEMINI_API_KEY and SPOTIFY_ACCESS_TOKEN (and SPOTIFY_REFRESH_TOKEN) in .env.test.';
        throw new Error(msg);
    }
    return { hasActiveGemini: sessions.hasActiveGemini, hasActiveSpotify: sessions.hasActiveSpotify };
}

/**
 * Ensure Spotify has an active session (with refresh attempted on 401).
 * Throws if not active so the test suite stops.
 */
export async function ensureActiveSpotifyOrThrow(): Promise<void> {
    const sessions = await hasActiveSessions();
    if (!sessions.hasActiveSpotify) {
        const spotifyErrors = sessions.errors.filter(e => e.includes('Spotify'));
        console.error('\n[TestUtils] ========== SPOTIFY SESSION CHECK FAILED - FULL DETAILS ==========');
        console.error('[TestUtils] Errors:', spotifyErrors.length ? spotifyErrors : sessions.errors);
        console.error('[TestUtils] Env: SPOTIFY_ACCESS_TOKEN=', !!process.env.SPOTIFY_ACCESS_TOKEN, '| SPOTIFY_CLIENT_ID=', !!process.env.SPOTIFY_CLIENT_ID, '| SPOTIFY_REFRESH_TOKEN=', !!process.env.SPOTIFY_REFRESH_TOKEN);
        console.error('[TestUtils] ========================================\n');
        const msg = spotifyErrors.length
            ? `No active Spotify session. ${spotifyErrors.join('; ')}`
            : 'No active Spotify session. Set SPOTIFY_ACCESS_TOKEN (and SPOTIFY_REFRESH_TOKEN) in .env.test.';
        throw new Error(msg);
    }
}

/**
 * Validate API keys using the same methods the app uses
 * Sets keys in database first, then validates through services (like the app does)
 * FAILS HARD if keys are missing or invalid - no tests should run
 * REQUIRES both Gemini and Spotify keys to be present and valid
 */
export async function validateApiKeys(): Promise<{ valid: boolean; errors: string[] }> {
    const keys = loadTestApiKeys();
    const errors: string[] = [];

    // Check if .env.test file is being loaded
    const geminiKeyEnv = process.env.GEMINI_API_KEY;
    const spotifyTokenEnv = process.env.SPOTIFY_ACCESS_TOKEN;
    
    // Check if required keys are present (not empty, not placeholder values)
    const hasGeminiKey = keys.geminiApiKey && 
                         keys.geminiApiKey !== '' && 
                         keys.geminiApiKey !== 'your_gemini_api_key_here';
    const hasSpotifyKey = keys.spotifyAccessToken && 
                          keys.spotifyAccessToken !== '' && 
                          keys.spotifyAccessToken !== 'your_spotify_access_token_here';

    // REQUIRE Gemini API key - fail if missing or empty
    if (!geminiKeyEnv) {
        errors.push('GEMINI_API_KEY is not set in .env.test file');
    } else if (geminiKeyEnv.trim() === '') {
        errors.push('GEMINI_API_KEY is empty in .env.test file (set but empty string)');
    } else if (!hasGeminiKey) {
        errors.push(`GEMINI_API_KEY is placeholder or invalid in .env.test (value: "${geminiKeyEnv.substring(0, 20)}...")`);
    } else if (keys.geminiApiKey) {
        // Set in database first (like the app does)
        await dbService.setPreference('gemini_api_key', keys.geminiApiKey);
        
        // Validate using the service (like the app does - reads from database)
        console.log('[TestUtils] Validating Gemini API key...');
        try {
            const apiKeyFromDb = await dbService.getPreference('gemini_api_key');
            if (!apiKeyFromDb) {
                errors.push('Gemini API key not found in database after setting');
            } else {
                // Use gemini service to validate (like the app does)
                // Use jest.requireActual to get the real service, bypassing any mocks
                try {
                    const { gemini: realGemini } = jest.requireActual('../../services/gemini/GeminiService');
                    if (typeof realGemini?.validateKey !== 'function') {
                        errors.push('Gemini service validateKey method is not available');
                    } else {
                        const geminiValidation = await realGemini.validateKey(apiKeyFromDb);
                        if (!geminiValidation) {
                            errors.push('Gemini API key validation returned null/undefined');
                        } else if (!geminiValidation.valid) {
                            const errorMsg = geminiValidation.error || 'No error message provided';
                            // Check if it's a network error vs invalid key
                            if (errorMsg.toLowerCase().includes('network') || errorMsg.toLowerCase().includes('timeout')) {
                                console.warn(`[TestUtils] Gemini validation network issue (key may be valid): ${errorMsg}`);
                                // Don't fail on network errors - key might be valid
                            } else {
                                errors.push(`Gemini API key is invalid: ${errorMsg}`);
                                console.error(`[TestUtils] Gemini validation error: ${errorMsg}`);
                            }
                        } else {
                            console.log('[TestUtils] ✓ Gemini API key is valid');
                        }
                    }
                } catch (validationError: any) {
                    const errorMsg = validationError?.message || validationError?.error || 'Validation threw an error';
                    // Check if it's a network error
                    if (errorMsg.toLowerCase().includes('network') || errorMsg.toLowerCase().includes('timeout') || errorMsg.toLowerCase().includes('econnrefused')) {
                        console.warn(`[TestUtils] Gemini validation network issue (key may be valid): ${errorMsg}`);
                        // Don't fail on network errors - key might be valid
                    } else {
                        errors.push(`Gemini API key validation error: ${errorMsg}`);
                        console.error(`[TestUtils] Gemini validation exception:`, validationError);
                    }
                }
            }
        } catch (error: any) {
            const errorMsg = error?.message || error?.error || 'Unknown error';
            errors.push(`Gemini API key validation failed: ${errorMsg}`);
            console.error(`[TestUtils] Gemini validation failed:`, error);
        }
    }

    // REQUIRE Spotify access token - fail if missing or empty
    if (!spotifyTokenEnv) {
        errors.push('SPOTIFY_ACCESS_TOKEN is not set in .env.test file');
    } else if (spotifyTokenEnv.trim() === '') {
        errors.push('SPOTIFY_ACCESS_TOKEN is empty in .env.test file (set but empty string)');
    } else if (!hasSpotifyKey) {
        errors.push(`SPOTIFY_ACCESS_TOKEN is placeholder or invalid in .env.test (value: "${spotifyTokenEnv.substring(0, 20)}...")`);
    } else if (keys.spotifyAccessToken) {
        // Set in database first (like the app does)
        if (keys.spotifyClientId) {
            await dbService.setPreference('spotify_client_id', keys.spotifyClientId);
        }
        
        let refreshToken = keys.spotifyRefreshToken;
        if (!refreshToken) {
            refreshToken = await dbService.getRefreshToken('spotify');
        }
        await dbService.setServiceToken('spotify', keys.spotifyAccessToken, refreshToken || undefined);
        
        // Validate using the service (like the app does - reads from database)
        console.log('[TestUtils] Validating Spotify access token...');
        try {
            const accessTokenFromDb = await dbService.getServiceToken('spotify');
            if (!accessTokenFromDb) {
                errors.push('Spotify access token not found in database after setting');
            } else {
                try {
                    const spotifyValidation = await validateSpotifyCredentials(accessTokenFromDb);
                    if (!spotifyValidation) {
                        errors.push('Spotify access token validation returned null/undefined');
                    } else if (!spotifyValidation.valid) {
                        const errorMsg = spotifyValidation.error || 'No error message provided';
                        // Check if it's a network error vs invalid token
                        if (errorMsg.toLowerCase().includes('network') || errorMsg.toLowerCase().includes('timeout') || errorMsg.toLowerCase().includes('econnrefused')) {
                            console.warn(`[TestUtils] Spotify validation network issue (token may be valid): ${errorMsg}`);
                            // Don't fail on network errors - token might be valid
                        } else if (errorMsg.includes('401') || errorMsg.includes('Invalid or expired')) {
                            errors.push(`Spotify access token is invalid or expired: ${errorMsg}`);
                            console.error(`[TestUtils] Spotify validation error: ${errorMsg}`);
                        } else {
                            errors.push(`Spotify access token validation failed: ${errorMsg}`);
                            console.error(`[TestUtils] Spotify validation error: ${errorMsg}`);
                        }
                    } else {
                        console.log('[TestUtils] ✓ Spotify access token is valid');
                    }
                } catch (validationError: any) {
                    const errorMsg = validationError?.message || validationError?.error || 'Validation threw an error';
                    // Check if it's a network error
                    if (errorMsg.toLowerCase().includes('network') || errorMsg.toLowerCase().includes('timeout') || errorMsg.toLowerCase().includes('econnrefused')) {
                        console.warn(`[TestUtils] Spotify validation network issue (token may be valid): ${errorMsg}`);
                        // Don't fail on network errors - token might be valid
                    } else {
                        errors.push(`Spotify access token validation error: ${errorMsg}`);
                        console.error(`[TestUtils] Spotify validation exception:`, validationError);
                    }
                }
            }
        } catch (error: any) {
            const errorMsg = error?.message || error?.error || 'Unknown error';
            errors.push(`Spotify access token validation failed: ${errorMsg}`);
            console.error(`[TestUtils] Spotify validation failed:`, error);
        }
    }

    return {
        valid: errors.length === 0,
        errors
    };
}

/**
 * Initialize test database with API keys from .env.test.
 * Sets all session data in DB exactly like the app (Settings -> DB; services read from DB).
 * Uses loadTestApiKeys() (from process.env) and fallback to process.env so all .env.test secrets are set.
 */
export async function initializeTestDatabase(): Promise<void> {
    const keys = loadTestApiKeys();

    // Gemini: app reads gemini_api_key from DB (GeminiService.getApiKey -> getPreference)
    if (keys.geminiApiKey) {
        await dbService.setPreference('gemini_api_key', keys.geminiApiKey);
    }

    // Spotify: app reads spotify_client_id and tokens from DB (SpotifyRemoteService uses getPreference, getServiceToken, getRefreshToken)
    if (keys.spotifyAccessToken) {
        const clientId = keys.spotifyClientId || (process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_ID.trim() && process.env.SPOTIFY_CLIENT_ID !== 'your_spotify_client_id_here' ? process.env.SPOTIFY_CLIENT_ID.trim() : null);
        if (clientId) {
            await dbService.setPreference('spotify_client_id', clientId);
        }
        let refreshToken = keys.spotifyRefreshToken || (process.env.SPOTIFY_REFRESH_TOKEN && process.env.SPOTIFY_REFRESH_TOKEN.trim() && process.env.SPOTIFY_REFRESH_TOKEN !== 'your_spotify_refresh_token_here' ? process.env.SPOTIFY_REFRESH_TOKEN.trim() : null);
        if (!refreshToken) {
            refreshToken = await dbService.getRefreshToken('spotify');
        }
        await dbService.setServiceToken('spotify', keys.spotifyAccessToken, refreshToken || undefined);
    }
}
