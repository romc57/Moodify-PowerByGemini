import { dbService } from '@/services/database';
// Note: spotifyRemote is imported lazily in ingestLikedSongs() to avoid require cycle

export type NodeType = 'SONG' | 'ARTIST' | 'GENRE' | 'VIBE' | 'AUDIO_FEATURE';
export type EdgeType = 'SIMILAR' | 'SAME_ARTIST' | 'IN_GENRE' | 'HAS_VIBE' | 'NEXT' | 'RELATED' | 'HAS_GENRE' | 'HAS_FEATURE';

export interface GraphNode {
    id: number;
    type: NodeType;
    name: string;
    spotify_id: string | null;
    data: string | null; // JSON string
    created_at?: string;
    play_count?: number;
    last_played_at?: number;
    x?: number;
    y?: number;
}

export interface GraphEdge {
    source: number;
    target: number;
    type: EdgeType;
    weight: number;
}

export class GraphService {
    private static instance: GraphService;

    // In-memory fallback for Web/No-SQL environments
    private memoryNodes: Map<number, GraphNode> = new Map();
    private memoryEdges: { source: number, target: number, type: EdgeType, weight: number }[] = [];
    /** O(1) edge dedup key → index in memoryEdges. Key = "sourceId|targetId|type" */
    private memoryEdgeIndex: Map<string, number> = new Map();
    private nextNodeId: number = 1;
    /** O(1) lookup by spotify_id to avoid duplicate nodes. */
    private memoryNodesBySpotifyId: Map<string, GraphNode> = new Map();
    /** O(1) lookup by type+name for nodes without spotify_id (GENRE, VIBE, etc.). */
    private memoryNodesByTypeName: Map<string, GraphNode> = new Map();

    private static typeNameKey(type: NodeType, name: string): string {
        return `${type}\0${name}`;
    }

    /** Rebuild O(1) edge dedup index from memoryEdges array. */
    private rebuildEdgeIndex(): void {
        this.memoryEdgeIndex.clear();
        for (let i = 0; i < this.memoryEdges.length; i++) {
            const e = this.memoryEdges[i];
            this.memoryEdgeIndex.set(GraphService.edgeKey(e.source, e.target, e.type), i);
        }
    }

    /** Rebuild O(1) indices. Nodes with spotify_id keyed only by id (songs can share names); others by type+name. */
    private rebuildMemoryIndices(): void {
        this.memoryNodesBySpotifyId.clear();
        this.memoryNodesByTypeName.clear();
        for (const node of this.memoryNodes.values()) {
            if (node.spotify_id) this.memoryNodesBySpotifyId.set(node.spotify_id, node);
            else this.memoryNodesByTypeName.set(GraphService.typeNameKey(node.type, node.name), node);
        }
    }

    private readonly STORAGE_KEY_NODES = 'moodify_graph_nodes';
    private readonly STORAGE_KEY_EDGES = 'moodify_graph_edges';

    private constructor() {
        // Hydrate from localStorage if available (Web only)
        this.hydrateFromStorage();
    }

    /**
     * Load graph data from localStorage (Web persistence)
     */
    private hydrateFromStorage(): void {
        try {
            if (typeof localStorage === 'undefined') return;

            const nodesJson = localStorage.getItem(this.STORAGE_KEY_NODES);
            const edgesJson = localStorage.getItem(this.STORAGE_KEY_EDGES);

            if (nodesJson) {
                const nodes: GraphNode[] = JSON.parse(nodesJson);
                for (const node of nodes) {
                    this.memoryNodes.set(node.id, node);
                    if (node.id >= this.nextNodeId) {
                        this.nextNodeId = node.id + 1;
                    }
                }
                this.rebuildMemoryIndices();
                console.log(`[GraphService] Hydrated ${nodes.length} nodes from localStorage`);
            }

            if (edgesJson) {
                this.memoryEdges = JSON.parse(edgesJson);
                this.rebuildEdgeIndex();
                console.log(`[GraphService] Hydrated ${this.memoryEdges.length} edges from localStorage`);
            }
        } catch (e) {
            console.error('[GraphService] Failed to hydrate from localStorage', e);
        }
    }

    /**
     * Persist graph data to localStorage (Web persistence)
     */
    private persistToStorage(): void {
        try {
            if (typeof localStorage === 'undefined') return;

            const nodesArray = Array.from(this.memoryNodes.values());
            localStorage.setItem(this.STORAGE_KEY_NODES, JSON.stringify(nodesArray));
            localStorage.setItem(this.STORAGE_KEY_EDGES, JSON.stringify(this.memoryEdges));
        } catch (e) {
            console.error('[GraphService] Failed to persist to localStorage', e);
        }
    }

    static getInstance(): GraphService {
        if (!GraphService.instance) {
            GraphService.instance = new GraphService();
        }
        return GraphService.instance;
    }

