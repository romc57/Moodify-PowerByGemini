import { GeminiErrors, ServiceError } from '@/services/core/ServiceError';
import { useErrorStore } from '@/stores/ErrorStore';
import axios from 'axios';
import { create } from 'zustand';
import { dbService } from '../database';
import {
    DEFAULT_JSON_CONFIG,
    DEFAULT_MODEL,
    GEMINI_MODELS,
    GeminiModel,
    MODEL_PRIORITY,
    ModelId,
    TOKEN_LIMITS,
} from './constants';
import { GeminiPrompts } from './GeminiPrompts';

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

export interface ModelStatus {
    id: ModelId;
    available: boolean;
    latency?: number;
    error?: string;
    lastChecked?: number;
}

interface GeminiState {
    apiKey: string | null;
    selectedModel: ModelId;
    modelStatuses: Record<ModelId, ModelStatus>;
    setApiKey: (key: string) => void;
    setSelectedModel: (model: ModelId) => void;
    setModelStatus: (status: ModelStatus) => void;
}

export const useGeminiStore = create<GeminiState>((set) => ({
    apiKey: null,
    selectedModel: DEFAULT_MODEL,
    modelStatuses: {} as Record<ModelId, ModelStatus>,
    setApiKey: (key) => set({ apiKey: key }),
    setSelectedModel: (model) => set({ selectedModel: model }),
    setModelStatus: (status) =>
        set((state) => ({
            modelStatuses: { ...state.modelStatuses, [status.id]: status },
        })),
}));

class GeminiService {
    private static instance: GeminiService;
    private lastThoughtSignature: string | null = null;
    private isGenerating: boolean = false;
    private currentModel: ModelId = DEFAULT_MODEL;

    private constructor() {
        this.loadSelectedModel();
    }

    static getInstance(): GeminiService {
        if (!GeminiService.instance) {
            GeminiService.instance = new GeminiService();
        }
        return GeminiService.instance;
    }

    // Load user's selected model from database
    private async loadSelectedModel(): Promise<void> {
        const saved = await dbService.getPreference('gemini_model');
        if (saved && saved in GEMINI_MODELS) {
            this.currentModel = saved as ModelId;
            useGeminiStore.getState().setSelectedModel(this.currentModel);
        }
    }

    // Get current model info
    getCurrentModel(): GeminiModel {
        return GEMINI_MODELS[this.currentModel];
    }

    // Get current model ID
    getCurrentModelId(): ModelId {
        return this.currentModel;
    }

    // Set preferred model
    async setModel(modelId: ModelId): Promise<void> {
        if (modelId in GEMINI_MODELS) {
            this.currentModel = modelId;
            await dbService.setPreference('gemini_model', modelId);
            useGeminiStore.getState().setSelectedModel(modelId);
            console.log(`[Gemini] Model set to: ${GEMINI_MODELS[modelId].name}`);
        }
    }

    // Test a specific model's availability
    async testModel(modelId: ModelId, apiKey?: string): Promise<ModelStatus> {
        const key = apiKey || (await this.getApiKey());
        const model = GEMINI_MODELS[modelId];

        if (!key) {
            return { id: modelId, available: false, error: 'No API key' };
        }

        const startTime = Date.now();

        try {
            await axios.post(
                `${model.url}?key=${key}`,
                {
                    contents: [{ parts: [{ text: 'Hi' }] }],
                    generationConfig: { maxOutputTokens: 1 },
                },
                { timeout: 15000 }
            );

            const latency = Date.now() - startTime;
            const status: ModelStatus = {
                id: modelId,
                available: true,
                latency,
                lastChecked: Date.now(),
            };

            useGeminiStore.getState().setModelStatus(status);
            console.log(`[Gemini] ${model.name}: Available (${latency}ms)`);
            return status;
        } catch (error: any) {
            const errorMsg = error.response?.data?.error?.message || error.message || 'Unknown error';
            const status: ModelStatus = {
                id: modelId,
                available: false,
                error: errorMsg,
                lastChecked: Date.now(),
            };

            useGeminiStore.getState().setModelStatus(status);
            console.log(`[Gemini] ${model.name}: Unavailable - ${errorMsg}`);
            return status;
        }
    }

