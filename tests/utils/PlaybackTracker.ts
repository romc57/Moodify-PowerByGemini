/**
 * Playback Tracker
 *
 * Tracks what Gemini recommends vs what Spotify actually plays.
 * Used for integration tests to verify end-to-end flow.
 */

import axios from 'axios';
import { loadTestApiKeys } from './testApiKeys';

export interface RecommendedTrack {
    title: string;
    artist: string;
    uri?: string;
    source: 'gemini' | 'backfill' | 'fallback';
    timestamp: number;
}

export interface PlayedTrack {
    title: string;
    artist: string;
    uri: string;
    playedAt: number;
    durationMs: number;
    listenedMs: number;
    wasSkipped: boolean;
}

export interface TestExpectation {
    description: string;
    expectedTrackCount: number;
    expectedFirstTrack?: { title: string; artist: string };
    expectedVibeContext?: string;
}

export interface PlaybackTestResult {
    testName: string;
    timestamp: number;
    expectations: TestExpectation;
    recommendations: RecommendedTrack[];
    actualPlayed: PlayedTrack[];
    queueState: { uri: string; title: string; artist: string }[];
    passed: boolean;
    failures: string[];
    summary: string;
}

/**
 * Playback Tracker class for test verification
 */
export class PlaybackTracker {
    private recommendations: RecommendedTrack[] = [];
    private played: PlayedTrack[] = [];
    private testResults: PlaybackTestResult[] = [];
    private spotifyToken: string;
    private pollingInterval: NodeJS.Timeout | null = null;
    private lastTrackUri: string | null = null;
    private lastTrackStartTime: number = 0;

    constructor() {
        const keys = loadTestApiKeys();
        this.spotifyToken = keys.spotifyAccessToken || '';
    }

    /**
     * Record a recommendation from Gemini
     */
    recordRecommendation(track: Omit<RecommendedTrack, 'timestamp'>): void {
        this.recommendations.push({
            ...track,
            timestamp: Date.now()
        });
        console.log(`[PlaybackTracker] Recorded recommendation: ${track.title} by ${track.artist} (${track.source})`);
    }

    /**
     * Record multiple recommendations
     */
    recordRecommendations(tracks: Omit<RecommendedTrack, 'timestamp'>[]): void {
        tracks.forEach(t => this.recordRecommendation(t));
    }

    /**
     * Get current Spotify playback state
     */
    async getCurrentPlayback(): Promise<{
        isPlaying: boolean;
        track: { title: string; artist: string; uri: string; durationMs: number; progressMs: number } | null;
    }> {
        if (!this.spotifyToken) {
            return { isPlaying: false, track: null };
        }

        try {
            const response = await axios.get('https://api.spotify.com/v1/me/player', {
                headers: { Authorization: `Bearer ${this.spotifyToken}` },
                timeout: 5000,
                validateStatus: (status) => status < 500
            });

            if (response.status === 204 || !response.data?.item) {
                return { isPlaying: false, track: null };
            }

            const item = response.data.item;
            return {
                isPlaying: response.data.is_playing,
                track: {
                    title: item.name,
                    artist: item.artists?.[0]?.name || 'Unknown',
                    uri: item.uri,
                    durationMs: item.duration_ms,
                    progressMs: response.data.progress_ms
                }
            };
        } catch (e) {
            console.warn('[PlaybackTracker] Failed to get playback state');
            return { isPlaying: false, track: null };
        }
    }

    /**
     * Get Spotify queue
     */
    async getQueue(): Promise<{ uri: string; title: string; artist: string }[]> {
        if (!this.spotifyToken) return [];

        try {
            const response = await axios.get('https://api.spotify.com/v1/me/player/queue', {
                headers: { Authorization: `Bearer ${this.spotifyToken}` },
                timeout: 5000
            });

            if (!response.data?.queue) return [];

            return response.data.queue.map((item: any) => ({
                uri: item.uri,
                title: item.name,
                artist: item.artists?.[0]?.name || 'Unknown'
            }));
        } catch (e) {
            return [];
        }
    }

    /**
     * Start polling Spotify for track changes
     */
    startTracking(intervalMs: number = 1000): void {
        this.stopTracking();

        this.pollingInterval = setInterval(async () => {
            const { isPlaying, track } = await this.getCurrentPlayback();

            if (!track) return;

            // Track changed
            if (this.lastTrackUri && this.lastTrackUri !== track.uri) {
                const listenedMs = Date.now() - this.lastTrackStartTime;
                const lastPlayed = this.played.find(p => p.uri === this.lastTrackUri);

                if (lastPlayed) {
                    lastPlayed.listenedMs = listenedMs;
                    lastPlayed.wasSkipped = listenedMs < lastPlayed.durationMs * 0.8;
                }
            }

            // New track
            if (track.uri !== this.lastTrackUri) {
                this.lastTrackUri = track.uri;
                this.lastTrackStartTime = Date.now();

                this.played.push({
                    title: track.title,
                    artist: track.artist,
                    uri: track.uri,
                    playedAt: Date.now(),
                    durationMs: track.durationMs,
                    listenedMs: 0,
                    wasSkipped: false
                });

                console.log(`[PlaybackTracker] Now playing: ${track.title} by ${track.artist}`);
            }
        }, intervalMs);

        console.log('[PlaybackTracker] Started tracking playback');
    }

