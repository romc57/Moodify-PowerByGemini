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
 * Pass ALL tracks to the play command to create a proper multi-track context.
 * This ensures next/prev work correctly and tracks play sequentially.
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
        // Play ALL tracks to create a proper multi-track context
        const allUris = tracks.map(t => t.uri);
        await spotifyRemote.play(allUris);

        // Wait for playback to start
        await waitForTrackToPlay(firstTrack.uri, 5000);

        return {
            success: true,
            playingTrack: firstTrack,
            queuedTracks: remainingTracks
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
    const { successes, failures } = await addTracksToQueue(tracks, 200);
    return { added: successes, failed: failures };
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
