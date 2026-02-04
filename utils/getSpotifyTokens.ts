/**
 * Utility to get Spotify tokens at runtime from the database
 * Useful for debugging, testing, or programmatic access
 */

import { dbService } from '../services/database';

/**
 * Get current Spotify access token from database
 */
export async function getSpotifyAccessToken(): Promise<string | null> {
    return await dbService.getServiceToken('spotify');
}

/**
 * Get current Spotify refresh token from database
 */
export async function getSpotifyRefreshToken(): Promise<string | null> {
    return await dbService.getRefreshToken('spotify');
}

/**
 * Get both Spotify tokens at once
 */
export async function getSpotifyTokens(): Promise<{
    accessToken: string | null;
    refreshToken: string | null;
}> {
    const [accessToken, refreshToken] = await Promise.all([
        dbService.getServiceToken('spotify'),
        dbService.getRefreshToken('spotify'),
    ]);

    return { accessToken, refreshToken };
}

/**
 * Check if Spotify is authenticated (has tokens)
 */
export async function isSpotifyAuthenticated(): Promise<boolean> {
    const accessToken = await dbService.getServiceToken('spotify');
    return !!accessToken;
}
