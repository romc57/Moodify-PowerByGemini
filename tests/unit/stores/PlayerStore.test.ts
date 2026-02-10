/**
 * PlayerStore Unit Tests
 *
 * Tests state management logic: queue dedup, session history,
 * graph commit threshold, mood tracking, internal state sync.
 * NO MOCKS - uses real dbService, graphService, spotifyRemote, QueueManager.
 */

import { usePlayerStore, Track } from '../../../stores/PlayerStore';
import { graphService } from '../../../services/graph/GraphService';
import * as QueueManager from '../../../services/spotify/QueueManager';
import { dbService } from '../../../services/database';
import { initializeTestDatabase } from '../../utils/testDb';

const realAppendToQueue = QueueManager.appendToQueue;
const getState = () => usePlayerStore.getState();

function makeTracks(count: number): Track[] {
    return Array.from({ length: count }, (_, i) => ({
        title: `Song ${i}`,
        artist: `Artist ${i}`,
        uri: `spotify:track:t${i}`,
    }));
}

describe('PlayerStore', () => {
    let commitSessionSpy: jest.SpyInstance;
    let appendToQueueSpy: jest.SpyInstance;

    beforeAll(async () => {
        await initializeTestDatabase();
        await dbService.init();
    });

    beforeEach(() => {
        usePlayerStore.setState({
            isPlaying: false,
            currentTrack: null,
            progressMs: 0,
            isLoading: false,
            isQueueModifying: false,
            isSyncing: false,
            queue: [],
            currentIndex: 0,
            sessionHistory: [],
            lastActionTime: 0,
            currentMood: null,
            assessedMood: null,
        });
        commitSessionSpy = jest.spyOn(graphService, 'commitSession');
        appendToQueueSpy = jest.spyOn(QueueManager, 'appendToQueue');
    });

    afterEach(() => {
        commitSessionSpy?.mockRestore();
        appendToQueueSpy?.mockRestore();
    });

    describe('setMood / setAssessedMood', () => {
        it('should set and read mood', () => {
            getState().setMood('Chill Evening');
            expect(getState().currentMood).toBe('Chill Evening');
        });

        it('should set and read assessed mood', () => {
            getState().setAssessedMood('melancholic');
            expect(getState().assessedMood).toBe('melancholic');
        });

        it('should clear mood with null', () => {
            getState().setMood('X');
            getState().setMood(null);
            expect(getState().currentMood).toBeNull();
        });
    });

    describe('addToHistory / sessionHistory', () => {
        it('should append items to session history', () => {
            getState().addToHistory({ uri: 'sp:1', title: 'S1', artist: 'A1', status: 'played', liked: false });
            getState().addToHistory({ uri: 'sp:2', title: 'S2', artist: 'A2', status: 'skipped', liked: false });

            expect(getState().sessionHistory).toHaveLength(2);
            expect(getState().sessionHistory[0].status).toBe('played');
            expect(getState().sessionHistory[1].status).toBe('skipped');
        });

        it('should track listenMs', () => {
            getState().addToHistory({ uri: 'sp:1', title: 'S1', artist: 'A1', status: 'played', liked: false, listenMs: 90000 });
            expect(getState().sessionHistory[0].listenMs).toBe(90000);
        });
    });

    describe('setInternalState', () => {
        it('should set playing state and current track', () => {
            const track: Track = { title: 'Test', artist: 'X', uri: 'sp:test' };
            getState().setInternalState({ isPlaying: true, track });

            expect(getState().isPlaying).toBe(true);
            expect(getState().currentTrack?.title).toBe('Test');
            expect(getState().currentTrack?.origin).toBe('sync');
        });

        it('should update queue when spotifyQueue provided', () => {
            const queue = makeTracks(3);
            getState().setInternalState({ isPlaying: true, track: null, spotifyQueue: queue });

            expect(getState().queue).toHaveLength(3);
        });

        it('should update progressMs', () => {
            getState().setInternalState({ isPlaying: true, track: null, progressMs: 45000 });
            expect(getState().progressMs).toBe(45000);
        });
    });

    describe('commitCurrentVibe', () => {
        it('should not commit if no mood set', async () => {
            getState().addToHistory({ uri: 'sp:1', title: 'S1', artist: 'A1', status: 'played', liked: false });
            await getState().commitCurrentVibe();

            expect(commitSessionSpy).not.toHaveBeenCalled();
        });

        it('should not commit if session history is empty', async () => {
            getState().setMood('Chill');
            await getState().commitCurrentVibe();

            expect(commitSessionSpy).not.toHaveBeenCalled();
        });

        it('should commit with listenMs >= 60s marked as visited', async () => {
            getState().setMood('Chill Evening');
            getState().addToHistory({ uri: 'spotify:track:abc', title: 'Long Listen', artist: 'A', status: 'played', liked: false, listenMs: 90000 });
            getState().addToHistory({ uri: 'spotify:track:def', title: 'Short Skip', artist: 'B', status: 'skipped', liked: false, listenMs: 15000 });

            await getState().commitCurrentVibe();

            expect(commitSessionSpy).toHaveBeenCalledWith(
                'Chill Evening',
                expect.arrayContaining([
                    expect.objectContaining({ name: 'Long Listen', spotifyId: 'abc', visited: true }),
                    expect.objectContaining({ name: 'Short Skip', spotifyId: 'def', visited: false }),
                ])
            );
        });

        it('should strip spotify:track: prefix from URIs for graph', async () => {
            getState().setMood('V');
            getState().addToHistory({ uri: 'spotify:track:xyz123', title: 'S', artist: 'A', status: 'played', liked: false, listenMs: 120000 });

            await getState().commitCurrentVibe();

            expect(commitSessionSpy).toHaveBeenCalledWith(
                'V',
                [expect.objectContaining({ spotifyId: 'xyz123' })]
            );
        });

        it('should clear session history after commit', async () => {
            getState().setMood('V');
            getState().addToHistory({ uri: 'sp:1', title: 'S1', artist: 'A', status: 'played', liked: false, listenMs: 120000 });

            await getState().commitCurrentVibe();
            expect(getState().sessionHistory).toEqual([]);
        });
    });

    describe('appendQueue - deduplication', () => {
        it('should filter out tracks already in queue', async () => {
            usePlayerStore.setState({
                queue: [{ title: 'Existing', artist: 'A', uri: 'spotify:track:existing' }]
            });

            await getState().appendQueue([
                { title: 'Existing', artist: 'A', uri: 'spotify:track:existing' }, // dupe
                { title: 'New', artist: 'B', uri: 'spotify:track:new1' },
            ]);

            expect(appendToQueueSpy).toHaveBeenCalledWith([
                expect.objectContaining({ uri: 'spotify:track:new1' })
            ]);
        });

        it('should not call appendToQueue when all tracks are duplicates', async () => {
            usePlayerStore.setState({
                queue: [{ title: 'S1', artist: 'A', uri: 'sp:1' }]
            });

            await getState().appendQueue([{ title: 'S1', artist: 'A', uri: 'sp:1' }]);

            expect(appendToQueueSpy).not.toHaveBeenCalled();
        });
    });

    describe('queue modification locking', () => {
        it('should set isQueueModifying during appendQueue', async () => {
            appendToQueueSpy.mockImplementation(async (tracks: any) => {
                (global as any).__capturedQueueModifying = getState().isQueueModifying;
                return realAppendToQueue(tracks);
            });

            await getState().appendQueue(makeTracks(1));
            expect((global as any).__capturedQueueModifying).toBe(true);
            expect(getState().isQueueModifying).toBe(false);
        });
    });
});
