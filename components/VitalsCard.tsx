import { useVitalsStore } from '@/vitals/VitalsStore';
import React, { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';

export const VitalsCard = () => {
    const { current, baseline, calibrateBaseline, isCalibrating } = useVitalsStore();
    const { heartRate, stressLevel } = current;

    // Animation values
    const scale = useSharedValue(1);
    const opacity = useSharedValue(1);

    // Pulse animation based on Heart Rate
    useEffect(() => {
        const beatDuration = (60 / Math.max(heartRate, 40)) * 1000;
        scale.value = withRepeat(
            withSequence(
                withTiming(1.05, { duration: beatDuration * 0.1 }),
                withTiming(1, { duration: beatDuration * 0.9 })
            ),
            -1,
            false
        );
    }, [heartRate]);

    // Dynamic Background Color based on Stress
    const getBackgroundColor = () => {
        if (stressLevel < 30) return '#4ADE80'; // Green
        if (stressLevel < 60) return '#60A5FA'; // Blue
        if (stressLevel < 80) return '#FBBF24'; // Orange
        return '#EF4444'; // Red
    };

    const animatedStyle = useAnimatedStyle(() => ({
        transform: [{ scale: scale.value }],
    }));

    return (
        <View style={[styles.container, { backgroundColor: getBackgroundColor() }]}>
            <View style={styles.header}>
                <Text style={styles.title}>Your Vitals</Text>
                <Pressable onPress={() => calibrateBaseline()} disabled={isCalibrating}>
                    <Text style={styles.calibrateBtn}>
                        {isCalibrating ? 'Calibrating...' : 'Calibrate'}
                    </Text>
                </Pressable>
            </View>

            <Animated.View style={[styles.circle, animatedStyle]}>
                <Text style={styles.bpm}>{heartRate}</Text>
                <Text style={styles.label}>BPM</Text>
            </Animated.View>

            <View style={styles.stats}>
                <Text style={styles.statText}>Stress: {stressLevel}/100</Text>
                <Text style={styles.statText}>HRV: {current.hrv}ms</Text>
            </View>

            {baseline && (
                <Text style={styles.baselineText}>
                    Baseline: {baseline.heartRate} BPM
                </Text>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        padding: 20,
        borderRadius: 24,
        margin: 16,
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
        elevation: 5,
    },
    header: {
        width: '100%',
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 20,
    },
    title: {
        color: 'white',
        fontSize: 18,
        fontWeight: 'bold',
    },
    calibrateBtn: {
        color: 'rgba(255,255,255,0.8)',
        fontSize: 14,
        textDecorationLine: 'underline',
    },
    circle: {
        width: 120,
        height: 120,
        borderRadius: 60,
        backgroundColor: 'rgba(255,255,255,0.2)',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 20,
        borderWidth: 2,
        borderColor: 'rgba(255,255,255,0.4)',
    },
    bpm: {
        color: 'white',
        fontSize: 42,
        fontWeight: 'bold',
    },
    label: {
        color: 'rgba(255,255,255,0.9)',
        fontSize: 14,
    },
    stats: {
        flexDirection: 'row',
        gap: 20,
    },
    statText: {
        color: 'white',
        fontSize: 16,
        fontWeight: '500',
    },
    baselineText: {
        marginTop: 10,
        color: 'rgba(255,255,255,0.7)',
        fontSize: 12,
    }
});
