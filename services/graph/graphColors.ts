import type { ModernTheme } from '@/constants/theme';
import type { EdgeType, NodeType } from './GraphService';


/** Single source of truth for graph edge colors (visualization). */
/**
 * 10 "Cool" Color Constants for Graph Visualization.
 * First 5 for Nodes, Last 5 for Edges.
 */
const COOL_PALETTE = [
    // Nodes
    '#00FFFF', // Cyan (SONG)
    '#76FF03', // Light Green (ARTIST)
    '#E040FB', // Purple Accent (VIBE)
    '#FFD740', // Amber Accent (GENRE)
    '#FF5252', // Red Accent (AUDIO_FEATURE)

    // Edges
    '#69F0AE', // Teal Accent (SIMILAR)
    '#448AFF', // Blue Accent (NEXT)
    '#EA80FC', // Purple (RELATED)
    '#FFAB40', // Orange (HAS_FEATURE)
    '#B2FF59', // Lime (HAS_GENRE)
];

const NODE_TYPE_COLORS: Record<NodeType, string> = {
    SONG: COOL_PALETTE[0],
    ARTIST: COOL_PALETTE[1],
    VIBE: COOL_PALETTE[2],
    GENRE: COOL_PALETTE[3],
    AUDIO_FEATURE: COOL_PALETTE[4],
};

const EDGE_TYPE_COLORS: Record<EdgeType, string> = {
    SIMILAR: COOL_PALETTE[5],
    NEXT: COOL_PALETTE[6],
    RELATED: COOL_PALETTE[7],
    HAS_FEATURE: COOL_PALETTE[8],
    HAS_GENRE: COOL_PALETTE[9],
};

export function getNodeColor(type: NodeType): string {
    return NODE_TYPE_COLORS[type] ?? '#FFF';
}

export function getEdgeColor(type: EdgeType): string {
    return EDGE_TYPE_COLORS[type] ?? '#FFF';
}

/** Theme-aware node color: NOW RETURNS THE CONSTANT COLOR. */
export function getThemedNodeColor(type: NodeType, theme: ModernTheme): string {
    return getNodeColor(type);
}

/** Theme-aware edge color: NOW RETURNS THE CONSTANT COLOR. */
export function getThemedEdgeColor(type: EdgeType, theme: ModernTheme): string {
    return getEdgeColor(type);
}

/**
 * Returns the unique color for a node (Now consistent by Type).
 */
export function getUniqueNodeColor(id: number, type: NodeType): string {
    return NODE_TYPE_COLORS[type] ?? '#FFF';
}

/**
 * Returns the unique color for an edge (Now consistent by Type).
 */
export function getUniqueEdgeColor(sourceId: number, targetId: number, type: EdgeType): string {
    return EDGE_TYPE_COLORS[type] ?? '#FFF';
}