    /**
     * Stop tracking
     */
    stopTracking(): void {
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
            this.pollingInterval = null;
        }
    }

    /**
     * Verify test expectations and generate result
     */
    async verifyExpectations(
        testName: string,
        expectations: TestExpectation
    ): Promise<PlaybackTestResult> {
        const failures: string[] = [];
        const queueState = await this.getQueue();
        const { track: currentTrack } = await this.getCurrentPlayback();

        // Check track count
        const totalTracks = this.played.length + queueState.length + (currentTrack ? 1 : 0);
        if (expectations.expectedTrackCount > 0) {
            if (totalTracks < expectations.expectedTrackCount) {
                failures.push(
                    `Expected ${expectations.expectedTrackCount} tracks, got ${totalTracks}`
                );
            }
        }

        // Check first track
        if (expectations.expectedFirstTrack && this.played.length > 0) {
            const firstPlayed = this.played[0];
            const titleMatch = this.normalizeString(firstPlayed.title)
                .includes(this.normalizeString(expectations.expectedFirstTrack.title));
            const artistMatch = this.normalizeString(firstPlayed.artist)
                .includes(this.normalizeString(expectations.expectedFirstTrack.artist));

            if (!titleMatch && !artistMatch) {
                failures.push(
                    `Expected first track "${expectations.expectedFirstTrack.title}" by "${expectations.expectedFirstTrack.artist}", ` +
                    `got "${firstPlayed.title}" by "${firstPlayed.artist}"`
                );
            }
        }

        // Check recommendations were played
        const recommendedUris = new Set(this.recommendations.map(r => r.uri).filter(Boolean));
        const playedUris = new Set(this.played.map(p => p.uri));
        const queueUris = new Set(queueState.map(q => q.uri));

        let matchedRecommendations = 0;
        recommendedUris.forEach(uri => {
            if (uri && (playedUris.has(uri) || queueUris.has(uri))) {
                matchedRecommendations++;
            }
        });

        if (recommendedUris.size > 0 && matchedRecommendations < recommendedUris.size * 0.5) {
            failures.push(
                `Only ${matchedRecommendations}/${recommendedUris.size} recommended tracks were played/queued`
            );
        }

        const result: PlaybackTestResult = {
            testName,
            timestamp: Date.now(),
            expectations,
            recommendations: [...this.recommendations],
            actualPlayed: [...this.played],
            queueState,
            passed: failures.length === 0,
            failures,
            summary: this.generateSummary(failures)
        };

        this.testResults.push(result);
        this.logResult(result);

        return result;
    }

    private normalizeString(str: string): string {
        return str.toLowerCase().replace(/[^\w\s]/g, '').trim();
    }

    private generateSummary(failures: string[]): string {
        if (failures.length === 0) {
            return `PASSED: ${this.played.length} tracks played, ${this.recommendations.length} recommended`;
        }
        return `FAILED: ${failures.join('; ')}`;
    }

    private logResult(result: PlaybackTestResult): void {
        console.log('\n========================================');
        console.log(`TEST: ${result.testName}`);
        console.log(`STATUS: ${result.passed ? 'PASSED' : 'FAILED'}`);
        console.log('----------------------------------------');
        console.log('EXPECTATIONS:');
        console.log(JSON.stringify(result.expectations, null, 2));
        console.log('----------------------------------------');
        console.log('RECOMMENDATIONS:');
        result.recommendations.forEach((r, i) => {
            console.log(`  ${i + 1}. ${r.title} - ${r.artist} (${r.source})`);
        });
        console.log('----------------------------------------');
        console.log('ACTUALLY PLAYED:');
        result.actualPlayed.forEach((p, i) => {
            const status = p.wasSkipped ? 'SKIPPED' : 'PLAYED';
            console.log(`  ${i + 1}. ${p.title} - ${p.artist} [${status}]`);
        });
        console.log('----------------------------------------');
        console.log('CURRENT QUEUE:');
        result.queueState.forEach((q, i) => {
            console.log(`  ${i + 1}. ${q.title} - ${q.artist}`);
        });
        console.log('----------------------------------------');
        if (result.failures.length > 0) {
            console.log('FAILURES:');
            result.failures.forEach(f => console.log(`  - ${f}`));
        }
        console.log(`SUMMARY: ${result.summary}`);
        console.log('========================================\n');
    }

    /**
     * Reset tracker for new test
     */
    reset(): void {
        this.recommendations = [];
        this.played = [];
        this.lastTrackUri = null;
        this.lastTrackStartTime = 0;
    }

    /**
     * Get all test results
     */
    getResults(): PlaybackTestResult[] {
        return [...this.testResults];
    }

    /**
     * Export results as JSON
     */
    exportResults(): string {
        return JSON.stringify({
            exportedAt: new Date().toISOString(),
            totalTests: this.testResults.length,
            passed: this.testResults.filter(r => r.passed).length,
            failed: this.testResults.filter(r => !r.passed).length,
            results: this.testResults
        }, null, 2);
    }
}

/**
 * Singleton instance for use across tests
 */
let trackerInstance: PlaybackTracker | null = null;

export function getPlaybackTracker(): PlaybackTracker {
    if (!trackerInstance) {
        trackerInstance = new PlaybackTracker();
    }
    return trackerInstance;
}

export function resetPlaybackTracker(): void {
    if (trackerInstance) {
        trackerInstance.stopTracking();
        trackerInstance.reset();
    }
    trackerInstance = null;
}
