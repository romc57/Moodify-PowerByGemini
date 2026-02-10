import { KnowledgeGraph } from '@/components/graph/KnowledgeGraph';
import { THEMES } from '@/constants/theme';
import { useSettingsStore } from '@/stores/SettingsStore';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function GraphScreen() {
    const { theme } = useSettingsStore();
    const activeTheme = THEMES[theme] || THEMES.midnight;
    const insets = useSafeAreaInsets();

    return (
        <LinearGradient
            colors={[activeTheme.gradientStart, activeTheme.gradientMid, activeTheme.gradientEnd]}
            style={[styles.gradient, { paddingTop: insets.top }]}
        >
            <KnowledgeGraph theme={activeTheme} />
        </LinearGradient>
    );
}

const styles = StyleSheet.create({
    gradient: {
        flex: 1,
    },
});
