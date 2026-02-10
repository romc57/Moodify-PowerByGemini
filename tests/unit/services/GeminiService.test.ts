/**
 * GeminiService Unit Tests
 * NO MOCKS - uses real dbService and real axios (real Gemini API when key present).
 */

import { gemini } from '../../../services/gemini/GeminiService';
import { dbService } from '../../../services/database';
import { initializeTestDatabase } from '../../utils/testDb';

describe('GeminiService (Real DB)', () => {
    beforeAll(async () => {
        await initializeTestDatabase();
        await dbService.init();
    });

    beforeEach(() => {
        gemini.clearConversationState();
    });

    describe('Missing API Key', () => {
        it('should handle missing API key gracefully', async () => {
            await dbService.setPreference('gemini_api_key', '');
            const result = await gemini.backfillRequest('test prompt');
            expect(result.text).toBeNull();
            expect(result.error).toBeDefined();
        });
    });

    describe('Concurrent Request Blocking', () => {
        it('should block concurrent makeRequest calls', async () => {
            const key = (await dbService.getPreference('gemini_api_key')) || 'test_key';
            const slowRequest = gemini.makeRequest(key, 'test prompt');
            await expect(
                gemini.makeRequest(key, 'test prompt 2')
            ).rejects.toThrow('Concurrent Request Blocked');
            await slowRequest.catch(() => {});
        });
    });
});
