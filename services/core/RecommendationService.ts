import { dbService } from '@/services/database';
import { graphService } from '@/services/graph/GraphService';
import { usePlayerStore } from '@/stores/PlayerStore';
import { gemini } from '../gemini/GeminiService';
import { spotifyRemote } from '../spotify/SpotifyRemoteService';
import { RawTrackSuggestion, validatedQueueService } from './ValidatedQueueService';

const EXCLUSION_CACHE_TTL_MS = 30_000; // 30 seconds

export class RecommendationService {
    private static instance: RecommendationService;

    // Exclusion cache with TTL
    private exclusionCache: string[] | null = null;
    private exclusionCacheTime: number = 0;

    private constructor() { }

    static getInstance(): RecommendationService {
        if (!RecommendationService.instance) {
            RecommendationService.instance = new RecommendationService();
        }
        return RecommendationService.instance;
    }

    /** Invalidate the exclusion cache (call on vibe changes). */
    invalidateExclusionCache(): void {
        this.exclusionCache = null;
        this.exclusionCacheTime = 0;
    }

    /**
     * Get combined exclusion list from DB daily history + current session.
     * Cached for 30s to avoid rebuilding on every call.
     */
    private async getExclusions(): Promise<string[]> {
        const now = Date.now();
        if (this.exclusionCache && (now - this.exclusionCacheTime) < EXCLUSION_CACHE_TTL_MS) {
            return this.exclusionCache;
        }

        const dailyExclusions = await dbService.getDailyHistory();
        const sessionExclusions = usePlayerStore.getState().sessionHistory.map(h => `${h.title} - ${h.artist}`);
        this.exclusionCache = Array.from(new Set([...dailyExclusions, ...sessionExclusions]));
        this.exclusionCacheTime = now;
        return this.exclusionCache;
    }

    /**
     * Fetch user's top tracks as formatted favorites list
     */
    private async getFavorites(count: number, timeRange: 'short_term' | 'medium_term' | 'long_term' = 'short_term'): Promise<string[]> {
        try {
            const topTracks = await spotifyRemote.getUserTopTracks(count, timeRange);
            if (!topTracks || !Array.isArray(topTracks)) {
                return [];
            }
            return topTracks.map((t: any) => `${t.name} - ${t.artists?.[0]?.name || 'Unknown'}`);
        } catch (e) {
            console.warn('[RecService] Favorites fetch failed:', e);
            return [];
        }
    }

