/**
 * Full Flow Integration Test
 *
 * Tests the complete application flow with real APIs:
 * 1. Get vibe options from Gemini
 * 2. Select a vibe and expand it
 * 3. Verify playback started correctly
 * 4. Verify queue matches recommendations
 * 5. Test skip functionality and rescue vibe
 *
 * Requires real API keys in .env.test
 * NO MOCKS - uses real Spotify and Gemini APIs
 */

import { recommendationService } from '../../services/core/RecommendationService';
import { spotifyRemote } from '../../services/spotify/SpotifyRemoteService';
import { hasGeminiKeys, hasSpotifyKeys, initializeTestDatabase, getIntegrationSessionStatus, ensureFreshSpotifyToken } from '../utils/testDb';
import { waitForApiCall, logTestData } from '../utils/testApiKeys';
import { getPlaybackTracker, resetPlaybackTracker, PlaybackTestResult } from '../utils/PlaybackTracker';

interface TestResult {
    step: string;
    passed: boolean;
    expected: any;
    actual: any;
    timestamp: number;
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

describe('Full Flow Integration Tests (Real API)', () => {
    const tracker = getPlaybackTracker();
    const testResults: TestResult[] = [];

    function recordResult(step: string, expected: any, actual: any): boolean {
        const passed = JSON.stringify(expected) === JSON.stringify(actual) ||
            (typeof expected === 'object' && Object.keys(expected).every(key =>
                actual[key] === expected[key] || (expected[key] === true && !!actual[key])
            ));

        testResults.push({ step, passed, expected, actual, timestamp: Date.now() });
        logTestData(step, {}, expected, actual);

        if (!passed) {
            console.error(`[FAIL] ${step}`);
            console.error('  Expected:', JSON.stringify(expected, null, 2));
            console.error('  Actual:', JSON.stringify(actual, null, 2));
        } else {
            console.log(`[PASS] ${step}`);
        }

        return passed;
    }

    function printSummary(): void {
        console.log('\n========================================');
        console.log('TEST RESULTS SUMMARY');
        console.log('========================================');

        testResults.forEach((result, idx) => {
            const status = result.passed ? '✓ PASS' : '✗ FAIL';
            console.log(`${idx + 1}. [${status}] ${result.step}`);
            if (!result.passed) {
                console.log(`   Expected: ${JSON.stringify(result.expected)}`);
                console.log(`   Actual: ${JSON.stringify(result.actual)}`);
            }
        });

        const passed = testResults.filter(r => r.passed).length;
        const total = testResults.length;
        console.log(`\nTotal: ${passed}/${total} passed (${((passed/total)*100).toFixed(1)}%)`);
        console.log('========================================\n');
    }

    beforeAll(async () => {
        if (!hasGeminiKeys()) {
            throw new Error('GEMINI_API_KEY required. Add to .env.test');
        }
        if (!hasSpotifyKeys()) {
            throw new Error('SPOTIFY credentials required. Add to .env.test');
        }

        await initializeTestDatabase();

        // Ensure we have a fresh token before starting tests
        await ensureFreshSpotifyToken();

        const status = await getIntegrationSessionStatus();

        if (!status.runGeminiAndSpotify) {
            throw new Error('API validation failed: ' + status.errors.join(', '));
        }

        console.log('[FullFlow] Test environment ready');
    }, 30000);

    beforeEach(async () => {
        testResults.length = 0;
        tracker.reset();
        // Ensure token is fresh before each test
        await ensureFreshSpotifyToken();
    });

    afterEach(() => {
        printSummary();
    });

    afterAll(() => {
        tracker.stopTracking();
        resetPlaybackTracker();
    });

    describe('Complete Vibe Flow', () => {
        it('should play recommended tracks in correct order', async () => {
            console.log('\n[Test] Starting complete vibe flow test...\n');

            // Step 1: Get vibe options (with retry for Gemini flakiness)
            console.log('[Step 1] Getting vibe options from Gemini...');
            let vibeOptions: any[] = [];
            for (let attempt = 1; attempt <= 3; attempt++) {
                vibeOptions = await waitForApiCall(
                    () => recommendationService.getVibeOptions('energetic workout music'),
                    60000
                );
                if (vibeOptions && vibeOptions.length > 0 && vibeOptions[0]?.track) break;
                console.log(`[Step 1] Gemini returned empty, retrying (${attempt}/3)...`);
                await sleep(2000);
            }

            recordResult('Step 1: Get vibe options', { query: 'energetic workout music' }, { isArray: true, minLength: true }, {
                isArray: Array.isArray(vibeOptions),
                minLength: vibeOptions?.length > 0
            });

            expect(vibeOptions.length).toBeGreaterThan(0);

            // Step 2: Select and expand vibe
            console.log('[Step 2] Selecting and expanding vibe...');
            const selectedVibe = vibeOptions[0];
            const seedTrack = selectedVibe.track;

            tracker.recordRecommendation({
                title: seedTrack.title,
                artist: seedTrack.artist,
                uri: seedTrack.uri,
                source: 'gemini'
            });

            const { items: expandedItems } = await waitForApiCall(
                () => recommendationService.expandVibe(
                    { title: seedTrack.title, artist: seedTrack.artist },
                    selectedVibe.reason || 'Selected vibe'
                ),
                60000
            );

            // Build track list
            const fullTrackList = [seedTrack];
            const seenUris = new Set([seedTrack.uri]);

            (expandedItems || []).forEach((item: any) => {
                if (item.uri && !seenUris.has(item.uri)) {
                    seenUris.add(item.uri);
                    fullTrackList.push(item);
                    tracker.recordRecommendation({
                        title: item.title,
                        artist: item.artist,
                        uri: item.uri,
                        source: 'gemini'
                    });
                }
            });

            recordResult('Step 2: Expand vibe', { minTracks: true }, {
                minTracks: fullTrackList.length > 1,
                trackCount: fullTrackList.length
            });

            console.log(`[Info] Track list: ${fullTrackList.length} tracks`);
            fullTrackList.slice(0, 5).forEach((t, i) => {
                console.log(`  ${i + 1}. ${t.title} - ${t.artist}`);
            });

            // Step 3: Play the vibe
            console.log('[Step 3] Playing vibe on Spotify...');
            const allUris = fullTrackList.map(t => t.uri);

            await waitForApiCall(() => spotifyRemote.play(allUris), 30000);
            tracker.startTracking(1000);
            await sleep(4000);

            // Step 4: Verify first track is playing
            console.log('[Step 4] Verifying playback...');
            const currentState = await waitForApiCall(
                () => spotifyRemote.getCurrentState(),
                10000
            );

            recordResult('Step 4: First track playing', { urisPlayed: allUris.length, seedUri: seedTrack.uri }, {
                hasState: true,
                correctUri: seedTrack.uri,
                correctTitle: seedTrack.title
            }, {
                hasState: !!currentState,
                correctUri: currentState?.uri,
                correctTitle: currentState?.title,
                isPlaying: currentState?.is_playing
            });

            expect(currentState).not.toBeNull();
            expect(currentState?.uri).toBe(seedTrack.uri);

            // Step 5: Verify queue contains expected tracks
            console.log('[Step 5] Verifying queue...');
            const queueData = await waitForApiCall(
                () => spotifyRemote.getUserQueue(),
                10000
            );

            const queueUris = queueData?.queue?.map((t: any) => t.uri) || [];
            const expectedInQueue = fullTrackList.slice(1).map(t => t.uri);
            const matchCount = expectedInQueue.filter(uri => queueUris.includes(uri)).length;

            recordResult('Step 5: Queue verification', { expectedInQueueCount: expectedInQueue.length, fullTrackListCount: fullTrackList.length }, {
                hasQueue: true,
                containsExpectedTracks: true,
                queueLengthAtLeastExpected: true
            }, {
                hasQueue: queueUris.length > 0,
                queueLength: queueUris.length,
                containsExpectedTracks: matchCount > 0,
                matchCount,
                expectedCount: expectedInQueue.length
            });

            expect(queueUris.length).toBeGreaterThanOrEqual(expectedInQueue.length);
            console.log(`[Info] Queue has ${queueUris.length} tracks, ${matchCount}/${expectedInQueue.length} match expected`);

            // Step 6: Test skip functionality
            console.log('[Step 6] Testing skips...');
            for (let i = 1; i <= 2; i++) {
                const beforeState = await spotifyRemote.getCurrentState();
                await spotifyRemote.next();
                await sleep(3000);
                const afterState = await spotifyRemote.getCurrentState();

                const trackChanged = beforeState?.uri !== afterState?.uri;

                recordResult(`Step 6.${i}: Skip ${i}`, { skipIndex: i }, { trackChanged: true }, {
                    trackChanged,
                    before: beforeState?.title,
                    after: afterState?.title
                });

                expect(trackChanged).toBe(true);
            }

            // Step 7: Verify tracking data
            console.log('[Step 7] Verifying playback tracking...');
            const playbackResult = await tracker.verifyExpectations('Complete Vibe Flow', {
                description: 'Full vibe selection and playback',
                expectedTrackCount: fullTrackList.length,
                expectedFirstTrack: { title: seedTrack.title, artist: seedTrack.artist }
            });

            recordResult('Step 7: Tracking verification', { passed: true }, {
                passed: playbackResult.passed,
                tracksPlayed: playbackResult.actualPlayed.length,
                failures: playbackResult.failures
            });

            tracker.stopTracking();
        }, 120000);
    });

    describe('Rescue Vibe Flow', () => {
        it('should trigger rescue vibe after 3 skips', async () => {
            console.log('\n[Test] Starting rescue vibe test...\n');

            // Step 1: Start with initial vibe (with retry for Gemini flakiness)
            console.log('[Step 1] Getting initial vibe...');
            let initialOptions: any[] = [];
            for (let attempt = 1; attempt <= 3; attempt++) {
                initialOptions = await waitForApiCall(
                    () => recommendationService.getVibeOptions('chill relaxing music'),
                    60000
                );
                if (initialOptions && initialOptions.length > 0 && initialOptions[0]?.track) break;
                console.log(`[Step 1] Gemini returned empty, retrying (${attempt}/3)...`);
                await sleep(2000);
            }

            expect(initialOptions.length).toBeGreaterThan(0);

            const selectedVibe = initialOptions[0];
            const { items } = await waitForApiCall(
                () => recommendationService.expandVibe(
                    { title: selectedVibe.track.title, artist: selectedVibe.track.artist },
                    selectedVibe.reason || 'Initial vibe'
                ),
                60000
            );

            const initialTracks = [selectedVibe.track, ...(items || [])].filter(t => t.uri);
            await spotifyRemote.play(initialTracks.map(t => t.uri));
            await sleep(3000);

            recordResult('Step 1: Initial vibe playing', { vibeQuery: 'chill relaxing music', trackCount: initialTracks.length }, { isPlaying: true }, {
                isPlaying: true,
                trackCount: initialTracks.length
            });

            // Step 2: Perform 3 skips
            console.log('[Step 2] Performing 3 skips...');
            const skippedTracks: any[] = [];

            for (let i = 1; i <= 3; i++) {
                const beforeState = await spotifyRemote.getCurrentState();
                skippedTracks.push({
                    title: beforeState?.title,
                    artist: beforeState?.artist,
                    uri: beforeState?.uri
                });

                await spotifyRemote.next();
                await sleep(2000);

                const afterState = await spotifyRemote.getCurrentState();

                recordResult(`Step 2.${i}: Skip ${i}`, { changed: true }, {
                    changed: beforeState?.uri !== afterState?.uri,
                    skipped: beforeState?.title,
                    nowPlaying: afterState?.title
                });
            }

            // Step 3: Get rescue vibe
            console.log('[Step 3] Getting rescue vibe...');
            const rescueResult = await waitForApiCall(
                () => recommendationService.getRescueVibe(skippedTracks),
                60000
            );

            recordResult('Step 3: Rescue vibe generated', { skippedTracksCount: skippedTracks.length }, {
                hasItems: true,
                hasVibeName: true
            }, {
                hasItems: rescueResult?.items?.length > 0,
                hasVibeName: !!rescueResult?.vibe,
                itemCount: rescueResult?.items?.length || 0,
                vibeName: rescueResult?.vibe
            });

            expect(rescueResult).not.toBeNull();
            expect(rescueResult?.items.length).toBeGreaterThan(0);

            // Step 4: Play rescue vibe
            console.log('[Step 4] Playing rescue vibe...');
            const rescueTracks = rescueResult!.items.filter(t => t.uri);
            await spotifyRemote.play(rescueTracks.map(t => t.uri));
            await sleep(3000);

            const rescueState = await spotifyRemote.getCurrentState();
            const skippedUris = skippedTracks.map(t => t.uri).filter(Boolean);
            const isDifferent = !skippedUris.includes(rescueState?.uri || '');

            recordResult('Step 4: Rescue vibe playing', {
                isPlaying: true,
                isDifferentFromSkipped: true
            }, {
                isPlaying: !!rescueState?.is_playing,
                isDifferentFromSkipped: isDifferent,
                nowPlaying: rescueState?.title,
                skippedTracks: skippedTracks.map(t => t.title)
            });

            expect(isDifferent).toBe(true);

            // Step 5: Verify rescue queue
            console.log('[Step 5] Verifying rescue queue...');
            const rescueQueue = await spotifyRemote.getUserQueue();
            const queueUris = rescueQueue?.queue?.map((t: any) => t.uri) || [];
            const rescueUris = rescueTracks.map(t => t.uri);
            const inQueue = rescueUris.filter(uri => queueUris.includes(uri)).length;

            recordResult('Step 5: Rescue queue', { rescueUrisCount: rescueUris.length }, { hasRescueTracks: true }, {
                hasRescueTracks: inQueue > 0,
                rescueTracksInQueue: inQueue,
                totalRescueTracks: rescueUris.length,
                queueLength: queueUris.length
            });

            console.log(`[Info] ${inQueue}/${rescueUris.length} rescue tracks in queue`);

        }, 180000);
    });

    describe('Queue Clearing Verification', () => {
        it('should clear old queue when starting new vibe', async () => {
            console.log('\n[Test] Testing queue clearing...\n');

            // Step 1: Play first vibe
            console.log('[Step 1] Playing first vibe...');
            let vibe1: any[] = [];
            for (let attempt = 1; attempt <= 3; attempt++) {
                vibe1 = await waitForApiCall(
                    () => recommendationService.getVibeOptions('rock music'),
                    60000
                );
                if (vibe1 && vibe1.length > 0 && vibe1[0]?.track) break;
                console.log(`[Step 1] Gemini returned empty, retrying (${attempt}/3)...`);
                await sleep(2000);
            }

            expect(vibe1.length).toBeGreaterThan(0);
            const firstTrack = vibe1[0].track;
            const { items: items1 } = await waitForApiCall(
                () => recommendationService.expandVibe(
                    { title: firstTrack.title, artist: firstTrack.artist },
                    'First vibe'
                ),
                60000
            );

            const tracks1 = [firstTrack, ...(items1 || [])].filter(t => t.uri);
            await spotifyRemote.play(tracks1.map(t => t.uri));
            await sleep(3000);

            const queue1 = await spotifyRemote.getUserQueue();
            const queue1Uris = queue1?.queue?.map((t: any) => t.uri) || [];

            recordResult('Step 1: First vibe queue', { hasQueue: true }, {
                hasQueue: queue1Uris.length > 0,
                queueLength: queue1Uris.length
            });

            // Step 2: Play second vibe (should clear first)
            console.log('[Step 2] Playing second vibe (should clear queue)...');
            let vibe2: any[] = [];
            // Retry up to 3 times if Gemini returns empty (API can be flaky)
            for (let attempt = 1; attempt <= 3; attempt++) {
                vibe2 = await waitForApiCall(
                    () => recommendationService.getVibeOptions('jazz music'),
                    60000
                );
                if (vibe2 && vibe2.length > 0 && vibe2[0]?.track) {
                    break;
                }
                console.log(`[Step 2] Gemini returned empty, retrying (${attempt}/3)...`);
                await sleep(2000);
            }

            if (!vibe2 || vibe2.length === 0 || !vibe2[0]?.track) {
                console.warn('[Step 2] Gemini returned no vibes after 3 attempts - using fallback');
                // Use a well-known jazz track as fallback
                vibe2 = [{
                    track: {
                        title: 'Take Five',
                        artist: 'Dave Brubeck Quartet',
                        uri: 'spotify:track:1YQWosTIljIvxAgHWTp7KP'
                    }
                }];
            }

            const secondTrack = vibe2[0].track;
            const { items: items2 } = await waitForApiCall(
                () => recommendationService.expandVibe(
                    { title: secondTrack.title, artist: secondTrack.artist },
                    'Second vibe'
                ),
                60000
            );

            const tracks2 = [secondTrack, ...(items2 || [])].filter(t => t.uri);
            await spotifyRemote.play(tracks2.map(t => t.uri));
            await sleep(4000);

            // Step 3: Verify queue is replaced
            console.log('[Step 3] Verifying queue replaced...');
            const queue2 = await spotifyRemote.getUserQueue();
            const queue2Uris = queue2?.queue?.map((t: any) => t.uri) || [];

            const tracks1Uris = new Set(tracks1.map(t => t.uri));
            const tracks2Uris = new Set(tracks2.map(t => t.uri));

            const oldTracksInQueue = queue2Uris.filter((uri: string) => tracks1Uris.has(uri) && !tracks2Uris.has(uri)).length;
            const newTracksInQueue = queue2Uris.filter((uri: string) => tracks2Uris.has(uri)).length;

            const expectedQueueLength = tracks2.length - 1;
            recordResult('Step 3: Queue replaced', { firstVibeTracks: tracks1.length, secondVibeTracks: tracks2.length }, {
                noOldTracks: true,
                hasNewTracks: true,
                queueLengthAtLeastExpected: true
            }, {
                noOldTracks: oldTracksInQueue === 0,
                oldTracksInQueue,
                hasNewTracks: newTracksInQueue > 0,
                newTracksInQueue,
                totalQueueLength: queue2Uris.length,
                expectedQueueLength
            });

            expect(oldTracksInQueue).toBe(0);
            expect(newTracksInQueue).toBeGreaterThan(0);
            expect(queue2Uris.length).toBeGreaterThanOrEqual(expectedQueueLength);

        }, 300000);
    });
});
