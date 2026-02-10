/**
 * RecommendationService Unit Tests
 * NO MOCKS - uses real dbService, Gemini, ValidatedQueue, Spotify, Graph, PlayerStore.
 */

import { recommendationService } from '../../../services/core/RecommendationService';
import { logTestData, waitForApiCall } from '../../utils/testApiKeys';
import { getIntegrationSessionStatus, hasGeminiKeys, hasSpotifyKeys, initializeTestDatabase } from '../../utils/testDb';

const hasRequiredKeys = hasGeminiKeys() && hasSpotifyKeys();
let sessionsActive = false;

describe('RecommendationService (Real APIs)', () => {
    beforeAll(async () => {
        await initializeTestDatabase();
        const status = await getIntegrationSessionStatus();
        sessionsActive = status.runGeminiAndSpotify;
        if (!sessionsActive && hasRequiredKeys) {
            console.warn('[RecommendationService] ⚠ Sessions inactive - some tests skipped:', status.errors);
        }
    }, 30000);

    describe('getVibeOptions', () => {
        it('should return array (empty or with options)', async () => {
            const result = await recommendationService.getVibeOptions();
            expect(Array.isArray(result)).toBe(true);
        });

        it('should fetch real vibe options when sessions active', async () => {
            if (!sessionsActive) return;
            const result = await waitForApiCall(
                () => recommendationService.getVibeOptions('happy upbeat music'),
                60000
            );
            const expected = { isArray: true, eachHasTrackWithUri: true };
            const got = {
                isArray: Array.isArray(result),
                length: Array.isArray(result) ? result.length : 0,
                eachHasTrackWithUri: Array.isArray(result) ? result.every((opt: any) => opt.track?.uri) : false,
                raw: result
            };
            logTestData('getVibeOptions(happy upbeat music)', { query: 'happy upbeat music' }, expected, got);

            expect(Array.isArray(result)).toBe(true);
            if (result.length > 0) {
                result.forEach((option: any) => {
                    expect(option).toHaveProperty('track');
                    expect(option.track).toHaveProperty('uri');
                    expect(option.track.uri).toMatch(/^spotify:track:/);
                    expect(option.track).toHaveProperty('title');
                    expect(option.track).toHaveProperty('artist');
                });
            }
        }, 60000);

        it('should handle empty query without throwing', async () => {
            if (!sessionsActive) return;
            const result = await waitForApiCall(() => recommendationService.getVibeOptions(''), 30000);
            logTestData('getVibeOptions(empty string)', { query: '' }, { isArray: true }, { isArray: Array.isArray(result), raw: result });
            expect(Array.isArray(result)).toBe(true);
        }, 30000);
    });
});

if (!hasRequiredKeys) {
    describe.skip('RecommendationService (no API keys)', () => {
        it('skipped - requires Gemini and Spotify keys in .env.test', () => {});
    });
}
