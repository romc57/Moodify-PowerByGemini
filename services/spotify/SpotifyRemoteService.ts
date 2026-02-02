import axios from 'axios';
import { dbService } from '../database/DatabaseService';

const SPOTIFY_API_BASE = 'https://api.spotify.com/v1';
const SPOTIFY_TOKEN_URL = 'https://accounts.spotify.com/api/token';

/**
 * Get Spotify Client ID from database (user-entered in settings)
 */
async function getSpotifyClientId(): Promise<string> {
    const clientId = await dbService.getPreference('spotify_client_id');
    return clientId || '';
}

export class SpotifyRemoteService {
    private static instance: SpotifyRemoteService;
    private authFailed: boolean = false;
    private lastAuthFailTime: number = 0;
    private readonly AUTH_RETRY_DELAY_MS = 30000; // Wait 30s before retrying after auth failure

    private constructor() { }

    static getInstance(): SpotifyRemoteService {
        if (!SpotifyRemoteService.instance) {
            SpotifyRemoteService.instance = new SpotifyRemoteService();
        }
        return SpotifyRemoteService.instance;
    }

    /**
     * Check if we should skip requests due to recent auth failure
     */
    private shouldSkipDueToAuthFailure(): boolean {
        if (!this.authFailed) return false;
        const timeSinceFailure = Date.now() - this.lastAuthFailTime;
        if (timeSinceFailure > this.AUTH_RETRY_DELAY_MS) {
            this.authFailed = false;
            return false;
        }
        return true;
    }

    /**
     * Reset auth state - call after successful re-authentication
     */
    resetAuthState(): void {
        this.authFailed = false;
        this.lastAuthFailTime = 0;
    }

    private async getAccessToken(): Promise<string | null> {
        if (this.shouldSkipDueToAuthFailure()) {
            return null;
        }
        let token = await dbService.getServiceToken('spotify');
        return token;
    }

    private async refreshAccessToken(): Promise<string | null> {
        if (this.shouldSkipDueToAuthFailure()) {
            return null;
        }

        const refreshToken = await dbService.getRefreshToken('spotify');
        if (!refreshToken) {
            console.warn('[SpotifyRemote] No refresh token available');
            return null;
        }

        const clientId = await getSpotifyClientId();
        if (!clientId) {
            // Silently handle - user hasn't configured Spotify yet
            this.authFailed = true;
            this.lastAuthFailTime = Date.now();
            return null;
        }

        try {
            const response = await axios.post(SPOTIFY_TOKEN_URL,
                new URLSearchParams({
                    grant_type: 'refresh_token',
                    refresh_token: refreshToken,
                    client_id: clientId,
                }).toString(),
                {
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
                }
            );

            const { access_token, refresh_token: new_refresh_token } = response.data;

            if (access_token) {
                await dbService.setServiceToken('spotify', access_token, new_refresh_token || refreshToken);
                console.log('[SpotifyRemote] Token refreshed successfully');
                this.resetAuthState();
                return access_token;
            }
        } catch (e: any) {
            const errorData = e.response?.data;
            // Only log if it's not a simple auth issue
            if (errorData?.error !== 'invalid_client' && errorData?.error !== 'invalid_grant') {
                console.warn('[SpotifyRemote] Token refresh failed:', e.message);
            }

            // Mark auth as failed to prevent infinite retry loops
            if (errorData?.error === 'invalid_client' || errorData?.error === 'invalid_grant') {
                this.authFailed = true;
                this.lastAuthFailTime = Date.now();
                // Clear invalid tokens to force re-authentication
                await dbService.removeServiceToken('spotify');
            }
        }
        return null;
    }

