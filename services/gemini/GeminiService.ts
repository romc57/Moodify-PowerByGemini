import { GeminiErrors, ServiceError } from '@/services/core/ServiceError';
import { useErrorStore } from '@/stores/ErrorStore';
import axios from 'axios';
import { create } from 'zustand';
import { dbService } from '../database';
import { GEMINI_API_URL, DEFAULT_JSON_CONFIG as DEFAULT_CONFIG } from './constants';
import { GeminiPrompts } from './GeminiPrompts';

/**
 * Thinking level controls how much "reasoning" the model performs.
 * - "minimal": Fastest, for trivial tasks (greetings, simple formatting)
 * - "low": Fast, for structured output like JSON generation
 * - "medium": Balanced, for moderate complexity tasks
 * - "high": Slowest, for complex refactoring/architecture (DEFAULT if not set)
 */
export type ThinkingLevel = 'minimal' | 'low' | 'medium' | 'high';

export interface RecommendationResponse {
    mood_analysis: string;
    items: any[];
}

export interface GeminiGenerationConfig {
    responseMimeType?: string;
    maxOutputTokens?: number;
    thinkingLevel?: ThinkingLevel;
    seed?: number;
    temperature?: number;
    topP?: number;
}

interface GeminiState {
    apiKey: string | null;
    setApiKey: (key: string) => void;
}

export const useGeminiStore = create<GeminiState>((set) => ({
    apiKey: null,
    setApiKey: (key) => set({ apiKey: key }),
}));

/**
 * Default generation config for JSON responses
 * Following Gemini 3 Pro best practices from CLAUDE.md
 * Uses constants from constants.ts for one source of truth
 */
const DEFAULT_JSON_CONFIG: GeminiGenerationConfig = {
    ...DEFAULT_CONFIG,
};

class GeminiService {
    private static instance: GeminiService;

    /**
     * Stores the thoughtSignature from the last API response.
     * CRITICAL: When Gemini performs Chain-of-Thought reasoning or tool use,
     * it returns a cryptographic signature that MUST be passed back in the
     * next turn. Dropping this will cause 400 Invalid Argument errors.
     */
    private lastThoughtSignature: string | null = null;
    private isGenerating: boolean = false; // Concurrency Lock

    private constructor() { }

    static getInstance(): GeminiService {
        if (!GeminiService.instance) {
            GeminiService.instance = new GeminiService();
        }
        return GeminiService.instance;
    }

    /**
     * Clears the stored thought signature.
     * Call this when starting a new conversation/session.
     */
    clearConversationState(): void {
        this.lastThoughtSignature = null;
    }

    /**
     * Returns the current thought signature (for debugging/logging).
     */
    getThoughtSignature(): string | null {
        return this.lastThoughtSignature;
    }

    /**
     * Get API key from database
     */
    private async getApiKey(): Promise<string | null> {
        return dbService.getPreference('gemini_api_key');
    }

    /**
     * Build generation config with defaults
     */
    private buildGenerationConfig(overrides: Partial<GeminiGenerationConfig> = {}): Record<string, any> {
        const config = { ...DEFAULT_JSON_CONFIG, ...overrides };
        return {
            responseMimeType: config.responseMimeType,
            // thinking_level: config.thinkingLevel, // REMOVED: Causing 400 Invalid Argument
            maxOutputTokens: config.maxOutputTokens,
            temperature: config.temperature,
            topP: config.topP,
            ...(config.seed !== undefined && { seed: config.seed })
        };
    }

    /**
     * Parse JSON response from Gemini, handling markdown code blocks
     * Includes validation and error handling for malformed responses
     */
    private parseJsonResponse(text: string): any {
        try {
            const cleanedText = text.replace(/```json/g, '').replace(/```/g, '').trim();
            const parsed = JSON.parse(cleanedText);

            // Basic validation - ensure we got an object or array
            if (parsed === null || (typeof parsed !== 'object' && !Array.isArray(parsed))) {
                console.warn('[Gemini] Parsed JSON is not an object/array:', typeof parsed);
                this.emitError(GeminiErrors.parseError('Response was not a valid JSON object'));
                return {};
            }

            return parsed;
        } catch (error: any) {
            console.error('[Gemini] JSON parse error:', error.message);
            console.error('[Gemini] Raw text (first 1000 chars):', text?.substring(0, 1000));

            // REPAIR: Try to salvage truncated JSON arrays
            // Find all complete JSON objects in the array
            const repairedText = text.replace(/```json/g, '').replace(/```/g, '').trim();

            if (repairedText.startsWith('[')) {
                console.log('[Gemini] Attempting JSON repair for truncated array...');

                // Find all complete objects by looking for `},` or `}]` patterns
                const objectMatches: any[] = [];
                const objectPattern = /\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g;
                let match;

                while ((match = objectPattern.exec(repairedText)) !== null) {
                    try {
                        const obj = JSON.parse(match[0]);
                        if (obj && obj.id && obj.title) {
                            objectMatches.push(obj);
                        }
                    } catch {
                        // Skip malformed objects
                    }
                }

                if (objectMatches.length > 0) {
                    console.log(`[Gemini] Repaired: Salvaged ${objectMatches.length} complete options from truncated response`);
                    return objectMatches;
                }
            }

            this.emitError(GeminiErrors.parseError(error.message));
            throw error;
        }
    }