    /**
     * Get a node by Spotify ID or Name+Type, or create if not exists.
     * @param persist - If false, skip localStorage persistence (for batch operations)
     */
    async getEffectiveNode(
        type: NodeType,
        name: string,
        spotifyId: string | null = null,
        data: any = {},
        persist: boolean = true
    ): Promise<GraphNode | null> {
        if (!dbService.database) {
            // Memory Fallback — compare by spotify_id for dedup (songs can share names); type+name only when no id
            if (spotifyId) {
                const byId = this.memoryNodesBySpotifyId.get(spotifyId);
                if (byId) return byId;
                // Do not fall back to type+name: same song name can be different tracks
            } else {
                const byTypeName = this.memoryNodesByTypeName.get(GraphService.typeNameKey(type, name));
                if (byTypeName) return byTypeName;
            }

            const newNode: GraphNode = {
                id: this.nextNodeId++,
                type,
                spotify_id: spotifyId,
                name,
                data,
                play_count: 0,
                last_played_at: 0
            };
            this.memoryNodes.set(newNode.id, newNode);
            if (newNode.spotify_id) this.memoryNodesBySpotifyId.set(newNode.spotify_id, newNode);
            else this.memoryNodesByTypeName.set(GraphService.typeNameKey(type, name), newNode);
            if (persist) this.persistToStorage();
            return newNode;
        }

        if (!dbService.database) await dbService.init();

        try {
            let node: any = null;

            // 1. With spotify_id: only match by spotify_id (songs can share names — different tracks)
            if (spotifyId) {
                node = await dbService.database?.getFirstAsync<any>(
                    'SELECT * FROM graph_nodes WHERE spotify_id = ?',
                    [spotifyId]
                );
            } else {
                // 2. No spotify_id (GENRE, VIBE, etc.): match by type + name
                node = await dbService.database?.getFirstAsync<any>(
                    'SELECT * FROM graph_nodes WHERE type = ? AND name = ?',
                    [type, name]
                );
            }

            // 3. Create if doesn't exist (no fallback to name when we have spotify_id — avoids wrong track)
            if (!node) {
                const result = await dbService.database?.runAsync(
                    `INSERT INTO graph_nodes (type, spotify_id, name, data, created_at, last_accessed)
                     VALUES (?, ?, ?, ?, ?, ?)`,
                    [type, spotifyId, name, JSON.stringify(data), Date.now(), Date.now()]
                );

                if (result?.lastInsertRowId) {
                    return {
                        id: result.lastInsertRowId,
                        type,
                        spotify_id: spotifyId,
                        name,
                        data,
                        play_count: 0,
                        last_played_at: 0
                    };
                }

                // Fallback: fetch by spotify_id or type+name (same logic as lookup)
                const created = spotifyId
                    ? await dbService.database?.getFirstAsync<any>('SELECT * FROM graph_nodes WHERE spotify_id = ?', [spotifyId])
                    : await dbService.database?.getFirstAsync<any>('SELECT * FROM graph_nodes WHERE type = ? AND name = ?', [type, name]);
                if (created) {
                    return { ...created, data: JSON.parse(created.data || '{}') } as GraphNode;
                }
                return null;
            }

            // 4. Update if found (e.g., adding Spotify ID to a partial node)
            if (spotifyId && !node.spotify_id) {
                await dbService.database?.runAsync(
                    'UPDATE graph_nodes SET spotify_id = ?, data = ? WHERE id = ?',
                    [spotifyId, JSON.stringify({ ...JSON.parse(node.data || '{}'), ...data }), node.id]
                );
                node.spotify_id = spotifyId;
            }

            return {
                ...node,
                data: JSON.parse(node.data || '{}')
            };

        } catch (e) {
            console.error('[GraphService] getEffectiveNode Error', e);
            return null;
        }
    }

    /**
     * Update data on an existing node (merge into existing data).
     */
    async updateNodeData(nodeId: number, data: Record<string, any>): Promise<void> {
        if (!dbService.database) {
            // Memory Fallback
            const node = this.memoryNodes.get(nodeId);
            if (node) {
                node.data = { ...node.data, ...data };
            }
            return;
        }

        try {
            const existing = await dbService.database.getFirstAsync<any>(
                'SELECT data FROM graph_nodes WHERE id = ?',
                [nodeId]
            );
            if (existing) {
                const merged = { ...JSON.parse(existing.data || '{}'), ...data };
                await dbService.database.runAsync(
                    'UPDATE graph_nodes SET data = ? WHERE id = ?',
                    [JSON.stringify(merged), nodeId]
                );
            }
        } catch (e) {
            console.error('[GraphService] updateNodeData Error', e);
        }
    }

    /**
     * Connect two nodes with an edge.
     */
    private static edgeKey(source: number, target: number, type: string): string {
        return `${source}|${target}|${type}`;
    }

    async connectNodes(sourceId: number, targetId: number, type: EdgeType, weight: number = 1.0, persist: boolean = true) {
        if (!dbService.database) {
            // Memory Fallback — O(1) lookup via index map
            const key = GraphService.edgeKey(sourceId, targetId, type);
            const idx = this.memoryEdgeIndex.get(key);

            if (idx !== undefined) {
                this.memoryEdges[idx].weight += 0.5;
            } else {
                this.memoryEdgeIndex.set(key, this.memoryEdges.length);
                this.memoryEdges.push({ source: sourceId, target: targetId, type, weight });
            }
            if (persist) {
                this.persistToStorage();
            }
            return;
        }

        try {
            // Upsert: insert if new, bump weight if existing (UNIQUE(source_id, target_id, type))
            await dbService.database?.runAsync(
                `INSERT INTO graph_edges (source_id, target_id, type, weight, created_at)
                 VALUES (?, ?, ?, ?, ?)
                 ON CONFLICT(source_id, target_id, type) DO UPDATE SET weight = weight + 0.5, created_at = excluded.created_at`,
                [sourceId, targetId, type, weight, Date.now()]
            );
        } catch (e) {
            console.error('[GraphService] connectNodes Error', e);
        }
    }

    /**
     * Update play stats for a node.
     */
    async recordPlay(nodeId: number) {
        if (!dbService.database) {
            // Memory fallback
            const node = this.memoryNodes.get(nodeId);
            if (node) {
                node.play_count = (node.play_count || 0) + 1;
                node.last_played_at = Date.now();
            }
            return;
        }

        try {
            await dbService.database?.runAsync(
                'UPDATE graph_nodes SET play_count = play_count + 1, last_played_at = ? WHERE id = ?',
                [Date.now(), nodeId]
            );
        } catch (e) {
            console.error('[GraphService] recordPlay Error', e);
        }
    }

