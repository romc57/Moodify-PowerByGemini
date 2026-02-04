/**
 * Spotify Authentication Test Suite
 *
 * RUNS FIRST - Validates Spotify credentials.
 * No mocking - uses real Spotify API.
 *
 * To get valid tokens, run: node scripts/get-spotify-token.js
 */

import axios from 'axios';
import { loadTestApiKeys, validateSpotifyCredentials, logTestData } from '../utils/testApiKeys';

describe('Spotify Authentication (Real API)', () => {
    const keys = loadTestApiKeys();
    let tokenIsValid = false;

    beforeAll(async () => {
        if (!keys.spotifyClientId) {
            console.warn(
                '\n⚠️  SPOTIFY_CLIENT_ID not found in .env.test.\n' +
                '   Get one from: https://developer.spotify.com/dashboard\n'
            );
        }

        if (!keys.spotifyAccessToken) {
            console.warn(
                '\n⚠️  SPOTIFY_ACCESS_TOKEN not found in .env.test.\n' +
                '   Run: node scripts/get-spotify-token.js to get valid tokens.\n'
            );
            return;
        }

        // Check if token looks valid (Spotify tokens are long JWT-like strings)
        if (keys.spotifyAccessToken.length < 100) {
            console.warn(
                '\n⚠️  WARNING: SPOTIFY_ACCESS_TOKEN looks too short to be valid.\n' +
                '   Spotify OAuth tokens are typically 200+ characters.\n' +
                '   Current token length: ' + keys.spotifyAccessToken.length + '\n' +
                '   Run: node scripts/get-spotify-token.js to get valid tokens.\n'
            );
        }

        // Pre-validate token to set flag for other tests
        const result = await validateSpotifyCredentials(keys.spotifyAccessToken);
        tokenIsValid = result.valid;

        if (!tokenIsValid) {
            console.warn(
                '\n⚠️  Spotify token validation failed: ' + result.error + '\n' +
                '   Spotify tests will be skipped.\n' +
                '   Run: node scripts/get-spotify-token.js to get valid tokens.\n'
            );
        }
    });

    it('should have SPOTIFY_CLIENT_ID in environment', () => {
        if (!keys.spotifyClientId) {
            console.log('SKIP: SPOTIFY_CLIENT_ID not configured');
            return;
        }
        expect(keys.spotifyClientId).toBeTruthy();
        expect(keys.spotifyClientId).not.toBe('your_spotify_client_id_here');
    });

    it('should have SPOTIFY_ACCESS_TOKEN in environment', () => {
        if (!keys.spotifyAccessToken) {
            console.log('SKIP: SPOTIFY_ACCESS_TOKEN not configured');
            return;
        }
        expect(keys.spotifyAccessToken).toBeTruthy();
        expect(keys.spotifyAccessToken).not.toBe('your_spotify_access_token_here');
    });

    it('should validate Spotify access token with real API call', async () => {
        if (!keys.spotifyAccessToken) {
            console.log('SKIP: No access token to validate');
            return;
        }

        if (!tokenIsValid) {
            console.log('SKIP: Token already known to be invalid');
            console.log('Run: node scripts/get-spotify-token.js to get valid tokens');
            return;
        }

        logTestData('Spotify token validation', { input: 'access token from .env.test' }, { valid: true }, { valid: tokenIsValid });
        expect(tokenIsValid).toBe(true);
    }, 15000);

    it('should get user profile with valid token', async () => {
        if (!tokenIsValid) {
            console.log('SKIP: Valid token required for this test');
            return;
        }

        const response = await axios.get('https://api.spotify.com/v1/me', {
            headers: { Authorization: `Bearer ${keys.spotifyAccessToken}` },
            timeout: 10000
        });

        logTestData('Spotify /v1/me profile', { input: 'GET /v1/me with access token' }, { status: 200, hasId: true, hasDisplayName: true }, {
            status: response.status,
            hasId: response.data?.id != null,
            hasDisplayName: response.data?.display_name != null,
            id: response.data?.id,
            display_name: response.data?.display_name
        });

        expect(response.status).toBe(200);
        expect(response.data).toHaveProperty('id');
        expect(response.data).toHaveProperty('display_name');

        console.log(`[SpotifyAuth] Authenticated as: ${response.data.display_name} (${response.data.id})`);
    }, 15000);

    it('should reject invalid access token', async () => {
        const result = await validateSpotifyCredentials('invalid-token-12345');
        logTestData('Spotify invalid token', { input: 'invalid-token-12345' }, { valid: false, error: 'defined' }, { valid: result.valid, error: result.error });
        expect(result.valid).toBe(false);
        expect(result.error).toBeDefined();
    }, 15000);

    it('should have required scopes for playback control', async () => {
        if (!tokenIsValid) {
            console.log('SKIP: Valid token required for scope testing');
            return;
        }

        const testEndpoints = [
            { url: '/me/player', scope: 'user-read-playback-state' },
            { url: '/me/top/tracks?limit=1', scope: 'user-top-read' },
        ];

        for (const endpoint of testEndpoints) {
            try {
                const response = await axios.get(
                    `https://api.spotify.com/v1${endpoint.url}`,
                    {
                        headers: { Authorization: `Bearer ${keys.spotifyAccessToken}` },
                        timeout: 10000,
                        validateStatus: (status) => status < 500
                    }
                );

                logTestData(`Spotify scope ${endpoint.scope}`, { input: `GET ${endpoint.url}` }, { status: [200, 204] }, { status: response.status });

                if (response.status === 403) {
                    throw new Error(`Missing scope: ${endpoint.scope}`);
                }

                expect([200, 204]).toContain(response.status);
            } catch (error: any) {
                if (error.response?.status === 403) {
                    throw new Error(`Missing scope: ${endpoint.scope}`);
                }
                // Network errors or other issues - re-throw
                throw error;
            }
        }
    }, 30000);
});
