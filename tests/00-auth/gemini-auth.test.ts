/**
 * Gemini Authentication Test Suite
 *
 * RUNS FIRST - Tests fail hard if credentials are invalid.
 * No mocking - uses real Gemini API.
 */

import { loadTestApiKeys, validateGeminiApiKey } from '../utils/testApiKeys';

describe('Gemini Authentication (Real API)', () => {
    const keys = loadTestApiKeys();

    beforeAll(() => {
        if (!keys.geminiApiKey) {
            throw new Error(
                'GEMINI_API_KEY not found in .env.test. ' +
                'Please copy .env.test.example to .env.test and add your API key. ' +
                'Get one from: https://aistudio.google.com/app/apikey'
            );
        }
    });

    it('should have GEMINI_API_KEY in environment', () => {
        expect(keys.geminiApiKey).toBeTruthy();
        expect(keys.geminiApiKey).not.toBe('your_gemini_api_key_here');
    });

    it('should validate Gemini API key with real API call', async () => {
        const result = await validateGeminiApiKey(keys.geminiApiKey!);

        if (!result.valid) {
            throw new Error(
                `Gemini API key validation failed: ${result.error}. ` +
                'Please check your GEMINI_API_KEY in .env.test is valid.'
            );
        }

        expect(result.valid).toBe(true);
    }, 30000); // 30s timeout for API call

    it('should reject invalid API key', async () => {
        const result = await validateGeminiApiKey('invalid-api-key-12345');
        expect(result.valid).toBe(false);
        expect(result.error).toBeDefined();
    }, 30000);
});
