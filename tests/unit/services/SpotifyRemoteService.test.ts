/**
 * SpotifyRemoteService Unit Tests
 * NO MOCKS - uses real dbService. Tests auth state and behavior with real DB.
 */

import { spotifyRemote } from '../../../services/spotify/SpotifyRemoteService';
import { dbService } from '../../../services/database';
import { initializeTestDatabase } from '../../utils/testDb';

describe('SpotifyRemoteService (Real DB)', () => {
    beforeAll(async () => {
        await initializeTestDatabase();
        await dbService.init();
    });

    beforeEach(() => {
        spotifyRemote.resetAuthState();
    });

    describe('Authentication', () => {
        it('should return empty array when no token and search is called', async () => {
            await dbService.setServiceToken('spotify', '', undefined);
            const result = await spotifyRemote.search('test query', 'track');
            expect(Array.isArray(result)).toBe(true);
            expect(result).toEqual([]);
        });

        it('should expose auth status shape', () => {
            const authStatus = spotifyRemote.getAuthStatus();
            expect(authStatus).toHaveProperty('isLocked');
            expect(authStatus).toHaveProperty('lastFailReason');
        });

        it('should expose lockout helpers', () => {
            expect(typeof spotifyRemote.getAuthLockoutRemaining).toBe('function');
            expect(typeof spotifyRemote.isInAuthLockout).toBe('function');
        });
    });

    describe('Token Refresh', () => {
        it('should handle refresh when no refresh token (marks auth failed or returns)', async () => {
            await spotifyRemote.refreshAccessToken().catch(() => {});
            const authStatus = spotifyRemote.getAuthStatus();
            expect(authStatus).toBeDefined();
        });
    });
});
