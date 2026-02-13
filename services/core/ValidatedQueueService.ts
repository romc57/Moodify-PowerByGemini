import { SpotifyErrors } from '@/services/core/ServiceError';
import { useErrorStore } from '@/stores/ErrorStore';
import { dbService } from '../database';
import { gemini } from '../gemini/GeminiService';
import { spotifyRemote } from '../spotify/SpotifyRemoteService';

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
/**
 * Track match score result
 */
interface TrackMatchScore {
    track: any;
    score: number;
    reasons: string[];
}

class ValidatedQueueService {
    private static instance: ValidatedQueueService;

    // Cache of URIs we've already seen this session (prevent duplicates)
    private seenUris: Set<string> = new Set();

    // Maximum backfill attempts to prevent infinite loops
    private readonly MAX_BACKFILL_ATTEMPTS = 2;

    // Minimum score threshold for track matching (out of 100)
    private readonly MIN_MATCH_SCORE = 65;

    private constructor() { }

    /**
     * Normalize a title for comparison
     * Removes punctuation, extra whitespace, and converts to lowercase
     */
    private normalizeTitle(title: string): string {
        return title
            .toLowerCase()
            .replace(/[^\w\s]/g, '') // Remove punctuation
            .replace(/\s+/g, ' ')    // Normalize whitespace
            .trim();
    }

    /**
     * Calculate similarity between two strings using Dice coefficient
     * Returns a value between 0 and 1
     */
    private calculateSimilarity(str1: string, str2: string): number {
        const s1 = this.normalizeTitle(str1);
        const s2 = this.normalizeTitle(str2);

        if (s1 === s2) return 1;
        if (s1.length < 2 || s2.length < 2) return 0;

        // Create bigrams
        const bigrams1 = new Set<string>();
        const bigrams2 = new Set<string>();

        for (let i = 0; i < s1.length - 1; i++) {
            bigrams1.add(s1.substring(i, i + 2));
        }
        for (let i = 0; i < s2.length - 1; i++) {
            bigrams2.add(s2.substring(i, i + 2));
        }

        // Count intersection
        let intersection = 0;
        bigrams1.forEach(bigram => {
            if (bigrams2.has(bigram)) intersection++;
        });

        return (2 * intersection) / (bigrams1.size + bigrams2.size);
    }

    /**
     * Check if a track is likely a remix, live version, or remaster
     * These are often not what the user wants
     */
    private isAlternateVersion(trackName: string): boolean {
        const lowerName = trackName.toLowerCase();
        const alternatePatterns = [
            'remix',
            'remixed',
            'live',
            'acoustic',
            'remaster',
            'remastered',
            'demo',
            'karaoke',
            'instrumental',
            'cover',
            'tribute',
            'radio edit',
            'extended',
            'club mix',
            'dub mix',
            'sped up',
            'slowed'
        ];

        return alternatePatterns.some(pattern => lowerName.includes(pattern));
    }

    /**
     * Score a Spotify search result against the target track
     *
     * Scoring system (max 100 points):
     * - Exact title match: +50 points
     * - Title contains target: +30 points
     * - Artist match: +40 points
     * - Contains remix/live/etc: -20 points
     * - Higher popularity: +5 points (for top 20%)
     */
    private scoreTrackMatch(
        result: any,
        targetTitle: string,
        targetArtist: string
    ): TrackMatchScore {
        let score = 0;
        const reasons: string[] = [];

        const resultTitle = result.name || '';
        const resultArtist = result.artists?.[0]?.name || '';

        const normalizedTarget = this.normalizeTitle(targetTitle);
        const normalizedResult = this.normalizeTitle(resultTitle);
        const normalizedTargetArtist = this.normalizeTitle(targetArtist);
        const normalizedResultArtist = this.normalizeTitle(resultArtist);

        // Title matching
        const titleSimilarity = this.calculateSimilarity(targetTitle, resultTitle);

        if (normalizedTarget === normalizedResult) {
            score += 50;
            reasons.push('exact_title');
        } else if (titleSimilarity > 0.8) {
            score += 40;
            reasons.push('high_title_similarity');
        } else if (normalizedResult.includes(normalizedTarget) || normalizedTarget.includes(normalizedResult)) {
            score += 30;
            reasons.push('title_contains');
        } else if (titleSimilarity > 0.5) {
            score += 20;
            reasons.push('moderate_title_similarity');
        }

        // Artist matching
        const artistSimilarity = this.calculateSimilarity(targetArtist, resultArtist);

        if (normalizedTargetArtist === normalizedResultArtist) {
            score += 40;
            reasons.push('exact_artist');
        } else if (artistSimilarity > 0.7) {
            score += 30;
            reasons.push('high_artist_similarity');
        } else if (
            normalizedResultArtist.includes(normalizedTargetArtist) ||
            normalizedTargetArtist.includes(normalizedResultArtist)
        ) {
            score += 25;
            reasons.push('artist_contains');
        }

        // Penalty for alternate versions (balanced to not reject valid matches)
        if (this.isAlternateVersion(resultTitle) && !this.isAlternateVersion(targetTitle)) {
            score -= 15; // Reduced from 30 to prevent rejecting exact matches
            reasons.push('alternate_version_penalty');
        }

        // Bonus for popularity (helps distinguish original from obscure covers)
        const popularity = result.popularity || 0;
        if (popularity > 70) {
            score += 10;
            reasons.push('high_popularity');
        } else if (popularity > 40) {
            score += 5;
        }

        return { track: result, score, reasons };
    }