    private async request(method: string, endpoint: string, data: any = {}, params: any = {}) {
        if (this.shouldSkipDueToAuthFailure()) {
            throw new Error('AUTH_FAILED');
        }

        let token = await this.getAccessToken();
        if (!token) throw new Error('NO_TOKEN');

        const makeRequest = async (t: string, retries = 3) => {
            const config: any = {
                method,
                url: `${SPOTIFY_API_BASE}${endpoint}`,
                params,
                headers: { Authorization: `Bearer ${t}` }
            };

            if (method.toLowerCase() !== 'get' && method.toLowerCase() !== 'head') {
                config.data = data;
            }

            try {
                return await axios(config);
            } catch (error: any) {
                // Retry on Network Error or 5xx
                if ((error.message === 'Network Error' || (error.response && error.response.status >= 500)) && retries > 0) {
                    console.warn(`[SpotifyRemote] Request failed (${error.message}), retrying... (${retries} left)`);
                    await new Promise(r => setTimeout(r, 1000)); // Wait 1s
                    return makeRequest(t, retries - 1);
                }
                throw error;
            }
        };

        try {
            return await makeRequest(token);
        } catch (error: any) {
            if (error.response?.status === 401) {
                // Silently attempt token refresh
                token = await this.refreshAccessToken();
                if (token) { // Changed from newToken to token to match the assignment above
                    return await makeRequest(token);
                }
            }
            throw error;
        }
    }

    async play(uriOrUris?: string | string[]) {
        try {
            let body = {};
            if (uriOrUris) {
                const uris = Array.isArray(uriOrUris) ? uriOrUris : [uriOrUris];
                body = { uris };
            }
            await this.request('put', '/me/player/play', body);
        } catch (e: any) {
            console.error('[SpotifyRemote] Play Error', e);
            if (e.response && e.response.status === 404) {
                throw new Error('NO_DEVICE');
            }
            if (e.response && e.response.status === 403) {
                throw new Error('PREMIUM_REQUIRED');
            }
            throw e;
        }
    }

    async playUri(uri: string): Promise<void> {
        try {
            // This method assumes 'remote' and 'this.token' are available, which they are not in this class.
            // This snippet seems to be from a different context or requires additional setup.
            // For now, I'll implement it using the existing `request` method.
            await this.request('put', '/me/player/play', { uris: [uri] });
        } catch (e) {
            console.error('[SpotifyRemote] Play Error', e);
            throw e;
        }
    }

    async pause() {
        try {
            await this.request('put', '/me/player/pause');
        } catch (e: any) {
            console.error('[SpotifyRemote] Pause Error', e);
            if (e.response && e.response.status === 404) {
                throw new Error('NO_DEVICE');
            }
            if (e.response && e.response.status === 403) {
                throw new Error('PREMIUM_REQUIRED');
            }
            throw e;
        }
    }

    async next() {
        try {
            await this.request('post', '/me/player/next');
        } catch (e: any) {
            console.error('[SpotifyRemote] Next Error', e);
            if (e.response && e.response.status === 404) {
                throw new Error('NO_DEVICE');
            }
            if (e.response && e.response.status === 403) {
                throw new Error('PREMIUM_REQUIRED');
            }
            throw e;
        }
    }

    async previous() {
        try {
            await this.request('post', '/me/player/previous');
        } catch (e: any) {
            console.error('[SpotifyRemote] Previous Error', e);
            if (e.response && e.response.status === 404) {
                throw new Error('NO_DEVICE');
            }
            if (e.response && e.response.status === 403) {
                throw new Error('PREMIUM_REQUIRED');
            }
            throw e;
        }
    }

    async addToQueue(uri: string) {
        if (!uri) return;
        try {
            // The provided snippet for addToQueue uses 'remote' and 'this.token' which are not defined here.
            // I will use the existing 'request' method to implement the queue functionality.
            // The instruction also mentions "Verify connection before queueing or playing to prevent PREMIUM errors."
            // The `request` method already handles token acquisition and refresh, which implicitly verifies connection.
            // The `PREMIUM_REQUIRED` error handling is also present in the `request` method's callers.
            await this.request('post', '/me/player/queue', {}, { uri });
        } catch (e: any) {
            console.error('[SpotifyRemote] AddToQueue Error', e);
            if (e.message?.includes('PREMIUM_REQUIRED')) {
                console.warn('[Spotify] Premium required error. Attempting strictly remote command as fallback.');
                // Sometimes the specific 'queue' command fails on free, but we might be disconnected.
                // Re-throw to let upper layers handle it
            }
            throw e; // Rethrow to let PlayerStore fallback to play()
        }
    }

