import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
import { VitalsData } from '../../vitals/types';

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro-latest:generateContent';

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

    async getRecommendation(vitals: VitalsData, history: string[]): Promise<RecommendationResponse | null> {
        const apiKey = await SecureStore.getItemAsync('gemini_api_key');
        if (!apiKey) {
            console.warn('[Gemini] No API Key found.');
            return null;
        }

        const prompt = `
      You are an AI Music Therapist. 
      User Vitals:
      - Heart Rate: ${vitals.heartRate} bpm
      - Stress Level: ${vitals.stressLevel}/100
      - HRV: ${vitals.hrv} ms
      
      User History: ${history.join(', ')}
      
      Based on this, suggest a specific music genre or search query to IMPROVE their state (e.g. lower stress).
      Return ONLY a JSON object with this structure:
      {
        "analysis": "User is highly stressed...",
        "suggestedAction": {
          "service": "spotify",
          "type": "playlist",
          "query": "Ambient Rain Sounds",
          "reason": "To lower heart rate"
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
