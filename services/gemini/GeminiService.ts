import { dbService } from '@/services/database/DatabaseService';
import { VitalsData } from '@/vitals/types';
import axios from 'axios';

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-preview:generateContent';

export interface RecommendationResponse {
    analysis: string;
    suggestedAction: {
        service: 'spotify' | 'youtube';
        type: 'track' | 'playlist';
        query: string; // "Calming piano music"
        reason: string;
    };
}

export class GeminiService {
    private static instance: GeminiService;

    private constructor() { }

    static getInstance(): GeminiService {
        if (!GeminiService.instance) {
            GeminiService.instance = new GeminiService();
        }
        return GeminiService.instance;
    }

    async validateKey(key: string): Promise<boolean> {
        if (!key) return false;
        try {
            // Minimal request to validate key
            await axios.post(
                `${GEMINI_API_URL}?key=${key}`,
                {
                    contents: [{ parts: [{ text: "Hello" }] }],
                    generationConfig: { maxOutputTokens: 1 }
                }
            );
            return true;
        } catch (e) {
            console.error('[Gemini] Validation Error', e);
            return false;
        }
    }

    async generateRecommendation(
        vitals: VitalsData,
        relativeVitals: { hrDiff: number; hrvDiff: number; stressDiff: number } | null,
        history: any[]
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
            const response = await axios.post(
                `${GEMINI_API_URL}?key=${apiKey}`,
                {
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: { responseMimeType: "application/json" }
                }
            );

            const text = response.data.candidates[0].content.parts[0].text;
            return JSON.parse(text);
        } catch (error) {
            console.error('[Gemini] API Error:', error);
            return null;
        }
    }
}

export const gemini = GeminiService.getInstance();