    /**
     * Emit error to ErrorStore for UI display
     */
    private emitError(error: ServiceError): void {
        useErrorStore.getState().setError(error);
    }

    /**
     * Clear Gemini errors from ErrorStore
     */
    private clearError(): void {
        useErrorStore.getState().clearError('gemini');
    }

    /**
     * Centralized Gemini error handling
     * Determines error type and emits appropriate error to ErrorStore
     */
    private handleGeminiError(error: any, context: string): void {
        const status = error.response?.status;
        const errorMessage = error.response?.data?.error?.message || error.message || '';

        // DEBUG: Log full error details
        console.error('[Gemini] RAW ERROR:', {
            status,
            message: errorMessage,
            data: error.response?.data,
            headers: error.response?.headers
        });

        if (status === 400) {
            if (errorMessage.includes('thoughtSignature') || errorMessage.includes('Invalid Argument')) {
                this.clearConversationState();
                this.emitError(GeminiErrors.signatureError(errorMessage));
            } else {
                this.emitError(GeminiErrors.unknown(`${context}: ${errorMessage}`));
            }
        } else if (status === 401 || status === 403) {
            this.emitError(GeminiErrors.invalidKey(errorMessage));
        } else if (status === 429) {
            this.emitError(GeminiErrors.rateLimited(errorMessage));
        } else if (error.message === 'Network Error' || error.code === 'ECONNABORTED') {
            this.emitError(GeminiErrors.networkError(errorMessage));
        } else if (error.message === 'Concurrent Request Blocked') {
            this.emitError(GeminiErrors.concurrentBlocked());
        } else {
            this.emitError(GeminiErrors.unknown(`${context}: ${errorMessage}`));
        }
    }

