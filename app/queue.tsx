import { THEMES } from '@/constants/theme';
import { usePlayerStore } from '@/stores/PlayerStore';
import { useSettingsStore } from '@/stores/SettingsStore';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { FlatList, StyleSheet, Text, View, ScrollView } from 'react-native';

export default function QueueScreen() {
    const { theme } = useSettingsStore();
    const activeTheme = THEMES[theme] || THEMES.midnight;
    const { queue, currentTrack, syncFromSpotify, isPlaying } = usePlayerStore();

    // Sync queue from Spotify on mount and periodically
    React.useEffect(() => {
        syncFromSpotify();
        const interval = setInterval(syncFromSpotify, 2000);
        return () => clearInterval(interval);
    }, []);

    const renderQueueItem = ({ item, index }: { item: any; index: number }) => {
        return (
            <View
                style={[
                    styles.queueItem,
                    { backgroundColor: activeTheme.surface, borderColor: activeTheme.border },
                ]}
            >
                <Text style={[styles.queueNumber, { color: activeTheme.textSecondary }]}>
                    {index + 1}
                </Text>
                <View style={styles.trackInfo}>
                    <Text
                        style={[styles.trackTitle, { color: activeTheme.text }]}
                        numberOfLines={1}
                    >
                        {item.title}
                    </Text>
                    <Text style={[styles.trackArtist, { color: activeTheme.textSecondary }]} numberOfLines={1}>
                        {item.artist}
                    </Text>
                </View>
            </View>
        );
    };

    return (
        <ScrollView style={[styles.container, { backgroundColor: activeTheme.background }]}>
            <View style={styles.header}>
                <Text style={[styles.headerTitle, { color: activeTheme.text }]}>Queue</Text>
            </View>

            {/* Now Playing Section */}
            {currentTrack && (
                <View style={styles.section}>
                    <Text style={[styles.sectionTitle, { color: activeTheme.textSecondary }]}>
                        NOW PLAYING
                    </Text>
                    <View
                        style={[
                            styles.nowPlayingItem,
                            {
                                backgroundColor: `${activeTheme.spotifyGreen}15`,
                                borderColor: activeTheme.spotifyGreen,
                            },
                        ]}
                    >
                        <View style={styles.nowPlayingIcon}>
                            <Ionicons
                                name={isPlaying ? "pause-circle" : "play-circle"}
                                size={40}
                                color={activeTheme.spotifyGreen}
                            />
                        </View>
                        <View style={styles.trackInfo}>
                            <Text
                                style={[styles.nowPlayingTitle, { color: activeTheme.spotifyGreen }]}
                                numberOfLines={1}
                            >
                                {currentTrack.title}
                            </Text>
                            <Text style={[styles.nowPlayingArtist, { color: activeTheme.textSecondary }]} numberOfLines={1}>
                                {currentTrack.artist}
                            </Text>
                        </View>
                    </View>
                </View>
            )}

            {/* Up Next Section */}
            <View style={styles.section}>
                <Text style={[styles.sectionTitle, { color: activeTheme.textSecondary }]}>
                    UP NEXT • {queue.length} {queue.length === 1 ? 'track' : 'tracks'}
                </Text>

                {queue.length === 0 ? (
                    <View style={styles.emptyState}>
                        <Ionicons name="musical-notes-outline" size={48} color={activeTheme.textSecondary} />
                        <Text style={[styles.emptyText, { color: activeTheme.textSecondary }]}>
                            Queue is empty
                        </Text>
                    </View>
                ) : (
                    <FlatList
                        data={queue}
                        renderItem={renderQueueItem}
                        keyExtractor={(item, index) => `${item.uri}-${index}`}
                        scrollEnabled={false}
                        showsVerticalScrollIndicator={false}
                    />
                )}
            </View>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    header: {
        paddingHorizontal: 20,
        paddingTop: 60,
        paddingBottom: 10,
    },
    headerTitle: {
        fontSize: 32,
        fontWeight: 'bold',
    },
    section: {
        paddingHorizontal: 20,
        marginTop: 20,
    },
    sectionTitle: {
        fontSize: 12,
        fontWeight: '700',
        letterSpacing: 1,
        marginBottom: 12,
    },
    nowPlayingItem: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        borderRadius: 16,
        borderWidth: 2,
    },
    nowPlayingIcon: {
        marginRight: 16,
    },
    nowPlayingTitle: {
        fontSize: 18,
        fontWeight: '700',
        marginBottom: 4,
    },
    nowPlayingArtist: {
        fontSize: 14,
    },
    queueItem: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 14,
        borderRadius: 12,
        marginBottom: 8,
        borderWidth: 1,
    },
    queueNumber: {
        fontSize: 14,
        fontWeight: '600',
        width: 28,
        textAlign: 'center',
    },
    trackInfo: {
        flex: 1,
        marginRight: 12,
    },
    trackTitle: {
        fontSize: 15,
        fontWeight: '600',
        marginBottom: 2,
    },
    trackArtist: {
        fontSize: 13,
    },
    emptyState: {
        paddingVertical: 40,
        alignItems: 'center',
    },
    emptyText: {
        fontSize: 14,
        marginTop: 12,
    },
});
