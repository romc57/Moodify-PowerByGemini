import { spotifyRemote } from '../spotify/SpotifyRemoteService';
import { gemini } from '../gemini/GeminiService';
import { dbService } from '../database/DatabaseService';

/**
 * Track suggestion from Gemini (before Spotify validation)
 */
export interface RawTrackSuggestion {
    title: string;
    artist: string;
    query?: string;
    reason?: string;
    type?: string;
}

/**
 * Validated track (after Spotify verification)
 */
export interface ValidatedTrack {
    title: string;
    artist: string;
    uri: string;
    artwork?: string;
    reason?: string;
    originalSuggestion?: string;
}

/**
 * Validation result for a single track
 */
interface ValidationResult {
    original: RawTrackSuggestion;
    validated: ValidatedTrack | null;
    success: boolean;
}

/**
 * Context for backfill requests
 */
export interface BackfillContext {
    type: 'vibe_options' | 'expansion' | 'rescue';
    seedTrack?: { title: string; artist: string };
    vibeName?: string;
    failedTracks: RawTrackSuggestion[];
    existingTracks: ValidatedTrack[];
}

/**
 * ValidatedQueueService
 *
 * Smart queue filler that:
 * 1. Validates Gemini suggestions against Spotify
 * 2. Tracks failures
 * 3. Requests backfill to meet target count
 * 4. Ensures no duplicates
 */
class ValidatedQueueService {
    private static instance: ValidatedQueueService;

    // Cache of URIs we've already seen this session (prevent duplicates)
    private seenUris: Set<string> = new Set();

    // Maximum backfill attempts to prevent infinite loops
    private readonly MAX_BACKFILL_ATTEMPTS = 2;

    private constructor() {}

    static getInstance(): ValidatedQueueService {
        if (!ValidatedQueueService.instance) {
            ValidatedQueueService.instance = new ValidatedQueueService();
        }
        return ValidatedQueueService.instance;
    }

    /**
     * Clear seen URIs (call when starting new session)
     */
    clearSession(): void {
        this.seenUris.clear();
    }

    /**
     * Add URIs to seen set (from external sources like DB history)
     */
    addToSeenUris(uris: string[]): void {
        uris.forEach(uri => this.seenUris.add(uri));
    }

