import { THEMES } from '@/constants/theme';
import { useSettingsStore } from '@/stores/SettingsStore';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import React from 'react';
import { Dimensions, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = SCREEN_WIDTH * 0.7;
const CARD_MARGIN = 12;

interface VibeOption {
    id: string;
    title: string;
    description: string;
    track: {
        title: string;
        artist: string;
        query: string;
        reason?: string;
    };
    reason: string;
}

interface VibeSelectorProps {
    visible: boolean;
    options: VibeOption[];
    onSelect: (option: VibeOption) => void;
    onClose: () => void;
    isLoading?: boolean;
}

export function VibeSelector({ visible, options, onSelect, onClose, isLoading }: VibeSelectorProps) {
    const { theme } = useSettingsStore();
    const activeTheme = THEMES[theme] || THEMES.midnight;

    // Show up to 8 vibe options
    const limitedOptions = options.slice(0, 8);

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
                        <Text style={[styles.title, { color: activeTheme.text }]}>Choose Your Vibe</Text>
                        <Text style={[styles.subtitle, { color: activeTheme.textSecondary }]}>
                            Swipe to explore {limitedOptions.length} directions
                        </Text>
                    </View>

                    {/* Horizontal ScrollView */}
                    <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.horizontalList}
                        snapToInterval={CARD_WIDTH + CARD_MARGIN}
                        decelerationRate="fast"
                    >
                        {limitedOptions.map((option, index) => (
                            <Pressable
                                key={option.id}
                                onPress={() => onSelect(option)}
                                style={({ pressed }) => [
                                    styles.optionCard,
                                    {
                                        backgroundColor: '#1E1E1E', // Solid background
                                        transform: [{ scale: pressed ? 0.96 : 1 }],
                                        marginLeft: index === 0 ? 24 : CARD_MARGIN / 2,
                                        marginRight: index === limitedOptions.length - 1 ? 24 : CARD_MARGIN / 2,
                                        borderWidth: 0, // Remove border for cleaner solid look
                                    }
                                ]}
                            >
                                <View
                                    style={[styles.cardContent, { backgroundColor: '#1E1E1E' }]}
                                >
                                    {/* Vibe Number Badge */}
                                    <View style={[styles.numberBadge, { backgroundColor: activeTheme.primary }]}>
                                        <Text style={styles.numberText}>{index + 1}</Text>
                                    </View>

                                    <View style={styles.cardHeader}>
                                        <View style={[styles.iconBadge, { backgroundColor: activeTheme.spotifyGreen }]}>
                                            <Ionicons name="musical-notes" size={18} color="#fff" />
                                        </View>
                                        <Text style={[styles.vibeTitle, { color: '#fff' }]} numberOfLines={2}>
                                            {option.title}
                                        </Text>
                                    </View>

                                    <Text style={[styles.vibeDesc, { color: '#ccc' }]} numberOfLines={3}>
                                        {option.description}
                                    </Text>

                                    <View style={styles.spacer} />

                                    <View style={[styles.trackInfo, { backgroundColor: 'rgba(255,255,255,0.05)' }]}>
                                        <Ionicons name="play-circle" size={24} color={activeTheme.spotifyGreen} />
                                        <View style={styles.trackTextContainer}>
                                            <Text style={[styles.trackTitle, { color: '#fff' }]} numberOfLines={1}>
                                                {option.track.title}
                                            </Text>
                                            <Text style={[styles.trackArtist, { color: '#999' }]} numberOfLines={1}>
                                                {option.track.artist}
                                            </Text>
                                        </View>
                                    </View>
                                </View>
                            </Pressable>
                        ))}
                    </ScrollView>

                    {/* Dots indicator */}
                    <View style={styles.dotsContainer}>
                        {limitedOptions.map((_, index) => (
                            <View
                                key={index}
                                style={[
                                    styles.dot,
                                    { backgroundColor: index === 0 ? activeTheme.primary : '#555' }
                                ]}
                            />
                        ))}
                    </View>

                    <Pressable
                        onPress={onClose}
                        style={[styles.closeButton, { backgroundColor: '#FF4444', borderWidth: 0 }]}
                    >
                        <Text style={[styles.closeText, { color: '#fff' }]}>Cancel</Text>
                    </Pressable>
                </Animated.View>
            </BlurView>
        </ Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        justifyContent: 'flex-end',
    },
    backdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.4)',
    },
    container: {
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
        marginBottom: 20,
        paddingVertical: 16,
        marginHorizontal: 10,
        borderRadius: 20,
    },
    title: {
        fontSize: 22,
        fontWeight: '700',
        marginBottom: 4,
        paddingHorizontal: 24,
        textAlign: 'center',
    },
    subtitle: {
        fontSize: 14,
        paddingHorizontal: 24,
        textAlign: 'center',
    },
    horizontalList: {
        paddingVertical: 8,
    },
    optionCard: {
        width: CARD_WIDTH,
        height: 340,
        borderRadius: 24,
        overflow: 'hidden',
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.5,
        shadowRadius: 16,
        elevation: 10,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.15)',
    },
    cardContent: {
        flex: 1,
        padding: 20,
        justifyContent: 'space-between',
    },
    numberBadge: {
        position: 'absolute',
        top: 12,
        right: 12,
        width: 32,
        height: 32,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10,
    },
    numberText: {
        color: '#fff',
        fontWeight: '800',
        fontSize: 16,
    },
    cardHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 16,
        paddingRight: 30,
    },
    iconBadge: {
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    vibeTitle: {
        fontSize: 20,
        fontWeight: '800',
        flex: 1,
        letterSpacing: -0.5,
    },
    vibeDesc: {
        fontSize: 15,
        lineHeight: 22,
        marginBottom: 12,
        opacity: 0.9,
    },
    spacer: {
        flex: 1,
    },
    trackInfo: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 12,
        borderRadius: 16,
        marginTop: 12,
        gap: 12,
    },
    trackTextContainer: {
        flex: 1,
    },
    trackTitle: {
        fontSize: 15,
        fontWeight: '700',
        marginBottom: 2,
    },
    trackArtist: {
        fontSize: 13,
    },
    dotsContainer: {
        flexDirection: 'row',
        justifyContent: 'center',
        marginTop: 16,
        gap: 8,
    },
    dot: {
        width: 8,
        height: 8,
        borderRadius: 4,
    },
    closeButton: {
        marginTop: 20,
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
