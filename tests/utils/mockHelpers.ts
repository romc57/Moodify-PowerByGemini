/**
 * Mock Helpers
 * Reusable factories for creating mock data in tests
 */

import { RawTrackSuggestion, ValidatedTrack } from '../../services/core/ValidatedQueueService';

/**
 * Create a mock Gemini vibe option
 */
export function createMockGeminiOption(title: string, artist: string, reason: string = 'Test vibe') {
    return {
        track: { title, artist },
        reason,
        id: `mock_${title.toLowerCase().replace(/\s+/g, '_')}`,
    };
}

/**
 * Create a mock Spotify track response
 */
export function createMockSpotifyTrack(
    name: string,
    artist: string,
    uri: string = `spotify:track:${Math.random().toString(36).substring(7)}`,
    popularity: number = 70
) {
    return {
        name,
        artists: [{ name: artist }],
        uri,
        album: {
            images: [{ url: `https://example.com/artwork/${uri}.jpg` }],
        },
        popularity,
        duration_ms: 180000,
        id: uri.split(':')[2],
    };
}

/**
 * Create a mock RawTrackSuggestion
 */
export function createMockRawSuggestion(
    title: string,
    artist: string,
    reason?: string
): RawTrackSuggestion {
    return {
        title,
        artist,
        reason: reason || `Mock reason for ${title}`,
    };
}

/**
 * Create a mock ValidatedTrack
 */
export function createMockValidatedTrack(
    title: string,
    artist: string,
    uri: string = `spotify:track:${Math.random().toString(36).substring(7)}`
): ValidatedTrack {
    return {
        title,
        artist,
        uri,
        artwork: `https://example.com/artwork/${uri}.jpg`,
        reason: `Validated ${title}`,
    };
}

/**
 * Create multiple mock Gemini options
 */
export function createMockGeminiOptions(count: number): any[] {
    const options = [];
    for (let i = 0; i < count; i++) {
        options.push(createMockGeminiOption(`Song ${i + 1}`, `Artist ${i + 1}`, `Vibe ${i + 1}`));
    }
    return options;
}

/**
 * Create multiple mock Spotify tracks
 */
export function createMockSpotifyTracks(count: number): any[] {
    const tracks = [];
    for (let i = 0; i < count; i++) {
        tracks.push(createMockSpotifyTrack(`Song ${i + 1}`, `Artist ${i + 1}`));
    }
    return tracks;
}

/**
 * Create a mock Gemini API response
 */
export function createMockGeminiResponse(options: any[]) {
    return {
        data: {
            candidates: [
                {
                    content: {
                        parts: [
                            {
                                text: JSON.stringify({ options }),
                            },
                        ],
                    },
                },
            ],
        },
    };
}

/**
 * Create a mock Spotify search response
 */
export function createMockSpotifySearchResponse(tracks: any[]) {
    return {
        data: {
            tracks: {
                items: tracks,
            },
        },
    };
}