    // Test all models and return their statuses
    async testAllModels(apiKey?: string): Promise<ModelStatus[]> {
        const key = apiKey || (await this.getApiKey()) || undefined;
        const results: ModelStatus[] = [];

        for (const modelId of MODEL_PRIORITY) {
            const status = await this.testModel(modelId, key);
            results.push(status);
        }

        return results;
    }

    // Find first available model (for fallback)
    async findAvailableModel(apiKey?: string): Promise<ModelId | null> {
        const key = apiKey || (await this.getApiKey()) || undefined;

        for (const modelId of MODEL_PRIORITY) {
            const status = await this.testModel(modelId, key);
            if (status.available) {
                return modelId;
            }
        }

        return null;
    }

    clearConversationState(): void {
        this.lastThoughtSignature = null;
    }

    getThoughtSignature(): string | null {
        return this.lastThoughtSignature;
    }

    private async getApiKey(): Promise<string | null> {
        return dbService.getPreference('gemini_api_key');
    }

    private buildGenerationConfig(overrides: Partial<GeminiGenerationConfig> = {}): Record<string, any> {
        const config = { ...DEFAULT_JSON_CONFIG, ...overrides };
        return {
            responseMimeType: config.responseMimeType,
            maxOutputTokens: config.maxOutputTokens,
            temperature: config.temperature,
            topP: config.topP,
            ...(config.seed !== undefined && { seed: config.seed }),
        };
    }

    private parseJsonResponse(text: string): any {
        try {
            const cleanedText = text.replace(/```json/g, '').replace(/```/g, '').trim();
            const parsed = JSON.parse(cleanedText);

            if (parsed === null || (typeof parsed !== 'object' && !Array.isArray(parsed))) {
                console.warn('[Gemini] Parsed JSON is not an object/array:', typeof parsed);
                this.emitError(GeminiErrors.parseError('Response was not a valid JSON object'));
                return {};
            }

            return parsed;
        } catch (error: any) {
            console.error('[Gemini] JSON parse error:', error.message);

            // Attempt repair for truncated arrays
            const repairedText = text.replace(/```json/g, '').replace(/```/g, '').trim();
            if (repairedText.startsWith('[')) {
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
                        // Skip malformed
                    }
                }

                if (objectMatches.length > 0) {
                    console.log(`[Gemini] Repaired: Salvaged ${objectMatches.length} items`);
                    return objectMatches;
                }
            }

