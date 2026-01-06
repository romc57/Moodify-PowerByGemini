import { RecommendationResponse } from '@/services/gemini/GeminiService';
import { spotifyRemote } from '@/services/spotify/SpotifyRemoteService';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';

interface Props {
    recommendation: RecommendationResponse | null;
    onPlay: () => void;
}

export const RecommendationList = ({ recommendation, onPlay }: Props) => {
    const [track, setTrack] = useState<any>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (recommendation?.suggestedAction) {
            fetchTrack();
        }
    }, [recommendation]);

    const fetchTrack = async () => {
        if (!recommendation) return;
        setLoading(true);
        const { query, type } = recommendation.suggestedAction;

        console.log(`[UI] Searching for: ${query} (${type})`);
        const results = await spotifyRemote.search(query, type);
        if (results && results.length > 0) {
            setTrack(results[0]);
        }
        setLoading(false);
    };

    const handlePlay = async () => {
        if (track) {
            await spotifyRemote.play(track.uri);
            onPlay();
        }
    };

    if (!recommendation) return null;

    return (
        <View style={styles.container}>
            <Text style={styles.sectionTitle}>AI Analysis</Text>
            <Text style={styles.analysis}>{recommendation.analysis}</Text>

            <View style={styles.card}>
                {loading ? (
                    <ActivityIndicator color="#60A5FA" />
                ) : track ? (
                    <>
                        <Image
                            source={{ uri: track.album?.images[0]?.url }}
                            style={styles.artwork}
                        />
                        <View style={styles.info}>
                            <Text style={styles.trackTitle} numberOfLines={1}>{track.name}</Text>
                            <Text style={styles.artist} numberOfLines={1}>
                                {track.artists?.map((a: any) => a.name).join(', ')}
                            </Text>
                            <Text style={styles.reason}>
                                💡 {recommendation.suggestedAction.reason}
                            </Text>
                        </View>
                        <Pressable onPress={handlePlay} style={styles.playBtn}>
                            <Text style={styles.playIcon}>▶</Text>
                        </Pressable>
                    </>
                ) : (
                    <Text style={styles.errorText}>Could not find track.</Text>
                )}
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        width: '100%',
        paddingHorizontal: 20,
    },
    sectionTitle: {
        color: 'white',
        fontSize: 18,
        fontWeight: 'bold',
        marginBottom: 8,
    },
    analysis: {
        color: '#E2E8F0',
        fontSize: 14,
        lineHeight: 20,
        marginBottom: 20,
    },
    card: {
        backgroundColor: '#1E293B',
        borderRadius: 16,
        padding: 12,
        flexDirection: 'row',
        alignItems: 'center',
        shadowColor: 'black',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 4,
    },
    artwork: {
        width: 60,
        height: 60,
        borderRadius: 8,
        backgroundColor: '#334155',
    },
    info: {
        flex: 1,
        marginLeft: 12,
        marginRight: 10,
    },
    trackTitle: {
        color: 'white',
        fontSize: 16,
        fontWeight: '600',
    },
    artist: {
        color: '#94A3B8',
        fontSize: 14,
    },
    reason: {
        color: '#FBBF24',
        fontSize: 12,
        marginTop: 4,
        fontStyle: 'italic',
    },
    playBtn: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#60A5FA',
        justifyContent: 'center',
        alignItems: 'center',
    },
    playIcon: {
        color: 'white',
        fontSize: 20,
    },
    errorText: {
        color: '#EF4444',
    }
});