    /**
     * Batch process a session of songs to build/update the graph.
     */
    async processSession(
        sessionSongs: { name: string, artist: string, spotifyId: string, visited: boolean }[],
        vibeName: string
    ) {
        console.time('[Perf] Graph Process Session');
        try {
            // 1. Get/Create Vibe Node
            const vibeNode = await this.getEffectiveNode('VIBE', vibeName, null, {});
            if (!vibeNode) return;

            let previousNodeId: number | null = null;

            // Try to link to the last song played before this session to maintain continuity
            // If we have no previous node tracking, maybe fetch the very last node from graph?
            // For now, simple sequence within session is enough.
            // Actually, let's fetch the most recent song to link the FIRST song of this session to it.
            try {
                const candidates = await this.getCandidates(1);
                if (candidates.length > 0) {
                    previousNodeId = candidates[0].id;
                }
            } catch (ignore) { }

            for (const song of sessionSongs) {
                if (!song.visited) continue; // Only process listened songs? Or all? User said "songs that were on the vibe"

                // 2. Get/Create Song Node
                const songNode = await this.getEffectiveNode(
                    'SONG',
                    song.name,
                    song.spotifyId,
                    { artist: song.artist }
                );

                if (songNode) {
                    // Update stats
                    await this.recordPlay(songNode.id);

                    // Link Vibe <-> Song (both directions for traversal)
                    await this.connectNodes(vibeNode.id, songNode.id, 'RELATED', 1.0);
                    await this.connectNodes(songNode.id, vibeNode.id, 'RELATED', 1.0);

                    // Link Previous Song -> Current Song (Sequence)
                    if (previousNodeId) {
                        await this.connectNodes(previousNodeId, songNode.id, 'NEXT', 1.0);
                    }

                    previousNodeId = songNode.id;
                }
            }
            console.log(`[GraphService] Processed session '${vibeName}' with ${sessionSongs.length} songs.`);
        } catch (e) {
            console.error('[GraphService] processSession Error', e);
        } finally {
            console.timeEnd('[Perf] Graph Process Session');
        }
    }

    /**
     * Get candidate nodes for Gemini context.
     * Excludes songs played "today" (since midnight).
     */
    async getCandidates(limit: number = 5): Promise<GraphNode[]> {
        if (!dbService.database) {
            // Memory path: return most recently played SONG nodes
            const songNodes: GraphNode[] = [];
            for (const node of this.memoryNodes.values()) {
                if (node.type === 'SONG') songNodes.push(node);
            }
            return songNodes
                .sort((a, b) => (b.last_played_at || 0) - (a.last_played_at || 0))
                .slice(0, limit);
        }

        try {
            const result = await dbService.database.getAllAsync<any>(
                'SELECT * FROM graph_nodes WHERE type = "SONG" ORDER BY last_played_at DESC LIMIT ?',
                [limit]
            );

            return result?.map(r => ({ ...r, data: JSON.parse(r.data || '{}') })) || [];
        } catch (e) {
            console.error('[GraphService] getCandidates Error', e);
            return [];
        }
    }

    /**
     * Get suggestions from the graph (traversal).
     * Filters out songs played today.
     */
    async getNextSuggestedNode(currentNodeId: number, excludeIds: Set<number> = new Set()): Promise<GraphNode | null> {
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const todayTimestamp = todayStart.getTime();

        // Memory fallback path
        if (!dbService.database) {
            const candidates: { node: GraphNode; weight: number }[] = [];
            for (const edge of this.memoryEdges) {
                if (edge.source !== currentNodeId) continue;
                const targetNode = this.memoryNodes.get(edge.target);
                if (!targetNode || targetNode.type !== 'SONG') continue;
                if (targetNode.last_played_at >= todayTimestamp) continue;
                if (excludeIds.has(targetNode.id)) continue;
                candidates.push({ node: targetNode, weight: edge.weight });
            }
            candidates.sort((a, b) => b.weight - a.weight);
            return candidates.length > 0 ? candidates[0].node : null;
        }

        try {
            // Fetch top 10 candidates and find first non-excluded
            const results = await dbService.database?.getAllAsync<any>(
                `SELECT n.*
                 FROM graph_edges e
                 JOIN graph_nodes n ON e.target_id = n.id
                 WHERE e.source_id = ?
                 AND n.last_played_at < ?
                 AND n.type = 'SONG'
                 ORDER BY e.weight DESC
                 LIMIT 10`,
                [currentNodeId, todayTimestamp]
            );

            if (results) {
                for (const result of results) {
                    if (!excludeIds.has(result.id)) {
                        return { ...result, data: JSON.parse(result.data || '{}') };
                    }
                }
            }

            return null;
        } catch (e) {
            console.error('[GraphService] getNextSuggestedNode Error', e);
            return null;
        }
    }

    /**
     * Get all neighbors of a node (for Context)
     */
    async getNeighbors(nodeId: number, limit: number = 5): Promise<{ name: string; artist: string; weight: number }[]> {
        if (!dbService.database) {
            // Memory path: traverse edges from nodeId, resolve target nodes
            const neighbors: { name: string; artist: string; weight: number }[] = [];
            for (const edge of this.memoryEdges) {
                if (edge.source !== nodeId) continue;
                const targetNode = this.memoryNodes.get(edge.target);
                if (!targetNode) continue;
                const data = typeof targetNode.data === 'string' ? JSON.parse(targetNode.data || '{}') : (targetNode.data || {});
                neighbors.push({ name: targetNode.name, artist: data.artist || 'Unknown', weight: edge.weight });
            }
            return neighbors.sort((a, b) => b.weight - a.weight).slice(0, limit);
        }

        try {
            const results = await dbService.database.getAllAsync<any>(
                `SELECT n.name, n.data, e.weight
                 FROM graph_edges e
                 JOIN graph_nodes n ON e.target_id = n.id
                 WHERE e.source_id = ?
                 ORDER BY e.weight DESC
                 LIMIT ?`,
                [nodeId, limit]
            );

            return results?.map(r => {
                const data = JSON.parse(r.data || '{}');
                return {
                    name: r.name,
                    artist: data.artist || 'Unknown',
                    weight: r.weight
                };
            }) || [];

        } catch (e) {
            console.error('[GraphService] getNeighbors Error', e);
            return [];
        }
    }
    /**
     * Quantize audio features into a bucket key for similarity grouping.
     * 3 dimensions (energy, valence, danceability) x 3 bins each = 27 buckets.
     */
    private getAudioBucket(features: { energy: number; valence: number; danceability: number }): string {
        const bin = (v: number) => v < 0.33 ? 0 : v < 0.66 ? 1 : 2;
        return `${bin(features.energy)}-${bin(features.valence)}-${bin(features.danceability)}`;
    }

