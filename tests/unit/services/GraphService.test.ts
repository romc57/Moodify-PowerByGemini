/**
 * GraphService Unit Tests
 *
 * Tests run against the REAL graph. Uses real dbService (test DB adapter).
 * NO MOCKS.
 */

import { graphService } from '../../../services/graph/GraphService';
import { dbService } from '../../../services/database';
import { initializeTestDatabase } from '../../utils/testDb';
import {
    song, artist, genre, vibe,
    connect, tagGenre,
    playTimes,
    snapshot, snapshotNodes, snapshotEdges,
    buildGraph, buildStar,
} from '../../utils/graphTestHelpers';

describe('GraphService (Real Graph)', () => {
    beforeAll(async () => {
        await initializeTestDatabase();
        await dbService.init();
    });

    beforeEach(async () => {
        await graphService.clearGraph();
    });

    // ═══════════════════════════════════════════════
    // Node deduplication
    // ═══════════════════════════════════════════════
    describe('Node deduplication', () => {
        it('should dedup SONG by spotify_id (same id → same node)', async () => {
            const a = await song('Song A', 'sp:1', { artist: 'A' });
            const b = await song('Song A', 'sp:1', { artist: 'A' });
            expect(a.id).toBe(b.id);
            expect((await snapshotNodes('SONG'))).toHaveLength(1);
        });

        it('should NOT dedup SONG by name when spotify_id differs', async () => {
            const a = await song('Same Name', 'sp:1');
            const b = await song('Same Name', 'sp:2');
            expect(a.id).not.toBe(b.id);
            expect((await snapshotNodes('SONG'))).toHaveLength(2);
        });

        it('should dedup GENRE by type+name', async () => {
            const g1 = await genre('indie rock');
            const g2 = await genre('indie rock');
            expect(g1.id).toBe(g2.id);
            expect((await snapshotNodes('GENRE'))).toHaveLength(1);
        });

        it('should create distinct GENRE nodes for different names', async () => {
            await genre('indie rock');
            await genre('dream pop');
            expect((await snapshotNodes('GENRE'))).toHaveLength(2);
        });

        it('should dedup VIBE by type+name', async () => {
            const v1 = await vibe('Chill Evening');
            const v2 = await vibe('Chill Evening');
            expect(v1.id).toBe(v2.id);
            expect((await snapshotNodes('VIBE'))).toHaveLength(1);
        });

        it('should dedup ARTIST by spotify_id', async () => {
            const a1 = await artist('Radiohead', 'sp:rh');
            const a2 = await artist('Radiohead', 'sp:rh');
            expect(a1.id).toBe(a2.id);
            expect((await snapshotNodes('ARTIST'))).toHaveLength(1);
        });

        it('should NOT dedup ARTIST with different spotify_id', async () => {
            await artist('Artist', 'sp:a1');
            await artist('Artist', 'sp:a2');
            expect((await snapshotNodes('ARTIST'))).toHaveLength(2);
        });
    });

    // ═══════════════════════════════════════════════
    // Edge deduplication
    // ═══════════════════════════════════════════════
    describe('Edge deduplication', () => {
        it('should increment weight by 0.5 on duplicate edge (same source+target+type)', async () => {
            const a = await song('A', 'sp:a');
            const b = await song('B', 'sp:b');

            await connect(a.id, b.id, 'NEXT', 1.0);
            await connect(a.id, b.id, 'NEXT', 1.0); // duplicate

            const edges = await snapshotEdges();
            expect(edges).toHaveLength(1);
            expect(edges[0].weight).toBe(1.5); // 1.0 + 0.5
        });

        it('should allow different edge types between same nodes (no dedup)', async () => {
            const a = await song('A', 'sp:a');
            const b = await song('B', 'sp:b');

            await connect(a.id, b.id, 'NEXT', 1.0);
            await connect(a.id, b.id, 'SIMILAR', 2.0);

            expect((await snapshotEdges())).toHaveLength(2);
        });

        it('should accumulate weight across multiple duplicates', async () => {
            const a = await song('A', 'sp:a');
            const b = await song('B', 'sp:b');

            await connect(a.id, b.id, 'NEXT', 1.0);
            await connect(a.id, b.id, 'NEXT', 1.0);
            await connect(a.id, b.id, 'NEXT', 1.0);

            const edges = await snapshotEdges('NEXT');
            expect(edges).toHaveLength(1);
            expect(edges[0].weight).toBe(2.0); // 1.0 + 0.5 + 0.5
        });
    });

    // ═══════════════════════════════════════════════
    // getEffectiveNode
    // ═══════════════════════════════════════════════
    describe('getEffectiveNode', () => {
        it('should create a SONG node with correct fields', async () => {
            const node = await song('Bohemian Rhapsody', 'sp:123', { artist: 'Queen' });
            expect(node.type).toBe('SONG');
            expect(node.name).toBe('Bohemian Rhapsody');
            expect(node.spotify_id).toBe('sp:123');
            expect(node.data).toEqual({ artist: 'Queen' });
            expect(node.play_count).toBe(0);
        });

        it('should create VIBE node without spotify_id', async () => {
            const v = await vibe('Chill Evening');
            expect(v.type).toBe('VIBE');
            expect(v.name).toBe('Chill Evening');
            expect(v.spotify_id).toBeNull();
        });

        it('should assign sequential IDs', async () => {
            const n1 = await song('A', 'sp:a');
            const n2 = await song('B', 'sp:b');
            expect(n2.id).toBe(n1.id + 1);
        });
    });

    // ═══════════════════════════════════════════════
    // connectNodes
    // ═══════════════════════════════════════════════
    describe('connectNodes', () => {
        it('should create a new edge between two nodes', async () => {
            const a = await song('A', 'sp:a');
            const b = await song('B', 'sp:b');
            await connect(a.id, b.id, 'NEXT', 1.0);

            const edges = await snapshotEdges();
            expect(edges).toHaveLength(1);
            expect(edges[0]).toEqual({ source: a.id, target: b.id, type: 'NEXT', weight: 1.0 });
        });
    });

    // ═══════════════════════════════════════════════
    // recordPlay
    // ═══════════════════════════════════════════════
    describe('recordPlay', () => {
        it('should increment play_count and update last_played_at', async () => {
            const node = await song('A', 'sp:a');
            expect(node.play_count).toBe(0);

            const before = Date.now();
            await graphService.recordPlay(node.id);

            const after = await song('A', 'sp:a'); // re-fetch (same ref in memory)
            expect(after.play_count).toBe(1);
            expect(after.last_played_at).toBeGreaterThanOrEqual(before);
        });

        it('should accumulate play counts', async () => {
            const node = await song('A', 'sp:a');
            await playTimes(node.id, 3);

            const updated = await song('A', 'sp:a');
            expect(updated.play_count).toBe(3);
        });
    });

    // ═══════════════════════════════════════════════
    // getNextSuggestedNode
    // ═══════════════════════════════════════════════
    describe('getNextSuggestedNode', () => {
        it('should return highest-weight neighbor not played today', async () => {
            const { center, neighbors } = await buildStar('Center', ['Low', 'High'], [1.0, 5.0]);

            const suggestion = await graphService.getNextSuggestedNode(center.id);
            expect(suggestion).not.toBeNull();
            expect(suggestion!.name).toBe('High');
        });

        it('should exclude nodes played today', async () => {
            const { center, neighbors } = await buildStar('Center', ['Next'], [5.0]);
            await graphService.recordPlay(neighbors[0].id); // marks as played today

            const suggestion = await graphService.getNextSuggestedNode(center.id);
            expect(suggestion).toBeNull();
        });

        it('should respect excludeIds', async () => {
            const { center, neighbors } = await buildStar('Center', ['A', 'B'], [5.0, 3.0]);

            const suggestion = await graphService.getNextSuggestedNode(center.id, new Set([neighbors[0].id]));
            expect(suggestion).not.toBeNull();
            expect(suggestion!.name).toBe('B');
        });

        it('should only return SONG type nodes', async () => {
            const center = await song('Center', 'sp:center');
            const rock = await genre('rock');
            const rockSong = await song('Rock Song', 'sp:rock');

            await connect(center.id, rock.id, 'HAS_GENRE', 10.0);
            await connect(center.id, rockSong.id, 'SIMILAR', 2.0);

            const suggestion = await graphService.getNextSuggestedNode(center.id);
            expect(suggestion!.type).toBe('SONG');
            expect(suggestion!.name).toBe('Rock Song');
        });
    });

    // ═══════════════════════════════════════════════
    // getNeighbors
    // ═══════════════════════════════════════════════
    describe('getNeighbors', () => {
        it('should return neighbors sorted by weight descending', async () => {
            const { center } = await buildStar('A', ['B', 'C'], [1.0, 5.0]);

            const neighbors = await graphService.getNeighbors(center.id);
            expect(neighbors).toHaveLength(2);
            expect(neighbors[0].name).toBe('C');
            expect(neighbors[0].weight).toBe(5.0);
            expect(neighbors[1].name).toBe('B');
        });

        it('should respect limit', async () => {
            const names = Array.from({ length: 10 }, (_, i) => `S${i}`);
            const weights = Array.from({ length: 10 }, (_, i) => i);
            const { center } = await buildStar('Center', names, weights);

            const neighbors = await graphService.getNeighbors(center.id, 3);
            expect(neighbors).toHaveLength(3);
        });
    });

    // ═══════════════════════════════════════════════
    // commitSession
    // ═══════════════════════════════════════════════
    describe('commitSession', () => {
        it('should create VIBE node and link visited songs (no duplicates)', async () => {
            await graphService.commitSession('Chill Evening', [
                { name: 'Song A', artist: 'A', spotifyId: 'sp:a', visited: true },
                { name: 'Song B', artist: 'B', spotifyId: 'sp:b', visited: true },
                { name: 'Song C', artist: 'C', spotifyId: 'sp:c', visited: false },
            ]);

            const vibes = await snapshotNodes('VIBE');
            const songs = await snapshotNodes('SONG');
            expect(vibes).toHaveLength(1);
            expect(vibes[0].name).toBe('Chill Evening');
            expect(songs).toHaveLength(2); // only visited

            const relatedEdges = await snapshotEdges('RELATED');
            const nextEdges = await snapshotEdges('NEXT');
            expect(relatedEdges).toHaveLength(4); // bidirectional for 2 songs
            expect(nextEdges).toHaveLength(1);     // A → B
        });

        it('should not duplicate nodes when committing same song twice', async () => {
            await graphService.commitSession('V1', [
                { name: 'Song A', artist: 'A', spotifyId: 'sp:a', visited: true },
            ]);
            await graphService.commitSession('V2', [
                { name: 'Song A', artist: 'A', spotifyId: 'sp:a', visited: true },
            ]);

            const songs = await snapshotNodes('SONG');
            expect(songs).toHaveLength(1); // dedup by spotify_id

            const vibes = await snapshotNodes('VIBE');
            expect(vibes).toHaveLength(2); // V1 and V2 are different vibes
        });

        it('should increment play_count for visited songs', async () => {
            await graphService.commitSession('Vibe', [
                { name: 'Song A', artist: 'A', spotifyId: 'sp:a', visited: true },
            ]);

            const node = await song('Song A', 'sp:a');
            expect(node.play_count).toBe(1);
        });

        it('should skip songs with visited=false', async () => {
            await graphService.commitSession('Vibe', [
                { name: 'Skipped', artist: 'X', spotifyId: 'sp:skip', visited: false },
            ]);

            expect((await snapshotNodes('SONG'))).toHaveLength(0);
        });
    });

    // ═══════════════════════════════════════════════
    // getTopGenres
    // ═══════════════════════════════════════════════
    describe('getTopGenres', () => {
        it('should rank genres by total weight', async () => {
            await buildGraph([
                { name: 'S1', spotifyId: 'sp:s1', genres: ['rock'] },
                { name: 'S2', spotifyId: 'sp:s2', genres: ['rock'] },
                { name: 'S3', spotifyId: 'sp:s3', genres: ['rock', 'pop'] },
            ]);

            const genres = await graphService.getTopGenres(10);
            expect(genres).toHaveLength(2);
            expect(genres[0].name).toBe('rock');
            expect(genres[0].songCount).toBe(3);
            expect(genres[0].totalWeight).toBe(3.0);
            expect(genres[1].name).toBe('pop');
            expect(genres[1].songCount).toBe(1);
        });

        it('should respect limit', async () => {
            await buildGraph(
                Array.from({ length: 5 }, (_, i) => ({
                    name: `S${i}`, spotifyId: `sp:s${i}`, genres: [`genre${i}`]
                }))
            );
            expect((await graphService.getTopGenres(3))).toHaveLength(3);
        });

        it('should return empty array when no genres exist', async () => {
            expect(await graphService.getTopGenres()).toEqual([]);
        });
    });

    // ═══════════════════════════════════════════════
    // getSongsByGenres
    // ═══════════════════════════════════════════════
    describe('getSongsByGenres', () => {
        it('should return songs connected to specified genres', async () => {
            await buildGraph([
                { name: 'Rock Song', spotifyId: 'sp:rock1', genres: ['rock'] },
                { name: 'Pop Song', spotifyId: 'sp:pop1', genres: ['pop'] },
            ]);

            const results = await graphService.getSongsByGenres(['rock']);
            expect(results).toHaveLength(1);
            expect(results[0].name).toBe('Rock Song');
        });

        it('should exclude specified URIs', async () => {
            await buildGraph([
                { name: 'S1', spotifyId: 'sp:s1', genres: ['rock'] },
                { name: 'S2', spotifyId: 'sp:s2', genres: ['rock'] },
            ]);

            const results = await graphService.getSongsByGenres(['rock'], 20, new Set(['sp:s1']));
            expect(results).toHaveLength(1);
            expect(results[0].spotify_id).toBe('sp:s2');
        });

        it('should return empty for empty genre list', async () => {
            expect(await graphService.getSongsByGenres([])).toEqual([]);
        });

        it('should sort by total weight across genres', async () => {
            const nodes = await buildGraph([
                { name: 'Multi', spotifyId: 'sp:multi', genres: ['rock', 'indie'] },
                { name: 'Single', spotifyId: 'sp:single', genres: ['rock'] },
            ]);

            // Multi has extra weight: also in indie
            const multiNode = nodes.get('sp:multi')!;
            const indieGenre = await genre('indie'); // already created by buildGraph, deduped
            // buildGraph already connected it, but let's add extra weight
            await tagGenre(multiNode.id, indieGenre.id); // +0.5 bump on existing edge

            const results = await graphService.getSongsByGenres(['rock', 'indie']);
            expect(results).toHaveLength(2);
            expect(results[0].name).toBe('Multi');
        });

        it('should not duplicate songs that match multiple queried genres', async () => {
            await buildGraph([
                { name: 'Crossover', spotifyId: 'sp:cross', genres: ['rock', 'pop'] },
            ]);

            const results = await graphService.getSongsByGenres(['rock', 'pop']);
            expect(results).toHaveLength(1); // same song, not duplicated
        });
    });

    // ═══════════════════════════════════════════════
    // getClusterRepresentatives
    // ═══════════════════════════════════════════════
    describe('getClusterRepresentatives', () => {
        it('should return top played songs with artist diversity', async () => {
            await buildGraph([
                { name: 'Hit1', spotifyId: 'sp:h1', artist: 'Artist A', plays: 10 },
                { name: 'Hit2', spotifyId: 'sp:h2', artist: 'Artist A', plays: 8 },
                { name: 'Hit3', spotifyId: 'sp:h3', artist: 'Artist B', plays: 5 },
                { name: 'Hit4', spotifyId: 'sp:h4', artist: 'Artist C', plays: 3 },
            ]);

            const reps = await graphService.getClusterRepresentatives(3);
            expect(reps).toHaveLength(3);
            expect(reps[0].name).toBe('Hit1'); // highest played

            // Should prefer diverse artists: skip Hit2 (same artist A), pick Hit3 and Hit4
            const names = reps.map(r => r.name);
            expect(names).toContain('Hit3');
            expect(names).toContain('Hit4');
        });

        it('should return empty when no songs exist', async () => {
            expect(await graphService.getClusterRepresentatives()).toEqual([]);
        });
    });

    // ═══════════════════════════════════════════════
    // getTasteProfile
    // ═══════════════════════════════════════════════
    describe('getTasteProfile', () => {
        it('should return complete taste profile from graph', async () => {
            await buildGraph([
                { name: 'S1', spotifyId: 'sp:s1', artist: 'A', genres: ['rock'], plays: 5,
                  audioFeatures: { energy: 0.8, valence: 0.6, danceability: 0.7 } },
                { name: 'S2', spotifyId: 'sp:s2', artist: 'B', genres: ['rock'], plays: 3,
                  audioFeatures: { energy: 0.4, valence: 0.3, danceability: 0.5 } },
            ]);

            const profile = await graphService.getTasteProfile();

            expect(profile.clusterReps.length).toBeGreaterThan(0);
            expect(profile.clusterReps[0].name).toBe('S1'); // highest play count
            expect(profile.topGenres).toHaveLength(1);
            expect(profile.topGenres[0].name).toBe('rock');
            expect(profile.audioProfile).not.toBeNull();
            expect(profile.audioProfile!.energy).toBeCloseTo(0.6, 1);
            expect(profile.audioProfile!.valence).toBeCloseTo(0.45, 1);
        });
    });

    // ═══════════════════════════════════════════════
    // getGraphSnapshot
    // ═══════════════════════════════════════════════
    describe('getGraphSnapshot', () => {
        it('should return all nodes and edges', async () => {
            const a = await song('A', 'sp:a');
            const b = await song('B', 'sp:b');
            await connect(a.id, b.id, 'NEXT', 1.0);

            const snap = await snapshot();
            expect(snap.nodes).toHaveLength(2);
            expect(snap.edges).toHaveLength(1);
        });

        it('should cache and return cached snapshot', async () => {
            await song('A', 'sp:a');
            const snap1 = await snapshot();
            const snap2 = await graphService.getGraphSnapshot(); // cached
            expect(snap1).toBe(snap2); // same reference
        });

        it('should refresh when forceRefresh=true', async () => {
            await song('A', 'sp:a');
            await snapshot();
            await song('B', 'sp:b');

            const snap2 = await snapshot(); // forced
            expect(snap2.nodes).toHaveLength(2);
        });
    });

    // ═══════════════════════════════════════════════
    // isGraphPopulated
    // ═══════════════════════════════════════════════
    describe('isGraphPopulated', () => {
        it('should return false for empty graph', async () => {
            expect(await graphService.isGraphPopulated()).toBe(false);
        });

        it('should return true when SONG nodes exist', async () => {
            await song('A', 'sp:a');
            expect(await graphService.isGraphPopulated()).toBe(true);
        });

        it('should return false when only non-SONG nodes exist', async () => {
            await genre('rock');
            expect(await graphService.isGraphPopulated()).toBe(false);
        });
    });

    // ═══════════════════════════════════════════════
    // clearGraph
    // ═══════════════════════════════════════════════
    describe('clearGraph', () => {
        it('should remove all nodes and edges', async () => {
            await song('A', 'sp:a');
            await song('B', 'sp:b');
            await graphService.clearGraph();

            const snap = await snapshot();
            expect(snap.nodes).toHaveLength(0);
            expect(snap.edges).toHaveLength(0);
        });

        it('should reset node ID counter', async () => {
            await song('A', 'sp:a');
            await graphService.clearGraph();
            const node = await song('B', 'sp:b');
            expect(node.id).toBe(1);
        });
    });

    // ═══════════════════════════════════════════════
    // updateNodeData
    // ═══════════════════════════════════════════════
    describe('updateNodeData', () => {
        it('should merge new data into existing node data', async () => {
            const node = await song('A', 'sp:a', { artist: 'Queen' });
            await graphService.updateNodeData(node.id, { energy: 0.8, valence: 0.5 });

            const updated = await song('A', 'sp:a');
            expect(updated.data.artist).toBe('Queen');
            expect(updated.data.energy).toBe(0.8);
            expect(updated.data.valence).toBe(0.5);
        });
    });

    // ═══════════════════════════════════════════════
    // buildGraph helper deduplication
    // ═══════════════════════════════════════════════
    describe('buildGraph helper deduplication', () => {
        it('should not create duplicate genre nodes when multiple songs share a genre', async () => {
            await buildGraph([
                { name: 'S1', spotifyId: 'sp:s1', genres: ['rock', 'pop'] },
                { name: 'S2', spotifyId: 'sp:s2', genres: ['rock', 'indie'] },
                { name: 'S3', spotifyId: 'sp:s3', genres: ['rock'] },
            ]);

            const genreNodes = await snapshotNodes('GENRE');
            const genreNames = genreNodes.map(g => g.name).sort();
            expect(genreNames).toEqual(['indie', 'pop', 'rock']); // rock appears once
        });

        it('should not create duplicate song nodes when same spotifyId is in buildGraph', async () => {
            await buildGraph([
                { name: 'S1', spotifyId: 'sp:s1', genres: ['rock'] },
            ]);
            // Manually add same song again
            await song('S1', 'sp:s1');

            expect((await snapshotNodes('SONG'))).toHaveLength(1);
        });
    });

    // ═══════════════════════════════════════════════
    // Stored data integrity (node fields, edge weights, play counts)
    // ═══════════════════════════════════════════════
    describe('Stored data integrity', () => {
        it('should store all node fields correctly in snapshot', async () => {
            const s = await song('Test Song', 'sp:test', { artist: 'Test Artist' });
            await playTimes(s.id, 3);

            const snap = await snapshot();
            const stored = snap.nodes.find(n => n.spotify_id === 'sp:test')!;
            expect(stored.id).toBe(s.id);
            expect(stored.type).toBe('SONG');
            expect(stored.name).toBe('Test Song');
            expect(stored.spotify_id).toBe('sp:test');
            expect(stored.data).toEqual({ artist: 'Test Artist' });
            expect(stored.play_count).toBe(3);
            expect(stored.last_played_at).toBeGreaterThan(0);
        });

        it('should store correct edge fields in snapshot', async () => {
            const a = await song('A', 'sp:a');
            const b = await song('B', 'sp:b');
            await connect(a.id, b.id, 'SIMILAR', 2.5);

            const snap = await snapshot();
            const stored = snap.edges[0];
            expect(stored.source).toBe(a.id);
            expect(stored.target).toBe(b.id);
            expect(stored.type).toBe('SIMILAR');
            expect(stored.weight).toBe(2.5);
        });

        it('should preserve play_count after dedup re-fetch', async () => {
            const s = await song('X', 'sp:x');
            await playTimes(s.id, 7);

            // Re-fetch same node via dedup
            const refetched = await song('X', 'sp:x');
            expect(refetched.id).toBe(s.id);
            expect(refetched.play_count).toBe(7);
        });

        it('should preserve edge weight after multiple bumps and snapshot', async () => {
            const a = await song('A', 'sp:a');
            const b = await song('B', 'sp:b');

            await connect(a.id, b.id, 'NEXT', 1.0);
            await connect(a.id, b.id, 'NEXT', 1.0); // +0.5
            await connect(a.id, b.id, 'NEXT', 1.0); // +0.5
            await connect(a.id, b.id, 'NEXT', 1.0); // +0.5
            await connect(a.id, b.id, 'NEXT', 1.0); // +0.5

            const edges = await snapshotEdges('NEXT');
            expect(edges).toHaveLength(1);
            expect(edges[0].weight).toBe(3.0); // 1.0 + 4*0.5
        });

        it('should track play counts correctly across commitSession calls', async () => {
            await graphService.commitSession('V1', [
                { name: 'S', artist: 'A', spotifyId: 'sp:s', visited: true },
            ]);
            await graphService.commitSession('V2', [
                { name: 'S', artist: 'A', spotifyId: 'sp:s', visited: true },
            ]);
            await graphService.commitSession('V3', [
                { name: 'S', artist: 'A', spotifyId: 'sp:s', visited: true },
            ]);

            const node = await song('S', 'sp:s');
            expect(node.play_count).toBe(3); // one per session
        });

        it('should not create duplicate edges when commitSession re-links same vibe+song', async () => {
            await graphService.commitSession('V', [
                { name: 'S', artist: 'A', spotifyId: 'sp:s', visited: true },
            ]);
            await graphService.commitSession('V', [
                { name: 'S', artist: 'A', spotifyId: 'sp:s', visited: true },
            ]);

            const relatedEdges = await snapshotEdges('RELATED');
            // Bidirectional: vibe→song + song→vibe = 2 unique edges, weight bumped on second call
            expect(relatedEdges).toHaveLength(2);
            expect(relatedEdges[0].weight).toBe(2.5); // 2.0 initial + 0.5 bump
        });

        it('should store correct node count and edge count in snapshot after buildGraph', async () => {
            await buildGraph([
                { name: 'A', spotifyId: 'sp:a', artist: 'X', genres: ['rock', 'pop'], plays: 2 },
                { name: 'B', spotifyId: 'sp:b', artist: 'Y', genres: ['rock'], plays: 1 },
                { name: 'C', spotifyId: 'sp:c', artist: 'Z', genres: ['jazz'], plays: 0 },
            ]);

            const snap = await snapshot();
            const songNodes = snap.nodes.filter(n => n.type === 'SONG');
            const genreNodes = snap.nodes.filter(n => n.type === 'GENRE');
            expect(songNodes).toHaveLength(3);
            expect(genreNodes).toHaveLength(3); // rock, pop, jazz

            // A→rock, A→pop, B→rock, C→jazz = 4 HAS_GENRE edges
            // rock is shared but edge source differs so no dedup
            const genreEdges = snap.edges.filter(e => e.type === 'HAS_GENRE');
            expect(genreEdges).toHaveLength(4);

            // Verify play counts stored
            const aNode = songNodes.find(n => n.spotify_id === 'sp:a')!;
            const bNode = songNodes.find(n => n.spotify_id === 'sp:b')!;
            const cNode = songNodes.find(n => n.spotify_id === 'sp:c')!;
            expect(aNode.play_count).toBe(2);
            expect(bNode.play_count).toBe(1);
            expect(cNode.play_count).toBe(0);
        });
    });

    // ═══════════════════════════════════════════════
    // End-to-end: realistic graph building
    // ═══════════════════════════════════════════════
    describe('End-to-end graph building', () => {
        it('should build a realistic mini-graph and verify structure + no dupes', async () => {
            // 3 songs, 2 artists, 2 genres
            const creep = await song('Creep', 'sp:creep', { artist: 'Radiohead' });
            const karma = await song('Karma Police', 'sp:karma', { artist: 'Radiohead' });
            const yellow = await song('Yellow', 'sp:yellow', { artist: 'Coldplay' });

            const rh = await artist('Radiohead', 'sp:radiohead');
            const cp = await artist('Coldplay', 'sp:coldplay');
            const altRock = await genre('alternative rock');
            const britpop = await genre('britpop');

            // Song → Artist
            await connect(creep.id, rh.id, 'RELATED', 1.0);
            await connect(karma.id, rh.id, 'RELATED', 1.0);
            await connect(yellow.id, cp.id, 'RELATED', 1.0);

            // Song → Genre
            await tagGenre(creep.id, altRock.id);
            await tagGenre(karma.id, altRock.id);
            await tagGenre(yellow.id, altRock.id);
            await tagGenre(yellow.id, britpop.id);

            // Similar
            await connect(creep.id, karma.id, 'SIMILAR', 1.0);

            // Verify counts
            const snap = await snapshot();
            expect(snap.nodes).toHaveLength(7);  // 3 songs + 2 artists + 2 genres
            expect(snap.edges).toHaveLength(8);  // 3 RELATED + 4 HAS_GENRE + 1 SIMILAR

            // Verify no duplicate genres from re-fetching
            const altRock2 = await genre('alternative rock');
            expect(altRock2.id).toBe(altRock.id);
            expect((await snapshotNodes('GENRE'))).toHaveLength(2);

            // Verify genre ranking
            const genres = await graphService.getTopGenres();
            expect(genres[0].name).toBe('alternative rock');
            expect(genres[0].songCount).toBe(3);

            // Verify song lookup by genre
            const altSongs = await graphService.getSongsByGenres(['alternative rock']);
            expect(altSongs).toHaveLength(3);

            // Verify neighbors
            const creepNeighbors = await graphService.getNeighbors(creep.id, 10);
            expect(creepNeighbors.length).toBeGreaterThanOrEqual(2);
        });
    });
});
