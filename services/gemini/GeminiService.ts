import { dbService } from '@/services/database/DatabaseService';
import { VitalsData } from '@/vitals/types';
import axios from 'axios';

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
    analysis: string;
    suggestedAction: {
        service: 'spotify' | 'youtube';
        type: 'track' | 'playlist';
        query: string; // "Calming piano music"
        reason: string;
    };
}

export interface GeminiGenerationConfig {
    responseMimeType?: string;
    maxOutputTokens?: number;
    thinkingLevel?: ThinkingLevel;
    seed?: number;
}

export class GeminiService {
    private static instance: GeminiService;

    /**
     * Stores the thoughtSignature from the last API response.
     * CRITICAL: When Gemini performs Chain-of-Thought reasoning or tool use,
     * it returns a cryptographic signature that MUST be passed back in the
     * next turn. Dropping this will cause 400 Invalid Argument errors.
     */
    private lastThoughtSignature: string | null = null;

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

    async validateKey(key: string): Promise<boolean> {
        if (!key) return false;
        try {
            // Minimal request to validate key
            // Using thinking_level: "minimal" since this is a trivial validation task
            await axios.post(
                `${GEMINI_API_URL}?key=${key}`,
                {
                    contents: [{ parts: [{ text: "Hello" }] }],
                    generationConfig: {
                        maxOutputTokens: 1,
                        thinking_level: 'minimal' as ThinkingLevel
                    }
                }
            );
            return true;
        } catch (e) {
            console.error('[Gemini] Validation Error', e);
            return false;
        }
    }

    /**
     * Generates a music recommendation based on vitals data.
     *
     * @param vitals - Current vitals data (heart rate, HRV, stress)
     * @param relativeVitals - Comparison to baseline (if available)
     * @param history - Recent feedback history
     * @param options - Optional configuration overrides
     * @param options.thinkingLevel - Override thinking level (default: "low")
     * @param options.seed - Set seed for deterministic/reproducible output
     */
    async generateRecommendation(
        vitals: VitalsData,
        relativeVitals: { hrDiff: number; hrvDiff: number; stressDiff: number } | null,
        history: any[],
        options: { thinkingLevel?: ThinkingLevel; seed?: number } = {}
    ): Promise<RecommendationResponse | null> {
        const apiKey = await dbService.getSecret('gemini_api_key');
        if (!apiKey) {
            console.warn('[Gemini] No API Key found.');
            return null;
        }

        const timeOfDay = new Date().getHours() < 12 ? 'Morning' : new Date().getHours() < 18 ? 'Afternoon' : 'Evening';

        let vitalsCtx = `
        Current Vitals:
        - Heart Rate: ${vitals.heartRate} bpm
        - HRV: ${vitals.hrv} ms
        - Stress Level: ${vitals.stressLevel}
        `;

        if (relativeVitals) {
            vitalsCtx += `
        Baseline Comparison:
        - Heart Rate is ${relativeVitals.hrDiff > 0 ? '+' : ''}${relativeVitals.hrDiff} bpm from baseline.
        - HRV is ${relativeVitals.hrvDiff > 0 ? '+' : ''}${relativeVitals.hrvDiff} ms from baseline.
        - Stress is ${relativeVitals.stressDiff > 0 ? '+' : ''}${relativeVitals.stressDiff} points from baseline.
            `;
        } else {
            vitalsCtx += `\n(User has not calibrated baseline yet, assume absolute values)`;
        }

        const historyCtx = history.length > 0
            ? `User Feedback History:\n${history.map(h => `- Played "${h.track}" -> User said: "${h.feedback}"`).join('\n')}`
            : "No recent history.";

        const prompt = `
        You are Moodify, an advanced AI Music Therapist.

        CONTEXT:
        Time: ${timeOfDay}
        ${vitalsCtx}
        ${historyCtx}

        TASK:
        Analyze the user's biological state and context.
        Think step-by-step:
        1. Compare current vitals to baseline (if available). High HR + Low HRV = Stress/Anxiety. Low HR + High HRV = Relaxed.
        2. Consider the time of day.
        3. Look at recent feedback to avoid repeating rejected styles.
        4. Suggest a specific Spotify track or playlist to shift their mood to a better state (or maintain flow).

        OUTPUT:
        Return ONLY a JSON object:
        {
            "analysis": "User's heart rate is elevated (+15bpm) suggesting mild anxiety...",
            "suggestedAction": {
                "service": "spotify",
                "type": "track",
                "query": "Weightless by Marconi Union",
                "reason": "Scientifically proven to reduce anxiety."
            }
        }
        `;

        try {
            // Build generation config with best practices:
            // - thinking_level: "low" for JSON generation (avoid over-thinking)
            // - maxOutputTokens: 500 safety cap (expected output is ~200 tokens)
            // - seed: optional, for reproducible results during testing
            const generationConfig: Record<string, any> = {
                responseMimeType: "application/json",
                thinking_level: options.thinkingLevel ?? 'low',
                maxOutputTokens: 500
            };

            // Add seed if provided (for deterministic output during testing/debugging)
            if (options.seed !== undefined) {
                generationConfig.seed = options.seed;
            }

            // Build request body
            const requestBody: Record<string, any> = {
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig
            };

            // CRITICAL: Pass back thoughtSignature if we have one from a previous turn.
            // This is required for multi-turn conversations with reasoning models.
            // Dropping this signature will cause 400 Invalid Argument errors.
            if (this.lastThoughtSignature) {
                requestBody.thoughtSignature = this.lastThoughtSignature;
            }

            const response = await axios.post(
                `${GEMINI_API_URL}?key=${apiKey}`,
                requestBody
            );

            // CRITICAL: Extract and store thoughtSignature from response.
            // The model generates this cryptographic token when performing
            // Chain-of-Thought reasoning. We must pass it back in the next turn.
            if (response.data.thoughtSignature) {
                this.lastThoughtSignature = response.data.thoughtSignature;
                console.log('[Gemini] Stored thought signature for next turn');
            }

            const text = response.data.candidates[0].content.parts[0].text;
            return JSON.parse(text);
        } catch (error: any) {
            // Check for specific error types related to signature issues
            if (error.response?.status === 400) {
                const errorMessage = error.response?.data?.error?.message || '';
                if (errorMessage.includes('thoughtSignature') || errorMessage.includes('Invalid Argument')) {
                    console.error('[Gemini] Thought signature error - clearing state and retrying may help');
                    this.clearConversationState();
                }
            }
            console.error('[Gemini] API Error:', error);
            return null;
        }
    }
}

export const gemini = GeminiService.getInstance();
