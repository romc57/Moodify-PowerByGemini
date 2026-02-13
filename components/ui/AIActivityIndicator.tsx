import { THEMES } from '@/constants/theme';
import { useAIActivityStore } from '@/stores/AIActivityStore';
import { useSettingsStore } from '@/stores/SettingsStore';
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
    FadeInDown,
    FadeOutDown,
    useAnimatedStyle,
    useSharedValue,
    withRepeat,
    withSequence,
    withTiming,
} from 'react-native-reanimated';

export function AIActivityIndicator() {
    const { theme } = useSettingsStore();
    const activeTheme = THEMES[theme] || THEMES.midnight;
    const { isActive, label } = useAIActivityStore();

    const rotation = useSharedValue(0);
    const pulse = useSharedValue(1);

    useEffect(() => {
        if (isActive) {
            rotation.value = withRepeat(withTiming(360, { duration: 2000 }), -1, false);
            pulse.value = withRepeat(
                withSequence(
                    withTiming(0.6, { duration: 800 }),
                    withTiming(1, { duration: 800 })
                ),
                -1,
                true
            );
        } else {
            rotation.value = 0;
            pulse.value = 1;
        }
    }, [isActive]);

    const spinStyle = useAnimatedStyle(() => ({
        transform: [{ rotate: `${rotation.value}deg` }],
    }));

    const pulseStyle = useAnimatedStyle(() => ({
        opacity: pulse.value,
    }));

    if (!isActive) return null;

    return (
        <Animated.View
            entering={FadeInDown.duration(200)}
            exiting={FadeOutDown.duration(200)}
            style={[styles.container, { backgroundColor: `${activeTheme.aiPurple}20`, borderColor: `${activeTheme.aiPurple}40` }]}
        >
            <Animated.View style={spinStyle}>
                <Ionicons name="sparkles" size={14} color={activeTheme.aiPurple} />
            </Animated.View>
            <Animated.View style={pulseStyle}>
                <Text style={[styles.label, { color: activeTheme.aiPurple }]} numberOfLines={1}>
                    {label}
                </Text>
            </Animated.View>
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    container: {
        position: 'absolute',
        bottom: 78,
        alignSelf: 'center',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 14,
        paddingVertical: 7,
        borderRadius: 20,
        borderWidth: 1,
    },
    label: {
        fontSize: 12,
        fontWeight: '600',
    },
});
