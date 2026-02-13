import type { ModernTheme } from '@/constants/theme';
import { getUniqueEdgeColor, getUniqueNodeColor } from '@/services/graph/graphColors';
import { Ionicons } from '@expo/vector-icons';
import React, { useMemo, useRef, useState } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import {
    GestureHandlerRootView,
    PanGestureHandler,
    PinchGestureHandler,
    State,
    type PanGestureHandlerGestureEvent,
    type PinchGestureHandlerGestureEvent,
} from 'react-native-gesture-handler';
import Svg, { Circle, G, Line, Text as SvgText } from 'react-native-svg';
import type { SimEdge, SimNode } from './useForceSimulation';

interface GraphCanvasProps {
    nodes: SimNode[];
    edges: SimEdge[];
    nodeVisibility: Record<string, boolean>;
    edgeVisibility: Record<string, boolean>;
    theme: ModernTheme;
    onNodePress?: (node: SimNode) => void;
    width: number;
    height: number;
}

export function GraphCanvas({
    nodes,
    edges,
    nodeVisibility,
    edgeVisibility,
    theme,
    onNodePress,
    width,
    height,
}: GraphCanvasProps) {
    // O(1) node lookup by id — avoids O(n) find() per edge during render
    const nodeMap = useMemo(() => {
        const map = new Map<number, SimNode>();
        for (const n of nodes) map.set(n.id, n);
        return map;
    }, [nodes]);

    const [scale, setScale] = useState(1);
    const [translateX, setTranslateX] = useState(0);
    const [translateY, setTranslateY] = useState(0);

    // Pan/zoom base values (updated on gesture end)
    const baseScale = useRef(1);
    const baseX = useRef(0);
    const baseY = useRef(0);

    const onPinch = (event: PinchGestureHandlerGestureEvent) => {
        if (event.nativeEvent.state === State.ACTIVE) {
            const newScale = Math.max(0.1, Math.min(6, baseScale.current * event.nativeEvent.scale));
            setScale(newScale);
        }
    };

    const onPinchEnd = (event: PinchGestureHandlerGestureEvent) => {
        if (event.nativeEvent.state === State.END) {
            baseScale.current = Math.max(0.1, Math.min(6, baseScale.current * event.nativeEvent.scale));
        }
    };

    const onPan = (event: PanGestureHandlerGestureEvent) => {
        if (event.nativeEvent.state === State.ACTIVE) {
            setTranslateX(baseX.current + event.nativeEvent.translationX);
            setTranslateY(baseY.current + event.nativeEvent.translationY);
        }
    };

    const onPanEnd = (event: PanGestureHandlerGestureEvent) => {
        if (event.nativeEvent.state === State.END) {
            baseX.current = baseX.current + event.nativeEvent.translationX;
            baseY.current = baseY.current + event.nativeEvent.translationY;
        }
    };

    const getNodeRadius = (type: string) => {
        switch (type) {
            case 'VIBE': return 10;
            case 'SONG': return 5;
            case 'ARTIST': return 7;
            default: return 4;
        }
    };

    // Apply viewport transform
    const vx = (x: number) => x * scale + translateX;
    const vy = (y: number) => y * scale + translateY;

    const handleZoomIn = () => {
        const newScale = Math.min(6, scale * 1.2);
        setScale(newScale);
        baseScale.current = newScale;
    };

    const handleZoomOut = () => {
        const newScale = Math.max(0.1, scale / 1.2);
        setScale(newScale);
        baseScale.current = newScale;
    };

    const hasValidSize = width > 0 && height > 0;

    return (
        <GestureHandlerRootView style={styles.container}>
            <PinchGestureHandler onGestureEvent={onPinch} onHandlerStateChange={onPinchEnd}>
                <PanGestureHandler onGestureEvent={onPan} onHandlerStateChange={onPanEnd}>
                    <View style={[styles.canvas, { backgroundColor: theme.background, width: width || 1, height: height || 1 }]}>
                        {!hasValidSize ? null : (
                        <Svg width={width} height={height}>
                            {/* Edges */}
                            {edges.map((edge, i) => {
                                if (!edgeVisibility[edge.type]) return null;
                                // Also hide edges connected to hidden node types
                                const srcNode = nodeMap.get(edge.sourceId);
                                const tgtNode = nodeMap.get(edge.targetId);
                                if (srcNode && !nodeVisibility[srcNode.type]) return null;
                                if (tgtNode && !nodeVisibility[tgtNode.type]) return null;

                                return (
                                    <G key={`e-${i}`}>
                                        <Line
                                            x1={vx(edge.x1)}
                                            y1={vy(edge.y1)}
                                            x2={vx(edge.x2)}
                                            y2={vy(edge.y2)}
                                            stroke={getUniqueEdgeColor(edge.sourceId, edge.targetId, edge.type)}
                                            strokeWidth={Math.max(0.4, Math.sqrt(edge.weight || 1)) * scale}
                                            strokeOpacity={0.6}
                                        />
                                        {/* Edge Label (only if zoomed in enough) */}
                                        {scale > 0.8 && (
                                            <SvgText
                                                x={(vx(edge.x1) + vx(edge.x2)) / 2}
                                                y={(vy(edge.y1) + vy(edge.y2)) / 2}
                                                fill={theme.textMuted}
                                                fontSize={10 * scale} // Scale with zoom
                                                textAnchor="middle"
                                                alignmentBaseline="middle"
                                                opacity={0.8}
                                            >
                                                {edge.type}
                                            </SvgText>
                                        )}
                                    </G>
                                );
                            })}

                            {/* Nodes */}
                            {nodes.map(node => {
                                if (!nodeVisibility[node.type]) return null;

                                const r = getNodeRadius(node.type) * scale;
                                const cx = vx(node.x);
                                const cy = vy(node.y);

                                return (
                                    <G key={`n-${node.id}`} onPress={() => onNodePress?.(node)}>
                                        {/* Hit Slop */}
                                        <Circle
                                            cx={cx}
                                            cy={cy}
                                            r={Math.max(20, r * 2)} // Min 20 units or 2x radius
                                            fill="transparent"
                                        />
                                        {/* Visible Node */}
                                        <Circle
                                            cx={cx}
                                            cy={cy}
                                            r={r}
                                            fill={getUniqueNodeColor(node.id, node.type)}
                                            stroke="rgba(255,255,255,0.3)"
                                            strokeWidth={0.5 * scale}
                                        />
                                        {/* Node Label */}
                                        <SvgText
                                            x={cx}
                                            y={cy + r + (4 * scale)}
                                            fill={theme.text}
                                            fontSize={Math.max(8, 10 * scale)} // Min size 8
                                            textAnchor="middle"
                                            alignmentBaseline="hanging"
                                            opacity={scale < 0.5 ? 0 : 1} // Hide if too zoomed out
                                        >
                                            {node.name.length > 20 ? node.name.substring(0, 18) + '..' : node.name}
                                        </SvgText>
                                    </G>
                                );
                            })}
                        </Svg>
                        )}

                        {/* Zoom Controls */}
                        <View style={styles.zoomControls}>
                            <TouchableOpacity onPress={handleZoomIn} style={[styles.zoomBtn, { backgroundColor: theme.primary, borderColor: theme.primary }]}>
                                <Ionicons name="add" size={32} color="#FFF" />
                            </TouchableOpacity>
                            <TouchableOpacity onPress={handleZoomOut} style={[styles.zoomBtn, { backgroundColor: theme.primary, borderColor: theme.primary }]}>
                                <Ionicons name="remove" size={32} color="#FFF" />
                            </TouchableOpacity>
                        </View>
                    </View>
                </PanGestureHandler>
            </PinchGestureHandler>
        </GestureHandlerRootView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    canvas: {
        flex: 1,
        borderRadius: 12,
        overflow: 'hidden',
    },
    zoomControls: {
        position: 'absolute',
        top: 16, // Moved to top to avoid bottom detail card overlap
        right: 16,
        gap: 8,
    },
    zoomBtn: {
        width: 56, // Increased from 40
        height: 56, // Increased from 40
        borderRadius: 28,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 }, // Increased shadow
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 8,
    },
});