    /** Audio feature dimensions used for AUDIO_FEATURE nodes (one node per dimension). */
    private static readonly AUDIO_FEATURE_NAMES = [
        'energy', 'valence', 'danceability', 'tempo', 'acousticness', 'instrumentalness'
    ] as const;

    /**
     * Ingest User's Liked Songs into the Graph (Background Process).
     * 1. Fetch ALL liked songs into memory.
     * 2. Fetch artist details (with genres) for all unique artists.
     * 3. Iterate song-by-song: create SONG, connect to ARTIST and GENRE using hash tables (create if missing).
     * 4. Audio features + SIMILAR + HAS_FEATURE edges.
     */
    async ingestLikedSongs() {
        console.log('[GraphService] Starting Liked Songs Ingestion...');

        const { spotifyRemote } = require('@/services/spotify/SpotifyRemoteService');
        const initStore = require('@/stores/InitializationStore').useInitializationStore.getState();

        try {
            // ===== 1. Fetch ALL liked songs into memory =====
            initStore.setStatusMessage('Fetching liked songs...');
            const PAGE_SIZE = 50;
            const allSongs: { trackId: string; trackName: string; primaryArtistId: string; primaryArtistName: string }[] = [];
            let offset = 0;
            let totalSongs = 0;

            const firstPage = await spotifyRemote.getUserSavedTracks(PAGE_SIZE, 0);
            totalSongs = firstPage.total;
            if (!firstPage.items?.length) {
                // If total > 0 but items empty, the API likely failed — don't mark as done
                if (totalSongs > 0) {
                    console.warn('[GraphService] Liked songs API returned items=[] but total=' + totalSongs + '. Skipping (possible API error).');
                    throw new Error('Liked songs fetch returned empty items despite total > 0');
                }
                console.log('[GraphService] No liked songs found (user library is empty).');
                await dbService.setPreference('graph_ingested_liked', 'true');
                return;
            }

            const pushPage = (items: any[]) => {
                for (const item of items) {
                    const track = item?.track;
                    if (!track?.id) continue;
                    const primary = track.artists?.[0];
                    allSongs.push({
                        trackId: track.id,
                        trackName: track.name,
                        primaryArtistId: primary?.id ?? '',
                        primaryArtistName: primary?.name ?? 'Unknown',
                    });
                }
            };

            pushPage(firstPage.items);
            offset = firstPage.items.length;
            initStore.setProgress({ current: offset, total: totalSongs });

            while (offset < totalSongs) {
                const page = await spotifyRemote.getUserSavedTracks(PAGE_SIZE, offset);
                if (!page.items?.length) break;
                pushPage(page.items);
                offset += page.items.length;
                initStore.setProgress({ current: offset, total: totalSongs });
                await new Promise(r => setTimeout(r, 50));
            }

            console.log(`[GraphService] Fetched ${allSongs.length} songs into memory`);

            // ===== 2. Artist details (with genres) for all unique artists =====
            const uniqueArtistIds = Array.from(new Set(allSongs.map(s => s.primaryArtistId).filter(Boolean)));
            initStore.setStatusMessage('Loading artist details...');
            const artistDetailsList = await spotifyRemote.getArtistsBatch(uniqueArtistIds);
            const artistDetailsMap = new Map<string, { id: string; name: string; genres: string[] }>();
            uniqueArtistIds.forEach((id, i) => {
                const a = artistDetailsList[i];
                if (a?.id) artistDetailsMap.set(id, { id: a.id, name: a.name, genres: a.genres ?? [] });
            });

            // ===== 3. Build graph: hash tables so we create once and reuse =====
            const genreToNode = new Map<string, GraphNode>();
            const artistToNode = new Map<string, GraphNode>();
            const trackNodeIds = new Map<string, number>();
            const trackIds: string[] = [];

            initStore.setStatusMessage('Building graph (songs → artist & genre)...');
            initStore.setProgress({ current: 0, total: allSongs.length });

            let artistEdgeCount = 0;
            let genreEdgeCount = 0;

            for (let i = 0; i < allSongs.length; i++) {
                const song = allSongs[i];
                const songNode = await this.getEffectiveNode(
                    'SONG',
                    song.trackName,
                    song.trackId,
                    { artist: song.primaryArtistName },
                    false
                );
                if (!songNode) continue;

                trackNodeIds.set(song.trackId, songNode.id);
                trackIds.push(song.trackId);

                const artistData = song.primaryArtistId ? artistDetailsMap.get(song.primaryArtistId) : null;
                if (artistData) {
                    let artistNode = artistToNode.get(artistData.id);
                    if (!artistNode) {
                        const created = await this.getEffectiveNode(
                            'ARTIST',
                            artistData.name,
                            artistData.id,
                            { genres: artistData.genres },
                            false
                        );
                        if (created) {
                            artistToNode.set(artistData.id, created);
                            artistNode = created;
                        }
                    }
                    if (artistNode) {
                        await this.connectNodes(songNode.id, artistNode.id, 'RELATED', 1.0, false);
                        artistEdgeCount++;
                    }
                }

                const genres = artistData?.genres ?? [];
                for (const genreName of genres) {
                    if (!genreName) continue;
                    let genreNode = genreToNode.get(genreName);
                    if (!genreNode) {
                        const created = await this.getEffectiveNode('GENRE', genreName, null, {}, false);
                        if (created) {
                            genreToNode.set(genreName, created);
                            genreNode = created;
                        }
                    }
                    if (genreNode) {
                        await this.connectNodes(songNode.id, genreNode.id, 'HAS_GENRE', 1.0, false);
                        genreEdgeCount++;
                    }
                }

                if (i % 100 === 0) initStore.setProgress({ current: i, total: allSongs.length });
            }

            console.log(`[GraphService] Graph links: ${artistToNode.size} artists, ${genreToNode.size} genres, ${artistEdgeCount} SONG→ARTIST, ${genreEdgeCount} SONG→GENRE`);

            // ===== 4. Audio features + SIMILAR + HAS_FEATURE =====
            initStore.setStatusMessage('Analyzing audio features...');
            initStore.setProgress({ current: 0, total: trackIds.length });
            const audioFeatures = await spotifyRemote.getAudioFeaturesBatch(trackIds);
            const buckets: Map<string, number[]> = new Map();

            for (let i = 0; i < audioFeatures.length; i++) {
                const features = audioFeatures[i];
                const trackId = trackIds[i];
                const nodeId = trackNodeIds.get(trackId);
                if (!features || !nodeId) continue;

                await this.updateNodeData(nodeId, {
                    energy: features.energy,
                    valence: features.valence,
                    danceability: features.danceability,
                    tempo: features.tempo,
                    acousticness: features.acousticness,
                    instrumentalness: features.instrumentalness,
                });

                const bucket = this.getAudioBucket(features);
                if (!buckets.has(bucket)) buckets.set(bucket, []);
                buckets.get(bucket)!.push(nodeId);

                for (const featName of GraphService.AUDIO_FEATURE_NAMES) {
                    const featNode = await this.getEffectiveNode('AUDIO_FEATURE', featName, null, {}, false);
                    const value = (features as any)[featName];
                    if (featNode != null && typeof value === 'number') {
                        const normalized = featName === 'tempo' ? Math.min(1, value / 200) : value;
                        await this.connectNodes(nodeId, featNode.id, 'HAS_FEATURE', normalized, false);
                    }
                }
                if (i % 100 === 0) initStore.setProgress({ current: i, total: trackIds.length });
            }

            let similarEdgeCount = 0;
            for (const [, nodeIds] of buckets) {
                for (let j = 0; j < nodeIds.length - 1; j++) {
                    await this.connectNodes(nodeIds[j], nodeIds[j + 1], 'SIMILAR', 1.0, false);
                    similarEdgeCount++;
                }
            }
            console.log(`[GraphService] Audio phase: ${similarEdgeCount} SIMILAR edges across ${buckets.size} buckets`);

            this.persistToStorage();
            this.invalidateCache(); // Clear cache so next view gets fresh data
            await dbService.setPreference('graph_ingested_liked', 'true');
            initStore.setStatusMessage('Ingestion complete!');
            initStore.setProgress({ current: allSongs.length, total: allSongs.length });
            console.log('[GraphService] Ingestion Complete.');
        } catch (e) {
            console.error('[GraphService] Ingestion Failed', e);
            throw e;
        }
    }

