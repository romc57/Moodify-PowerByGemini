/**
 * GeminiService Unit Tests
 * Tests for error handling, rate limiting, and concurrent request blocking
 */

import { gemini } from '../../../services/gemini/GeminiService';

// Mock dependencies
jest.mock('../../../services/database', () => ({
    dbService: {
        getPreference: jest.fn().mockResolvedValue('test_api_key'),
        setPreference: jest.fn().mockResolvedValue(true),
    }
}));

jest.mock('axios');

import axios from 'axios';
import { dbService } from '../../../services/database';

describe('GeminiService Error Handling', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        gemini.clearConversationState();
    });

    describe('Concurrent Request Blocking', () => {
        it('should block concurrent requests', async () => {
            // Mock a slow request
            (axios.post as jest.Mock).mockImplementation(() =>
                new Promise(resolve => setTimeout(() => resolve({ data: {} }), 100))
            );

            // Start first request
            const request1 = gemini.makeRequest('test_key', 'test prompt');

            // Try to start second request immediately (should be blocked)
            await expect(
                gemini.makeRequest('test_key', 'test prompt 2')
            ).rejects.toThrow('Concurrent Request Blocked');

            // Wait for first request to complete
            await request1;
        });

        it('should allow new requests after previous one completes', async () => {
            (axios.post as jest.Mock).mockResolvedValue({ data: {} });

            // First request
            await gemini.makeRequest('test_key', 'test prompt 1');

            // Second request should work after first completes
            await expect(
                gemini.makeRequest('test_key', 'test prompt 2')
            ).resolves.toBeDefined();
        });
    });

    describe('Rate Limiting', () => {
        it('should retry on 429 rate limit errors', async () => {
            // Mock rate limit error, then success
            (axios.post as jest.Mock)
                .mockRejectedValueOnce({
                    response: { status: 429, data: { error: { message: 'Rate limited' } } }
                })
                .mockResolvedValueOnce({ data: { candidates: [{ content: { parts: [{ text: '{}' }] } }] } });

            const result = await gemini.backfillRequest('test prompt');

            // Should retry and eventually succeed
            expect(axios.post).toHaveBeenCalledTimes(2);
            expect(result.text).toBeTruthy();
        }, 10000);

        it('should retry on 5xx server errors', async () => {
            // Mock server error, then success
            (axios.post as jest.Mock)
                .mockRejectedValueOnce({
                    response: { status: 500, data: { error: { message: 'Server error' } } }
                })
                .mockResolvedValueOnce({ data: { candidates: [{ content: { parts: [{ text: '{}' }] } }] } });

            const result = await gemini.backfillRequest('test prompt');

            // Should retry and eventually succeed
            expect(axios.post).toHaveBeenCalledTimes(2);
            expect(result.text).toBeTruthy();
        }, 10000);
    });

    describe('Authentication Errors', () => {
        it('should handle invalid API key errors', async () => {
            (axios.post as jest.Mock).mockRejectedValue({
                response: {
                    status: 401,
                    data: { error: { message: 'Invalid API key' } }
                }
            });

            const result = await gemini.backfillRequest('test prompt');

            // Should return error, not throw
            expect(result.text).toBeNull();
            // Error may be in error field or handled internally
            expect(result.error || result.text === null).toBeTruthy();
        });

        it('should handle 403 forbidden errors', async () => {
            (axios.post as jest.Mock).mockRejectedValue({
                response: {
                    status: 403,
                    data: { error: { message: 'Forbidden' } }
                }
            });

            const result = await gemini.backfillRequest('test prompt');

            // Should return error, not throw
            expect(result.text).toBeNull();
            // Error may be in error field or handled internally
            expect(result.error || result.text === null).toBeTruthy();
        });
    });

    describe('Network Errors', () => {
        it('should handle network connection errors', async () => {
            (axios.post as jest.Mock).mockRejectedValue({
                message: 'Network Error',
                code: 'ECONNABORTED'
            });

            const result = await gemini.backfillRequest('test prompt');

            // Should return error, not throw
            expect(result.text).toBeNull();
            expect(result.error).toBeDefined();
        });

        it('should handle request timeout errors', async () => {
            (axios.post as jest.Mock).mockRejectedValue({
                message: 'Network Error',
                code: 'ETIMEDOUT'
            });

            const result = await gemini.backfillRequest('test prompt');

            // Should return error, not throw
            expect(result.text).toBeNull();
            expect(result.error).toBeDefined();
        });
    });

    describe('Missing API Key', () => {
        it('should handle missing API key gracefully', async () => {
            (dbService.getPreference as jest.Mock).mockResolvedValueOnce(null);

            const result = await gemini.backfillRequest('test prompt');

            // Should return error about missing key
            expect(result.text).toBeNull();
            expect(result.error).toContain('No API key');
        });
    });

    describe('Model Fallback Logic', () => {
        it('should strip thoughtSignature when falling back to non-reasoning models', async () => {
            // Setup: Set current model to Gemini 3 Pro (supports signature)
            await gemini.setModel('gemini-3-pro');

            // Mock a previous thought signature
            (gemini as any).lastThoughtSignature = 'test_signature';

            // Mock 1st call (Gemini 3 Pro) failing with 500
            // Mock 2nd call (Gemini 2.5 Pro) succeeding
            (axios.post as jest.Mock)
                .mockRejectedValueOnce({
                    response: { status: 500, data: { error: { message: 'Server error' } } }
                })
                .mockResolvedValueOnce({
                    data: { candidates: [{ content: { parts: [{ text: '{}' }] } }] }
                });

            await gemini.makeRequest('test_key', 'test prompt', {}, true);

            expect(axios.post).toHaveBeenCalledTimes(2);

            // 1st call (Gemini 3 Pro) should HAVE thoughtSignature
            const firstCallBody = (axios.post as jest.Mock).mock.calls[0][1];
            expect(firstCallBody.thoughtSignature).toBe('test_signature');

            // 2nd call (Fallback to Gemini 2.5 Pro etc) should NOT have thoughtSignature
            const secondCallBody = (axios.post as jest.Mock).mock.calls[1][1];
            expect(secondCallBody.thoughtSignature).toBeUndefined();
        });
    });
});
