import { makeRedirectUri, ResponseType, useAuthRequest, AuthSessionResult } from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { dbService } from '../database';
import { SPOTIFY_AUTH_ENDPOINT, SPOTIFY_TOKEN_URL } from './constants';

// Ensure auth session can complete on web
WebBrowser.maybeCompleteAuthSession();

// OAuth Discovery document
const discovery = {
    authorizationEndpoint: SPOTIFY_AUTH_ENDPOINT,
    tokenEndpoint: SPOTIFY_TOKEN_URL,
};

// Scopes required for the app
const SPOTIFY_SCOPES = [
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
    'streaming',
];

/**
 * Get platform-specific redirect URI
 */
export function getRedirectUri(): string {
    if (Platform.OS === 'web') {
        // Dynamically use current origin so it works on any host/port
        if (typeof window !== 'undefined') {
            return `${window.location.origin}/callback`;
        }
        return 'http://localhost:8081/callback';
    }
    // Native: use custom scheme for Android/iOS
    return makeRedirectUri({
        scheme: 'moodifymobile',
        path: 'callback',
        native: 'moodifymobile://callback',
    });
}

/**
 * Get Spotify Client ID from database
 */
export async function getSpotifyClientId(): Promise<string> {
    const clientId = await dbService.getPreference('spotify_client_id');
    return clientId || '';
}

/**
 * Exchange authorization code for tokens
 */
export async function exchangeCodeForToken(
    code: string,
    codeVerifier: string,
    clientId: string
): Promise<{ success: boolean; error?: string }> {
    try {
        const redirectUri = getRedirectUri();
        console.log('[SpotifyAuth] Exchanging code for token...');

        const response = await fetch(SPOTIFY_TOKEN_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_id: clientId,
                grant_type: 'authorization_code',
                code,
                redirect_uri: redirectUri,
                code_verifier: codeVerifier,
            }).toString(),
        });

        const data = await response.json();

        if (!response.ok) {
            console.error('[SpotifyAuth] Token exchange failed:', data);
            return { success: false, error: data.error_description || data.error || 'Token exchange failed' };
        }

        if (data.access_token) {
            await dbService.setServiceToken('spotify', data.access_token, data.refresh_token);
            console.log('[SpotifyAuth] Tokens saved successfully');
            return { success: true };
        }

        return { success: false, error: 'No access token in response' };
    } catch (e: any) {
        console.error('[SpotifyAuth] Exchange error:', e);
        return { success: false, error: e.message || 'Network error' };
    }
}

/**
 * Process OAuth callback result from WebBrowser or deep link
 */
export async function processAuthResult(
    result: AuthSessionResult | { url: string },
    codeVerifier: string | undefined,
    clientId: string
): Promise<{ success: boolean; error?: string; cancelled?: boolean }> {
    // Handle WebBrowser result types
    if ('type' in result) {
        if (result.type === 'cancel' || result.type === 'dismiss') {
            return { success: false, cancelled: true };
        }
        if (result.type !== 'success' || !('url' in result)) {
            return { success: false, error: 'Authentication did not complete' };
        }
    }

    // Extract URL from result
    const urlString = 'url' in result ? result.url : null;
    if (!urlString) {
        return { success: false, error: 'No callback URL received' };
    }

    try {
        const url = new URL(urlString);
        const code = url.searchParams.get('code');
        const error = url.searchParams.get('error');

        if (error) {
            return { success: false, error: `Spotify error: ${error}` };
        }

        if (!code) {
            return { success: false, error: 'No authorization code received' };
        }

        if (!codeVerifier) {
            return { success: false, error: 'Missing code verifier' };
        }

        if (!clientId) {
            return { success: false, error: 'Missing client ID' };
        }

        return await exchangeCodeForToken(code, codeVerifier, clientId);
    } catch (e: any) {
        return { success: false, error: e.message || 'Failed to process callback' };
    }
}

// Auth state interface
interface SpotifyAuthState {
    isReady: boolean;
    isLoading: boolean;
    error: string | null;
}

// Auth hook return type
interface UseSpotifyAuthReturn {
    state: SpotifyAuthState;
    login: () => Promise<{ success: boolean; error?: string; cancelled?: boolean }>;
    clientId: string;
}

/**
 * Hook for Spotify OAuth authentication
 * Clean, unified interface for Android, iOS, and Web
 */
export function useSpotifyAuth(): UseSpotifyAuthReturn {
    const [clientId, setClientId] = useState('');
    const [state, setState] = useState<SpotifyAuthState>({
        isReady: false,
        isLoading: false,
        error: null,
    });

    // Load client ID on mount
    useEffect(() => {
        getSpotifyClientId().then((id) => {
            setClientId(id);
        });
    }, []);

    // Create auth request
    const [request, , promptAsync] = useAuthRequest(
        {
            clientId: clientId || 'placeholder',
            scopes: SPOTIFY_SCOPES,
            usePKCE: true,
            responseType: ResponseType.Code,
            redirectUri: getRedirectUri(),
        },
        discovery
    );

    // Update ready state when request and clientId are available
    useEffect(() => {
        setState((s) => ({
            ...s,
            isReady: !!request && !!clientId,
            error: !clientId ? 'Please enter your Spotify Client ID in settings' : null,
        }));
    }, [request, clientId]);

    // Login function - works across all platforms
    const login = useCallback(async (): Promise<{ success: boolean; error?: string; cancelled?: boolean }> => {
        if (!request || !clientId) {
            return { success: false, error: 'Auth not ready. Please enter your Spotify Client ID.' };
        }

        setState((s) => ({ ...s, isLoading: true, error: null }));

        try {
            console.log('[SpotifyAuth] Starting auth flow...');
            console.log('[SpotifyAuth] Redirect URI:', getRedirectUri());

            let result;

            if (Platform.OS === 'web') {
                // On web, use promptAsync for proper popup-based OAuth flow
                // This integrates with maybeCompleteAuthSession() in the callback route
                result = await promptAsync();
            } else {
                // On native, use WebBrowser for Chrome Custom Tabs / ASWebAuthenticationSession
                result = await WebBrowser.openAuthSessionAsync(
                    request.url,
                    getRedirectUri()
                );
            }

            console.log('[SpotifyAuth] Auth result type:', result.type);

            const authResult = await processAuthResult(result, request.codeVerifier, clientId);

            setState((s) => ({
                ...s,
                isLoading: false,
                error: authResult.error || null,
            }));

            return authResult;
        } catch (e: any) {
            console.error('[SpotifyAuth] Login error:', e);
            const error = e.message || 'Login failed';
            setState((s) => ({ ...s, isLoading: false, error }));
            return { success: false, error };
        }
    }, [request, clientId, promptAsync]);

    return { state, login, clientId };
}
