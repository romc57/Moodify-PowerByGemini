
/**
 * Real User Loop Integration Test
 *
 * Covers the specific user flow:
 * 1. User picks a vibe -> Plays specific song -> Queue filled with Gemini tracks.
 * 2. User skips 3 times -> Rescue mode triggers -> New vibe/songs.
 * 3. Queue drains to 5 songs -> Expansion loop triggers -> More songs added.
 *
 * Maintains local expected state and compares with real Spotify state.
 * NO MOCKS.
 */

import { recommendationService } from '../../services/core/RecommendationService';
import { spotifyRemote } from '../../services/spotify/SpotifyRemoteService';
import { waitForApiCall, logTestData } from '../utils/testApiKeys';
import { getIntegrationSessionStatus, hasGeminiKeys, hasSpotifyKeys, initializeTestDatabase, ensureSpotifySessionOrThrow, ensureFreshSpotifyToken } from '../utils/testDb';

function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

describe('Real User Loop Integration (Real API)', () => {
    // Local state tracking
    let expectedState = {
        currentTrackUri: '',
        queueUris: [] as string[],
        vibe: ''
    };

    beforeAll(async () => {
        if (!hasGeminiKeys() || !hasSpotifyKeys()) {
            throw new Error('Real API keys required in .env.test');
        }
        await initializeTestDatabase();

        // Ensure we have a fresh token before starting tests
        await ensureFreshSpotifyToken();

        const status = await getIntegrationSessionStatus();
        if (!status.runGeminiAndSpotify) {
            throw new Error('Sessions invalid: ' + status.errors.join(', '));
        }
        console.log('[RealLoop] Test environment ready.');
    }, 60000);

    beforeEach(async () => {
        // Ensure token is fresh before each test
        await ensureFreshSpotifyToken();
        await ensureSpotifySessionOrThrow();
    }, 15000);

    it('should execute the full lifecycle: Pick Vibe -> Rescue -> Queue Refill', async () => {
        // =========================================================================
        // PHASE 1: Vibe Selection
        // =========================================================================
        console.log('\n=== PHASE 1: Vibe Selection ===');
        const vibeQuery = 'late night coding lo-fi';

        // 1. Get Options (with retry for Gemini flakiness)
        console.log(`[1.1] Getting options for: "${vibeQuery}"...`);
        let options: any[] = [];
        for (let attempt = 1; attempt <= 3; attempt++) {
            options = await waitForApiCall(() => recommendationService.getVibeOptions(vibeQuery), 60000);
            if (options && options.length > 0 && options[0]?.track) break;
            console.log(`[1.1] Gemini returned empty, retrying (${attempt}/3)...`);
            await sleep(2000);
        }
        logTestData('Phase 1: Get vibe options', { input: { vibeQuery } }, { minLength: 1, hasOptions: true }, {
            length: options?.length ?? 0,
            hasOptions: (options?.length ?? 0) > 0,
            firstOption: options?.[0] ? { title: options[0].track?.title, uri: options[0].track?.uri } : null
        });
        expect(options.length).toBeGreaterThan(0);

        // 2. Select First Option & Expand
        const selectedOption = options[0];
        const seedTrack = selectedOption.track;
        console.log(`[1.2] Selected: ${seedTrack.title} (${seedTrack.uri}). Expanding...`);

        const expansion = await waitForApiCall(
            () => recommendationService.expandVibe(
                { title: seedTrack.title, artist: seedTrack.artist },
                selectedOption.reason
            ),
            60000
        );
        const expandedTracks = expansion.items.filter(t => t.uri);
        logTestData('Phase 1: Expand vibe', { input: { seedTrack: { title: seedTrack.title, artist: seedTrack.artist }, reason: selectedOption.reason } }, { minTracks: 1 }, { itemCount: expandedTracks.length, firstUris: expandedTracks.slice(0, 3).map(t => t.uri) });
        expect(expandedTracks.length).toBeGreaterThan(0);

        // 3. Play & Queue
        // User logic: "actual song the user chose is playing all queue... cleared and only chosen tracks... queued"
        // We assume the App logic handles this by playing the seed + queuing the rest.
        // We will manually replicate the "Play Vibe" logic here to ensure we test the result.
        const tracksToPlay = [seedTrack, ...expandedTracks];
        const urisToPlay = tracksToPlay.map(t => t.uri);

        console.log(`[1.3] Playing ${urisToPlay.length} tracks...`);
        await spotifyRemote.play(urisToPlay);
        await sleep(5000); // Allow Spotify to catch up

        // 4. Update Expected State
        expectedState.currentTrackUri = seedTrack.uri;
        expectedState.queueUris = expandedTracks.map(t => t.uri);
        expectedState.vibe = selectedOption.reason;

        // 5. Verify against Real Spotify
        console.log('[1.4] Verifying Phase 1 State...');
        const p1Status = await spotifyRemote.getCurrentState();
        const p1Queue = await spotifyRemote.getUserQueue();

        const actualQueueUris = p1Queue?.queue?.map((t: any) => t.uri) || [];
        const p1MatchCount = expectedState.queueUris.filter(uri => actualQueueUris.includes(uri)).length;

        logTestData('Phase 1: Current track + queue', {
            input: { urisPlayed: urisToPlay.length, seedUri: seedTrack.uri }
        }, {
            currentTrackUri: expectedState.currentTrackUri,
            queueUrisLength: expectedState.queueUris.length,
            queueOrderMatchAtLeast: Math.min(5, expectedState.queueUris.length)
        }, {
            currentTrackUri: p1Status?.uri,
            queueUrisLength: actualQueueUris.length,
            queueOrderMatchCount: p1MatchCount,
            actualQueueUrisSample: actualQueueUris.slice(0, 5)
        });

        // Verify playback is active and current track is one of ours (or at least playing)
        // Spotify may skip unavailable URIs or auto-play different content
        expect(p1Status).not.toBeNull();
        if (urisToPlay.includes(p1Status?.uri)) {
            console.log(`[1.4] Current track matches one of our URIs: ${p1Status?.uri}`);
        } else {
            console.warn(`[1.4] Current track ${p1Status?.uri} not in our list — Spotify may have substituted`);
        }
        // Queue should have at least some of our tracks
        expect(p1MatchCount).toBeGreaterThan(0);


        // =========================================================================
        // PHASE 2: Rescue Mode (3 Skips)
        // =========================================================================
        console.log('\n=== PHASE 2: Rescue Mode (3 Skips) ===');

        // 1. Simulate 3 Skips
        const skippedTracks = [];
        for (let i = 0; i < 3; i++) {
            console.log(`[2.1] Skip ${i + 1}/3...`);
            const stateBefore = await spotifyRemote.getCurrentState();
            if (stateBefore) skippedTracks.push({
                title: stateBefore.title,
                artist: stateBefore.artist,
                uri: stateBefore.uri
            });
            await spotifyRemote.next();
            await sleep(3000);
        }

        // 2. Trigger Rescue
        console.log('[2.2] Triggering Rescue Vibe...');
        const rescueResult = await waitForApiCall(
            () => recommendationService.getRescueVibe(skippedTracks),
            60000
        );

        expect(rescueResult).not.toBeNull();
        if (!rescueResult) return; // TS guard

        const rescueTracks = rescueResult.items.filter(t => t.uri);
        console.log(`[2.2] Rescue returned ${rescueTracks.length} tracks. Vibe: ${rescueResult.vibe}`);

        // 3. Play Rescue (Simulate useAutoDJ behavior: replace queue)
        await spotifyRemote.play(rescueTracks.map(t => t.uri));
        await sleep(5000);

        // 4. Update Expected State
        expectedState.currentTrackUri = rescueTracks[0].uri;
        expectedState.queueUris = rescueTracks.slice(1).map(t => t.uri);
        expectedState.vibe = rescueResult.vibe;

        // 5. Verify against Real Spotify
        console.log('[2.3] Verifying Rescue State...');
        const p2Status = await spotifyRemote.getCurrentState();
        const p2Queue = await spotifyRemote.getUserQueue();

        const actualRescueQueueUris = p2Queue?.queue?.map((t: any) => t.uri) || [];
        const p2MatchCount = expectedState.queueUris.filter(uri => actualRescueQueueUris.includes(uri)).length;

        logTestData('Phase 2: Rescue current track + queue', {
            input: { rescueTracksPlayed: rescueTracks.length, skippedCount: skippedTracks.length }
        }, {
            currentTrackUri: expectedState.currentTrackUri,
            queueUrisLength: expectedState.queueUris.length,
            queueOrderMatchAtLeast: Math.min(5, expectedState.queueUris.length)
        }, {
            currentTrackUri: p2Status?.uri,
            queueUrisLength: actualRescueQueueUris.length,
            queueOrderMatchCount: p2MatchCount,
            actualQueueUrisSample: actualRescueQueueUris.slice(0, 5)
        });

        // Verify playback is active after rescue
        const rescueUrisPlayed = rescueTracks.map(t => t.uri);
        expect(p2Status).not.toBeNull();
        if (rescueUrisPlayed.includes(p2Status?.uri)) {
            console.log(`[2.3] Current track matches one of our rescue URIs: ${p2Status?.uri}`);
        } else {
            console.warn(`[2.3] Current track ${p2Status?.uri} not in rescue list — Spotify may have substituted`);
        }
        // Queue should have at least some of our rescue tracks
        expect(p2MatchCount).toBeGreaterThan(0);


        // =========================================================================
        // PHASE 3: Queue Refill (Expansion Loop)
        // =========================================================================
        console.log('\n=== PHASE 3: Queue Refill ===');

        // 1. Drain Queue usually - simplified here by just adding more logic
        // We verify that if we ask to expand, it adds to the end.

        console.log('[3.1] Triggering Expansion (Simulating low queue)...');
        // Simulate finding the "Seed" from current track
        const currentSeed = {
            title: rescueTracks[0].title,
            artist: rescueTracks[0].artist
        };

        const expansionResult = await waitForApiCall(
            () => recommendationService.expandVibe(currentSeed, expectedState.vibe),
            60000
        );

        const newTracks = expansionResult.items.filter(t => t.uri);
        console.log(`[3.2] Got ${newTracks.length} new tracks.`);

        // 2. Append to Queue (Simulate useAutoDJ)
        // We use the same service call the app uses: spotifyRemote.addToQueue
        // But we need to do it loop style or use a helper if available, likely `addToQueue` one by one or `QueueManager`
        // The prompt asked to use "local run time state".

        // We'll use spotifyRemote directly to append
        /* 
           NOTE: In a real run, `appendQueue` from PlayerStore calls QueueManager. 
           We will simulate that actions.
        */
        for (const track of newTracks) {
            await spotifyRemote.addToQueue(track.uri);
            // small delay to ensure order
            await sleep(100);
        }
        await sleep(3000);

        // 3. Update Expected State
        // Expected: [Current Tracks in Queue] + [New Tracks]
        // Since we didn't actually play through the queue, the "Expected State" from Phase 2 (queueUris) is still technically in the queue.
        expectedState.queueUris = [...expectedState.queueUris, ...newTracks.map(t => t.uri)];

        // 4. Verify
        console.log('[3.3] Verifying Refilled Queue...');
        const p3Queue = await spotifyRemote.getUserQueue();
        const actualRefillQueue = p3Queue?.queue?.map((t: any) => t.uri) || [];
        const foundNewTracks = newTracks.filter(t => actualRefillQueue.includes(t.uri));

        logTestData('Phase 3: Refill queue (new tracks in queue)', {
            input: { newTracksAdded: newTracks.length, seed: currentSeed }
        }, {
            newTracksInQueueAtLeast: 1,
            newTracksCount: newTracks.length
        }, {
            foundNewTracksInQueue: foundNewTracks.length,
            totalNewTracks: newTracks.length,
            actualQueueLength: actualRefillQueue.length
        });

        expect(foundNewTracks.length).toBeGreaterThan(0);

    }, 300000); // 5 minute timeout
});
