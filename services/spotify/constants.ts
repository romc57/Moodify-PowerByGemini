/**
 * Spotify Service Constants
 * One source of truth for Spotify API endpoints and configuration
 */

// Spotify API endpoints
export const SPOTIFY_API_BASE = 'https://api.spotify.com/v1';
export const SPOTIFY_TOKEN_URL = 'https://accounts.spotify.com/api/token';
export const SPOTIFY_AUTH_ENDPOINT = 'https://accounts.spotify.com/authorize';

// Spotify Client ID is now stored in the database and entered via Settings page
// This constant is kept for backwards compatibility but is deprecated
// Use getSpotifyClientId() from SpotifyAuthService or SpotifyRemoteService instead

/** @deprecated Use getSpotifyClientId() from database instead */
export const DEFAULT_SPOTIFY_CLIENT_ID = '';