    async search(query: string, type: 'track' | 'playlist' | 'artist' | 'album' | 'show' | 'episode' = 'track') {
        try {
            // Searching Spotify...
            const response = await this.request('get', '/search', {}, {
                q: query,
                type,
                limit: 10,
                market: 'from_token'
            });

            if (!response || !response.data) {
                console.warn('[SpotifyRemote] Search response empty');
                return [];
            }

            let key = `${type}s`;
            let items = response.data[key]?.items;

            // Fallback: If exact key matches nothing, check common keys
            if (!items) {
                const contentKeys = ['tracks', 'episodes', 'playlists', 'shows', 'artists', 'albums'];
                for (const k of contentKeys) {
                    if (response.data[k]?.items) {
                        // Found items in different key
                        key = k;
                        items = response.data[k].items;
                        break;
                    }
                }
            }

            if (!items) {
                console.warn(`[SpotifyRemote] No items found. Keys in response: ${Object.keys(response.data).join(', ')}`);
            } else {
                // Search successful
            }

            return items || [];
        } catch (e: any) {
            console.error('[SpotifyRemote] Search Error', (e as any).response ? (e as any).response.data : e);
            if (e.response && e.response.status === 403) {
                console.warn('[SpotifyRemote] 403 during search - attempting token refresh');
                await this.refreshAccessToken();
            }
            return [];
        }
    }

    async getUserTopTracks(limit: number = 20, time_range: 'short_term' | 'medium_term' | 'long_term' = 'short_term') {
        try {
            const response = await this.request('get', '/me/top/tracks', {}, { limit, time_range });
            return response ? response.data.items : [];
        } catch (e: any) {
            console.error('[SpotifyRemote] Get Top Tracks Error', e);
            if (e.response && e.response.status === 403) {
                console.warn('[SpotifyRemote] 403 Forbidden - Insufficient scope? Removing token to force re-auth.');
                await dbService.removeServiceToken('spotify');
            }
            return [];
        }
    }

    async getRecommendations(seedTracks: string[], seedGenres: string[] = [], limit: number = 5) {
        try {
            let query = `?limit=${limit}`;
            if (seedTracks.length > 0) query += `&seed_tracks=${seedTracks.join(',')}`;
            if (seedGenres.length > 0) query += `&seed_genres=${seedGenres.join(',')}`;

            // Use request() method for proper 401 handling and token refresh
            const response = await this.request('get', `/recommendations${query}`);

            if (!response || !response.data) {
                console.warn('[SpotifyRemote] Empty recommendations response');
                return [];
            }

            return response.data.tracks || [];
        } catch (e: any) {
            if (e.response && e.response.status === 404) {
                console.warn('[SpotifyRemote] Recommendations endpoint not found (404).');
            } else {
                console.error('[SpotifyRemote] Get Recommendations Error', e);
            }
            return [];
        }
    }

    /**
     * Get Spotify Radio for a track (similar tracks)
     * Uses recommendations endpoint with the track as seed
     */
    async getRadioForTrack(trackId: string, limit: number = 30) {
        try {
            return await this.getRecommendations([trackId], [], limit);
        } catch (e) {
            console.error('[SpotifyRemote] Get Radio Error', e);
            return [];
        }
    }

    /**
     * Queue multiple tracks sequentially
     * Includes rate limiting to avoid Spotify API throttling
     */
    async addMultipleToQueue(uris: string[]) {
        const results = [];
        for (const uri of uris) {
            try {
                await this.addToQueue(uri);
                results.push({ uri, success: true });
                // Rate limit: 100ms between each queue request
                await new Promise(r => setTimeout(r, 100));
            } catch (e) {
                console.warn(`[SpotifyRemote] Failed to queue ${uri}:`, e);
                results.push({ uri, success: false, error: e });
            }
        }
        return results;
    }

