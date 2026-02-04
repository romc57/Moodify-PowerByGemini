/**
 * Queue Manager
 *
 * Handles Spotify queue operations with proper clearing and verification.
 * Spotify Web API doesn't have a "clear queue" endpoint, so we use workarounds.
 */

import { spotifyRemote } from './SpotifyRemoteService';

export interface QueuedTrack {
    uri: string;
    title: string;
    artist: string;
}

export interface QueueResult {
    success: boolean;
    playingTrack: QueuedTrack | null;
    queuedTracks: QueuedTrack[];
    error?: string;
}

/**
 * Wait for Spotify to register the playing track
 */
async function waitForTrackToPlay(
    expectedUri: string,
    maxWaitMs: number = 5000
): Promise<boolean> {
    const startTime = Date.now();
    const pollInterval = 300;

    while (Date.now() - startTime < maxWaitMs) {
        const state = await spotifyRemote.getCurrentState();
        if (state?.uri === expectedUri) {
            return true;
        }
        await new Promise(r => setTimeout(r, pollInterval));
    }

    return false;
}

/**
 * Verify the queue contains the expected tracks
 */
async function verifyQueue(
    expectedUris: string[],
    maxWaitMs: number = 3000
): Promise<{ verified: boolean; actualQueue: string[] }> {
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitMs) {
        const queueData = await spotifyRemote.getUserQueue();
        if (!queueData) {
            await new Promise(r => setTimeout(r, 500));
            continue;
        }

        const actualQueue = queueData.queue.map((item: any) => item.uri);
        const hasExpectedTracks = expectedUris.every(uri =>
            actualQueue.includes(uri)
        );

        if (hasExpectedTracks || actualQueue.length >= expectedUris.length) {
            return { verified: true, actualQueue };
        }

        await new Promise(r => setTimeout(r, 500));
    }

    const finalQueue = await spotifyRemote.getUserQueue();
    return {
        verified: false,
        actualQueue: finalQueue?.queue.map((item: any) => item.uri) || []
    };
}

/**
 * Add tracks to queue with rate limiting
 */
async function addTracksToQueue(
    tracks: QueuedTrack[],
    delayMs: number = 150
): Promise<{ successes: QueuedTrack[]; failures: QueuedTrack[] }> {
    const successes: QueuedTrack[] = [];
    const failures: QueuedTrack[] = [];

    for (const track of tracks) {
        try {
            await spotifyRemote.addToQueue(track.uri);
            successes.push(track);
            if (tracks.indexOf(track) < tracks.length - 1) {
                await new Promise(r => setTimeout(r, delayMs));
            }
        } catch (e) {
            console.warn(`[QueueManager] Failed to queue: ${track.title}`);
            failures.push(track);
        }
    }

    return { successes, failures };
}

/**
 * Replace the current queue with new tracks
 *
 * Strategy:
 * 1. Play the first track to create a new playback context
 * 2. Wait for Spotify to confirm playback started
 * 3. Add remaining tracks to queue one by one
 * 4. Verify the queue contains expected tracks
 */
export async function replaceQueue(
    tracks: QueuedTrack[]
): Promise<QueueResult> {
    if (!tracks.length) {
        return { success: false, playingTrack: null, queuedTracks: [], error: 'No tracks provided' };
    }

    const firstTrack = tracks[0];
    const remainingTracks = tracks.slice(1);

    try {
        // Step 1: Play first track to establish new context
        console.log(`[QueueManager] Playing first track: ${firstTrack.title}`);
        await spotifyRemote.play([firstTrack.uri]);

        // Step 2: Wait for playback to start
        const isPlaying = await waitForTrackToPlay(firstTrack.uri, 5000);
        if (!isPlaying) {
            console.warn('[QueueManager] Track did not start playing in time');
            // Continue anyway - it might still work
        }

        // Step 3: Add remaining tracks to queue
        if (remainingTracks.length > 0) {
            console.log(`[QueueManager] Adding ${remainingTracks.length} tracks to queue`);
            const { successes, failures } = await addTracksToQueue(remainingTracks);

            if (failures.length > 0) {
                console.warn(`[QueueManager] ${failures.length} tracks failed to queue`);
            }

            // Step 4: Verify queue (optional, for debugging)
            const expectedUris = successes.map(t => t.uri);
            const { verified } = await verifyQueue(expectedUris, 2000);

            if (!verified) {
                console.warn('[QueueManager] Queue verification failed');
            }

            return {
                success: true,
                playingTrack: firstTrack,
                queuedTracks: successes
            };
        }

        return {
            success: true,
            playingTrack: firstTrack,
            queuedTracks: []
        };

    } catch (error: any) {
        console.error('[QueueManager] Replace queue failed:', error.message);
        return {
            success: false,
            playingTrack: null,
            queuedTracks: [],
            error: error.message
        };
    }
}

/**
 * Append tracks to the existing queue
 */
export async function appendToQueue(
    tracks: QueuedTrack[]
): Promise<{ added: QueuedTrack[]; failed: QueuedTrack[] }> {
    return addTracksToQueue(tracks, 200);
}

/**
 * Get the current queue state
 */
export async function getQueueState(): Promise<{
    currentTrack: QueuedTrack | null;
    queue: QueuedTrack[];
}> {
    const queueData = await spotifyRemote.getUserQueue();
    if (!queueData) {
        return { currentTrack: null, queue: [] };
    }

    const currentTrack = queueData.currently_playing ? {
        uri: queueData.currently_playing.uri,
        title: queueData.currently_playing.name,
        artist: queueData.currently_playing.artists?.[0]?.name || 'Unknown'
    } : null;

    const queue = queueData.queue.map((item: any) => ({
        uri: item.uri,
        title: item.name,
        artist: item.artists?.[0]?.name || 'Unknown'
    }));

    return { currentTrack, queue };
}