    /**
     * Get Cluster Representatives
     * "Give Gemini 2 songs from each big cluster"
     */
    async getClusterRepresentatives(limit: number = 8): Promise<GraphNode[]> {
        if (!dbService.database) {
            // Memory path: collect SONG nodes, sort by play_count desc, pick diverse artists
            const songNodes: GraphNode[] = [];
            for (const node of this.memoryNodes.values()) {
                if (node.type === 'SONG') songNodes.push(node);
            }
            songNodes.sort((a, b) => (b.play_count || 0) - (a.play_count || 0));

            const selected: GraphNode[] = [];
            const selectedIds = new Set<number>();

            // 1. Pick top one
            if (songNodes.length === 0) return [];
            selected.push(songNodes[0]);
            selectedIds.add(songNodes[0].id);

            // 2. Pick others with artist diversity
            for (let i = 1; i < songNodes.length && selected.length < limit; i++) {
                const cand = songNodes[i];
                const candData = typeof cand.data === 'string' ? JSON.parse(cand.data || '{}') : (cand.data || {});
                const sameArtist = selected.some(s => {
                    const sData = typeof s.data === 'string' ? JSON.parse(s.data || '{}') : (s.data || {});
                    return sData.artist === candData.artist;
                });
                if (!sameArtist) {
                    selected.push(cand);
                    selectedIds.add(cand.id);
                }
            }

            // Fill rest if needed
            if (selected.length < limit) {
                for (const c of songNodes) {
                    if (!selectedIds.has(c.id)) {
                        selected.push(c);
                        selectedIds.add(c.id);
                        if (selected.length >= limit) break;
                    }
                }
            }

            return selected;
        }

        try {
            // Fetch candidates (Top 50 played/connected)
            const candidates = await dbService.database.getAllAsync<any>(
                `SELECT * FROM graph_nodes WHERE type = 'SONG' ORDER BY play_count DESC, id DESC LIMIT 50`
            );

            if (candidates.length === 0) return [];

            const selected: any[] = [];
            const selectedIds = new Set<number>();

            // 1. Pick top one
            const first = candidates[0];
            selected.push(first);
            selectedIds.add(first.id);

            // 2. Pick others that are NOT connected to selected (Simple Diversity)
            for (let i = 1; i < candidates.length && selected.length < limit; i++) {
                const cand = candidates[i];
                const candData = JSON.parse(cand.data || '{}');

                const sameArtist = selected.some(s => {
                    const sData = JSON.parse(s.data || '{}');
                    return sData.artist === candData.artist;
                });

                if (!sameArtist) {
                    selected.push(cand);
                    selectedIds.add(cand.id);
                }
            }

            // Fill rest if needed
            if (selected.length < limit) {
                for (const c of candidates) {
                    if (!selectedIds.has(c.id)) {
                        selected.push(c);
                        selectedIds.add(c.id);
                        if (selected.length >= limit) break;
                    }
                }
            }

            return selected.map(s => ({ ...s, data: JSON.parse(s.data || '{}') }));
        } catch (e) {
            console.error('[GraphService] Cluster Reps Error', e);
            return [];
        }
    }