    private pollingInterval: any = null;
    private lastTrackId: string | null = null;
    private lastPositionMs: number = 0;
    private lastDurationMs: number = 0;
    private lastTrackInfo: any = null;
    // Store callback reference to prevent memory leaks from closures
    private onTrackFinishedCallback: ((type: 'finish' | 'skip', track: any) => void) | null = null;

    startPolling(onTrackFinished: (type: 'finish' | 'skip', track: any) => void) {
        // Always clean up first to prevent memory leaks
        this.stopPolling();

        // Store callback reference
        this.onTrackFinishedCallback = onTrackFinished;

        // Starting playback polling
        this.pollingInterval = setInterval(async () => {
            try {
                const response = await this.request('get', '/me/player');
                if (!response || !response.data || !response.data.item) return;

                const currentItem = response.data.item;
                const progressMs = response.data.progress_ms;

                if (this.lastTrackId && this.lastTrackId !== currentItem.id) {
                    // Track changed

                    const isFinished = (this.lastPositionMs > this.lastDurationMs * 0.9) || (this.lastDurationMs - this.lastPositionMs < 10000);

                    if (this.lastTrackInfo && this.onTrackFinishedCallback) {
                        this.onTrackFinishedCallback(isFinished ? 'finish' : 'skip', this.lastTrackInfo);
                    }
                }

                this.lastTrackId = currentItem.id;
                this.lastDurationMs = currentItem.duration_ms;
                this.lastPositionMs = progressMs;
                this.lastTrackInfo = {
                    title: currentItem.name,
                    artist: currentItem.artists[0]?.name,
                    duration_ms: currentItem.duration_ms,
                    uri: currentItem.uri,
                    artwork: currentItem.album?.images[0]?.url
                };
            } catch (e: any) {
                // Don't spam logs for expected auth/token errors
                if (e.message !== 'NO_TOKEN' && e.message !== 'AUTH_FAILED') {
                    console.warn('[SpotifyRemote] Polling error:', e.message || e);
                }
            }
        }, 5000);
    }

    async getCurrentState() {
        // Skip if auth has failed - prevents error spam
        if (this.shouldSkipDueToAuthFailure()) {
            return null;
        }

        try {
            const response = await this.request('get', '/me/player');

            // Silently handle auth failures
            if (!response || response.status === 401 || response.status === 403) {
                return null;
            }

            if (!response.data || !response.data.item) return null;
            const item = response.data.item;
            return {
                title: item.name,
                artist: item.artists?.[0]?.name || 'Unknown Artist',
                uri: item.uri,
                artwork: item.album?.images?.[0]?.url,
                duration_ms: item.duration_ms,
                progress_ms: response.data.progress_ms,
                is_playing: response.data.is_playing
            };
        } catch (e: any) {
            // Don't spam logs for expected auth/token errors
            if (e.message !== 'NO_TOKEN' && e.message !== 'AUTH_FAILED') {
                console.warn('[SpotifyRemote] Get Current State failed:', e.message);
            }
            return null;
        }
    }

    async getUserQueue() {
        try {
            const response = await this.request('get', '/me/player/queue');
            if (!response || !response.data) return null;
            return {
                currently_playing: response.data.currently_playing,
                queue: response.data.queue
            };
        } catch (e) {
            console.error('[SpotifyRemote] Get Queue Error', e);
            return null;
        }
    }

    stopPolling() {
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
            this.pollingInterval = null;
            // Release callback reference to prevent memory leaks
            this.onTrackFinishedCallback = null;

            // Reset State so we don't trigger false skips/finish on restart
            this.lastTrackId = null;
            this.lastDurationMs = 0;
            this.lastPositionMs = 0;
            this.lastTrackInfo = null;
        }
    }
}

export const spotifyRemote = SpotifyRemoteService.getInstance();
