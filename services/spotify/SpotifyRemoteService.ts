import { useVitalsStore } from '@/vitals/VitalsStore';
import axios from 'axios';
import { dbService } from '../database/DatabaseService';
import { SPOTIFY_CLIENT_ID } from './constants';

const SPOTIFY_API_BASE = 'https://api.spotify.com/v1';
const SPOTIFY_TOKEN_URL = 'https://accounts.spotify.com/api/token';

export class SpotifyRemoteService {
    private static instance: SpotifyRemoteService;

    private constructor() { }

    static getInstance(): SpotifyRemoteService {
        if (!SpotifyRemoteService.instance) {
            SpotifyRemoteService.instance = new SpotifyRemoteService();
        }
        return SpotifyRemoteService.instance;
    }

    private async getAccessToken(): Promise<string | null> {
        let token = await dbService.getServiceToken('spotify');
        return token;
    }

    private async refreshAccessToken(): Promise<string | null> {
        console.log('[SpotifyRemote] Attempting refresh...');
        const refreshToken = await dbService.getRefreshToken('spotify');
        if (!refreshToken) {
            console.warn('[SpotifyRemote] No refresh token available');
            return null;
        }

        try {
            const response = await axios.post(SPOTIFY_TOKEN_URL,
                new URLSearchParams({
                    grant_type: 'refresh_token',
                    refresh_token: refreshToken,
                    client_id: SPOTIFY_CLIENT_ID,
                }).toString(),
                {
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
                }
            );

            const { access_token, refresh_token: new_refresh_token } = response.data;

            if (access_token) {
                await dbService.setServiceToken('spotify', access_token, new_refresh_token || refreshToken);
                console.log('[SpotifyRemote] Token refreshed successfully');
                return access_token;
            }
        } catch (e) {
            console.error('[SpotifyRemote] Refresh Failed', e);
        }
        return null;
    }

    private async request(method: string, endpoint: string, data: any = {}, params: any = {}) {
        let token = await this.getAccessToken();
        if (!token) return null;

        const makeRequest = async (t: string) => {
            return axios({
                method,
                url: `${SPOTIFY_API_BASE}${endpoint}`,
                data,
                params,
                headers: { Authorization: `Bearer ${t}` }
            });
        };

        try {
            return await makeRequest(token);
        } catch (error: any) {
            if (error.response && error.response.status === 401) {
                console.warn('[SpotifyRemote] 401 detected, refreshing token...');
                const newToken = await this.refreshAccessToken();
                if (newToken) {
                    return await makeRequest(newToken);
                }
            }
            throw error;
        }
    }

    async play(uri?: string) {
        try {
            await this.request('put', '/me/player/play', uri ? { uris: [uri] } : {});
            useVitalsStore.getState().setMusicState(true);
        } catch (e) {
            console.error('[SpotifyRemote] Play Error', e);
        }
    }

    async pause() {
        try {
            await this.request('put', '/me/player/pause');
            useVitalsStore.getState().setMusicState(false);
        } catch (e) {
            console.error('[SpotifyRemote] Pause Error', e);
        }
    }

    async next() {
        try {
            await this.request('post', '/me/player/next');
        } catch (e) {
            console.error('[SpotifyRemote] Next Error', e);
        }
    }

    async search(query: string, type: 'track' | 'playlist' = 'track') {
        try {
            const response = await this.request('get', '/search', {}, { q: query, type, limit: 10 });
            return response ? response.data[`${type}s`].items : [];
        } catch (e) {
            console.error('[SpotifyRemote] Search Error', e);
            return [];
        }
    }
}

export const spotifyRemote = SpotifyRemoteService.getInstance();