    /**
     * Get a rich taste profile for Gemini prompts.
     * Returns cluster reps, top genres, recent vibes, and average audio profile.
     */
    async getTasteProfile(): Promise<{
        clusterReps: { name: string; artist: string; playCount: number }[];
        topGenres: { name: string; songCount: number }[];
        recentVibes: string[];
        audioProfile: { energy: number; valence: number; danceability: number } | null;
    }> {
        // 1. Cluster representatives (6, up from 4)
        const reps = await this.getClusterRepresentatives(6);
        const clusterReps = reps.map(r => {
            const data = typeof r.data === 'string' ? JSON.parse(r.data || '{}') : (r.data || {});
            return { name: r.name, artist: data.artist || 'Unknown', playCount: r.play_count || 0 };
        });

        // 2. Top genres (8)
        const genres = await this.getTopGenres(8);
        const topGenres = genres.map(g => ({ name: g.name, songCount: g.songCount }));

        // 3. Recent vibes (last 5 VIBE nodes by last_played_at)
        let recentVibes: string[] = [];
        if (!dbService.database) {
            // Memory path
            const vibeNodes: GraphNode[] = [];
            for (const node of this.memoryNodes.values()) {
                if (node.type === 'VIBE') vibeNodes.push(node);
            }
            recentVibes = vibeNodes
                .sort((a, b) => (b.last_played_at || 0) - (a.last_played_at || 0))
                .slice(0, 5)
                .map(v => v.name);
        } else {
            try {
                const vibes = await dbService.database.getAllAsync<any>(
                    `SELECT name FROM graph_nodes WHERE type = 'VIBE' ORDER BY last_played_at DESC LIMIT 5`
                );
                recentVibes = (vibes || []).map((v: any) => v.name);
            } catch (e) {
                console.error('[GraphService] getTasteProfile vibes error', e);
            }
        }

        // 4. Average audio profile from top-played songs
        let audioProfile: { energy: number; valence: number; danceability: number } | null = null;
        if (!dbService.database) {
            // Memory path: average from all SONG nodes with audio data
            let totalE = 0, totalV = 0, totalD = 0, count = 0;
            for (const node of this.memoryNodes.values()) {
                if (node.type !== 'SONG') continue;
                const d = typeof node.data === 'string' ? JSON.parse(node.data || '{}') : (node.data || {});
                if (typeof d.energy === 'number') {
                    totalE += d.energy;
                    totalV += d.valence || 0;
                    totalD += d.danceability || 0;
                    count++;
                }
            }
            if (count > 0) {
                audioProfile = {
                    energy: Math.round((totalE / count) * 100) / 100,
                    valence: Math.round((totalV / count) * 100) / 100,
                    danceability: Math.round((totalD / count) * 100) / 100,
                };
            }
        } else {
            try {
                const result = await dbService.database.getFirstAsync<any>(
                    `SELECT
                        AVG(json_extract(data, '$.energy')) as avg_energy,
                        AVG(json_extract(data, '$.valence')) as avg_valence,
                        AVG(json_extract(data, '$.danceability')) as avg_dance
                     FROM graph_nodes
                     WHERE type = 'SONG'
                     AND json_extract(data, '$.energy') IS NOT NULL
                     ORDER BY play_count DESC
                     LIMIT 100`
                );
                if (result && result.avg_energy != null) {
                    audioProfile = {
                        energy: Math.round(result.avg_energy * 100) / 100,
                        valence: Math.round(result.avg_valence * 100) / 100,
                        danceability: Math.round(result.avg_dance * 100) / 100,
                    };
                }
            } catch (e) {
                console.error('[GraphService] getTasteProfile audio error', e);
            }
        }

        return { clusterReps, topGenres, recentVibes, audioProfile };
    }

    /**
     * Commit Session to Graph (works on both SQLite and Memory/Web platforms)
     */
    async commitSession(vibeName: string, songs: { name: string, artist: string, spotifyId: string, visited: boolean }[]) {
        const visitedSongs = songs.filter(s => s.visited);
        if (visitedSongs.length === 0) return;

        console.log(`[GraphService] Committing session '${vibeName}' with ${visitedSongs.length} songs`);

        const commitWork = async () => {
            const vibeNode = await this.getEffectiveNode('VIBE', vibeName, null, {});
            let prevNodeId: number | null = null;

            for (const song of visitedSongs) {
                // Ensure Song Node (create or update)
                const songNode = await this.getEffectiveNode('SONG', song.name, song.spotifyId, { artist: song.artist });
                if (!songNode) continue;

                // Update connection to Vibe (both directions)
                if (vibeNode) {
                    await this.connectNodes(vibeNode.id, songNode.id, 'RELATED', 2.0);
                    await this.connectNodes(songNode.id, vibeNode.id, 'RELATED', 2.0);
                }

                // Link Prev -> Current (Next)
                if (prevNodeId) {
                    await this.connectNodes(prevNodeId, songNode.id, 'NEXT', 1.0);
                }
                prevNodeId = songNode.id;

                // Record play (play_count + last_played_at)
                await this.recordPlay(songNode.id);
            }
        };

        try {
            if (dbService.database) {
                // SQLite: wrap in transaction for atomicity
                await dbService.database.withTransactionAsync(commitWork);
            } else {
                // Memory/Web: run directly, persist once at end
                await commitWork();
                this.persistToStorage();
            }
        } catch (e) {
            console.error('[GraphService] Commit Session Failed', e);
        }
    }

