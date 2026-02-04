
import { validatedQueueService } from '../../../services/core/ValidatedQueueService';
import { spotifyRemote } from '../../../services/spotify/SpotifyRemoteService';
import { hasSpotifyKeys, initializeTestDatabase, getIntegrationSessionStatus } from '../../utils/testDb';
import { logTestData } from '../../utils/testApiKeys';
import { createMockRawSuggestion } from '../../utils/mockHelpers';

// Mock SpotifyRemoteService for unit tests
jest.mock('../../../services/spotify/SpotifyRemoteService', () => ({
    spotifyRemote: {
        search: jest.fn(),
    },
}));

// Mock database service
// Store values in memory so set/get operations work (like real database)
jest.mock('../../../services/database', () => {
    const storage: Record<string, any> = {};
    return {
        dbService: {
            getDailyHistory: jest.fn(),
            getDailyHistoryURIs: jest.fn(),
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

import { dbService } from '../../../services/database';

describe('ValidatedQueueService Unit Tests', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        validatedQueueService.clearSession();
        (dbService.getDailyHistory as jest.Mock).mockResolvedValue([]);
        (dbService.getDailyHistoryURIs as jest.Mock).mockResolvedValue([]);
    });

    describe('validateTrack', () => {
        it('should return a valid track when an exact match is found', async () => {
            const suggestion = { title: 'Bohemian Rhapsody', artist: 'Queen' };
            const mockTrack = {
                name: 'Bohemian Rhapsody',
                artists: [{ name: 'Queen' }],
                uri: 'spotify:track:123',
                album: { images: [{ url: 'http://image.url' }] },
                popularity: 80
            };

            (spotifyRemote.search as jest.Mock).mockResolvedValue([mockTrack]);

            const result = await validatedQueueService.validateTrack(suggestion);

            expect(result).not.toBeNull();
            expect(result!.title).toBe('Bohemian Rhapsody');
            expect(result!.artist).toBe('Queen');
            expect(result!.uri).toBe('spotify:track:123');
        });

        it('should reject a track with a low match score', async () => {
            const suggestion = { title: 'Bohemian Rhapsody', artist: 'Queen' };
            const mockTrack = {
                name: 'Some Random Song',
                artists: [{ name: 'Unknown Artist' }],
                uri: 'spotify:track:456',
                popularity: 10
            };

            (spotifyRemote.search as jest.Mock).mockResolvedValue([mockTrack]);

            const result = await validatedQueueService.validateTrack(suggestion);

            expect(result).toBeNull();
        });

        it('should penalize alternate versions when not requested', async () => {
            const suggestion = { title: 'Shape of You', artist: 'Ed Sheeran' };
            const mockLiveTrack = {
                name: 'Shape of You (Live)',
                artists: [{ name: 'Ed Sheeran' }],
                uri: 'spotify:track:789',
                popularity: 60
            };

            // Mock only returning the live version
            (spotifyRemote.search as jest.Mock).mockResolvedValue([mockLiveTrack]);

            const result = await validatedQueueService.validateTrack(suggestion);

            // Expect it to differ or be null depending on strictness, 
            // but here we expect the score to drop significantly. 
            // If the score drops below 65, it returns null.
            // 50 (Title Match) + 40 (Artist Match) - 30 (Live Penalty) + 5 (Pop) = 65 -> Edge case
            // Let's assume it passes barely or fails if popularity is lower.

            // If we set popularity to 40, score = 60 -> Fail
            const lowPopLiveTrack = { ...mockLiveTrack, popularity: 40 };
            (spotifyRemote.search as jest.Mock).mockResolvedValue([lowPopLiveTrack]);

            const lowPopResult = await validatedQueueService.validateTrack(suggestion);
            expect(lowPopResult).toBeNull();
        });

        it('should accept alternate version if requested in title', async () => {
            const suggestion = { title: 'Shape of You (Live)', artist: 'Ed Sheeran' };
            const mockLiveTrack = {
                name: 'Shape of You (Live)',
                artists: [{ name: 'Ed Sheeran' }],
                uri: 'spotify:track:789',
                popularity: 60
            };

            (spotifyRemote.search as jest.Mock).mockResolvedValue([mockLiveTrack]);

            const result = await validatedQueueService.validateTrack(suggestion);
            expect(result).not.toBeNull();
        });

        it('should detect and reject duplicates', async () => {
            const suggestion = { title: 'Test Song', artist: 'Test Artist' };
            const mockTrack = {
                name: 'Test Song',
                artists: [{ name: 'Test Artist' }],
                uri: 'spotify:track:duplicate123',
                popularity: 80
            };

            (spotifyRemote.search as jest.Mock).mockResolvedValue([mockTrack]);

            // First call should succeed
            const result1 = await validatedQueueService.validateTrack(suggestion);
            expect(result1).not.toBeNull();

            // Second call with same URI should be rejected as duplicate
            const result2 = await validatedQueueService.validateTrack(suggestion);
            expect(result2).toBeNull();
        });
    });
});

// Integration tests - require real Spotify API
const hasSpotifyApiKeys = hasSpotifyKeys();

let spotifySessionActive = false;

if (hasSpotifyApiKeys) {
    describe('ValidatedQueueService Integration Tests', () => {
        // Get the REAL SpotifyRemoteService implementation (bypassing mock)
        const realSpotifyRemote = jest.requireActual(
            '../../../services/spotify/SpotifyRemoteService'
        ).spotifyRemote;

        beforeAll(async () => {
            await initializeTestDatabase();
            const status = await getIntegrationSessionStatus();
            spotifySessionActive = status.runSpotifyOnly;
            if (!spotifySessionActive) {
                console.warn('[ValidatedQueueService Integration] ⚠ Spotify session inactive - tests will be skipped:', status.errors);
            }
        }, 30000);

        beforeEach(() => {
            validatedQueueService.clearSession();
            (dbService.getDailyHistory as jest.Mock).mockResolvedValue([]);
            (dbService.getDailyHistoryURIs as jest.Mock).mockResolvedValue([]);

            // Route mock's search() to the REAL implementation for integration tests
            (spotifyRemote.search as jest.Mock).mockImplementation(
                (...args: any[]) => realSpotifyRemote.search(...args)
            );
        });

        describe('validateTrack with real Spotify API', () => {
            it('should validate a real track against Spotify', async () => {
                if (!spotifySessionActive) return;
                const suggestion = createMockRawSuggestion('Bohemian Rhapsody', 'Queen');
                const result = await validatedQueueService.validateTrack(suggestion);
                const expected = { notNull: true, uriMatch: /^spotify:track:/, hasTitle: true, hasArtist: true };
                const got = result ? { notNull: true, uri: result.uri, hasTitle: !!result.title, hasArtist: !!result.artist } : { notNull: false };
                logTestData('validateTrack(Bohemian Rhapsody, Queen)', suggestion, expected, got);

                expect(result).not.toBeNull();
                if (result) {
                    expect(result.uri).toMatch(/^spotify:track:/);
                    expect(result.title).toBeTruthy();
                    expect(result.artist).toBeTruthy();
                    expect(spotifyRemote.search).toHaveBeenCalled();
                }
            }, 30000);

            it('should reject a non-existent track', async () => {
                if (!spotifySessionActive) return;
                const suggestion = createMockRawSuggestion('ThisSongDefinitelyDoesNotExist12345', 'FakeArtistName12345');
                const result = await validatedQueueService.validateTrack(suggestion);
                logTestData('validateTrack(non-existent) expect null', suggestion, null, result);

                expect(result).toBeNull();
            }, 30000);

            it('should score tracks correctly with real Spotify responses', async () => {
                if (!spotifySessionActive) return;
                const suggestion = createMockRawSuggestion('Shape of You', 'Ed Sheeran');
                const result = await validatedQueueService.validateTrack(suggestion);
                const expected = { notNull: true, titleContains: 'shape of you', titleNotLive: true };
                const got = result ? { notNull: true, title: result.title, titleContains: result.title?.toLowerCase().includes('shape of you'), titleNotLive: !result.title?.toLowerCase().includes('live') } : { notNull: false };
                logTestData('validateTrack(Shape of You, Ed Sheeran)', suggestion, expected, got);

                expect(result).not.toBeNull();
                if (result) {
                    expect(result.title.toLowerCase()).toContain('shape of you');
                    expect(result.title.toLowerCase()).not.toContain('live');
                }
            }, 30000);
        });
    });
} else {
    describe.skip('ValidatedQueueService Integration Tests', () => {
        it('skipped - requires Spotify API keys in .env.test', () => {});
    });
}
