import type { NodeType, EdgeType } from './GraphService';

/** Single source of truth for graph node colors (visualization). */
export const NODE_COLORS: Record<NodeType, string> = {
    SONG: '#2196F3',
    ARTIST: '#8BC34A',
    VIBE: '#9C27B0',
    AUDIO_FEATURE: '#FF9800',
    GENRE: '#673AB7',
};

/** Single source of truth for graph edge colors (visualization). */
export const EDGE_COLORS: Record<EdgeType, string> = {
    SIMILAR: '#4CAF50',
    NEXT: '#00BCD4',
    RELATED: '#E91E63',
    HAS_FEATURE: '#FF9800',
    HAS_GENRE: '#673AB7',
};

export function getNodeColor(type: NodeType): string {
    return NODE_COLORS[type] ?? '#555';
}

export function getEdgeColor(type: EdgeType): string {
    return EDGE_COLORS[type] ?? '#999';
}
