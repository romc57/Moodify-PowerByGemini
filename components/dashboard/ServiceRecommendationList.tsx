import { Image } from 'expo-image';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface RecommendationItem {
    id: string;
    title: string;
    subtitle?: string;
    image?: string;
    uri?: string; // For Spotify
}

interface Props {
    title: string;
    data: RecommendationItem[];
    onItemPress: (item: RecommendationItem) => void;
    emptyMessage?: string;
}

export default function ServiceRecommendationList({ title, data, onItemPress, emptyMessage = "No recommendations yet" }: Props) {
    return (
        <View style={styles.container}>
            <Text style={styles.title}>{title}</Text>
            {data.length === 0 ? (
                <Text style={styles.emptyText}>{emptyMessage}</Text>
            ) : (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.list}>
                    {data.map((item) => (
                        <TouchableOpacity key={item.id} style={styles.card} onPress={() => onItemPress(item)}>
                            <Image
                                source={item.image ? { uri: item.image } : require('@/assets/images/react-logo.png')}
                                style={styles.image}
                                contentFit="cover"
                            />
                            <Text style={styles.itemTitle} numberOfLines={1}>{item.title}</Text>
                            {item.subtitle && <Text style={styles.itemSubtitle} numberOfLines={1}>{item.subtitle}</Text>}
                        </TouchableOpacity>
                    ))}
                </ScrollView>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        marginBottom: 25,
    },
    title: {
        fontSize: 20,
        fontWeight: 'bold',
        marginBottom: 10,
        marginLeft: 20,
        color: '#333'
    },
    list: {
        paddingHorizontal: 15,
    },
    card: {
        width: 140,
        marginHorizontal: 5,
    },
    image: {
        width: 140,
        height: 140,
        borderRadius: 12,
        backgroundColor: '#eee',
        marginBottom: 8,
    },
    itemTitle: {
        fontSize: 14,
        fontWeight: '600',
        color: '#000',
    },
    itemSubtitle: {
        fontSize: 12,
        color: '#666',
    },
    emptyText: {
        marginLeft: 20,
        fontStyle: 'italic',
        color: '#999'
    }
});