    /**
     * Find the best matching track from search results
     * Returns null if no track meets the minimum score threshold
     */
    private findBestMatch(
        results: any[],
        targetTitle: string,
        targetArtist: string
    ): any | null {
        if (!results || results.length === 0) return null;

        const scoredResults = results.map(result =>
            this.scoreTrackMatch(result, targetTitle, targetArtist)
        );

        // Sort by score descending
        scoredResults.sort((a, b) => b.score - a.score);

        const best = scoredResults[0];

        console.log(`[ValidatedQueue] Best match for "${targetTitle}" by "${targetArtist}":`,
            `"${best.track.name}" by "${best.track.artists?.[0]?.name}" (score: ${best.score}, reasons: ${best.reasons.join(', ')})`
        );

        // Return null if below threshold
        if (best.score < this.MIN_MATCH_SCORE) {
            console.log(`[ValidatedQueue] Score ${best.score} below threshold ${this.MIN_MATCH_SCORE}`);
            return null;
        }

        return best.track;
    }

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
     * Validate a single track against Spotify using smart matching
     * Returns null if not found or no good match
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
                // Use smart matching instead of blind results[0]
                const match = this.findBestMatch(results, suggestion.title, suggestion.artist);

                if (match) {
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
            }

            // Strategy 2: Loose title search with smart matching
            console.log(`[ValidatedQueue] Exact query failed for "${suggestion.title}", trying loose search`);
            results = await spotifyRemote.search(`${cleanTitle} ${cleanArtist}`, 'track');