    /**
     * Execute request with exponential backoff retry
     * Retries on 429 (rate limit) and 5xx errors
     */
    private async withRetry<T>(
        operation: () => Promise<T>,
        maxRetries: number = 3,
        context: string = 'request'
    ): Promise<T> {
        let lastError: any;

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                const result = await operation();
                // Clear any previous errors on success
                this.clearError();
                return result;
            } catch (error: any) {
                lastError = error;
                const status = error.response?.status;

                // Only retry on rate limit (429) or server errors (5xx)
                const isRetryable = status === 429 || (status >= 500 && status < 600);

                if (!isRetryable || attempt === maxRetries) {
                    break;
                }

                // Exponential backoff: 1s, 2s, 4s
                const delay = Math.pow(2, attempt) * 1000;
                console.log(`[Gemini] ${context} attempt ${attempt + 1} failed (${status}), retrying in ${delay}ms...`);
                await new Promise(r => setTimeout(r, delay));
            }
        }

        throw lastError;
    }

    /**
     * Extract text from Gemini response
     */
    private extractResponseText(response: any): string | null {
        const text = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text) {
            console.warn('[Gemini] Response has no text. Candidates:', JSON.stringify(response.data?.candidates || 'None'));
            console.warn('[Gemini] Prompt Feedback:', JSON.stringify(response.data?.promptFeedback || 'None'));
        }
        return text || null;
    }

    /**
     * Log prompt for debugging
     */
    private logPrompt(prompt: string): void {
        if (prompt) {
            console.log('\n=== GEMINI PROMPT START ===\n');
            console.log(prompt.substring(0, 5000)); // Log full prompt (up to 5k chars)
            console.log('\n=== GEMINI PROMPT END ===\n');
        }
    }

    /**
     * Build request body for Gemini API
     */
    private buildRequestBody(
        prompt: string,
        generationConfig: Record<string, any>,
        includeThoughtSignature: boolean
    ): Record<string, any> {
        const requestBody: Record<string, any> = {
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig
        };

        if (includeThoughtSignature && this.lastThoughtSignature) {
            requestBody.thoughtSignature = this.lastThoughtSignature;
        }

        return requestBody;
    }

    /**
     * Check and enforce concurrency lock
     */
    private checkConcurrency(): void {
        if (this.isGenerating) {
            console.warn('[Gemini] Request BLOCKED: An API call is already in progress.');
            throw new Error('Concurrent Request Blocked');
        }
        this.isGenerating = true;
    }

    /**
     * Execute the actual API request
     */
    private async executeRequest(apiKey: string, requestBody: Record<string, any>): Promise<any> {
        const startTime = Date.now();
        const maxTokens = requestBody.generationConfig.maxOutputTokens;
        console.log(`[Gemini] Requesting: GenerateContent (Tokens: ${maxTokens})`);

        const response = await axios.post(
            `${GEMINI_API_URL}?key=${apiKey}`,
            requestBody
        );

        const duration = Date.now() - startTime;
        console.log(`[Gemini] Response (${response.status}): GenerateContent took ${duration}ms`);

        // Store thought signature if returned
        if (response.data.thoughtSignature) {
            this.lastThoughtSignature = response.data.thoughtSignature;
        }

        return response;
    }

    /**
     * Make API request to Gemini
     * Public for use by ValidatedQueueService backfill
     */
    async makeRequest(
        apiKey: string,
        prompt: string,
        config: Partial<GeminiGenerationConfig> = {},
        includeThoughtSignature: boolean = false
    ): Promise<any> {
        this.logPrompt(prompt);
        const generationConfig = this.buildGenerationConfig(config);
        const requestBody = this.buildRequestBody(prompt, generationConfig, includeThoughtSignature);

        this.checkConcurrency();

        try {
            return await this.executeRequest(apiKey, requestBody);
        } finally {
            this.isGenerating = false;
        }
    }

    async validateKey(key: string): Promise<{ valid: boolean; error?: string }> {
        if (!key) return { valid: false, error: "API Key is empty" };
        try {
            await axios.post(
                `${GEMINI_API_URL}?key=${key}`,
                {
                    contents: [{ parts: [{ text: "Hello" }] }],
                    generationConfig: {
                        maxOutputTokens: 1,
                        // thinking_level: 'minimal' // Removed to prevent 400 errors with pro-preview models
                    }
                }
            );
            return { valid: true };
        } catch (error: any) {
            console.error('[GeminiService] Key validation failed:', error.response?.data || error.message);
            const errorMessage = error.response?.data?.error?.message || error.message || "Unknown error";
            return { valid: false, error: errorMessage };
        }
    }

    async testConnection(): Promise<boolean> {
        const apiKey = await this.getApiKey();
        if (!apiKey) return false;

        try {
            const response = await axios.post(
                `${GEMINI_API_URL}?key=${apiKey}`,
                { contents: [{ parts: [{ text: 'Hello' }] }] }
            );
            return response.status === 200;
        } catch {
            return false;
        }
    }

    async generateDJRecommendation(
        recentHistory: any[],
        favorites: string[],
        skipRate: number,
        userInstruction: string,
        strategy: 'conservative' | 'exploratory' | 'refined' = 'conservative',
        triggerCount: number = 0
    ): Promise<RecommendationResponse | null> {
        const apiKey = await this.getApiKey();
        if (!apiKey) {
            console.warn('[Gemini] No API Key found.');
            return null;
        }

        const prompt = GeminiPrompts.generateDJRecommendation(
            recentHistory,
            favorites,
            skipRate,
            userInstruction,
            strategy,
            triggerCount
        );

        try {
            const response = await this.makeRequest(apiKey, prompt, { maxOutputTokens: 2000 }, true);

            const text = this.extractResponseText(response);
            if (!text) {
                // Silently handle - likely missing API key
                return null;
            }

            console.log('[Gemini] DJ Response:', text);
            const parsed = this.parseJsonResponse(text);

            if (parsed.reasoning) {
                await dbService.logReasoning(
                    { skipRate, lastTrack: recentHistory[0]?.track_name },
                    parsed.reasoning,
                    parsed.items ? `Suggested ${parsed.items.length} items` : 'No items'
                );
            }

            return {
                mood_analysis: parsed.reasoning,
                items: parsed.items || []
            };

        } catch (error: any) {
            if (error.response?.status === 400) {
                const errorMessage = error.response?.data?.error?.message || '';
                if (errorMessage.includes('thoughtSignature') || errorMessage.includes('Invalid Argument')) {
                    // Thought signature error - clearing state
                    this.clearConversationState();
                }
            }
            // Silently handle - likely missing API key
            if (error.response?.status !== 400 && error.response?.status !== 401) {
                console.warn('[Gemini] DJ recommendation failed:', error.message);
            }
            return null;
        }
    }

    async getVibeOptions(
        recentHistory: any[],
        favorites: string[],
        userInstruction: string,
        excludeTracks: string[] = []
    ): Promise<any[]> {
        const apiKey = await this.getApiKey();
        if (!apiKey) return [];

        const prompt = GeminiPrompts.generateVibeOptionsPrompt(recentHistory, favorites, userInstruction, excludeTracks);

        try {
            const response = await this.makeRequest(apiKey, prompt, { maxOutputTokens: 8000 }, true); // Include thoughtSignature

            const text = this.extractResponseText(response);
            if (!text) return [];

            const parsed = this.parseJsonResponse(text);
            return parsed.options || [];
        } catch (error: any) {
            this.handleGeminiError(error, 'getVibeOptions');
            return [];
        }
    }

    async generateRescueVibe(
        recentSkips: any[],
        favorites: string[],
        excludeTracks: string[] = []
    ): Promise<{ items: any[], reasoning: string, vibe: string } | null> {
        const apiKey = await this.getApiKey();
        if (!apiKey) return null;

        const prompt = GeminiPrompts.generateRescueVibePrompt(recentSkips, favorites, excludeTracks);

        try {
            const response = await this.makeRequest(apiKey, prompt, { maxOutputTokens: 8000 }, true); // Increased limit & Include thoughtSignature
            const text = this.extractResponseText(response);
            if (!text) return null;

            const parsed = this.parseJsonResponse(text);
            return {
                items: parsed.items || [],
                // Handle both old and new schema field names
                reasoning: parsed.why || parsed.reasoning || "Switching it up!",
                vibe: parsed.vibe || parsed.new_vibe_name || "New Vibe"
            };
        } catch (error: any) {
            this.handleGeminiError(error, 'generateRescueVibe');
            return null;
        }
    }

    async expandVibe(
        seedTrack: { title: string, artist: string },
        recentHistory: any[],
        favorites: string[],
        excludeTracks: string[] = []
    ): Promise<{ items: any[], mood?: string }> {
        const apiKey = await this.getApiKey();
        if (!apiKey) return { items: [] };

        const prompt = GeminiPrompts.generateVibeExpansionPrompt(seedTrack, recentHistory, favorites, excludeTracks);

        try {
            const response = await this.makeRequest(apiKey, prompt, { maxOutputTokens: 3500 }, true); // Include thoughtSignature

            const text = this.extractResponseText(response);
            if (!text) return { items: [] };

            const parsed = this.parseJsonResponse(text);
            return {
                items: parsed.items || [],
                // Handle both old and new schema field names
                mood: parsed.mood || parsed.mood_description
            };
        } catch (error: any) {
            this.handleGeminiError(error, 'expandVibe');
            return { items: [] };
        }
    }

    async assessCurrentMood(
        currentTrack: { title: string; artist: string } | null,
        recentHistory: any[],
        userContext?: string
    ): Promise<{ mood: string; mood_description: string; energy_level: string; recommended_direction: string } | null> {
        const apiKey = await this.getApiKey();
        if (!apiKey) {
            console.warn('[Gemini] assessCurrentMood: No API Key found.');
            return null;
        }

        console.log('[Gemini] Generating mood assessment prompt...');
        const prompt = GeminiPrompts.generateMoodAssessmentPrompt(currentTrack, recentHistory, userContext);


        try {
            const response = await this.makeRequest(apiKey, prompt, { maxOutputTokens: 1500 }, true); // Include thoughtSignature

            const text = this.extractResponseText(response);
            if (!text) {
                console.warn('[Gemini] Response Text is NULL. Full Response:', JSON.stringify(response.data, null, 2));
                return null;
            }
            console.log('[Gemini] Raw Response Text:', text.substring(0, 200) + '...');

            const parsed = this.parseJsonResponse(text);
            console.log('[Gemini] Mood Assessment:', parsed);

            return {
                mood: parsed.mood || 'neutral',
                mood_description: parsed.mood_description || 'Analyzing your vibe...',
                energy_level: parsed.energy_level || 'medium',
                recommended_direction: parsed.recommended_direction || 'keep_current'
            };
        } catch (error: any) {
            this.handleGeminiError(error, 'assessCurrentMood');
            return null;
        }
    }

    /**
     * Public method for backfill requests from ValidatedQueueService
     * Wraps makeRequest with proper error handling and retry logic
     */
    async backfillRequest(
        prompt: string,
        config: Partial<GeminiGenerationConfig> = {}
    ): Promise<{ text: string | null; error?: string }> {
        const apiKey = await this.getApiKey();
        if (!apiKey) {
            return { text: null, error: 'No API key configured' };
        }

        try {
            const response = await this.withRetry(
                () => this.makeRequest(apiKey, prompt, { maxOutputTokens: 2000, ...config }, true),
                2, // 2 retries for backfill
                'backfill'
            );

            const text = this.extractResponseText(response);
            return { text };
        } catch (error: any) {
            this.handleGeminiError(error, 'backfillRequest');
            return { text: null, error: error.message };
        }
    }
}

export const gemini = GeminiService.getInstance();
