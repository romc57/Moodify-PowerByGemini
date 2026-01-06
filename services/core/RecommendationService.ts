import { useVitalsStore } from '@/vitals/VitalsStore';
import { dbService } from '../database/DatabaseService';
import { gemini, RecommendationResponse } from '../gemini/GeminiService';

export class RecommendationService {
    private static instance: RecommendationService;

    private constructor() { }

    static getInstance(): RecommendationService {
        if (!RecommendationService.instance) {
            RecommendationService.instance = new RecommendationService();
        }
        return RecommendationService.instance;
    }

    /**
     * Main entry point to get a recommendation based on current state.
     */
    async getRecommendation(): Promise<RecommendationResponse | null> {
        const vitalsStore = useVitalsStore.getState();
        const vitals = vitalsStore.current;
        const relative = vitalsStore.getRelativeVitals();

        // Get last 5 feedback items for context
        const feedbackHistory = await dbService.getFeedbackHistory(5);

        console.log('[Recommendation] Requesting from Gemini...');
        const response = await gemini.generateRecommendation(vitals, relative, feedbackHistory);

        if (response && response.suggestedAction) {
            // Optional: Pre-validate with Spotify Search? 
            // For now, we trust the Hallucination or handle 404 in UI.
            console.log('[Recommendation] Received:', response);
        }

        return response;
    }

    /**
     * User provides feedback on a track.
     * @param trackName Title/ID of the track
     * @param feedback "Too fast", "Good", etc.
     */
    async submitFeedback(trackName: string, feedback: string) {
        const vitalsStore = useVitalsStore.getState();
        const relative = vitalsStore.getRelativeVitals();

        let vitalsChangeStr = "Unknown";
        if (relative) {
            vitalsChangeStr = `HR: ${relative.hrDiff > 0 ? '+' : ''}${relative.hrDiff}, Stress: ${relative.stressDiff}`;
        }

        console.log(`[Recommendation] Logging feedback for ${trackName}: ${feedback}`);
        await dbService.logFeedback(trackName, feedback, vitalsChangeStr);
    }
}

export const recommendationService = RecommendationService.getInstance();
