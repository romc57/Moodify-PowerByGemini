import { ResponseType, useAuthRequest } from 'expo-auth-session';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { dbService } from '../database';
import { SPOTIFY_AUTH_ENDPOINT, SPOTIFY_TOKEN_URL } from './constants';

// Spotify OAuth discovery document
const discovery = {
    authorizationEndpoint: SPOTIFY_AUTH_ENDPOINT,
    tokenEndpoint: SPOTIFY_TOKEN_URL,
};

// Create platform-specific redirect URI
const getRedirectUri = (): string => {
    if (Platform.OS === 'web') {
        // For web, use 127.0.0.1 as configured in Spotify Developer Dashboard
        return 'http://127.0.0.1:8081/callback';
    }
    // For native apps, use the custom scheme with callback path to avoid 404s
    return 'moodifymobile://callback';
};

/**
 * Get Spotify Client ID from database (user-entered in settings)
 */
export async function getSpotifyClientId(): Promise<string> {
    const clientId = await dbService.getPreference('spotify_client_id');
    return clientId || '';
}

export const useSpotifyAuth = () => {
    const [clientId, setClientId] = useState<string>('');

    // Load client ID from database on mount
    useEffect(() => {
        getSpotifyClientId().then(setClientId);
    }, []);

    // 1. Define Request - provide valid config even when clientId is empty
    const [request, response, promptAsync] = useAuthRequest(
        {
            clientId: clientId || 'placeholder', // Use placeholder to prevent null errors
            scopes: [
                'user-read-email',
                'user-read-playback-state',
                'user-modify-playback-state',
                'user-read-currently-playing',
                'user-read-recently-played',
                'user-top-read',
                'playlist-read-private',
                'playlist-read-collaborative',
                'user-library-read',
                'user-library-modify',
                'streaming' // Required for Web Playback SDK (may help with search too)
            ],
            usePKCE: true,
            responseType: ResponseType.Code,
            redirectUri: getRedirectUri(),
        },
        discovery
    );

    useEffect(() => {
        // Redirect URI configured
    }, [request]);

    useEffect(() => {
        if (response?.type === 'success') {
            const { code } = response.params;
            if (code && request?.codeVerifier) {
                exchangeCodeForToken(code, request.codeVerifier, clientId);
            }
        }
    }, [response, clientId]);

    const exchangeCodeForToken = async (code: string, codeVerifier: string, currentClientId: string) => {
        try {
            const currentRedirectUri = getRedirectUri();
            console.log('[SpotifyAuth] Token exchange using redirect URI:', currentRedirectUri);

            const tokenResponse = await fetch(discovery.tokenEndpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: new URLSearchParams({
                    client_id: currentClientId,
                    grant_type: 'authorization_code',
                    code,
                    redirect_uri: currentRedirectUri,
                    code_verifier: codeVerifier,
                }).toString(),
            });

            if (!tokenResponse.ok) {
                const errorText = await tokenResponse.text();
                console.error('[SpotifyAuth] Token response not OK:', tokenResponse.status, errorText);
                return;
            }

            let data;
            try {
                data = await tokenResponse.json();
            } catch (parseError) {
                console.error('[SpotifyAuth] Failed to parse token response JSON', parseError);
                return;
            }

            if (data.access_token) {
                await dbService.setServiceToken('spotify', data.access_token, data.refresh_token);
                // Token stored successfully
            } else {
                console.error('[SpotifyAuth] Failed to exchange code', data);
            }
        } catch (e) {
            console.error('[SpotifyAuth] Exchange Error', e);
        }
    };

    return { request, promptAsync };
};
