import { makeRedirectUri } from 'expo-auth-session';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import { useEffect } from 'react';
import { dbService } from '../database/DatabaseService';

WebBrowser.maybeCompleteAuthSession();

// Placeholder for Google Client ID - User should replace this
const GOOGLE_ANDROID_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID || '';
const GOOGLE_IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || '';

export const useYouTubeAuth = () => {
    const [request, response, promptAsync] = Google.useAuthRequest({
        androidClientId: GOOGLE_ANDROID_CLIENT_ID,
        iosClientId: GOOGLE_IOS_CLIENT_ID,
        // webClientId: '...', 
        // webClientId: '...',
        scopes: ['https://www.googleapis.com/auth/youtube.readonly'],
        redirectUri: makeRedirectUri({
            scheme: 'moodifymobile'
        })
    });

    useEffect(() => {
        if (response?.type === 'success') {
            const { authentication } = response;
            if (authentication?.accessToken) {
                dbService.setServiceToken('youtube_oauth', authentication.accessToken, authentication.refreshToken);
                console.log('[YouTubeAuth] Token stored successfully');
            }
        }
    }, [response]);

    return { request, promptAsync };
};
