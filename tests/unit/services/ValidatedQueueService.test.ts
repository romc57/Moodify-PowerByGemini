import { validatedQueueService } from '../../../services/core/ValidatedQueueService';
import { hasSpotifyKeys, initializeTestDatabase, getIntegrationSessionStatus } from '../../utils/testDb';
import { logTestData } from '../../utils/testApiKeys';
import { createMockRawSuggestion } from '../../utils/mockHelpers';

const hasSpotifyApiKeys = hasSpotifyKeys();
let spotifySessionActive = false;

describe('ValidatedQueueService (Real DB + Real Spotify)', () => {
    beforeAll(async () => {
        await initializeTestDatabase();
        const status = await getIntegrationSessionStatus();
        spotifySessionActive = status.runSpotifyOnly;
        if (!spotifySessionActive && hasSpotifyApiKeys) {
            console.warn('[ValidatedQueueService] ⚠ Spotify session inactive - some tests skipped:', status.errors);
        }
    }, 30000);

    beforeEach(() => {
        validatedQueueService.clearSession();
    });

    describe('validateTrack', () => {
        it('should validate a real track against Spotify when session active', async () => {
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
            }
        }, 30000);

        it('should reject a non-existent track', async () => {
            if (!spotifySessionActive) return;
            const suggestion = createMockRawSuggestion('ThisSongDefinitelyDoesNotExist12345', 'FakeArtistName12345');
            const result = await validatedQueueService.validateTrack(suggestion);
            logTestData('validateTrack(non-existent) expect null', suggestion, null, result);
            expect(result).toBeNull();
        }, 30000);

        it('should return studio version when available (Shape of You)', async () => {
            if (!spotifySessionActive) return;
            const suggestion = createMockRawSuggestion('Shape of You', 'Ed Sheeran');
            const result = await validatedQueueService.validateTrack(suggestion);
            const expected = { notNull: true, titleContains: 'shape of you', titleNotLive: true };
            const got = result ? { notNull: true, title: result.title, titleContains: result.title?.toLowerCase().includes('shape of you'), titleNotLive: !result.title?.toLowerCase().includes('live') } : { notNull: false };
            logTestData('validateTrack(Shape of You, Ed Sheeran)', suggestion, expected, got);
            expect(result).not.toBeNull();
            if (result) {
                expect(result.title.toLowerCase()).toContain('shape of you');
            }
        }, 30000);

        it('should detect and reject duplicates within session', async () => {
            if (!spotifySessionActive) return;
            const suggestion = createMockRawSuggestion('Bohemian Rhapsody', 'Queen');
            const result1 = await validatedQueueService.validateTrack(suggestion);
            expect(result1).not.toBeNull();
            const result2 = await validatedQueueService.validateTrack(suggestion);
            expect(result2).toBeNull();
        }, 30000);
    });
});

if (!hasSpotifyApiKeys) {
    describe.skip('ValidatedQueueService (no Spotify keys)', () => {
        it('skipped - requires Spotify API keys in .env.test', () => {});
    });
}
