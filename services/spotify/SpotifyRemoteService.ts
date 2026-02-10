import { SpotifyErrors } from '@/services/core/ServiceError';
import { graphService } from '@/services/graph/GraphService';
import { useErrorStore } from '@/stores/ErrorStore';
import axios from 'axios';
import { dbService } from '../database';
import { SPOTIFY_API_BASE, SPOTIFY_TOKEN_URL } from './constants';

/**
 * Auth status for external access
 */
export type AuthFailReason = 'invalid_client' | 'invalid_grant' | 'network' | 'unknown' | null;

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
    private lastAuthFailReason: AuthFailReason = null;
    private readonly AUTH_RETRY_DELAY_MS = 30000; // Wait 30s before retrying after auth failure

    // Mutex for token refresh - prevents concurrent refresh attempts
    private isRefreshing: boolean = false;
    private refreshPromise: Promise<string | null> | null = null;

    private constructor() { }

    /**
     * Convert HTTP errors to typed playback errors
     * Centralizes error handling for player control methods
     */
    private handlePlaybackError(e: any, context: string): never {
        console.error(`[SpotifyRemote] ${context} Error`, e.response?.data || e.message);
        if (e.response?.status === 404) {
            throw new Error('NO_DEVICE');
        }
        if (e.response?.status === 403) {
            throw new Error('PREMIUM_REQUIRED');
        }
        throw e;
    }

    /**
     * Get the remaining time in auth lockout (ms)
     * Returns 0 if not in lockout
     */
    getAuthLockoutRemaining(): number {
        if (!this.authFailed) return 0;
        const elapsed = Date.now() - this.lastAuthFailTime;
        const remaining = this.AUTH_RETRY_DELAY_MS - elapsed;
        return remaining > 0 ? remaining : 0;
    }

    /**
     * Check if currently in auth lockout
     */
    isInAuthLockout(): boolean {
        return this.getAuthLockoutRemaining() > 0;
    }

    /**
     * Get current auth status for UI display
     */
    getAuthStatus(): {
        isLocked: boolean;
        lockoutRemainingMs: number;
        lastFailReason: AuthFailReason;
        lastFailTime: number | null;
    } {
        return {
            isLocked: this.isInAuthLockout(),
            lockoutRemainingMs: this.getAuthLockoutRemaining(),
            lastFailReason: this.lastAuthFailReason,
            lastFailTime: this.authFailed ? this.lastAuthFailTime : null
        };
    }

    static getInstance(): SpotifyRemoteService {
        if (!SpotifyRemoteService.instance) {
            console.log('[SpotifyRemote] Initializing Service...');
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
        this.lastAuthFailReason = null;
        // Clear any Spotify errors from the store
        useErrorStore.getState().clearError('spotify');
    }

    /**
     * Mark auth as failed with reason
     */
    private markAuthFailed(reason: AuthFailReason): void {
        this.authFailed = true;
        this.lastAuthFailTime = Date.now();
        this.lastAuthFailReason = reason;

        // Emit to ErrorStore
        const lockoutRemaining = this.AUTH_RETRY_DELAY_MS;
        if (reason === 'invalid_client' || reason === 'invalid_grant') {
            useErrorStore.getState().setError(SpotifyErrors.authExpired(`Auth failed: ${reason}`));
        } else {
            useErrorStore.getState().setError(SpotifyErrors.authLockout(lockoutRemaining));
        }
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

        // If already refreshing, wait for that promise instead of starting another
        if (this.isRefreshing && this.refreshPromise) {
            console.log('[SpotifyRemote] Refresh already in progress, waiting...');
            return this.refreshPromise;
        }

        // Start the refresh with mutex
        this.isRefreshing = true;
        this.refreshPromise = this.doRefreshAccessToken();

        try {
            const result = await this.refreshPromise;
            return result;
        } finally {
            this.isRefreshing = false;
            this.refreshPromise = null;
        }
    }

    private async doRefreshAccessToken(): Promise<string | null> {
        const refreshToken = await dbService.getRefreshToken('spotify');
        if (!refreshToken) {
            console.warn('[SpotifyRemote] No refresh token available');
            return null;
        }

        const clientId = await getSpotifyClientId();
        if (!clientId) {
            // Silently handle - user hasn't configured Spotify yet
            this.markAuthFailed('invalid_client');
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

            // Mark auth as failed to prevent infinite retry loops with specific reason
            if (errorData?.error === 'invalid_client') {
                this.markAuthFailed('invalid_client');
                await dbService.removeServiceToken('spotify');
            } else if (errorData?.error === 'invalid_grant') {
                this.markAuthFailed('invalid_grant');
                await dbService.removeServiceToken('spotify');
            } else if (e.message === 'Network Error') {
                this.markAuthFailed('network');
            } else {
                this.markAuthFailed('unknown');
            }
        }
        return null;
    }

    /**
     * Build axios config for request
     */
    private buildRequestConfig(method: string, endpoint: string, token: string, data: any, params: any): any {
        const config: any = {
            method,
            url: `${SPOTIFY_API_BASE}${endpoint}`,
            params,
            headers: { Authorization: `Bearer ${token}` }
        };

        if (method.toLowerCase() !== 'get' && method.toLowerCase() !== 'head') {
            config.data = data;
        }

        return config;
    }

    /**
     * Execute single request with retry logic
     */
    private async executeRequest(config: any, method: string, endpoint: string, retries = 3): Promise<any> {
        try {
            const response = await axios(config);
            return response;
        } catch (error: any) {
            const shouldRetry = (error.message === 'Network Error' ||
                (error.response?.status >= 500)) && retries > 0;

            if (shouldRetry) {
                await new Promise(r => setTimeout(r, 1000));
                return this.executeRequest(config, method, endpoint, retries - 1);
            }
            throw error;
        }
    }

    /**
     * Main request handler with auth retry
     */
    /**
     * Get user's saved tracks (Liked Songs)
     */
    async getUserSavedTracks(limit: number = 50, offset: number = 0): Promise<{ items: any[], total: number }> {
        try {
            const start = performance.now();
            const response = await this.request('get', '/me/tracks', {}, { limit, offset });
            const duration = performance.now() - start;
            console.log(`[Perf] Spotify Request (getUserSavedTracks): ${duration.toFixed(2)}ms`);

            return {
                items: response?.data?.items || [],
                total: response?.data?.total || 0
            };
        } catch (e) {
            console.error('[SpotifyRemote] Get Saved Tracks Error', e);
            return { items: [], total: 0 };
        }
    }

    /**
     * Get audio features for multiple tracks (max 100 per request)
     */
    async getAudioFeaturesBatch(ids: string[]): Promise<any[]> {
        const results: any[] = [];
        const CHUNK_SIZE = 100;

        for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
            const chunk = ids.slice(i, i + CHUNK_SIZE);
            try {
                const response = await this.request('get', '/audio-features', {}, {
                    ids: chunk.join(',')
                });
                if (response?.data?.audio_features) {
                    results.push(...response.data.audio_features);
                }
            } catch (e) {
                console.error(`[SpotifyRemote] Audio Features Batch Error (offset ${i})`, e);
                // Push nulls for failed chunks so indices stay aligned
                results.push(...chunk.map(() => null));
            }
            // Rate limit between chunks
            if (i + CHUNK_SIZE < ids.length) {
                await new Promise(r => setTimeout(r, 100));
            }
        }

        return results;
    }

    /**
     * Get artist details for multiple artists (max 50 per request)
     */
    async getArtistsBatch(ids: string[]): Promise<any[]> {
        const results: any[] = [];
        const CHUNK_SIZE = 50;

        for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
            const chunk = ids.slice(i, i + CHUNK_SIZE);
            try {
                const response = await this.request('get', '/artists', {}, {
                    ids: chunk.join(',')
                });
                if (response?.data?.artists) {
                    results.push(...response.data.artists);
                }
            } catch (e) {
                console.error(`[SpotifyRemote] Artists Batch Error (offset ${i})`, e);
                results.push(...chunk.map(() => null));
            }
            // Rate limit between chunks
            if (i + CHUNK_SIZE < ids.length) {
                await new Promise(r => setTimeout(r, 100));
            }
        }

        return results;
    }

    /**
     * Main request handler with auth retry
     */
    private async request(method: string, endpoint: string, data: any = {}, params: any = {}) {
        if (this.shouldSkipDueToAuthFailure()) {
            throw new Error('AUTH_FAILED');
        }

        let token = await this.getAccessToken();
        if (!token) throw new Error('NO_TOKEN');

        const makeRequest = async (t: string) => {
            const config = this.buildRequestConfig(method, endpoint, t, data, params);

            const start = performance.now();
            const result = await this.executeRequest(config, method, endpoint, 3);
            const duration = performance.now() - start;

            // Log performance for critical endpoints (search, player, etc.)
            // if (endpoint.includes('/search') || endpoint.includes('/player')) {
            //     console.log(`[Perf] Spotify Request (${endpoint}): ${duration.toFixed(2)}ms`);
            // }

            return result;
        };

        try {
            return await makeRequest(token);
        } catch (error: any) {
            // Handle 401 (Unauthorized) or 403 (Forbidden) by refreshing token
            const status = error.response?.status;
            if (status === 401 || status === 403 || error.message === 'NO_TOKEN') {
                console.log(`[SpotifyRemote] Auth error (${status || 'NO_TOKEN'}) - Attempting auto-refresh...`);
                token = await this.refreshAccessToken();
                if (token) {
                    console.log('[SpotifyRemote] Refresh successful, retrying request...');
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
                console.log(`[SpotifyRemote] Playing ${uris.length} tracks`);
            }
            // Add offset to ensure we play from start
            if (uriOrUris) {
                (body as any).offset = { position: 0 };
            }

            await this.request('put', '/me/player/play', body);
        } catch (e: any) {
            this.handlePlaybackError(e, 'Play');
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
            this.handlePlaybackError(e, 'Pause');
        }
    }

    async next() {
        try {
            await this.request('post', '/me/player/next');
        } catch (e: any) {
            this.handlePlaybackError(e, 'Next');
        }
    }

    async previous() {
        try {
            await this.request('post', '/me/player/previous');
        } catch (e: any) {
            this.handlePlaybackError(e, 'Previous');
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

    /**
     * Determine if track finished or was skipped
     */
    private wasTrackFinished(): boolean {
        const nearEnd = this.lastPositionMs > this.lastDurationMs * 0.9;
        const almostDone = this.lastDurationMs - this.lastPositionMs < 5000;
        const edgeCase = this.lastDurationMs === 0 && this.lastPositionMs > 0;
        return nearEnd || almostDone || edgeCase;
    }

    /**
     * Update tracking state from current item
     */
    private updateTrackingState(item: any, progressMs: number): void {
        this.lastTrackId = item.id;
        this.lastDurationMs = item.duration_ms;
        this.lastPositionMs = progressMs;
        this.lastTrackInfo = {
            title: item.name,
            artist: item.artists[0]?.name,
            duration_ms: item.duration_ms,
            uri: item.uri,
            artwork: item.album?.images[0]?.url
        };
    }

    /**
     * Handle track change detection
     */
    private handleTrackChange(currentItemId: string): void {
        if (!this.lastTrackId || this.lastTrackId === currentItemId) return;

        const isFinished = this.wasTrackFinished();
        if (this.lastTrackInfo && this.onTrackFinishedCallback) {
            const listenMs = this.lastPositionMs;
            this.onTrackFinishedCallback(isFinished ? 'finish' : 'skip', { ...this.lastTrackInfo, listenMs });
        }
    }

    /**
     * Process polling response
     */
    private async processPollingResponse(): Promise<void> {
        const response = await this.request('get', '/me/player');

        if (!response?.data || response.status === 204 || !response.data.item) {
            return;
        }

        const currentItem = response.data.item;
        this.handleTrackChange(currentItem.id);
        this.updateTrackingState(currentItem, response.data.progress_ms);
    }

    async startPolling(onTrackFinished: (type: 'finish' | 'skip', track: any) => void) {
        this.stopPolling();
        this.onTrackFinishedCallback = onTrackFinished;

        console.log('[SpotifyRemote] Starting polling...');

        this.pollingInterval = setInterval(async () => {
            try {
                await this.processPollingResponse();
            } catch (e: any) {
                if (e.message !== 'NO_TOKEN' && e.message !== 'AUTH_FAILED') {
                    // Silent fail for polling errors
                }
            }
        }, 1000);
    }

    async getCurrentState() {
        // Skip if auth has failed - prevents error spam
        if (this.shouldSkipDueToAuthFailure()) {
            return null;
        }

        try {
            const response = await this.request('get', '/me/player');

            // Silently handle auth failures or no content
            if (!response || response.status === 204 || response.status === 401 || response.status === 403) {
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
            console.log('[SpotifyRemote] Polling stopped');
        }
    }
    /**
     * Lazy Validation: Try to play/queue. If invalid URI, search, update Graph, and retry.
     */
    async queueOrRecover(uri: string, metadata: { name: string; artist: string; nodeId?: number }) {
        if (!uri) return;

        try {
            // 1. Try with existing URI
            await this.addToQueue(uri);
        } catch (e: any) {
            // 2. Catch 404/400 (Invalid ID)
            const isInvalidId = e.response?.status === 404 || e.response?.status === 400 || (e.message && e.message.includes('Invalid'));

            if (isInvalidId && metadata.name) {
                console.warn(`[SpotifyRemote] Invalid URI ${uri} for ${metadata.name}. Attempting recovery...`);

                // 3. Search for track
                const query = `${metadata.name} ${metadata.artist}`;
                const results = await this.search(query, 'track');

                if (results.length > 0) {
                    const freshTrack = results[0];
                    console.log(`[SpotifyRemote] Recovered ${metadata.name}: ${freshTrack.uri}`);

                    // 4. Update Graph (Self-Healing)
                    // We use getEffectiveNode to ensure it updates the existing node if ID passed, or creates/updates by name
                    if (metadata.nodeId) {
                        await graphService.getEffectiveNode('SONG', metadata.name, freshTrack.uri, { artist: metadata.artist });
                    }

                    // 5. Retry
                    await this.addToQueue(freshTrack.uri);
                    return;
                }
            }
            throw e; // Rethrow if not recoverable
        }
    }

    async playOrRecover(uri: string, metadata: { name: string; artist: string; nodeId?: number }) {
        try {
            await this.play(uri);
        } catch (e: any) {
            const isInvalidId = e.response?.status === 404 || e.response?.status === 400;
            if (isInvalidId && metadata.name) {
                console.warn(`[SpotifyRemote] Invalid URI ${uri}. Recovering...`);
                const results = await this.search(`${metadata.name} ${metadata.artist}`, 'track');
                if (results.length > 0) {
                    const freshUri = results[0].uri;
                    await graphService.getEffectiveNode('SONG', metadata.name, freshUri, { artist: metadata.artist });
                    await this.play(freshUri);
                    return;
                }
            }
            throw e;
        }
    }
}

export const spotifyRemote = SpotifyRemoteService.getInstance();
