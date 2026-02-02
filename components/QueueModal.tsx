import { THEMES } from '@/constants/theme';
import { spotifyRemote } from '@/services/spotify/SpotifyRemoteService';
import { usePlayerStore } from '@/stores/PlayerStore';
import { useSettingsStore } from '@/stores/SettingsStore';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import React, { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';

interface QueueModalProps {
    visible: boolean;
    onClose: () => void;
}

export function QueueModal({ visible, onClose }: QueueModalProps) {
    const { theme } = useSettingsStore();
    const activeTheme = THEMES[theme] || THEMES.midnight;
    const { currentTrack } = usePlayerStore();

    const [queueTracks, setQueueTracks] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        if (visible) {
            loadQueue();
        }
    }, [visible]);

    const loadQueue = async () => {
        setIsLoading(true);
        try {
            const data = await spotifyRemote.getUserQueue();
            if (data && data.queue) {
                setQueueTracks(data.queue);
            }
        } catch (e) {
            console.error('Failed to load queue', e);
        } finally {
            setIsLoading(false);
        }
    };

    if (!visible) return null;

    return (
        <Modal
            visible={visible}
            transparent
            animationType="fade"
            onRequestClose={onClose}
        >
            <BlurView intensity={20} style={styles.overlay}>
                <Pressable style={styles.backdrop} onPress={onClose} />

                <Animated.View
                    entering={FadeInDown.springify().damping(15)}
                    exiting={FadeOutDown}
                    style={[styles.container, { backgroundColor: activeTheme.surfaceStrong }]}
                >
                    <View style={styles.handle} />

                    <View style={[styles.headerContainer, { backgroundColor: activeTheme.surfaceStrong }]}>
                        <Text style={[styles.title, { color: activeTheme.text }]}>Up Next</Text>
                        <Pressable onPress={loadQueue} disabled={isLoading}>
                            <Ionicons name="refresh" size={20} color={activeTheme.textSecondary} />
                        </Pressable>
                    </View>

                    <ScrollView
                        showsVerticalScrollIndicator={false}
                        contentContainerStyle={styles.listContent}
                    >
                        {/* Current Track */}
                        {currentTrack && (
                            <View style={[styles.section, { borderBottomColor: activeTheme.border }]}>
                                <Text style={[styles.sectionTitle, { color: activeTheme.textSecondary }]}>Now Playing</Text>
                                <View style={[styles.trackRow, { backgroundColor: activeTheme.surfaceElevated }]}>
                                    <View style={styles.artworkPlaceholder}>
                                        <Ionicons name="musical-notes" size={24} color={activeTheme.primary} />
                                    </View>
                                    <View style={styles.trackInfo}>
                                        <Text style={[styles.trackTitle, { color: activeTheme.primary }]} numberOfLines={1}>
                                            {currentTrack.title}
                                        </Text>
                                        <Text style={[styles.trackArtist, { color: activeTheme.textSecondary }]} numberOfLines={1}>
                                            {currentTrack.artist}
                                        </Text>
                                    </View>
                                    <Ionicons name="volume-high" size={20} color={activeTheme.primary} />
                                </View>
                            </View>
                        )}

                        {/* Queue List */}
                        <View style={styles.section}>
                            <Text style={[styles.sectionTitle, { color: activeTheme.textSecondary }]}>Next From Queue</Text>
                            {isLoading ? (
                                <Text style={[styles.loadingText, { color: activeTheme.textSecondary }]}>Loading queue...</Text>
                            ) : queueTracks.length === 0 ? (
                                <Text style={[styles.emptyText, { color: activeTheme.textSecondary }]}>Queue is empty</Text>
                            ) : (
                                queueTracks.map((track, index) => (
                                    <View key={`${track.uri}-${index}`} style={[styles.trackRow, { backgroundColor: activeTheme.surface }]}>
                                        <Text style={[styles.trackIndex, { color: activeTheme.textMuted }]}>{index + 1}</Text>
                                        <View style={styles.trackInfo}>
                                            <Text style={[styles.trackTitle, { color: activeTheme.text }]} numberOfLines={1}>
                                                {track.name}
                                            </Text>
                                            <Text style={[styles.trackArtist, { color: activeTheme.textMuted }]} numberOfLines={1}>
                                                {track.artists?.[0]?.name}
                                            </Text>
                                        </View>
                                    </View>
                                ))
                            )}
                        </View>
                    </ScrollView>

                    <Pressable
                        onPress={onClose}
                        style={[styles.closeButton, { backgroundColor: activeTheme.surface, borderColor: activeTheme.border, borderWidth: 1 }]}
                    >
                        <Text style={[styles.closeText, { color: activeTheme.text }]}>Close</Text>
                    </Pressable>
                </Animated.View>
            </BlurView>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        justifyContent: 'flex-end',
    },
    backdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.5)',
    },
    container: {
        height: '80%',
        borderTopLeftRadius: 30,
        borderTopRightRadius: 30,
        paddingTop: 24,
        paddingBottom: 40,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.3,
        shadowRadius: 10,
        elevation: 10,
    },
    handle: {
        width: 40,
        height: 5,
        backgroundColor: 'rgba(120,120,120,0.4)',
        borderRadius: 3,
        alignSelf: 'center',
        marginBottom: 20,
    },
    headerContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 10,
        paddingHorizontal: 24,
        paddingVertical: 10,
    },
    title: {
        fontSize: 24,
        fontWeight: '700',
    },
    listContent: {
        paddingHorizontal: 24,
        paddingBottom: 20,
    },
    section: {
        marginBottom: 24,
    },
    sectionTitle: {
        fontSize: 14,
        fontWeight: '600',
        marginBottom: 12,
        textTransform: 'uppercase',
        letterSpacing: 1,
    },
    trackRow: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 12,
        borderRadius: 12,
        marginBottom: 8,
    },
    artworkPlaceholder: {
        width: 40,
        height: 40,
        borderRadius: 8,
        backgroundColor: 'rgba(255,255,255,0.1)',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    trackIndex: {
        width: 24,
        textAlign: 'center',
        marginRight: 12,
        fontWeight: '600',
    },
    trackInfo: {
        flex: 1,
    },
    trackTitle: {
        fontSize: 16,
        fontWeight: '600',
        marginBottom: 4,
    },
    trackArtist: {
        fontSize: 14,
    },
    loadingText: {
        marginTop: 20,
        textAlign: 'center',
    },
    emptyText: {
        marginTop: 20,
        textAlign: 'center',
        fontStyle: 'italic',
    },
    closeButton: {
        marginTop: 10,
        marginHorizontal: 24,
        padding: 16,
        borderRadius: 30,
        alignItems: 'center',
    },
    closeText: {
        fontWeight: '600',
        fontSize: 16,
    }
});
