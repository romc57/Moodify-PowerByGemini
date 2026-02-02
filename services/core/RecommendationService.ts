import { dbService } from '@/services/database/DatabaseService';
import { usePlayerStore } from '@/stores/PlayerStore';
import { gemini } from '../gemini/GeminiService';
import { spotifyRemote } from '../spotify/SpotifyRemoteService';
import { RawTrackSuggestion, validatedQueueService } from './ValidatedQueueService';

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
     * Entry Point 1: Get 8 Distinct Vibe Options (Refresh)
     * - Uses Daily Play Log for exclusions
     * - Uses Play Counts for affinity
     * - Now uses ValidatedQueueService for smart backfill
     */
    async getVibeOptions(userInstruction: string = ''): Promise<any[]> {
        try {
            const history = await dbService.getRecentHistory(20);

            // EXCLUSION LOGIC: Combine Daily History (DB) + Current Session (Store)
            const dailyExclusions = await dbService.getDailyHistory();
            const sessionExclusions = usePlayerStore.getState().sessionHistory.map(h => `${h.title} - ${h.uri}`);

            const allExclusions = Array.from(new Set([...dailyExclusions, ...sessionExclusions]));

            let favorites: string[] = [];
            try {
                const topTracks = await spotifyRemote.getUserTopTracks(10, 'short_term');
                favorites = topTracks.map((t: any) => `${t.name} - ${t.artists?.[0]?.name || 'Unknown'}`);
            } catch (e) {
                console.warn('[RecService] Favorites fetch failed:', e);
            }

            console.log(`[RecService] Generating Vibe Options (Excluding ${allExclusions.length} tracks)...`);

            // Request 10 options (reduced from 12 - closer to target of 8)
            const options = await gemini.getVibeOptions(
                history,
                favorites,
                userInstruction,
                allExclusions
            );

            console.log(`[RecService] Gemini returned ${options?.length ?? 0} raw options.`);

            if (!options || options.length === 0) {
                console.warn('[RecService] Gemini returned no options.');
                return [];
            }

            // Use ValidatedQueueService for smart validation with backfill
            const verifiedOptions = await validatedQueueService.validateVibeOptions(options, 8);

            console.log(`[RecService] ValidatedQueueService returned ${verifiedOptions.length} options.`);
            return verifiedOptions;

        } catch (error) {
            console.error('[RecService] GetVibeOptions Failed:', error);
            return [];
        }
    }



    /**
     * Entry Point 2: Rescue Vibe (3 Skips)
     * - Immediate "New Vibe" generation (No options)
     * - Returns 10 tracks to play immediately
     * - Now uses ValidatedQueueService for smart backfill
     */
    async getRescueVibe(recentSkips: any[]): Promise<{ items: any[]; vibe: string; reasoning: string } | null> {
        try {
            console.log('[RecService] Generating Rescue Vibe...');

            const dailyExclusions = await dbService.getDailyHistory();
            const sessionExclusions = usePlayerStore.getState().sessionHistory.map(h => `${h.title} - ${h.uri}`);
            const allExclusions = Array.from(new Set([...dailyExclusions, ...sessionExclusions]));

            let favorites: string[] = [];
            try {
                const topTracks = await spotifyRemote.getUserTopTracks(10, 'medium_term');
                favorites = topTracks.map((t: any) => `${t.name} - ${t.artists?.[0]?.name || 'Unknown'}`);
            } catch (e) { }

            const result = await gemini.generateRescueVibe(
                recentSkips,
                favorites,
                allExclusions
            );

            if (!result || result.items.length === 0) {
                // True Fallback if Gemini fails during Rescue
                console.warn('[RecService] Rescue Fallback to Top Tracks');
                const fallback = await this.getFallbackTracks(10);
                return {
                    items: fallback,
                    vibe: "Comfort Zone (Fallback)",
                    reasoning: "We couldn't reach the AI, so here are some familiar favorites to reset the vibe."
                };
            }

            // Convert Gemini response to RawTrackSuggestion format
            const suggestions: RawTrackSuggestion[] = result.items.map((item: any) => ({
                title: item.title || item.t,
                artist: item.artist || item.a,
                reason: item.reason
            }));

            // Get session history URIs to exclude already-played tracks
            const sessionUris = usePlayerStore.getState().sessionHistory.map(h => h.uri);

            // Use ValidatedQueueService for smart validation with backfill
            const validatedItems = await validatedQueueService.validateAndFill(
                suggestions,
                10, // Target 10 tracks
                {
                    type: 'rescue',
                    vibeName: result.vibe
                },
                sessionUris // Exclude session history
            );

            // If validation returned nothing, use fallback
            if (validatedItems.length === 0) {
                console.warn('[RecService] All tracks failed validation, using fallback');
                const fallback = await this.getFallbackTracks(10);
                return {
                    items: fallback,
                    vibe: "Comfort Zone (Fallback)",
                    reasoning: "Couldn't find suggested tracks on Spotify, here are some favorites instead."
                };
            }

            return {
                items: validatedItems,
                vibe: result.vibe,
                reasoning: result.reasoning
            };

        } catch (error) {
            console.error('[RecService] Rescue Failed:', error);
            return null;
        }
    }

    /**
     * Entry Point 3: Expansion (Loop Logic or Post-Selection)
     * - Extends a vibe by 10 tracks
     * - Now uses ValidatedQueueService for smart backfill
     */
    async expandVibe(
        seedTrack: { title: string; artist: string },
        currentVibeContext: string
    ): Promise<{ items: any[]; mood?: string }> {
        try {
            const history = await dbService.getRecentHistory(10);

            const dailyExclusions = await dbService.getDailyHistory();
            const sessionExclusions = usePlayerStore.getState().sessionHistory.map(h => `${h.title} - ${h.uri}`);
            const allExclusions = Array.from(new Set([...dailyExclusions, ...sessionExclusions]));

            let favorites: string[] = [];
            try {
                const topTracks = await spotifyRemote.getUserTopTracks(5, 'short_term');
                favorites = topTracks.map((t: any) => `${t.name} - ${t.artists?.[0]?.name}`);
            } catch (e) { }

            console.log(`[RecService] Expanding vibe from seed: ${seedTrack.title}...`);
            const result = await gemini.expandVibe(
                seedTrack,
                history,
                favorites,
                allExclusions
            );

            if (!result || result.items.length === 0) return { items: [] };

            // Convert Gemini response to RawTrackSuggestion format
            const suggestions: RawTrackSuggestion[] = result.items.map((item: any) => ({
                title: item.title || item.t,
                artist: item.artist || item.a,
                reason: item.reason
            }));

            // Get session history URIs to exclude already-played tracks
            const sessionUris = usePlayerStore.getState().sessionHistory.map(h => h.uri);
            const currentQueue = usePlayerStore.getState().queue.map(t => t.uri);

            // Use ValidatedQueueService for smart validation with backfill
            const validatedItems = await validatedQueueService.validateAndFill(
                suggestions,
                10, // Target 10 tracks
                {
                    type: 'expansion',
                    seedTrack,
                    vibeName: currentVibeContext
                },
                [...sessionUris, ...currentQueue] // Exclude session history + current queue
            );

            return { items: validatedItems, mood: result.mood };

        } catch (error) {
            console.error('[RecService] Expansion Failed:', error);
            return { items: [] };
        }
    }

    /**
     * Fallback generator (Spotify Top Tracks)
     */
    private async getFallbackTracks(count: number): Promise<any[]> {
        try {
            const tracks = await spotifyRemote.getUserTopTracks(count * 2, 'medium_term');
            if (!tracks || tracks.length === 0) return [];

            const shuffled = tracks.sort(() => 0.5 - Math.random()).slice(0, count);
            return shuffled.map((t: any) => ({
                title: t.name,
                artist: t.artists?.[0]?.name || 'Unknown',
                uri: t.uri,
                artwork: t.album?.images?.[0]?.url,
                reason: 'Fallback Favorite',
                type: 'track'
            }));
        } catch (e) {
            console.error('Fallback fetch failed', e);
            return [];
        }
    }

    /**
     * Record a play in the DB (Wrapper)
     */
    async recordPlay(track: any, skipped: boolean = false, context: object = {}) {
        const trackId = track.uri;
        if (!trackId) return;

        await dbService.recordPlay(
            trackId,
            track.title || track.name,
            track.artist || track.artists?.[0]?.name,
            skipped,
            context
        );
    }

    /**
     * User provides feedback on a track.
     */
    async submitFeedback(trackName: string, feedback: string) {
        console.log(`[Recommendation] Logging feedback for ${trackName}: ${feedback}`);
        await dbService.logFeedback(trackName, feedback);
    }
}

export const recommendationService = RecommendationService.getInstance();
