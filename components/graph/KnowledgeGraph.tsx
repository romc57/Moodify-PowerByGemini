import type { ModernTheme } from '@/constants/theme';
import type { EdgeType, NodeType } from '@/services/graph/GraphService';
import { graphService } from '@/services/graph/GraphService';
import { usePlayerStore } from '@/stores/PlayerStore';
import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GraphCanvas } from './GraphCanvas';
import { GraphControls } from './GraphControls';
import { GraphNodeDetail } from './GraphNodeDetail';
import { useForceSimulation, type SimNode } from './useForceSimulation';

const NODE_TYPES: NodeType[] = ['SONG', 'ARTIST', 'VIBE', 'GENRE', 'AUDIO_FEATURE'];
const EDGE_TYPES: EdgeType[] = ['SIMILAR', 'NEXT', 'RELATED', 'HAS_FEATURE', 'HAS_GENRE'];
const allOn = (types: readonly string[]): Record<string, boolean> =>
    Object.fromEntries(types.map(t => [t, true]));

interface KnowledgeGraphProps {
    theme: ModernTheme;
}

const MIN_CANVAS_WIDTH = 300;
const MIN_CANVAS_HEIGHT = 200;

export function KnowledgeGraph({ theme }: KnowledgeGraphProps) {
    const { width: screenWidth, height: screenHeight } = useWindowDimensions();
    const insets = useSafeAreaInsets();

    const [rawNodes, setRawNodes] = useState<any[]>([]);
    const [rawEdges, setRawEdges] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedNode, setSelectedNode] = useState<SimNode | null>(null);

    // Canvas dimensions from onLayout (fixes Android where useWindowDimensions can be 0)
    const [layoutSize, setLayoutSize] = useState({ width: screenWidth || MIN_CANVAS_WIDTH, height: MIN_CANVAS_HEIGHT });

    // Visibility toggles
    const [nodeVis, setNodeVis] = useState<Record<string, boolean>>(() => allOn(NODE_TYPES));
    const [edgeVis, setEdgeVis] = useState<Record<string, boolean>>(() => allOn(EDGE_TYPES));

    const canvasWidth = Math.max(MIN_CANVAS_WIDTH, layoutSize.width, screenWidth || 0);
    const canvasHeight = Math.max(MIN_CANVAS_HEIGHT, layoutSize.height);

    const { nodes, edges, reload, isSimulating, progress } = useForceSimulation({
        width: canvasWidth,
        height: canvasHeight,
        rawNodes,
        rawEdges,
    });

    const loadGraph = useCallback(async (force: boolean = false) => {
        setLoading(true);
        try {
            const snap = await graphService.getGraphSnapshot(force);
            setRawNodes(snap.nodes);
            setRawEdges(snap.edges);
        } catch (e) {
            console.error('[KnowledgeGraph] Failed to load graph', e);
        } finally {
            setLoading(false);
        }
    }, []);

    // Save positions on unmount or when nodes change significantly
    useEffect(() => {
        return () => {
            if (nodes.length > 0) {
                graphService.saveGraphPositions(nodes.map(n => ({ id: n.id, x: n.x, y: n.y })));
            }
        };
    }, [nodes]);

    // Initial load
    useEffect(() => {
        loadGraph(false); // Use cache on mount
    }, [loadGraph]);

    const handleRefresh = useCallback(() => {
        setSelectedNode(null);
        // Sync playback state from Spotify so Home has fresh data when user goes back
        usePlayerStore.getState().syncFromSpotify().catch(() => {});
        loadGraph(true); // Force refresh graph data from DB
    }, [loadGraph]);

    const handleNodePress = useCallback((node: SimNode) => {
        setSelectedNode(prev => prev?.id === node.id ? null : node);
    }, []);

    const toggleNode = useCallback((type: string) => {
        setNodeVis(prev => ({ ...prev, [type]: !prev[type] }));
    }, []);

    const toggleEdge = useCallback((type: string) => {
        setEdgeVis(prev => ({ ...prev, [type]: !prev[type] }));
    }, []);

    const handleReimport = useCallback(async () => {
        setLoading(true);
        try {
            await graphService.ingestLikedSongs();
            await loadGraph(true); // Force refresh after import
        } catch (e: any) {
            console.error('[KnowledgeGraph] Re-import failed', e);
            const message = e?.message || e?.toString?.() || 'Sync failed. Check Spotify connection in Settings.';
            Alert.alert('Sync Spotify Failed', message);
        } finally {
            setLoading(false);
        }
    }, [loadGraph]);

    // Count connected edges for selected node
    const connectedEdgeCount = selectedNode
        ? edges.filter(e => e.sourceId === selectedNode.id || e.targetId === selectedNode.id).length
        : 0;

    if (loading || isSimulating) {
        return (
            <View style={[styles.loading, { backgroundColor: theme.background }]}>
                <ActivityIndicator size="large" color={theme.aiPurple} />
                <Text style={[styles.loadingText, { color: theme.textSecondary }]}>
                    {loading ? 'Loading graph data...' : `Designing Galaxy... ${(progress * 100).toFixed(0)}%`}
                </Text>
            </View>
        );
    }

    if (rawNodes.length === 0) {
        return (
            <View style={[styles.empty, { backgroundColor: theme.background }]}>
                <Ionicons name="git-network-outline" size={64} color={theme.textMuted} />
                <Text style={[styles.emptyTitle, { color: theme.text }]}>No Graph Data</Text>
                <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
                    Play some music to build your knowledge graph.
                </Text>
                {/* Allow re-import even if empty */}
                <Pressable
                    onPress={handleReimport}
                    style={[styles.refreshBtn, { backgroundColor: theme.surface, marginTop: 16, width: 'auto', paddingHorizontal: 16 }]}
                >
                    <Text style={{ color: theme.text, fontWeight: '600' }}>Import Liked Songs</Text>
                </Pressable>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            {/* Controls & Filters */}
            <View style={styles.controlsWrapper}>
                <View style={styles.refreshRow}>
                    <GraphControls
                        nodeVisibility={nodeVis}
                        edgeVisibility={edgeVis}
                        onToggleNode={toggleNode}
                        onToggleEdge={toggleEdge}
                        nodeCount={rawNodes.length}
                        edgeCount={rawEdges.length}
                        theme={theme}
                        onReimport={handleReimport}
                        onRefresh={handleRefresh}
                    />
                </View>
            </View>

            {/* Canvas - onLayout ensures real dimensions on Android (useWindowDimensions can be 0) */}
            <View
                style={styles.canvasWrapper}
                onLayout={(e) => {
                    const { width: w, height: h } = e.nativeEvent.layout;
                    if (w > 0 && h > 0) setLayoutSize({ width: w, height: h });
                }}
            >
                <GraphCanvas
                    nodes={nodes}
                    edges={edges}
                    nodeVisibility={nodeVis}
                    edgeVisibility={edgeVis}
                    theme={theme}
                    onNodePress={handleNodePress}
                    width={canvasWidth}
                    height={canvasHeight}
                />

                {/* Detail Card */}
                {selectedNode && (
                    <GraphNodeDetail
                        node={selectedNode}
                        connectedEdges={edges.filter(e => e.sourceId === selectedNode.id || e.targetId === selectedNode.id)}
                        theme={theme}
                        onDismiss={() => setSelectedNode(null)}
                        bottomInset={insets.bottom}
                    />
                )}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    controlsWrapper: {
        zIndex: 1,
    },
    refreshRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
    },
    refreshBtn: {
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 8,
        marginRight: 12,
    },
    canvasWrapper: {
        flex: 1,
        position: 'relative',
    },
    loading: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
    },
    loadingText: {
        fontSize: 14,
    },
    empty: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        paddingHorizontal: 32,
    },
    emptyTitle: {
        fontSize: 20,
        fontWeight: '700',
    },
    emptyText: {
        fontSize: 14,
        textAlign: 'center',
    },
});
