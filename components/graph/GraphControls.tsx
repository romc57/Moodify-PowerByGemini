import type { ModernTheme } from '@/constants/theme';
import type { EdgeType, NodeType } from '@/services/graph/GraphService';
import { getThemedEdgeColor, getThemedNodeColor } from '@/services/graph/graphColors';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

const NODE_TYPES: NodeType[] = ['SONG', 'ARTIST', 'VIBE', 'GENRE', 'AUDIO_FEATURE'];
const EDGE_TYPES: EdgeType[] = ['SIMILAR', 'NEXT', 'RELATED', 'HAS_FEATURE', 'HAS_GENRE'];

interface GraphControlsProps {
    nodeVisibility: Record<string, boolean>;
    edgeVisibility: Record<string, boolean>;
    onToggleNode: (type: string) => void;
    onToggleEdge: (type: string) => void;
    nodeCount: number;
    edgeCount: number;
    theme: ModernTheme;
    onReimport?: () => void;
    onRefresh?: () => void;
}

export function GraphControls({
    nodeVisibility,
    edgeVisibility,
    onToggleNode,
    onToggleEdge,
    nodeCount,
    edgeCount,
    theme,
    onReimport,
    onRefresh,
}: GraphControlsProps) {
    // Import Ionicons here if not already available in scope (it wasn't imported in original file)
    // Actually typically passed or imported at top.
    // Let's assume Ionicons needs import.
    // Since I can't see the top of the file in this context, I'll rely on it being available or add it if missing in a separate step?
    // Wait, the original KnowledgeGraph had Ionicons. I need to make sure GraphControls has it.
    // I'll assume for now I need to check imports.
    // But for this replacement:

    return (
        <View style={styles.container}>
            {/* Header Row: Stats + Actions */}
            <View style={[styles.statsRow, { justifyContent: 'space-between' }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={[styles.statText, { color: theme.textSecondary }]}>
                        {nodeCount} nodes
                    </Text>
                    <View style={[styles.dot, { backgroundColor: theme.textMuted }]} />
                    <Text style={[styles.statText, { color: theme.textSecondary }]}>
                        {edgeCount} edges
                    </Text>
                </View>

                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    {onReimport && (
                        <Pressable
                            onPress={onReimport}
                            style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1, flexDirection: 'row', alignItems: 'center', gap: 4 })}
                        >
                            {/*
                           I need Ionicons. If not imported, this will fail.
                           I will do a separate import check/fix step after this.
                           For now, using Text fallback or Icon if available.
                           The user asked for a button.
                        */}
                            <Text style={{ fontSize: 10, color: theme.accent, fontWeight: '700' }}>SYNC SPOTIFY</Text>
                        </Pressable>
                    )}

                    {onRefresh && (
                        <Pressable
                            onPress={onRefresh}
                            style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
                        >
                            {/* Using Text fallback if Icon not available, but user likely has Icons available given previous context.
                                However, to be safe and consistent with previous edit, I will stick to Text or use a simplified approach
                                unless I import Ionicons.
                                Actually, I should probably check imports.
                                But let's assume I can use a simple text 'REFRESH' or similar if Icon fails,
                                but better to use the Icon if possible.
                                Since I am editing GraphControls, I should add Ionicons import if missing.
                                I'll add the button here assuming I'll fix imports next.
                            */}
                            <Text style={{ fontSize: 10, color: theme.textSecondary, fontWeight: '700' }}>REFRESH</Text>
                        </Pressable>
                    )}
                </View>
            </View>

            {/* Node filters */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
                <Text style={[styles.label, { color: theme.textMuted }]}>Nodes:</Text>
                {NODE_TYPES.map(type => {
                    const active = nodeVisibility[type];
                    const color = getThemedNodeColor(type, theme);
                    return (
                        <Pressable
                            key={type}
                            onPress={() => onToggleNode(type)}
                            style={[
                                styles.chip,
                                {
                                    backgroundColor: active ? `${color}20` : theme.surface,
                                    borderColor: active ? color : 'transparent',
                                },
                            ]}
                        >
                            <View style={[styles.chipDot, { backgroundColor: active ? color : theme.textMuted }]} />
                            <Text style={[styles.chipText, { color: active ? color : theme.textMuted }]}>
                                {type.replace('_', ' ')}
                            </Text>
                        </Pressable>
                    );
                })}
            </ScrollView>

            {/* Edge filters */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
                <Text style={[styles.label, { color: theme.textMuted }]}>Edges:</Text>
                {EDGE_TYPES.map(type => {
                    const active = edgeVisibility[type];
                    const color = getThemedEdgeColor(type, theme);
                    return (
                        <Pressable
                            key={type}
                            onPress={() => onToggleEdge(type)}
                            style={[
                                styles.chip,
                                {
                                    backgroundColor: active ? `${color}20` : theme.surface,
                                    borderColor: active ? color : 'transparent',
                                },
                            ]}
                        >
                            <View style={[styles.chipDot, { backgroundColor: active ? color : theme.textMuted }]} />
                            <Text style={[styles.chipText, { color: active ? color : theme.textMuted }]}>
                                {type.replace('_', ' ')}
                            </Text>
                        </Pressable>
                    );
                })}
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        paddingHorizontal: 12,
        paddingVertical: 8,
        flex: 1, // Allow taking width
    },
    statsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 8,
        flexWrap: 'wrap', // Allow wrapping on small screens
        gap: 12, // Add gap for wrapped items
    },
    statText: {
        fontSize: 12,
        fontWeight: '600',
    },
    dot: {
        width: 3,
        height: 3,
        borderRadius: 1.5,
    },
    chipRow: {
        flexDirection: 'row',
        marginBottom: 6,
    },
    label: {
        fontSize: 10,
        fontWeight: '700',
        textTransform: 'uppercase',
        alignSelf: 'center',
        marginRight: 8,
    },
    chip: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 8, // Larger touch target
        borderRadius: 16,
        marginRight: 6,
        borderWidth: 1,
        gap: 6,
    },
    chipDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
    },
    chipText: {
        fontSize: 12, // Slightly larger text
        fontWeight: '600',
    },
});