            if (results && results.length > 0) {
                // Use smart matching on loose results
                const match = this.findBestMatch(results, suggestion.title, suggestion.artist);

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
     *
     * Note: Parallel validation can cause race conditions with seenUris,
     * so we dedupe by URI after validation completes.
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
        const seenInBatch = new Set<string>(); // Dedupe within this batch

        for (const result of results) {
            if (result.validated) {
                // Dedupe: skip if we already have this URI in this batch
                if (seenInBatch.has(result.validated.uri)) {
                    console.log(`[ValidatedQueue] Batch dedupe: skipping duplicate ${result.validated.title}`);
                    failed.push(result.original);
                    continue;
                }
                seenInBatch.add(result.validated.uri);
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
     * Uses the public backfillRequest method for proper error handling
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
            // Use the public backfillRequest method instead of casting to any
            const { text, error } = await gemini.backfillRequest(prompt, { maxOutputTokens: 2000 });

            if (error || !text) {
                console.warn('[ValidatedQueue] Backfill request failed:', error || 'No response text');
                return [];
            }

            const cleanedText = text.replace(/```json/g, '').replace(/```/g, '').trim();

            // Use Gemini's robust parser which handles truncated/malformed JSON
            let parsed: any;
            try {
                parsed = JSON.parse(cleanedText);
            } catch {
                // Attempt to salvage: extract individual JSON objects from the text
                const objectMatches: any[] = [];
                const objectPattern = /\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g;
                let match;
                while ((match = objectPattern.exec(cleanedText)) !== null) {
                    try {
                        const obj = JSON.parse(match[0]);
                        if (obj && (obj.t || obj.title)) objectMatches.push(obj);
                    } catch { /* skip malformed */ }
                }
                if (objectMatches.length > 0) {
                    console.log(`[ValidatedQueue] Repaired backfill JSON: salvaged ${objectMatches.length} items`);
                    parsed = { items: objectMatches };
                } else {
                    throw new SyntaxError('Could not parse or repair backfill JSON');
                }
            }

            const items = Array.isArray(parsed) ? parsed : (parsed.items || []);
            return items.map((item: any) => ({
                title: item.t || item.title,
                artist: item.a || item.artist,
                reason: item.reason || 'Backfill suggestion'
            }));

        } catch (error) {
            console.warn('[ValidatedQueue] Backfill parse failed:', error);
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
     * Load exclusions for validation (URIs and text format)
     */
    private async loadExclusions(additionalExclusions: string[] = []): Promise<string[]> {
        const dailyURIs = await dbService.getDailyHistoryURIs();
        this.addToSeenUris(dailyURIs);
        this.addToSeenUris(additionalExclusions);
        return await dbService.getDailyHistory();
    }

    /**
     * Perform backfill to reach target count
     */
    private async performBackfill(
        validated: ValidatedTrack[],
        failed: RawTrackSuggestion[],
        targetCount: number,
        context: Omit<BackfillContext, 'failedTracks' | 'existingTracks'>,
        dailyExclusions: string[]
    ): Promise<ValidatedTrack[]> {
        let currentValidated = validated;
        let currentFailed = failed;
        let backfillAttempts = 0;

        while (currentValidated.length < targetCount && 
               backfillAttempts < this.MAX_BACKFILL_ATTEMPTS && 
               currentFailed.length > 0) {
            backfillAttempts++;
            const needed = targetCount - currentValidated.length;

            console.log(`[ValidatedQueue] Backfill attempt ${backfillAttempts}: need ${needed} more tracks`);

            const backfillContext: BackfillContext = {
                ...context,
                failedTracks: currentFailed,
                existingTracks: currentValidated
            };

            const backfillSuggestions = await this.getBackfillTracks(
                needed + 3, // Request extra to account for potential failures
                backfillContext,
                dailyExclusions
            );

            if (backfillSuggestions.length === 0) {
                console.log('[ValidatedQueue] Backfill returned no suggestions, stopping');
                if (currentValidated.length < targetCount) {
                    useErrorStore.getState().setError(
                        SpotifyErrors.searchFailed(`Could only find ${currentValidated.length} of ${targetCount} requested tracks`)
                    );
                }
                break;
            }

            const backfillResult = await this.validateBatch(backfillSuggestions);
            currentValidated = [...currentValidated, ...backfillResult.validated];
            currentFailed = backfillResult.failed;

            console.log(`[ValidatedQueue] After backfill: ${currentValidated.length} validated`);
        }

        return currentValidated;
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
        const dailyExclusions = await this.loadExclusions(additionalExclusions);

        console.log(`[ValidatedQueue] Starting validation. Target: ${targetCount}, Input: ${suggestions.length}`);

        const { validated, failed } = await this.validateBatch(suggestions);
        const validatedWithBackfill = await this.performBackfill(
            validated,
            failed,
            targetCount,
            context,
            dailyExclusions
        );

        const final = validatedWithBackfill.slice(0, targetCount);

        // Log final validated tracks
        console.log(`[ValidatedQueue] Final ${final.length} validated tracks:`);
        final.forEach((t, i) => {
            console.log(`  ${i + 1}. "${t.title}" - ${t.artist} [${t.uri}]`);
        });

        return final;
    }

    /**
     * Validate vibe options in parallel
     */
    private async validateOptions(options: any[]): Promise<{
        validated: any[];
        failed: any[];
    }> {
        const validatedOptions: any[] = [];
        const failedOptions: any[] = [];

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
        }

        return { validated: validatedOptions, failed: failedOptions };
    }

    /**
     * Add backfill options to validated options
     */
    private async addBackfillOptions(
        validatedOptions: any[],
        failedOptions: any[],
        targetCount: number,
        dailyExclusions: string[]
    ): Promise<any[]> {
        if (validatedOptions.length >= targetCount || failedOptions.length === 0) {
            return validatedOptions;
        }

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

        return validatedOptions;
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

        const dailyURIs = await dbService.getDailyHistoryURIs();
        this.addToSeenUris(dailyURIs);
        const dailyExclusions = await dbService.getDailyHistory();

        const { validated: validatedOptions, failed: failedOptions } = await this.validateOptions(options);

        // Early exit if we have enough
        if (validatedOptions.length >= targetCount) {
            console.log(`[ValidatedQueue] Returning ${validatedOptions.length} validated vibe options`);
            return validatedOptions.slice(0, targetCount);
        }

        const withBackfill = await this.addBackfillOptions(
            validatedOptions,
            failedOptions,
            targetCount,
            dailyExclusions
        );

        console.log(`[ValidatedQueue] Returning ${withBackfill.length} validated vibe options`);
        return withBackfill.slice(0, targetCount);
    }
}

export const validatedQueueService = ValidatedQueueService.getInstance();
