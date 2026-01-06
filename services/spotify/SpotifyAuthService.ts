import { makeRedirectUri, ResponseType, useAuthRequest } from 'expo-auth-session';
import { useEffect } from 'react';
import { dbService } from '../database/DatabaseService';
import { SPOTIFY_CLIENT_ID } from './constants';

const discovery = {
    authorizationEndpoint: 'https://accounts.spotify.com/authorize',
    tokenEndpoint: 'https://accounts.spotify.com/api/token',
};

export const useSpotifyAuth = () => {
    // 1. Define Request
    const [request, response, promptAsync] = useAuthRequest(
        {
            clientId: SPOTIFY_CLIENT_ID,
            scopes: [
                'user-read-email',
                'user-read-playback-state',
                'user-modify-playback-state'
            ],
            // In order to follow the "Authorization Code Flow" to fetch token after authorizationEndpoint
            // this must be set to true for PKCE
            usePKCE: true,
            responseType: ResponseType.Code,
            redirectUri: makeRedirectUri({
                native: 'moodifymobile://',
            }),
        },
        discovery
    );

    useEffect(() => {
        console.log('[SpotifyAuth] Redirect URI:', request?.redirectUri);
    }, [request]);

    useEffect(() => {
        if (response?.type === 'success') {
            const { code } = response.params;
            if (code && request?.codeVerifier) {
                // Exchange code for token
                exchangeCodeForToken(code, request.codeVerifier);
            }
        }
    }, [response]);

    const exchangeCodeForToken = async (code: string, codeVerifier: string) => {
        try {
            const redirectUri = makeRedirectUri({ native: 'moodifymobile://' });
            const tokenResponse = await fetch(discovery.tokenEndpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: new URLSearchParams({
                    client_id: SPOTIFY_CLIENT_ID,
                    grant_type: 'authorization_code',
                    code,
                    redirect_uri: redirectUri,
                    code_verifier: codeVerifier,
                }).toString(),
            });

            const data = await tokenResponse.json();
            if (data.access_token) {
                dbService.setServiceToken('spotify', data.access_token, data.refresh_token);
                console.log('[SpotifyAuth] Token & Refresh Token stored in DB successfully');
            } else {
                console.error('[SpotifyAuth] Failed to exchange code', data);
            }
        } catch (e) {
            console.error('[SpotifyAuth] Exchange Error', e);
        }
    };

    return { request, promptAsync };
};
