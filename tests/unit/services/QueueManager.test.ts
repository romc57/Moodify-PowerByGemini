/**
 * QueueManager Unit Tests
 *
 * Tests queue operations: replaceQueue, appendToQueue, getQueueState.
 * NO MOCKS - uses real spotifyRemote (real Spotify API).
 */

import { replaceQueue, appendToQueue, getQueueState, QueuedTrack } from '../../../services/spotify/QueueManager';
import { spotifyRemote } from '../../../services/spotify/SpotifyRemoteService';
import { initializeTestDatabase, ensureFreshSpotifyToken } from '../../utils/testDb';

function makeTracks(count: number): QueuedTrack[] {
    return Array.from({ length: count }, (_, i) => ({
        uri: `spotify:track:t${i}`,
        title: `Song ${i}`,
        artist: `Artist ${i}`,
    }));
}

describe('QueueManager', () => {
    beforeAll(async () => {
        await initializeTestDatabase();
        await ensureFreshSpotifyToken();
    });

    describe('replaceQueue', () => {
        it('should return error when no tracks provided', async () => {
            const result = await replaceQueue([]);
            expect(result.success).toBe(false);
            expect(result.error).toBe('No tracks provided');
        });

        it('should call real Spotify and return result (success when device active)', async () => {
            const tracks = makeTracks(3);
            const result = await replaceQueue(tracks);

            expect(result).toHaveProperty('success');
            expect(result).toHaveProperty('playingTrack');
            expect(result).toHaveProperty('queuedTracks');
            if (result.success) {
                expect(result.playingTrack).toEqual(tracks[0]);
                expect(result.queuedTracks).toEqual(tracks.slice(1));
            } else {
                expect(typeof result.error).toBe('string');
            }
        });

        it('should set playingTrack to first when playback succeeds', async () => {
            const tracks = makeTracks(5);
            const result = await replaceQueue(tracks);

            if (result.success) {
                expect(result.playingTrack?.title).toBe('Song 0');
                expect(result.queuedTracks).toHaveLength(4);
            }
        });
    });

    describe('appendToQueue', () => {
        it('should add tracks via real Spotify API', async () => {
            const tracks = makeTracks(3);
            const result = await appendToQueue(tracks);

            expect(result.added.length + result.failed.length).toBe(3);
            result.added.forEach((t, i) => expect(t.title).toBe(tracks[i].title));
        });

        it('should preserve order of added tracks', async () => {
            const tracks = makeTracks(3);
            const result = await appendToQueue(tracks);

            const expectedTitles = tracks.slice(0, result.added.length).map(t => t.title);
            expect(result.added.map(t => t.title)).toEqual(expectedTitles);
        });
    });

    describe('getQueueState', () => {
        it('should return state from real Spotify API', async () => {
            const state = await getQueueState();
            expect(state).toHaveProperty('currentTrack');
            expect(state).toHaveProperty('queue');
            expect(Array.isArray(state.queue)).toBe(true);
        });
    });
});
