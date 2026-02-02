import { RecommendationResponse } from '@/services/gemini/GeminiService';
import { usePlayerStore } from '@/stores/PlayerStore';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';
import { FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';

interface Props {
    recommendation: RecommendationResponse | null;
}

const HorizontalSection = ({ title, data, onItemPress }: { title: string, data: any[], onItemPress: (item: any) => void }) => {
    if (!data || data.length === 0) return null;

    const renderItem = ({ item }: { item: any }) => (
        <View style={styles.card}>
            <Image
                source={{ uri: item.artwork || 'https://via.placeholder.com/60' }}
                style={styles.artwork}
            />
            <View style={styles.info}>
                <Text style={styles.trackTitle} numberOfLines={1}>{item.spotifyName || item.title}</Text>
                <Text style={styles.artist} numberOfLines={1}>
                    {item.spotifyArtist || item.artist || item.publisher}
                </Text>
                <Text style={styles.reason} numberOfLines={2}>
                    💡 {item.reason}
                </Text>
            </View>
            <Pressable
                onPress={() => onItemPress(item)}
                style={({ pressed }) => [styles.playBtn, pressed && { opacity: 0.8 }]}
            >
                <Text style={styles.playIcon}>▶</Text>
            </Pressable>
        </View>
    );

    return (
        <View style={styles.sectionContainer}>
            <Text style={styles.subTitle}>{title}</Text>
            <FlatList
                data={data}
                renderItem={renderItem}
                keyExtractor={(item, index) => item.uri || index.toString()}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.listContent}
            />
        </View>
    );
};

export const RecommendationList = ({ recommendation }: Props) => {

    if (!recommendation) return null;

    const tracks = recommendation.items.filter(i => i.type === 'track' || i.type === 'song');
    const playlists = recommendation.items.filter(i => i.type === 'playlist');
    const podcasts = recommendation.items.filter(i => i.type === 'podcast');

    const handleTrackPress = (item: any) => {
        if (!tracks || tracks.length === 0) {
            console.warn('[UI] No tracks to play');
            return;
        }

        const playerStore = usePlayerStore.getState();

        // Find index of clicked item in the tracks array
        const index = tracks.findIndex(t => t.uri === item.uri);
        const safeIndex = index >= 0 ? index : 0;

        // Play the list from this index
        console.log(`[UI] Playing list starting from index ${safeIndex} (${item.title})`);
        playerStore.playList(tracks, safeIndex);
    };

    const handleOtherPress = (item: any) => {
        // Just play (might need specific handling for Playlist/Podcast switching)
        usePlayerStore.getState().playTrack(item);
    };

    return (
        <View style={styles.container}>
            <Text style={styles.sectionTitle}>For You</Text>
            {recommendation.mood_analysis && (
                <Text style={styles.analysis}>{recommendation.mood_analysis}</Text>
            )}

            <View style={styles.spotifyCard}>
                <View style={styles.cardHeader}>
                    <MaterialCommunityIcons name="spotify" size={24} color="#1DB954" style={{ marginRight: 10 }} />
                    <Text style={styles.cardTitle}>Mood Cure ({recommendation.target_mood})</Text>
                </View>

                {tracks.length > 0 && (
                    <HorizontalSection title="SONGS" data={tracks} onItemPress={handleTrackPress} />
                )}

                {playlists.length > 0 && (
                    <HorizontalSection title="PLAYLISTS" data={playlists} onItemPress={handleOtherPress} />
                )}

                {podcasts.length > 0 && (
                    <HorizontalSection title="PODCASTS" data={podcasts} onItemPress={handleOtherPress} />
                )}
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        width: '100%',
        paddingVertical: 10,
    },
    sectionTitle: {
        color: 'white',
        fontSize: 22,
        fontWeight: 'bold',
        marginBottom: 8,
        paddingHorizontal: 20,
    },
    analysis: {
        color: '#E2E8F0',
        fontSize: 14,
        lineHeight: 20,
        marginBottom: 20,
        paddingHorizontal: 20,
    },
    spotifyCard: {
        backgroundColor: '#000000', // Spotify Black
        marginHorizontal: 10,
        borderRadius: 20,
        paddingVertical: 20,
        borderWidth: 1,
        borderColor: '#1DB954', // Spotify Green Border
    },
    cardHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 20,
        marginBottom: 10,
    },
    spotifyLogo: {
        width: 24,
        height: 24,
        marginRight: 10,
        tintColor: '#1DB954'
    },
    cardTitle: {
        color: '#1DB954',
        fontSize: 16,
        fontWeight: 'bold',
        letterSpacing: 1,
    },
    sectionContainer: {
        marginBottom: 20,
    },
    subTitle: {
        color: 'white',
        fontSize: 14,
        fontWeight: 'bold',
        marginLeft: 20,
        marginBottom: 10,
        opacity: 0.8,
    },
    listContent: {
        paddingHorizontal: 20,
        paddingBottom: 10,
    },
    card: {
        backgroundColor: '#18181B', // Darker gray card inside black
        borderRadius: 12,
        padding: 10,
        marginRight: 15,
        width: 260,
        flexDirection: 'row',
        alignItems: 'center',
    },
    artwork: {
        width: 50,
        height: 50,
        borderRadius: 4,
        backgroundColor: '#334155',
    },
    info: {
        flex: 1,
        marginLeft: 10,
        marginRight: 10,
    },
    trackTitle: {
        color: 'white',
        fontSize: 14,
        fontWeight: '600',
    },
    artist: {
        color: '#A1A1AA',
        fontSize: 12,
    },
    reason: {
        color: '#FBBF24',
        fontSize: 10,
        marginTop: 2,
        fontStyle: 'italic',
    },
    playBtn: {
        width: 30,
        height: 30,
        borderRadius: 15,
        backgroundColor: '#1DB954',
        justifyContent: 'center',
        alignItems: 'center',
    },
    playIcon: {
        color: 'white',
        fontSize: 14,
    },
    loadingContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        height: 150,
        backgroundColor: '#000000',
        borderRadius: 20,
        marginHorizontal: 10,
        borderColor: '#1DB954',
        borderWidth: 1,
    },
    loadingText: {
        color: '#1DB954',
        marginTop: 10,
        fontSize: 14,
        fontWeight: 'bold',
    },
});
