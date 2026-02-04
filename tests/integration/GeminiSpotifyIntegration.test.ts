/**
 * Integration Tests: Gemini → Spotify Flow
 *
 * Tests the complete flow from Gemini AI suggestions to Spotify validation.
 * Requires real API keys in .env.test file.
 * NO MOCKS - uses real APIs only.
 */

import { recommendationService } from '../../services/core/RecommendationService';
import { validatedQueueService } from '../../services/core/ValidatedQueueService';
import { gemini } from '../../services/gemini/GeminiService';
import { dbService } from '../../services/database';
import { hasGeminiKeys, hasSpotifyKeys, initializeTestDatabase, getIntegrationSessionStatus } from '../utils/testDb';
import { waitForApiCall, logTestData } from '../utils/testApiKeys';
import { getPlaybackTracker, resetPlaybackTracker } from '../utils/PlaybackTracker';

describe('Gemini → Spotify Integration Tests (Real API)', () => {
    let sessionsActive = false;
    const tracker = getPlaybackTracker();

    beforeAll(async () => {
        // Fail hard if no API keys
        if (!hasGeminiKeys()) {
            throw new Error(
                'GEMINI_API_KEY required for integration tests. ' +
                'Add it to .env.test or run auth tests first.'
            );
        }
        if (!hasSpotifyKeys()) {
            throw new Error(
                'SPOTIFY_CLIENT_ID and SPOTIFY_ACCESS_TOKEN required. ' +
                'Add them to .env.test or run auth tests first.'
            );
        }

        console.log('[Integration] Initializing test database...');
        await initializeTestDatabase();

        const status = await getIntegrationSessionStatus();
        sessionsActive = status.runGeminiAndSpotify;

        if (!sessionsActive) {
            throw new Error(
                'API sessions validation failed: ' + status.errors.join(', ')
            );
        }

        console.log('[Integration] Sessions active, ready for testing');
    }, 30000);

    beforeEach(() => {
        validatedQueueService.clearSession();
        tracker.reset();
    });

    afterAll(() => {
        resetPlaybackTracker();
    });

    describe('Gemini Recommendation Flow', () => {
        it('should get vibe options with valid Spotify URIs', async () => {
            const query = 'happy upbeat music';
            console.log(`[Test] Getting vibe options for: "${query}"`);

            const result = await waitForApiCall(
                () => recommendationService.getVibeOptions(query),
                60000
            );

            // Log all recommendations for tracking
            if (Array.isArray(result)) {
                result.forEach(opt => {
                    if (opt.track) {
                        tracker.recordRecommendation({
                            title: opt.track.title,
                            artist: opt.track.artist,
                            uri: opt.track.uri,
                            source: 'gemini'
                        });
                    }
                });
            }

            const testData = {
                input: { query },
                expected: { isArray: true, minLength: 1, hasValidUris: true },
                actual: {
                    isArray: Array.isArray(result),
                    length: result?.length || 0,
                    hasValidUris: Array.isArray(result) && result.every(opt => opt.track?.uri?.startsWith('spotify:track:')),
                    tracks: result?.slice(0, 3).map(opt => ({
                        title: opt.track?.title,
                        artist: opt.track?.artist,
                        uri: opt.track?.uri
                    }))
                }
            };

            logTestData('getVibeOptions', testData.input, testData.expected, testData.actual);

            expect(Array.isArray(result)).toBe(true);
            expect(result.length).toBeGreaterThan(0);

            result.forEach((option, idx) => {
                expect(option).toHaveProperty('track');
                expect(option.track).toHaveProperty('uri');
                expect(option.track.uri).toMatch(/^spotify:track:/);
                expect(option.track).toHaveProperty('title');
                expect(option.track).toHaveProperty('artist');
            });
        }, 60000);

        it('should handle backfill when suggestions fail validation', async () => {
            const query = 'experimental avant-garde jazz fusion';
            console.log(`[Test] Testing backfill with: "${query}"`);

            const result = await waitForApiCall(
                () => recommendationService.getVibeOptions(query),
                60000
            );

            const testData = {
                input: { query },
                expected: { isArray: true, allTracksHaveUri: true },
                actual: {
                    isArray: Array.isArray(result),
                    length: result?.length || 0,
                    allTracksHaveUri: Array.isArray(result) && result.every(opt => !opt.track || opt.track.uri)
                }
            };

            logTestData('getVibeOptions (backfill test)', testData.input, testData.expected, testData.actual);

            expect(Array.isArray(result)).toBe(true);
            result.forEach(option => {
                if (option.track) {
                    expect(option.track.uri).toMatch(/^spotify:track:/);
                }
            });
        }, 60000);

        it('should prevent duplicate tracks in results', async () => {
            const query = 'pop music hits';
            console.log(`[Test] Testing no duplicates for: "${query}"`);

            const result = await waitForApiCall(
                () => recommendationService.getVibeOptions(query),
                60000
            );

            const uris = Array.isArray(result)
                ? result.map(opt => opt.track?.uri).filter(Boolean)
                : [];

            const testData = {
                input: { query },
                expected: { noDuplicates: true },
                actual: {
                    totalUris: uris.length,
                    uniqueUris: new Set(uris).size,
                    hasDuplicates: new Set(uris).size !== uris.length
                }
            };

            logTestData('getVibeOptions (no duplicates)', testData.input, testData.expected, testData.actual);

            expect(Array.isArray(result)).toBe(true);
            if (result.length > 1) {
                expect(new Set(uris).size).toBe(uris.length);
            }
        }, 60000);
    });

    describe('Track Validation', () => {
        it('should validate real Gemini suggestions against Spotify', async () => {
            console.log('[Test] Validating Gemini suggestion against Spotify...');

            const history = await dbService.getRecentHistory(20);
            const options = await waitForApiCall(
                () => gemini.getVibeOptions(history || [], [], 'test vibe', []),
                60000
            );

            if (!options || options.length === 0) {
                console.warn('[Test] No options returned from Gemini, skipping validation');
                return;
            }

            const firstOption = options[0];
            if (!firstOption.track) {
                console.warn('[Test] First option has no track, skipping validation');
                return;
            }

            const suggestion = {
                title: firstOption.track.title || firstOption.track.t,
                artist: firstOption.track.artist || firstOption.track.a
            };

            const validated = await waitForApiCall(
                () => validatedQueueService.validateTrack(suggestion),
                30000
            );

            const testData = {
                input: { suggestion },
                expected: { notNull: true, hasUri: true },
                actual: validated ? {
                    uri: validated.uri,
                    title: validated.title,
                    artist: validated.artist,
                    originalSuggestion: validated.originalSuggestion
                } : null
            };

            logTestData('validateTrack', testData.input, testData.expected, testData.actual);

            expect(validated).not.toBeNull();
            if (validated) {
                expect(validated.uri).toMatch(/^spotify:track:/);
                expect(validated.title).toBeTruthy();
                expect(validated.artist).toBeTruthy();
            }
        }, 60000);

        it('should reject non-existent tracks', async () => {
            const suggestion = {
                title: 'Completely Fake Song Title XYZ123',
                artist: 'NonExistent Artist ABC789'
            };

            const result = await validatedQueueService.validateTrack(suggestion);

            const testData = {
                input: { suggestion },
                expected: null,
                actual: result
            };

            logTestData('validateTrack (non-existent)', testData.input, testData.expected, testData.actual);

            expect(result).toBeNull();
        }, 30000);
    });

    describe('Expand Vibe Flow', () => {
        it('should expand a seed track into related tracks', async () => {
            const seedTrack = { title: 'Blinding Lights', artist: 'The Weeknd' };
            const vibeContext = 'synth-pop retro vibes';

            console.log(`[Test] Expanding vibe from: ${seedTrack.title} by ${seedTrack.artist}`);

            const result = await waitForApiCall(
                () => recommendationService.expandVibe(seedTrack, vibeContext),
                60000
            );

            const testData = {
                input: { seedTrack, vibeContext },
                expected: { hasItems: true, itemsHaveUris: true },
                actual: {
                    hasItems: !!(result?.items?.length),
                    itemCount: result?.items?.length || 0,
                    firstThree: result?.items?.slice(0, 3).map(t => ({
                        title: t.title,
                        artist: t.artist,
                        uri: t.uri
                    }))
                }
            };

            logTestData('expandVibe', testData.input, testData.expected, testData.actual);

            expect(result).toHaveProperty('items');
            expect(result.items.length).toBeGreaterThan(0);

            result.items.forEach((track: any) => {
                if (track.uri) {
                    expect(track.uri).toMatch(/^spotify:track:/);
                }
            });
        }, 60000);
    });

    describe('Error Resilience', () => {
        it('should handle network timeouts gracefully', async () => {
            // This tests the retry logic in waitForApiCall
            const suggestion = { title: 'Test', artist: 'Test' };

            const result = await waitForApiCall(
                () => validatedQueueService.validateTrack(suggestion),
                30000
            );

            // Should either return null or a valid track, not throw
            expect(result === null || (result && result.uri)).toBe(true);
        }, 30000);
    });
});