    /**
     * Validate a single track against Spotify
     * Returns null if not found
     */
    async validateTrack(suggestion: RawTrackSuggestion): Promise<ValidatedTrack | null> {
        try {
            // Build search query with field filters for accuracy
            const cleanTitle = suggestion.title.replace(/[:"]/g, '');
            const cleanArtist = suggestion.artist.replace(/[:"]/g, '');

            // Strategy 1: Exact match with field filters
            let query = `track:"${cleanTitle}" artist:"${cleanArtist}"`;
            let results = await spotifyRemote.search(query, 'track');

            if (results && results.length > 0) {
                const match = results[0];
                const uri = match.uri;

                // Check for duplicates
                if (this.seenUris.has(uri)) {
                    console.log(`[ValidatedQueue] Duplicate skipped: ${suggestion.title}`);
                    return null;
                }

                this.seenUris.add(uri);
                return {
                    title: match.name,
                    artist: match.artists?.[0]?.name || 'Unknown',
                    uri: uri,
                    artwork: match.album?.images?.[0]?.url,
                    reason: suggestion.reason,
                    originalSuggestion: `${suggestion.title} by ${suggestion.artist}`
                };
            }

            // Strategy 2: Loose title search with artist verification
            console.log(`[ValidatedQueue] Exact match failed for "${suggestion.title}", trying loose search`);
            results = await spotifyRemote.search(suggestion.title, 'track');

            if (results && results.length > 0) {
                // Find a result where artist name partially matches
                const match = results.find((t: any) =>
                    t.artists.some((a: any) =>
                        a.name.toLowerCase().includes(suggestion.artist.toLowerCase()) ||
                        suggestion.artist.toLowerCase().includes(a.name.toLowerCase())
                    )
                );

                if (match) {
                    const uri = match.uri;

                    if (this.seenUris.has(uri)) {
                        console.log(`[ValidatedQueue] Duplicate skipped: ${suggestion.title}`);
                        return null;
                    }

                    this.seenUris.add(uri);
                    return {
                        title: match.name,
                        artist: match.artists?.[0]?.name || 'Unknown',
                        uri: uri,
                        artwork: match.album?.images?.[0]?.url,
                        reason: suggestion.reason,
                        originalSuggestion: `${suggestion.title} by ${suggestion.artist}`
                    };
                }
            }

            console.log(`[ValidatedQueue] No match found for: ${suggestion.title} by ${suggestion.artist}`);
            return null;

        } catch (error) {
            console.warn(`[ValidatedQueue] Validation error for ${suggestion.title}:`, error);
            return null;
        }
    }

    /**
     * Validate multiple tracks in parallel
     * Returns both validated tracks and failed suggestions
     */
    async validateBatch(suggestions: RawTrackSuggestion[]): Promise<{
        validated: ValidatedTrack[];
        failed: RawTrackSuggestion[];
    }> {
        const results = await Promise.all(
            suggestions.map(async (s) => ({
                original: s,
                validated: await this.validateTrack(s),
                success: false // will be set below
            }))
        );

        const validated: ValidatedTrack[] = [];
        const failed: RawTrackSuggestion[] = [];

        for (const result of results) {
            if (result.validated) {
                result.success = true;
                validated.push(result.validated);
            } else {
                failed.push(result.original);
            }
        }

        console.log(`[ValidatedQueue] Batch result: ${validated.length} valid, ${failed.length} failed`);
        return { validated, failed };
    }

    /**
     * Get backfill tracks from Gemini to replace failed validations
     */
    async getBackfillTracks(
        count: number,
        context: BackfillContext,
        excludeTracks: string[] = []
    ): Promise<RawTrackSuggestion[]> {
        // Build a focused prompt for backfill
        const failedNames = context.failedTracks
            .map(t => `${t.title} - ${t.artist}`)
            .slice(0, 10)
            .join('; ');

        const existingNames = context.existingTracks
            .map(t => `${t.title} - ${t.artist}`)
            .slice(0, 10)
            .join('; ');

        const prompt = this.buildBackfillPrompt(count, context, failedNames, existingNames, excludeTracks);

        try {
            const apiKey = await dbService.getPreference('gemini_api_key');
            if (!apiKey) return [];

            const response = await (gemini as any).makeRequest(apiKey, prompt, { maxOutputTokens: 2000 });
            const text = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;

            if (!text) return [];

            const cleanedText = text.replace(/```json/g, '').replace(/```/g, '').trim();
            const parsed = JSON.parse(cleanedText);

            return (parsed.items || []).map((item: any) => ({
                title: item.t || item.title,
                artist: item.a || item.artist,
                reason: item.reason || 'Backfill suggestion'
            }));

        } catch (error) {
            console.warn('[ValidatedQueue] Backfill request failed:', error);
            return [];
        }
    }

    /**
     * Build optimized backfill prompt
     */
    private buildBackfillPrompt(
        count: number,
        context: BackfillContext,
        failedNames: string,
        existingNames: string,
        excludeTracks: string[]
    ): string {
        const excludeText = excludeTracks.slice(0, 30).join(', ');

        let contextText = '';
        if (context.type === 'expansion' && context.seedTrack) {
            contextText = `Matching vibe of: ${context.seedTrack.title} - ${context.seedTrack.artist}`;
        } else if (context.type === 'rescue') {
            contextText = `New direction vibe: ${context.vibeName || 'Fresh start'}`;
        } else {
            contextText = 'Diverse vibe options';
        }

        return `
JSON only. Need ${count} more tracks. These failed Spotify search - suggest ALTERNATIVES (different songs, same vibe).

Failed: ${failedNames}
Already have: ${existingNames}
Context: ${contextText}
Skip: ${excludeText}

Pick well-known tracks that definitely exist on Spotify. Major label artists preferred.

{"items":[{"t":"Title","a":"Artist"}]}`.trim();
    }

    /**
     * MAIN ENTRY POINT: Validate and fill queue to target count
     *
     * This is the smart function that:
     * 1. Validates initial suggestions
     * 2. Tracks failures
     * 3. Requests backfill if needed
     * 4. Returns exactly targetCount tracks (or as many as possible)
     */
    async validateAndFill(
        suggestions: RawTrackSuggestion[],
        targetCount: number,
        context: Omit<BackfillContext, 'failedTracks' | 'existingTracks'>,
        additionalExclusions: string[] = []
    ): Promise<ValidatedTrack[]> {
        // Load daily exclusions + any additional (like session history)
        const dailyExclusions = await dbService.getDailyHistory();
        this.addToSeenUris(dailyExclusions);
        this.addToSeenUris(additionalExclusions);

        console.log(`[ValidatedQueue] Starting validation. Target: ${targetCount}, Input: ${suggestions.length}`);

        // Initial validation
        let { validated, failed } = await this.validateBatch(suggestions);

        // Backfill loop if we don't have enough
        let backfillAttempts = 0;

        while (validated.length < targetCount && backfillAttempts < this.MAX_BACKFILL_ATTEMPTS && failed.length > 0) {
            backfillAttempts++;
            const needed = targetCount - validated.length;

            console.log(`[ValidatedQueue] Backfill attempt ${backfillAttempts}: need ${needed} more tracks`);

            const backfillContext: BackfillContext = {
                ...context,
                failedTracks: failed,
                existingTracks: validated
            };

            // Request more tracks from Gemini
            const backfillSuggestions = await this.getBackfillTracks(
                needed + 3, // Request extra to account for potential failures
                backfillContext,
                dailyExclusions
            );

            if (backfillSuggestions.length === 0) {
                console.log('[ValidatedQueue] Backfill returned no suggestions, stopping');
                break;
            }

            // Validate backfill
            const backfillResult = await this.validateBatch(backfillSuggestions);
            validated = [...validated, ...backfillResult.validated];
            failed = backfillResult.failed;

            console.log(`[ValidatedQueue] After backfill: ${validated.length} validated`);
        }

        // Trim to exact target count
        const final = validated.slice(0, targetCount);
        console.log(`[ValidatedQueue] Final result: ${final.length}/${targetCount} tracks`);

        return final;
    }

    /**
     * Convenience method for vibe options (returns options with validated seed tracks)
     * Now targets 8 minimum from 16 input options
     */
    async validateVibeOptions(
        options: any[],
        targetCount: number = 8
    ): Promise<any[]> {
        console.log(`[ValidatedQueue] Validating ${options.length} vibe options, target: ${targetCount} minimum`);

        const dailyExclusions = await dbService.getDailyHistory();
        this.addToSeenUris(dailyExclusions);

        const validatedOptions: any[] = [];
        const failedOptions: any[] = [];

        // Validate each option's seed track in parallel
        const results = await Promise.all(
            options.map(async (opt) => {
                const suggestion: RawTrackSuggestion = {
                    title: opt.track?.title || opt.track?.t,
                    artist: opt.track?.artist || opt.track?.a,
                    reason: opt.reason
                };

                const validated = await this.validateTrack(suggestion);
                return { option: opt, validated };
            })
        );

        for (const { option, validated } of results) {
            if (validated) {
                validatedOptions.push({
                    ...option,
                    track: {
                        title: validated.title,
                        artist: validated.artist,
                        uri: validated.uri,
                        artwork: validated.artwork
                    }
                });
            } else {
                failedOptions.push(option);
            }

            if (validatedOptions.length >= targetCount) break;
        }

        // If we don't have enough, request backfill options
        if (validatedOptions.length < targetCount && failedOptions.length > 0) {
            console.log(`[ValidatedQueue] Need ${targetCount - validatedOptions.length} more vibe options`);

            const backfillSuggestions = await this.getBackfillTracks(
                (targetCount - validatedOptions.length) + 2,
                {
                    type: 'vibe_options',
                    failedTracks: failedOptions.map(o => ({
                        title: o.track?.title,
                        artist: o.track?.artist
                    })),
                    existingTracks: validatedOptions.map(o => ({
                        title: o.track.title,
                        artist: o.track.artist,
                        uri: o.track.uri
                    }))
                },
                dailyExclusions
            );

            // Validate and add backfill options
            for (const suggestion of backfillSuggestions) {
                if (validatedOptions.length >= targetCount) break;

                const validated = await this.validateTrack(suggestion);
                if (validated) {
                    validatedOptions.push({
                        id: `backfill_${validatedOptions.length}`,
                        title: `${validated.artist} Vibes`,
                        description: 'Alternative suggestion',
                        track: {
                            title: validated.title,
                            artist: validated.artist,
                            uri: validated.uri,
                            artwork: validated.artwork
                        },
                        reason: 'Backfill option'
                    });
                }
            }
        }

        console.log(`[ValidatedQueue] Returning ${validatedOptions.length} validated vibe options`);
        return validatedOptions.slice(0, targetCount);
    }
}

export const validatedQueueService = ValidatedQueueService.getInstance();
