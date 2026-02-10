/**
 * Graph Test Helpers
 *
 * DRY utilities for building and asserting on the in-memory graph.
 * All helpers operate on the real graphService singleton (no mocks).
 */
import { graphService } from '../../services/graph/GraphService';

// Re-export types for convenience
type NodeType = 'SONG' | 'ARTIST' | 'GENRE' | 'VIBE' | 'AUDIO_FEATURE';
type EdgeType = 'SIMILAR' | 'SAME_ARTIST' | 'IN_GENRE' | 'HAS_VIBE' | 'NEXT' | 'RELATED' | 'HAS_GENRE' | 'HAS_FEATURE';

interface CreatedNode {
    id: number;
    name: string;
    type: NodeType;
    spotify_id: string | null;
    play_count: number;
    last_played_at: string | null;
    data: Record<string, any>;
}

// ─── Node Factories ─────────────────────────────────────────

/** Create a SONG node. Returns the non-null node. */
export async function song(name: string, spotifyId: string, data?: Record<string, any>): Promise<CreatedNode> {
    const node = await graphService.getEffectiveNode('SONG', name, spotifyId, data);
    return node!;
}

/** Create an ARTIST node. */
export async function artist(name: string, spotifyId?: string): Promise<CreatedNode> {
    const node = await graphService.getEffectiveNode('ARTIST', name, spotifyId ?? null);
    return node!;
}

/** Create a GENRE node. */
export async function genre(name: string): Promise<CreatedNode> {
    const node = await graphService.getEffectiveNode('GENRE', name, null);
    return node!;
}

/** Create a VIBE node. */
export async function vibe(name: string): Promise<CreatedNode> {
    const node = await graphService.getEffectiveNode('VIBE', name, null);
    return node!;
}

// ─── Edge Helpers ───────────────────────────────────────────

/** Connect two nodes. Shorthand for graphService.connectNodes. */
export async function connect(sourceId: number, targetId: number, type: EdgeType, weight = 1.0) {
    await graphService.connectNodes(sourceId, targetId, type, weight);
}

/** Connect a song to a genre with HAS_GENRE type. */
export async function tagGenre(songId: number, genreId: number, weight = 1.0) {
    await connect(songId, genreId, 'HAS_GENRE', weight);
}

// ─── Play Helpers ───────────────────────────────────────────

/** Record N plays for a node. */
export async function playTimes(nodeId: number, count: number) {
    for (let i = 0; i < count; i++) {
        await graphService.recordPlay(nodeId);
    }
}

// ─── Snapshot Helpers ───────────────────────────────────────

/** Get a fresh snapshot. */
export async function snapshot() {
    return graphService.getGraphSnapshot(true);
}

/** Get nodes from snapshot, optionally filtered by type. */
export async function snapshotNodes(type?: NodeType) {
    const snap = await snapshot();
    return type ? snap.nodes.filter(n => n.type === type) : snap.nodes;
}

/** Get edges from snapshot, optionally filtered by type. */
export async function snapshotEdges(type?: EdgeType) {
    const snap = await snapshot();
    return type ? snap.edges.filter(e => e.type === type) : snap.edges;
}

// ─── Graph Builders ─────────────────────────────────────────
// Pre-built graph topologies for common test scenarios.

export interface SongDef {
    name: string;
    spotifyId: string;
    artist?: string;
    genres?: string[];
    plays?: number;
    audioFeatures?: { energy?: number; valence?: number; danceability?: number };
}

/**
 * Build a graph from a declarative song list.
 * Creates SONG, GENRE, and optionally plays them.
 * Returns a map of spotifyId -> node for easy lookup.
 */
export async function buildGraph(songs: SongDef[]): Promise<Map<string, CreatedNode>> {
    const nodeMap = new Map<string, CreatedNode>();
    const genreCache = new Map<string, CreatedNode>();

    for (const def of songs) {
        const data: Record<string, any> = {};
        if (def.artist) data.artist = def.artist;
        if (def.audioFeatures) Object.assign(data, def.audioFeatures);

        const s = await song(def.name, def.spotifyId, data);
        nodeMap.set(def.spotifyId, s);

        // Connect genres
        if (def.genres) {
            for (const g of def.genres) {
                let gNode = genreCache.get(g);
                if (!gNode) {
                    gNode = await genre(g);
                    genreCache.set(g, gNode);
                }
                await tagGenre(s.id, gNode.id);
            }
        }

        // Record plays
        if (def.plays) {
            await playTimes(s.id, def.plays);
        }
    }

    return nodeMap;
}

/**
 * Build a star topology: one center node connected to N neighbors via NEXT edges.
 * Returns { center, neighbors }.
 */
export async function buildStar(
    centerName: string,
    neighborNames: string[],
    weights?: number[]
): Promise<{ center: CreatedNode; neighbors: CreatedNode[] }> {
    const center = await song(centerName, `sp:${centerName.toLowerCase()}`);
    const neighbors: CreatedNode[] = [];

    for (let i = 0; i < neighborNames.length; i++) {
        const n = await song(neighborNames[i], `sp:${neighborNames[i].toLowerCase()}`);
        await connect(center.id, n.id, 'NEXT', weights?.[i] ?? 1.0);
        neighbors.push(n);
    }

    return { center, neighbors };
}