    /**
     * Entry Point 1: Get 8 Distinct Vibe Options (Refresh)
     * - Uses Daily Play Log for exclusions
     * - Uses Play Counts for affinity
     * - Now uses ValidatedQueueService for smart backfill
     */
    async getVibeOptions(userInstruction: string = ''): Promise<any[]> {
        try {
            this.invalidateExclusionCache(); // Fresh exclusions for new vibe selection
            const history = await dbService.getRecentHistory(20);
            const allExclusions = await this.getExclusions();
            const favorites = await this.getFavorites(10, 'short_term');

            // Fetch full taste profile from graph for richer Gemini context
            let tasteProfile: { clusterReps: { name: string; artist: string; playCount?: number }[]; topGenres?: { name: string; songCount: number }[]; recentVibes?: string[]; audioProfile?: { energy: number; valence: number; danceability: number } | null } = { clusterReps: [] };
            try {
                tasteProfile = await graphService.getTasteProfile();
            } catch (e) {
                console.warn('[RecService] Failed to fetch taste profile', e);
            }

            console.log(`[RecService] Generating Vibe Options (Excluding ${allExclusions.length} tracks)...`);

            // Request 8 options (optimized for speed - target is 8)
            const options = await gemini.getVibeOptions(
                history,
                tasteProfile,
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

            // STRICT FILTER: ensuring every option has a valid URI to prevent "wrong song" issues
            const strictOptions = verifiedOptions.filter(opt => opt.track && opt.track.uri);

            console.log(`[RecService] ValidatedQueueService returned ${verifiedOptions.length} (Strict: ${strictOptions.length}) options.`);
            return strictOptions;

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

            const allExclusions = await this.getExclusions();
            const favorites = await this.getFavorites(10, 'medium_term');

            const result = await gemini.generateRescueVibe(
                recentSkips,
                favorites,
                allExclusions
            );

            if (!result || result.items.length === 0) {
                // Smart Fallback using graph genres when Gemini fails
                console.warn('[RecService] Rescue Fallback to Graph Genre Mix');
                const fallback = await this.getGraphFallbackTracks(10);
                return {
                    items: fallback,
                    vibe: "Genre Mix (Smart Fallback)",
                    reasoning: "We couldn't reach the AI, so here's a mix based on your favorite genres."
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

            // If validation returned nothing, use graph fallback
            if (validatedItems.length === 0) {
                console.warn('[RecService] All tracks failed validation, using graph fallback');
                const fallback = await this.getGraphFallbackTracks(10);
                return {
                    items: fallback,
                    vibe: "Genre Mix (Smart Fallback)",
                    reasoning: "Couldn't find suggested tracks on Spotify, here's a mix based on your favorite genres."
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
     * - Extends a vibe by 10 tracks (Hybrid: Gemini + Graph)
     */
    async expandVibe(
        seedTrack: { title: string; artist: string },
        currentVibeContext: string
    ): Promise<{ items: any[]; mood?: string }> {
        try {
            const history = await dbService.getRecentHistory(10);
            const allExclusions = await this.getExclusions();
            const favorites = await this.getFavorites(5, 'short_term');

            console.log(`[RecService] Expanding vibe from seed: ${seedTrack.title}...`);

            // 1. Fetch Graph Neighbors
            let neighbors: { name: string; artist: string; weight: number }[] = [];
            try {
                const seedNode = await graphService.getEffectiveNode('SONG', seedTrack.title, null, { artist: seedTrack.artist });
                if (seedNode && seedNode.id) {
                    // Get more candidates than needed (e.g., 20) to filter
                    // getNeighbors returns processed objects {name, artist, weight} already
                    neighbors = await graphService.getNeighbors(seedNode.id, 20);
                }
            } catch (e) {
                console.warn('[RecService] Failed to fetch neighbors', e);
            }

            // 2. Fetch top genres for richer context
            let topGenreNames: string[] = [];
            try {
                const genres = await graphService.getTopGenres(6);
                topGenreNames = genres.map(g => g.name);
            } catch (e) {
                console.warn('[RecService] Failed to fetch top genres for expansion', e);
            }

            // 3. Call Gemini for "Discovery" (with neighbors + genres context)
            const result = await gemini.expandVibe(
                seedTrack,
                history,
                neighbors,
                favorites,
                allExclusions,
                topGenreNames
            );

            // 3. Hybrid Combination
            const suggestions: RawTrackSuggestion[] = [];

            // A. Add Gemini suggestions (Discovery)
            if (result && result.items) {
                suggestions.push(...result.items.map((item: any) => ({
                    title: item.title || item.t,
                    artist: item.artist || item.a,
                    reason: item.reason || 'Gemini Discovery'
                })));
            }

            // B. Add Graph Neighbors (Continuity/Familiarity)
            // Filter neighbors: Not in exclusion list
            const combinedExclusions = new Set(allExclusions);
            const graphCandidates = neighbors.filter(n =>
                !combinedExclusions.has(`${n.name} - ${n.artist}`)
            ).slice(0, 5); // Take top 5 valid neighbors

            suggestions.push(...graphCandidates.map(n => ({
                title: n.name,
                artist: n.artist,
                reason: `Graph Connection (Weight: ${n.weight.toFixed(1)})`
            })));

            // Get session history URIs to exclude already-played tracks
            const sessionUris = usePlayerStore.getState().sessionHistory.map(h => h.uri);
            const currentQueue = usePlayerStore.getState().queue.map(t => t.uri);

            // Use ValidatedQueueService for smart validation with backfill
            // It will prioritize suggestions order. Gemini first (Discovery), then Graph (Familiarity).
            const validatedItems = await validatedQueueService.validateAndFill(
                suggestions,
                10, // Target 10 tracks
                {
                    type: 'expansion',
                    seedTrack,
                    vibeName: currentVibeContext
                },
                [...sessionUris, ...currentQueue]
            );

            return { items: validatedItems, mood: result.mood };

        } catch (error) {
            console.error('[RecService] Expansion Failed:', error);
            // Use graph fallback instead of returning empty
            try {
                const fallback = await this.getGraphFallbackTracks(10);
                if (fallback.length > 0) {
                    console.log(`[RecService] Expansion recovered with ${fallback.length} graph fallback tracks`);
                    return { items: fallback, mood: 'Genre Mix (Smart Fallback)' };
                }
            } catch (fallbackError) {
                console.error('[RecService] Expansion graph fallback also failed:', fallbackError);
            }
            return { items: [] };
        }
    }

    /**
     * Fisher-Yates shuffle algorithm (unbiased)
     */
    private shuffleArray<T>(array: T[]): T[] {
        const result = [...array];
        for (let i = result.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [result[i], result[j]] = [result[j], result[i]];
        }
        return result;
    }

    /**
     * Graph-aware fallback: uses local genre data + Spotify recommendations
     * when Gemini is unavailable (429, parse errors, network issues).
     *
     * Cascade: Graph genres → Graph songs (60%) + Spotify recs (40%) → Top tracks → []
     */
    private async getGraphFallbackTracks(count: number): Promise<any[]> {
        try {
            // 1. Build exclusion set
            const allExclusions = await this.getExclusions();
            const sessionUris = new Set(
                usePlayerStore.getState().sessionHistory.map(h => h.uri)
            );
            const excludeUris = new Set([...sessionUris]);

            // 2. Get top genres from graph
            const topGenres = await graphService.getTopGenres(10);

            if (topGenres.length === 0) {
                console.log('[RecService] Graph empty, falling back to top tracks');
                return this.getTopTracksFallback(count);
            }

            const genreNames = topGenres.slice(0, 5).map(g => g.name);
            console.log(`[RecService] Graph fallback using genres: ${genreNames.join(', ')}`);

            const items: any[] = [];

            // 3. Graph songs (~60% of target)
            const graphTarget = Math.ceil(count * 0.6);
            const graphSongs = await graphService.getSongsByGenres(genreNames, graphTarget * 2, excludeUris);

            // Filter against string exclusions (daily history uses "title - artist" format)
            const exclusionSet = new Set(allExclusions);
            const filteredGraphSongs = graphSongs.filter(s => {
                const data = typeof s.data === 'string' ? JSON.parse(s.data || '{}') : (s.data || {});
                return !exclusionSet.has(`${s.name} - ${data.artist || 'Unknown'}`);
            });

            const selectedGraphSongs = this.shuffleArray(filteredGraphSongs).slice(0, graphTarget);
            for (const song of selectedGraphSongs) {
                const data = typeof song.data === 'string' ? JSON.parse(song.data || '{}') : (song.data || {});
                items.push({
                    title: song.name,
                    artist: data.artist || 'Unknown',
                    uri: song.spotify_id?.startsWith('spotify:') ? song.spotify_id : `spotify:track:${song.spotify_id}`,
                    reason: 'Graph Genre Match',
                    type: 'track'
                });
            }

            // 4. Spotify recommendations seeded by graph genres + some seed tracks (~40%)
            const discoveryTarget = count - items.length;
            if (discoveryTarget > 0) {
                try {
                    const seedTrackIds = selectedGraphSongs
                        .slice(0, 2)
                        .map(s => s.spotify_id?.replace('spotify:track:', '') || '')
                        .filter(Boolean);
                    // Spotify allows max 5 seeds total (tracks + genres)
                    const seedGenres = genreNames.slice(0, 5 - seedTrackIds.length);

                    const recsRaw = await spotifyRemote.getRecommendations(seedTrackIds, seedGenres, discoveryTarget * 2);
                    const recs = (recsRaw || [])
                        .filter((t: any) => t.uri && !excludeUris.has(t.uri) && !exclusionSet.has(`${t.name} - ${t.artists?.[0]?.name || 'Unknown'}`))
                        .slice(0, discoveryTarget);

                    for (const t of recs) {
                        items.push({
                            title: t.name,
                            artist: t.artists?.[0]?.name || 'Unknown',
                            uri: t.uri,
                            artwork: t.album?.images?.[0]?.url,
                            reason: 'Genre Discovery',
                            type: 'track'
                        });
                    }
                } catch (e) {
                    console.warn('[RecService] Spotify recommendations failed in fallback:', e);
                }
            }

            // 5. Fill remaining with top tracks if still short
            if (items.length < count) {
                const fill = await this.getTopTracksFallback(count - items.length);
                items.push(...fill);
            }

            console.log(`[RecService] Graph fallback produced ${items.length} tracks (${selectedGraphSongs.length} graph, ${items.length - selectedGraphSongs.length} discovery/fill)`);
            return items;
        } catch (e) {
            console.error('[RecService] Graph fallback failed, using top tracks:', e);
            return this.getTopTracksFallback(count);
        }
    }

    /**
     * Simple top tracks fallback (original behavior, used as safety net)
     */
    private async getTopTracksFallback(count: number): Promise<any[]> {
        try {
            const tracks = await spotifyRemote.getUserTopTracks(count * 2, 'medium_term');
            if (!tracks || tracks.length === 0) return [];

            const shuffled = this.shuffleArray(tracks).slice(0, count);
            return shuffled.map((t: any) => ({
                title: t.name,
                artist: t.artists?.[0]?.name || 'Unknown',
                uri: t.uri,
                artwork: t.album?.images?.[0]?.url,
                reason: 'Fallback Favorite',
                type: 'track'
            }));
        } catch (e) {
            console.error('Top tracks fallback fetch failed', e);
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
