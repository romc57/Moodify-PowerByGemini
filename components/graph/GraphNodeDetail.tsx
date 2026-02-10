import type { ModernTheme } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { SimEdge, SimNode } from './useForceSimulation';

interface GraphNodeDetailProps {
    node: SimNode;
    connectedEdges: SimEdge[];
    theme: ModernTheme;
    onDismiss: () => void;
    bottomInset: number;
}

export function GraphNodeDetail({ node, connectedEdges, theme, onDismiss, bottomInset }: GraphNodeDetailProps) {
    const slideAnim = useRef(new Animated.Value(300)).current; // Start off-screen

    useEffect(() => {
        // Slide up when node changes
        Animated.spring(slideAnim, {
            toValue: 0,
            useNativeDriver: true,
            tension: 50,
            friction: 7,
        }).start();
    }, [node]);

    const data = typeof node.data === 'string' ? JSON.parse(node.data || '{}') : (node.data || {});

    // Format date
    const lastPlayed = node.lastPlayedAt
        ? new Date(node.lastPlayedAt).toLocaleDateString() + ' ' + new Date(node.lastPlayedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        : 'Never';

    return (
        <Animated.View style={[styles.card, {
            backgroundColor: theme.surfaceElevated,
            borderColor: theme.border,
            borderWidth: 1,
            bottom: 80 + bottomInset,
            transform: [{ translateY: slideAnim }],
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.5, // Increased shadow
            shadowRadius: 12,
            elevation: 20, // Increased elevation
        }]}>
            <View style={styles.header}>
                <View style={styles.titleRow}>
                    <Text style={[styles.name, { color: theme.text }]} numberOfLines={2}>
                        {node.name}
                    </Text>
                    <View style={[styles.typeBadge, { backgroundColor: theme.primary }]}>
                        <Text style={[styles.typeText, { color: '#FFF' }]}>{node.type}</Text>
                    </View>
                </View>
                <Pressable onPress={onDismiss} hitSlop={12} style={styles.closeBtn}>
                    <Ionicons name="close" size={20} color={theme.text} />
                </Pressable>
            </View>

            <ScrollView style={styles.scrollContent} contentContainerStyle={styles.scrollInner}>
                {/* 1. Core Info */}
                <View style={styles.section}>
                    <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>Info</Text>
                    <Text style={[styles.detail, { color: theme.textMuted }]}>ID: <Text style={{ color: theme.text }}>{node.id}</Text></Text>
                    {node.spotifyId && <Text style={[styles.detail, { color: theme.textMuted }]}>Spotify ID: <Text style={{ color: theme.text }}>{node.spotifyId}</Text></Text>}
                    <Text style={[styles.detail, { color: theme.textMuted }]}>Plays: <Text style={{ color: theme.text }}>{node.playCount}</Text></Text>
                    <Text style={[styles.detail, { color: theme.textMuted }]}>Last Played: <Text style={{ color: theme.text }}>{lastPlayed}</Text></Text>
                </View>

                {/* 2. Connections */}
                <View style={styles.section}>
                    <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>Connections ({connectedEdges.length})</Text>
                    {connectedEdges.map((edge, i) => {
                        const isSource = edge.sourceId === node.id;
                        const otherId = isSource ? edge.targetId : edge.sourceId;
                        return (
                            <View key={i} style={styles.connectionRow}>
                                <Text style={[styles.detail, { color: theme.textMuted, flex: 1 }]}>
                                    {isSource ? '→' : '←'} {edge.type} (Node {otherId})
                                </Text>
                                <View style={[styles.weightBadge, { backgroundColor: theme.surface }]}>
                                    <Text style={{ color: theme.textSecondary, fontSize: 10, fontWeight: 'bold' }}>{edge.weight.toFixed(2)}</Text>
                                </View>
                            </View>
                        );
                    })}
                </View>
            </ScrollView>
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    card: {
        position: 'absolute',
        left: 16,
        right: 16,
        borderRadius: 20,
        maxHeight: '45%',
        overflow: 'hidden',
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 16,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: 'rgba(128,128,128,0.2)',
        backgroundColor: 'rgba(255,255,255,0.03)', // Subtle header highlight
    },
    titleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        flex: 1,
        marginRight: 8,
    },
    name: {
        fontSize: 20, // Larger title
        fontWeight: '700',
        flexShrink: 1,
    },
    typeBadge: {
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 8,
    },
    typeText: {
        fontSize: 10,
        fontWeight: '700',
        textTransform: 'uppercase',
    },
    closeBtn: {
        padding: 6,
        backgroundColor: 'rgba(128,128,128,0.1)',
        borderRadius: 50,
    },
    scrollContent: {
        maxHeight: 300,
    },
    scrollInner: {
        padding: 16,
        gap: 20,
    },
    section: {
        gap: 6,
    },
    sectionTitle: {
        fontSize: 12,
        fontWeight: '800', // Bolder title
        textTransform: 'uppercase',
        marginBottom: 4,
        letterSpacing: 1,
        opacity: 0.8,
    },
    detail: {
        fontSize: 14,
        lineHeight: 20,
    },
    connectionRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
    },
    weightBadge: {
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 4,
    },
    dataRow: {
        flexDirection: 'row',
        gap: 6,
        marginBottom: 2,
    },
    dataKey: {
        fontSize: 13,
        fontWeight: '500',
    },
    dataValue: {
        fontSize: 13,
        flex: 1,
    },
});