    // --- Caching ---
    private snapshotCache: { nodes: GraphNode[]; edges: GraphEdge[] } | null = null;

    public invalidateCache() {
        this.snapshotCache = null;
        console.log('[GraphService] Cache invalidated');
    }

    /**
     * Save node positions to cache and storage to skip simulation warmup on next load.
     */
    public async saveGraphPositions(nodes: { id: number; x: number; y: number }[]): Promise<void> {
        console.log(`[GraphService] Saving positions for ${nodes.length} nodes...`);
        let updatedCount = 0;

        // 1. Update Memory
        for (const n of nodes) {
            const node = this.memoryNodes.get(n.id);
            if (node) {
                node.x = n.x;
                node.y = n.y;
                updatedCount++;
            }
        }

        // 2. Persist to Storage
        if (dbService.database) {
            // SQLite: batch-update positions in a single transaction
            try {
                const db = dbService.database;
                await db.withTransactionAsync(async () => {
                    for (const n of nodes) {
                        await db.runAsync(
                            'UPDATE graph_nodes SET pos_x = ?, pos_y = ? WHERE id = ?',
                            [n.x, n.y, n.id]
                        );
                    }
                });
                console.log(`[GraphService] Persisted ${nodes.length} positions to SQLite`);
            } catch (e) {
                console.error('[GraphService] Failed to persist positions to SQLite', e);
            }
        } else {
            this.persistToStorage();
        }

        // 3. Update Snapshot Cache if exists
        if (this.snapshotCache) {
            const posMap = new Map(nodes.map(n => [n.id, n]));
            this.snapshotCache.nodes.forEach(n => {
                const pos = posMap.get(n.id);
                if (pos) {
                    n.x = pos.x;
                    n.y = pos.y;
                }
            });
        }

        console.log(`[GraphService] Saved positions for ${updatedCount} nodes.`);
    }

