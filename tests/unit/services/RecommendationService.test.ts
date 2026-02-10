
import { recommendationService } from '../../../services/core/RecommendationService';
import { validatedQueueService } from '../../../services/core/ValidatedQueueService';
import { gemini } from '../../../services/gemini/GeminiService';
import { logTestData, waitForApiCall } from '../../utils/testApiKeys';
import { getIntegrationSessionStatus, hasGeminiKeys, hasSpotifyKeys, initializeTestDatabase } from '../../utils/testDb';


// Mock dependencies for unit tests
jest.mock('../../../services/gemini/GeminiService');
jest.mock('../../../services/core/ValidatedQueueService');
jest.mock('../../../services/spotify/SpotifyRemoteService');
jest.mock('../../../services/graph/GraphService', () => ({
    graphService: {
        getClusterRepresentatives: jest.fn(),
        getEffectiveNode: jest.fn(),
        getNeighbors: jest.fn(),
        getTopGenres: jest.fn(),
        getSongsByGenres: jest.fn(),
        commitSession: jest.fn(),
        ingestLikedSongs: jest.fn(),
    }
}));

// Mock the singleton dbService instance
// Store values in memory so set/get operations work (like real database)
const mockDbStorage: Record<string, any> = {};
jest.mock('../../../services/database', () => {
    const storage: Record<string, any> = {};
    return {
        dbService: {
            getDailyHistory: jest.fn(),
            getRecentHistory: jest.fn(),
            getDailyHistoryURIs: jest.fn(),
            getUserTopTracks: jest.fn(),
            getPreference: jest.fn().mockImplementation((key: string) => Promise.resolve(storage[`pref:${key}`] || null)),
            setPreference: jest.fn().mockImplementation((key: string, value: string) => {
                storage[`pref:${key}`] = value;
                return Promise.resolve();
            }),
            getServiceToken: jest.fn().mockImplementation((service: string) => Promise.resolve(storage[`token:${service}`] || null)),
            setServiceToken: jest.fn().mockImplementation((service: string, accessToken: string, refreshToken?: string) => {
                storage[`token:${service}`] = accessToken;
                if (refreshToken) {
                    storage[`refresh:${service}`] = refreshToken;
                }
                return Promise.resolve();
            }),
            getRefreshToken: jest.fn().mockImplementation((service: string) => Promise.resolve(storage[`refresh:${service}`] || null)),
        }
    };
});
jest.mock('../../../stores/PlayerStore', () => ({
    usePlayerStore: {
        getState: () => ({ sessionHistory: [], queue: [] })
    }
}));

import { dbService } from '../../../services/database';

describe('RecommendationService Unit Tests', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        // Default mock return values
        (dbService.getDailyHistory as jest.Mock).mockResolvedValue([]);
        (dbService.getRecentHistory as jest.Mock).mockResolvedValue([]);
        const { graphService } = require('../../../services/graph/GraphService');
        (graphService.getClusterRepresentatives as jest.Mock).mockResolvedValue([]);
        (graphService.getEffectiveNode as jest.Mock).mockResolvedValue(null);
        (graphService.getNeighbors as jest.Mock).mockResolvedValue([]);
        (graphService.getTopGenres as jest.Mock).mockResolvedValue([]);
        (graphService.getSongsByGenres as jest.Mock).mockResolvedValue([]);
    });

    describe('getVibeOptions', () => {
        it('should return validated options when Gemini returns suggestions', async () => {
            const mockGeminiOptions = [
                { track: { title: 'Song A', artist: 'Artist A' }, reason: 'Vibe A' },
                { track: { title: 'Song B', artist: 'Artist B' }, reason: 'Vibe B' }
            ];

            const mockValidatedOptions = [
                {
                    ...mockGeminiOptions[0],
                    track: { ...mockGeminiOptions[0].track, uri: 'spotify:track:A' }
                }
                // Simulate Song B failing validation (missing URI)
            ];

            (gemini.getVibeOptions as jest.Mock).mockResolvedValue(mockGeminiOptions);
            (validatedQueueService.validateVibeOptions as jest.Mock).mockResolvedValue([mockValidatedOptions[0]]);

            const result = await recommendationService.getVibeOptions('Happy');

            expect(gemini.getVibeOptions).toHaveBeenCalled();
            expect(validatedQueueService.validateVibeOptions).toHaveBeenCalledWith(
                mockGeminiOptions,
                8 // Target count
            );

            // Should filter out invalid/missing tracks
            expect(result).toHaveLength(1);
            expect(result[0].track.uri).toBe('spotify:track:A');
        });

        it('should handle empty Gemini response gracefully', async () => {
            (gemini.getVibeOptions as jest.Mock).mockResolvedValue([]);

            const result = await recommendationService.getVibeOptions();

            expect(result).toEqual([]);
        });

        it('should handle missing API keys gracefully', async () => {
            (gemini.getVibeOptions as jest.Mock).mockResolvedValue([]);

            const result = await recommendationService.getVibeOptions();

            expect(result).toEqual([]);
        });
    });
});

// Integration tests - require real API keys
const hasRequiredKeys = hasGeminiKeys() && hasSpotifyKeys();

let sessionsActive = false;

if (hasRequiredKeys) {
    describe('RecommendationService Integration Tests', () => {
        beforeAll(async () => {
            jest.unmock('../../../services/gemini/GeminiService');
            await initializeTestDatabase();
            const status = await getIntegrationSessionStatus();
            sessionsActive = status.runGeminiAndSpotify;
            if (!sessionsActive) {
                console.warn('[RecommendationService Integration] ⚠ Sessions inactive - tests will be skipped:', status.errors);
            }
        }, 30000);

        beforeEach(() => {
            jest.clearAllMocks();
        });

        describe('getVibeOptions with real APIs', () => {
            it('should fetch real vibe options from Gemini and validate against Spotify', async () => {
                if (!sessionsActive) return;
                const passed = { query: 'happy upbeat music' };
                const result = await waitForApiCall(
                    () => recommendationService.getVibeOptions('happy upbeat music'),
                    60000
                );
                const expected = { isArray: true, eachHasTrackWithUri: true };
                const got = { isArray: Array.isArray(result), length: Array.isArray(result) ? result.length : 0, eachHasTrackWithUri: Array.isArray(result) ? result.every(opt => opt.track?.uri) : false, raw: result };
                logTestData('getVibeOptions(happy upbeat music)', passed, expected, got);

                expect(Array.isArray(result)).toBe(true);
                if (result.length > 0) {
                    result.forEach(option => {
                        expect(option).toHaveProperty('track');
                        expect(option.track).toHaveProperty('uri');
                        expect(option.track.uri).toMatch(/^spotify:track:/);
                        expect(option.track).toHaveProperty('title');
                        expect(option.track).toHaveProperty('artist');
                    });
                }
            }, 60000);

            it('should handle real API errors gracefully', async () => {
                if (!sessionsActive) return;
                const passed = { query: '' };
                const result = await waitForApiCall(() => recommendationService.getVibeOptions(''), 30000);
                const expected = { isArray: true };
                const got = { isArray: Array.isArray(result), length: Array.isArray(result) ? result.length : undefined, raw: result };
                logTestData('getVibeOptions(empty string) expect array no throw', passed, expected, got);

                expect(Array.isArray(result)).toBe(true);
            }, 30000);
        });
    });
} else {
    describe.skip('RecommendationService Integration Tests', () => {
        it('skipped - requires API keys in .env.test', () => { });
    });
}