            this.emitError(GeminiErrors.parseError(error.message));
            throw error;
        }
    }

    private emitError(error: ServiceError): void {
        useErrorStore.getState().setError(error);
    }

    private clearError(): void {
        useErrorStore.getState().clearError('gemini');
    }

    private handleGeminiError(error: any, context: string): void {
        const status = error.response?.status;
        const errorMessage = error.response?.data?.error?.message || error.message || '';

        console.error('[Gemini] Error:', { status, message: errorMessage });

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
        } else {
            this.emitError(GeminiErrors.unknown(`${context}: ${errorMessage}`));
        }
    }

    private async withRetry<T>(
        operation: () => Promise<T>,
        maxRetries: number = 2,
        context: string = 'request'
    ): Promise<T> {
        let lastError: any;

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                const result = await operation();
                this.clearError();
                return result;
            } catch (error: any) {
                lastError = error;
                const status = error.response?.status;
                const isRetryable = status === 429 || (status >= 500 && status < 600);

                if (!isRetryable || attempt === maxRetries) break;

                const delay = Math.pow(2, attempt) * 1000;
                console.log(`[Gemini] ${context} retry ${attempt + 1} in ${delay}ms...`);
                await new Promise((r) => setTimeout(r, delay));
            }
        }

        throw lastError;
    }

    private extractResponseText(response: any): string | null {
        return response.data?.candidates?.[0]?.content?.parts?.[0]?.text || null;
    }

    // Execute request with automatic fallback to other models
    private async executeWithFallback(
        apiKey: string,
        requestBody: Record<string, any>,
        includeThoughtSignature: boolean,
        preferredModel?: ModelId
    ): Promise<any> {
        const modelsToTry = preferredModel
            ? [preferredModel, ...MODEL_PRIORITY.filter((m) => m !== preferredModel)]
            : [this.currentModel, ...MODEL_PRIORITY.filter((m) => m !== this.currentModel)];

        let lastError: any;

        for (const modelId of modelsToTry) {
            const model = GEMINI_MODELS[modelId];
            const startTime = Date.now();

            // Clone body to modify for this specific model
            const currentBody = { ...requestBody };

            // Only send thoughtSignature if model is Gemini 3 Pro (supports reasoning state)
            // Gemini 2.0/2.5 Pro/Flash do not support this field and will error with 400 INVALID_ARGUMENT
            if (modelId === 'gemini-3-pro' && includeThoughtSignature && this.lastThoughtSignature) {
                currentBody.thoughtSignature = this.lastThoughtSignature;
            }

            try {
                console.log(`[Gemini] Trying ${model.name}...`);

                const response = await axios.post(`${model.url}?key=${apiKey}`, currentBody, {
                    timeout: 60000,
                });

                const duration = Date.now() - startTime;
                console.log(`[Gemini] ${model.name} responded in ${duration}ms`);

                if (response.data.thoughtSignature) {
                    this.lastThoughtSignature = response.data.thoughtSignature;
                }

                return response;
            } catch (error: any) {
                lastError = error;
                const status = error.response?.status;
                console.warn(`[Gemini] ${model.name} failed (${status}): ${error.message}`);

                // Don't fallback on auth errors - they'll fail for all models
                if (status === 401 || status === 403) {
                    throw error;
                }

                // Continue to next model
            }
        }

        throw lastError;
    }

    async makeRequest(
        apiKey: string,
        prompt: string,
        config: Partial<GeminiGenerationConfig> = {},
        includeThoughtSignature: boolean = false
    ): Promise<any> {
        const generationConfig = this.buildGenerationConfig(config);

        const requestBody: Record<string, any> = {
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig,
        };

        if (this.isGenerating) {
            throw new Error('Concurrent Request Blocked');
        }

        this.isGenerating = true;

        try {
            return await this.executeWithFallback(apiKey, requestBody, includeThoughtSignature);
        } finally {
            this.isGenerating = false;
        }
    }

    async validateKey(key: string): Promise<{ valid: boolean; error?: string }> {
        if (!key) return { valid: false, error: 'API Key is empty' };

        // Test with the fastest model
        const status = await this.testModel('gemini-2.0-flash', key);
        return status.available ? { valid: true } : { valid: false, error: status.error };
    }

    async testConnection(): Promise<boolean> {
        const apiKey = await this.getApiKey();
        if (!apiKey) return false;

        const status = await this.testModel(this.currentModel, apiKey);
        return status.available;
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
        if (!apiKey) return null;

        const prompt = GeminiPrompts.generateDJRecommendation(
            recentHistory,
            favorites,
            skipRate,
            userInstruction,
            strategy,
            triggerCount
        );

        try {
            const response = await this.makeRequest(apiKey, prompt, { maxOutputTokens: TOKEN_LIMITS.STANDARD }, true);
            const text = this.extractResponseText(response);
            if (!text) return null;

            const parsed = this.parseJsonResponse(text);

            if (parsed.reasoning) {
                await dbService.logReasoning(
                    { skipRate, lastTrack: recentHistory[0]?.track_name },
                    parsed.reasoning,
                    parsed.items ? `Suggested ${parsed.items.length} items` : 'No items'
                );
            }

            return { mood_analysis: parsed.reasoning, items: parsed.items || [] };
        } catch (error: any) {
            if (error.response?.status === 400) {
                this.clearConversationState();
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

        const prompt = GeminiPrompts.generateVibeOptionsPrompt(
            recentHistory,
            favorites,
            userInstruction,
            excludeTracks
        );

        try {
            const response = await this.makeRequest(apiKey, prompt, { maxOutputTokens: TOKEN_LIMITS.LARGE }, true);
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
    ): Promise<{ items: any[]; reasoning: string; vibe: string } | null> {
        const apiKey = await this.getApiKey();
        if (!apiKey) return null;

        const prompt = GeminiPrompts.generateRescueVibePrompt(recentSkips, favorites, excludeTracks);

        try {
            const response = await this.makeRequest(apiKey, prompt, { maxOutputTokens: TOKEN_LIMITS.LARGE }, true);
            const text = this.extractResponseText(response);
            if (!text) return null;

            const parsed = this.parseJsonResponse(text);
            return {
                items: parsed.items || [],
                reasoning: parsed.why || parsed.reasoning || 'Switching it up!',
                vibe: parsed.vibe || parsed.new_vibe_name || 'New Vibe',
            };
        } catch (error: any) {
            this.handleGeminiError(error, 'generateRescueVibe');
            return null;
        }
    }

    async expandVibe(
        seedTrack: { title: string; artist: string },
        recentHistory: any[],
        favorites: string[],
        excludeTracks: string[] = []
    ): Promise<{ items: any[]; mood?: string }> {
        const apiKey = await this.getApiKey();
        if (!apiKey) return { items: [] };

        const prompt = GeminiPrompts.generateVibeExpansionPrompt(
            seedTrack,
            recentHistory,
            favorites,
            excludeTracks
        );

        try {
            const response = await this.makeRequest(apiKey, prompt, { maxOutputTokens: TOKEN_LIMITS.MEDIUM }, true);
            const text = this.extractResponseText(response);
            if (!text) return { items: [] };

            const parsed = this.parseJsonResponse(text);
            return { items: parsed.items || [], mood: parsed.mood || parsed.mood_description };
        } catch (error: any) {
            this.handleGeminiError(error, 'expandVibe');
            return { items: [] };
        }
    }

    async assessCurrentMood(
        currentTrack: { title: string; artist: string } | null,
        recentHistory: any[],
        userContext?: string
    ): Promise<{
        mood: string;
        mood_description: string;
        energy_level: string;
        recommended_direction: string;
    } | null> {
        const apiKey = await this.getApiKey();
        if (!apiKey) return null;

        const prompt = GeminiPrompts.generateMoodAssessmentPrompt(currentTrack, recentHistory, userContext);

        try {
            const response = await this.makeRequest(apiKey, prompt, { maxOutputTokens: TOKEN_LIMITS.SMALL }, true);
            const text = this.extractResponseText(response);
            if (!text) return null;

            const parsed = this.parseJsonResponse(text);
            return {
                mood: parsed.mood || 'neutral',
                mood_description: parsed.mood_description || 'Analyzing your vibe...',
                energy_level: parsed.energy_level || 'medium',
                recommended_direction: parsed.recommended_direction || 'keep_current',
            };
        } catch (error: any) {
            this.handleGeminiError(error, 'assessCurrentMood');
            return null;
        }
    }

    async backfillRequest(
        prompt: string,
        config: Partial<GeminiGenerationConfig> = {}
    ): Promise<{ text: string | null; error?: string }> {
        const apiKey = await this.getApiKey();
        if (!apiKey) return { text: null, error: 'No API key configured' };

        try {
            const response = await this.withRetry(
                () => this.makeRequest(apiKey, prompt, { maxOutputTokens: TOKEN_LIMITS.STANDARD, ...config }, true),
                2,
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

// Re-export types and constants for convenience
export { DEFAULT_MODEL, GEMINI_MODELS, MODEL_PRIORITY, TOKEN_LIMITS, type GeminiModel, type ModelId };