    /**
     * Get a snapshot of the current graph state (nodes and edges).
     * Used for visualization and initial loading.
     * @param forceRefresh - If true, bypass cache and fetch from DB.
     */
    async getGraphSnapshot(forceRefresh: boolean = false): Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }> {
        if (!forceRefresh && this.snapshotCache) {
            console.log('[GraphService] Returning cached graph snapshot');
            return this.snapshotCache;
        }

        // On Android/native, DB init is async; wait so we don't return empty memory fallback
        await dbService.waitUntilReady();

        if (!dbService.database) {
            // Memory fallback (web or no SQLite)
            const result = {
                nodes: Array.from(this.memoryNodes.values()),
                edges: this.memoryEdges.map(e => ({ ...e, weight: e.weight || 1.0 })),
            };
            this.snapshotCache = result;
            return result;
        }

        try {
            console.time('[Perf] getGraphSnapshot DB Fetch');
            const nodes = await dbService.database.getAllAsync<GraphNode>('SELECT * FROM graph_nodes');
            const rawEdges = await dbService.database.getAllAsync<any>('SELECT * FROM graph_edges');
            console.timeEnd('[Perf] getGraphSnapshot DB Fetch');

            // Ensure data is parsed correctly for nodes; map pos_x/pos_y → x/y
            const parsedNodes = nodes.map((n: any) => ({
                ...n,
                data: JSON.parse(n.data || '{}'),
                x: n.pos_x ?? undefined,
                y: n.pos_y ?? undefined,
            }));

            // Map raw edges to GraphEdge format
            const edges: GraphEdge[] = rawEdges.map((e: any) => ({
                source: e.source_id,
                target: e.target_id,
                type: e.type as EdgeType,
                weight: e.weight ?? 1.0
            }));

            const result = { nodes: parsedNodes, edges };
            this.snapshotCache = result;
            console.log(`[GraphService] Cached ${result.nodes.length} nodes and ${result.edges.length} edges`);
            return result;
        } catch (e) {
            console.error('[GraphService] getGraphSnapshot Error', e);
            return { nodes: [], edges: [] };
        }
    }

    /**
     * Check if the graph has any song nodes.
     * Used to verify if ingestion is needed (especially on Web where DB might be reset).
     */
    async isGraphPopulated(): Promise<boolean> {
        if (!dbService.database) {
            // Check memory nodes
            let songCount = 0;
            for (const node of this.memoryNodes.values()) {
                if (node.type === 'SONG') songCount++;
            }
            return songCount > 0;
        }

        try {
            const result = await dbService.database?.getFirstAsync<{ count: number }>(
                'SELECT COUNT(*) as count FROM graph_nodes WHERE type = ?',
                ['SONG']
            );
            return (result?.count || 0) > 0;
        } catch (e) {
            console.error('[GraphService] isGraphPopulated Error', e);
            return false;
        }
    }

    /**
     * Get top genres ranked by total edge weight and song count.
     * Used for graph-based fallback when Gemini is unavailable.
     */
    async getTopGenres(limit: number = 10): Promise<{ name: string; songCount: number; totalWeight: number }[]> {
        if (!dbService.database) {
            // Memory path: aggregate HAS_GENRE edges by target genre node
            const genreStats = new Map<number, { name: string; songCount: Set<number>; totalWeight: number }>();

            for (const edge of this.memoryEdges) {
                if (edge.type !== 'HAS_GENRE') continue;
                const targetNode = this.memoryNodes.get(edge.target);
                if (!targetNode || targetNode.type !== 'GENRE') continue;

                let stats = genreStats.get(edge.target);
                if (!stats) {
                    stats = { name: targetNode.name, songCount: new Set(), totalWeight: 0 };
                    genreStats.set(edge.target, stats);
                }
                stats.songCount.add(edge.source);
                stats.totalWeight += edge.weight;
            }

            return Array.from(genreStats.values())
                .map(s => ({ name: s.name, songCount: s.songCount.size, totalWeight: s.totalWeight }))
                .sort((a, b) => b.totalWeight - a.totalWeight)
                .slice(0, limit);
        }

        try {
            const results = await dbService.database.getAllAsync<any>(
                `SELECT gn.name, COUNT(DISTINCT ge.source_id) as song_count, SUM(ge.weight) as total_weight
                 FROM graph_edges ge
                 JOIN graph_nodes gn ON ge.target_id = gn.id AND gn.type = 'GENRE'
                 WHERE ge.type = 'HAS_GENRE'
                 GROUP BY gn.id
                 ORDER BY total_weight DESC
                 LIMIT ?`,
                [limit]
            );

            return (results || []).map((r: any) => ({
                name: r.name,
                songCount: r.song_count,
                totalWeight: r.total_weight
            }));
        } catch (e) {
            console.error('[GraphService] getTopGenres Error', e);
            return [];
        }
    }

    /**
     * Find songs connected to given genres, excluding specified URIs.
     * Returns GraphNode[] with spotify_id already set (no Spotify search needed).
     */
    async getSongsByGenres(genreNames: string[], limit: number = 20, excludeUris: Set<string> = new Set()): Promise<GraphNode[]> {
        if (genreNames.length === 0) return [];

        if (!dbService.database) {
            // Memory path: find genre node IDs, then find songs via HAS_GENRE edges
            const genreNodeIds = new Set<number>();
            for (const name of genreNames) {
                const key = GraphService.typeNameKey('GENRE', name);
                const node = this.memoryNodesByTypeName.get(key);
                if (node) genreNodeIds.add(node.id);
            }
            if (genreNodeIds.size === 0) return [];

            // Collect songs and their best edge weight to any matching genre
            const songScores = new Map<number, { node: GraphNode; weight: number }>();
            for (const edge of this.memoryEdges) {
                if (edge.type !== 'HAS_GENRE') continue;
                if (!genreNodeIds.has(edge.target)) continue;

                const songNode = this.memoryNodes.get(edge.source);
                if (!songNode || songNode.type !== 'SONG') continue;
                if (!songNode.spotify_id) continue;
                if (excludeUris.has(songNode.spotify_id) || excludeUris.has(`spotify:track:${songNode.spotify_id}`)) continue;

                const existing = songScores.get(edge.source);
                if (existing) {
                    existing.weight += edge.weight;
                } else {
                    songScores.set(edge.source, { node: songNode, weight: edge.weight });
                }
            }

            return Array.from(songScores.values())
                .sort((a, b) => b.weight - a.weight)
                .slice(0, limit)
                .map(s => s.node);
        }

        try {
            const placeholders = genreNames.map(() => '?').join(',');
            const todayStart = new Date();
            todayStart.setHours(0, 0, 0, 0);

            const results = await dbService.database.getAllAsync<any>(
                `SELECT DISTINCT sn.*, SUM(ge.weight) as genre_weight
                 FROM graph_nodes gn
                 JOIN graph_edges ge ON ge.target_id = gn.id AND ge.type = 'HAS_GENRE'
                 JOIN graph_nodes sn ON ge.source_id = sn.id AND sn.type = 'SONG'
                 WHERE gn.type = 'GENRE' AND gn.name IN (${placeholders})
                 AND sn.spotify_id IS NOT NULL
                 AND (sn.last_played_at < ? OR sn.last_played_at = 0)
                 GROUP BY sn.id
                 ORDER BY genre_weight DESC, sn.play_count DESC
                 LIMIT ?`,
                [...genreNames, todayStart.getTime(), limit]
            );

            if (!results) return [];

            // Filter out excluded URIs in JS (simpler than SQL with dynamic exclude list)
            return results
                .filter((r: any) => !excludeUris.has(r.spotify_id) && !excludeUris.has(`spotify:track:${r.spotify_id}`))
                .map((r: any) => ({
                    ...r,
                    data: JSON.parse(r.data || '{}')
                })) as GraphNode[];
        } catch (e) {
            console.error('[GraphService] getSongsByGenres Error', e);
            return [];
        }
    }

    /**
     * Clear all graph data (for testing/re-ingestion)
     */
    async clearGraph(): Promise<void> {
        console.log('[GraphService] Clearing graph data...');

        // Clear memory
        this.memoryNodes.clear();
        this.memoryEdges = [];
        this.memoryEdgeIndex.clear();
        this.nextNodeId = 1;
        this.rebuildMemoryIndices();

        // Clear localStorage (use the same keys as persistToStorage)
        if (typeof localStorage !== 'undefined') {
            localStorage.removeItem(this.STORAGE_KEY_NODES);
            localStorage.removeItem(this.STORAGE_KEY_EDGES);
        }

        // Clear DB if available
        if (dbService.database) {
            try {
                await dbService.database.runAsync('DELETE FROM graph_edges');
                await dbService.database.runAsync('DELETE FROM graph_nodes');
            } catch (e) {
                console.error('[GraphService] clearGraph DB Error', e);
            }
        }

        // Clear ingestion flag
        await dbService.setPreference('graph_ingested_liked', '');

        this.snapshotCache = null;
        console.log('[GraphService] Graph cleared.');
    }
}

export const graphService = GraphService.getInstance();
