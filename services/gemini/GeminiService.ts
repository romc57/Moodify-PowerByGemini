import axios from 'axios';
import { create } from 'zustand';
import { dbService } from '../database/DatabaseService';
import { GeminiPrompts } from './GeminiPrompts';

// Using Gemini 3 Pro for Google Hackathon
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-preview:generateContent';

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
 */
const DEFAULT_JSON_CONFIG: GeminiGenerationConfig = {
    responseMimeType: "application/json",
    thinkingLevel: 'low',
    maxOutputTokens: 2048, // Increased for Gemini 3 Pro (thinking tokens consume output budget)
    temperature: 0.7,
    topP: 0.9
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
            // thinking_level: config.thinkingLevel, // NOT SUPPORTED IN STANDARD API YET
            maxOutputTokens: config.maxOutputTokens,
            temperature: config.temperature,
            topP: config.topP,
            ...(config.seed !== undefined && { seed: config.seed })
        };
    }

    /**
     * Parse JSON response from Gemini, handling markdown code blocks
     */
    private parseJsonResponse(text: string): any {
        const cleanedText = text.replace(/```json/g, '').replace(/```/g, '').trim();
        return JSON.parse(cleanedText);
    }

    /**
     * Extract text from Gemini response
     */
    private extractResponseText(response: any): string | null {
        return response.data?.candidates?.[0]?.content?.parts?.[0]?.text || null;
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
        const generationConfig = this.buildGenerationConfig(config);

        const requestBody: Record<string, any> = {
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig
        };

        if (includeThoughtSignature && this.lastThoughtSignature) {
            requestBody.thoughtSignature = this.lastThoughtSignature;
        }

        if (this.isGenerating) {
            console.warn('[Gemini] Request BLOCKED: An API call is already in progress.');
            throw new Error('Concurrent Request Blocked');
        }

        this.isGenerating = true;

        try {
            const response = await axios.post(
                `${GEMINI_API_URL}?key=${apiKey}`,
                requestBody
            );

            // Debug: Log raw response structure for Gemini 3 Pro
            // console.log('[Gemini] Raw API Response:', JSON.stringify(response.data, null, 2).substring(0, 500));

            // Store thought signature if returned
            if (response.data.thoughtSignature) {
                this.lastThoughtSignature = response.data.thoughtSignature;
            }

            return response;
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
                        // thinking_level: 'minimal' 
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
            const response = await this.makeRequest(apiKey, prompt, { maxOutputTokens: 8000 }); // Increased for 16 vibe options

            const text = this.extractResponseText(response);
            if (!text) return [];

            const parsed = this.parseJsonResponse(text);
            return parsed.options || [];
        } catch (error: any) {
            if (error.response?.status !== 400 && error.response?.status !== 401) {
                console.warn('[Gemini] Vibe options failed:', error.message);
            }
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
            const response = await this.makeRequest(apiKey, prompt, { maxOutputTokens: 4000 });
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
            console.warn('[Gemini] Rescue vibe failed:', error.message);
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
            const response = await this.makeRequest(apiKey, prompt, { maxOutputTokens: 3500 });

            const text = this.extractResponseText(response);
            if (!text) return { items: [] };

            const parsed = this.parseJsonResponse(text);
            return {
                items: parsed.items || [],
                // Handle both old and new schema field names
                mood: parsed.mood || parsed.mood_description
            };
        } catch (error: any) {
            // Silently handle - likely missing API key
            if (error.response?.status !== 400 && error.response?.status !== 401) {
                console.warn('[Gemini] Expand vibe failed:', error.message);
            }
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
            const response = await this.makeRequest(apiKey, prompt, { maxOutputTokens: 1500 });

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
            // Silently handle - user hasn't configured Gemini API key yet
            // Only log if it's not a 400/401 error (which indicates missing/invalid key)
            if (error.response?.status !== 400 && error.response?.status !== 401) {
                console.warn('[Gemini] assessCurrentMood failed:', error.message);
            }
            return null;
        }
    }
}

export const gemini = GeminiService.getInstance();
