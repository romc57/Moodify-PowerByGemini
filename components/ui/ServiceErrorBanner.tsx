/**
 * ServiceErrorBanner - Animated error display component
 *
 * Shows active service errors with:
 * - Service-specific icons (Gemini sparkles, Spotify music)
 * - Color-coded severity (red=critical, orange=error, yellow=warning)
 * - Auto-dismiss for non-critical errors
 * - Manual dismiss button
 */

import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
    FadeInUp,
    FadeOutUp,
    Layout,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ErrorSeverity, ServiceError, ServiceType } from '@/services/core/ServiceError';
import { useActiveErrors, useErrorStore } from '@/stores/ErrorStore';
import { router } from 'expo-router';

interface ServiceErrorBannerProps {
    position?: 'top' | 'bottom';
    maxErrors?: number;
}

/**
 * Get icon name for service type
 */
function getServiceIcon(service: ServiceType): keyof typeof Ionicons.glyphMap {
    switch (service) {
        case 'gemini':
            return 'sparkles';
        case 'spotify':
            return 'musical-notes';
        case 'database':
            return 'server';
        case 'network':
            return 'wifi';
        default:
            return 'alert-circle';
    }
}

/**
 * Get colors for severity level
 */
function getSeverityColors(severity: ErrorSeverity): { bg: string; border: string; text: string; icon: string } {
    switch (severity) {
        case 'critical':
            return {
                bg: 'rgba(239, 68, 68, 0.15)',     // red-500/15
                border: 'rgba(239, 68, 68, 0.4)',  // red-500/40
                text: '#FCA5A5',                   // red-300
                icon: '#EF4444'                    // red-500
            };
        case 'error':
            return {
                bg: 'rgba(249, 115, 22, 0.15)',    // orange-500/15
                border: 'rgba(249, 115, 22, 0.4)', // orange-500/40
                text: '#FDBA74',                   // orange-300
                icon: '#F97316'                    // orange-500
            };
        case 'warning':
        default:
            return {
                bg: 'rgba(234, 179, 8, 0.15)',     // yellow-500/15
                border: 'rgba(234, 179, 8, 0.4)',  // yellow-500/40
                text: '#FDE047',                   // yellow-300
                icon: '#EAB308'                    // yellow-500
            };
    }
}

/**
 * Get service display name
 */
function getServiceName(service: ServiceType): string {
    switch (service) {
        case 'gemini':
            return 'GEMINI';
        case 'spotify':
            return 'SPOTIFY';
        case 'database':
            return 'DATABASE';
        case 'network':
            return 'NETWORK';
        default:
            return 'ERROR';
    }
}

/**
 * Single error banner item
 */
function ErrorBannerItem({ error, onDismiss }: { error: ServiceError; onDismiss: () => void }) {
    const colors = getSeverityColors(error.severity);
    const iconName = getServiceIcon(error.service);
    const serviceName = getServiceName(error.service);

    return (
        <Animated.View
            entering={FadeInUp.springify().damping(15)}
            exiting={FadeOutUp.springify().damping(15)}
            layout={Layout.springify()}
            style={[
                styles.errorItem,
                {
                    backgroundColor: colors.bg,
                    borderColor: colors.border,
                }
            ]}
        >
            {/* Service Icon */}
            <View style={[styles.iconContainer, { backgroundColor: `${colors.icon}20` }]}>
                <Ionicons name={iconName} size={16} color={colors.icon} />
            </View>

            import {router} from 'expo-router';

            // ... (existing imports)

            // Inside ErrorBannerItem before content container:
            {/* Action Button */}
            {error.actionLabel && (
                <Pressable
                    onPress={() => {
                        if (error.actionType === 'navigate' && error.actionLink) {
                            router.push(error.actionLink as any);
                            onDismiss();
                        }
                    }}
                    style={({ pressed }) => [
                        styles.actionButton,
                        { backgroundColor: colors.icon, opacity: pressed ? 0.8 : 1 }
                    ]}
                >
                    <Text style={styles.actionButtonText}>{error.actionLabel}</Text>
                </Pressable>
            )}

            {/* Content */}

            {/* Content */}
            <View style={styles.contentContainer}>
                <View style={styles.headerRow}>
                    <Text style={[styles.serviceLabel, { color: colors.icon }]}>
                        {serviceName}
                    </Text>
                    {error.retryable && (
                        <View style={styles.retryBadge}>
                            <Ionicons name="refresh" size={10} color={colors.text} />
                            <Text style={[styles.retryText, { color: colors.text }]}>Retrying</Text>
                        </View>
                    )}
                </View>
                <Text style={[styles.messageText, { color: colors.text }]} numberOfLines={2}>
                    {error.userMessage}
                </Text>
            </View>

            {/* Dismiss Button */}
            <Pressable
                onPress={onDismiss}
                style={({ pressed }) => [
                    styles.dismissButton,
                    { opacity: pressed ? 0.6 : 1 }
                ]}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
                <Ionicons name="close" size={18} color={colors.text} />
            </Pressable>
        </Animated.View>
    );
}

// Import router at the top or use simple string check

/**
 * Main banner component that shows all active errors
 */
export function ServiceErrorBanner({ position = 'top', maxErrors = 2 }: ServiceErrorBannerProps) {
    const errors = useActiveErrors();
    const clearError = useErrorStore(state => state.clearError);
    const insets = useSafeAreaInsets();

    // Show most recent errors first, limited to maxErrors
    const visibleErrors = errors
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, maxErrors);

    if (visibleErrors.length === 0) {
        return null;
    }

    const positionStyle = position === 'top'
        ? { top: insets.top + 10 }
        : { bottom: insets.bottom + 80 }; // Above tab bar

    return (
        <View style={[styles.container, positionStyle]} pointerEvents="box-none">
            {visibleErrors.map(error => (
                <ErrorBannerItem
                    key={`${error.service}-${error.timestamp}`}
                    error={error}
                    onDismiss={() => clearError(error.service)}
                />
            ))}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        position: 'absolute',
        left: 16,
        right: 16,
        zIndex: 1000,
        gap: 8,
    },
    errorItem: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 12,
        borderRadius: 12,
        borderWidth: 1,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 8,
        elevation: 5,
    },
    iconContainer: {
        width: 32,
        height: 32,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    contentContainer: {
        flex: 1,
        marginRight: 8,
    },
    headerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 2,
    },
    serviceLabel: {
        fontSize: 11,
        fontWeight: '700',
        letterSpacing: 0.5,
    },
    retryBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        marginLeft: 8,
        gap: 3,
    },
    retryText: {
        fontSize: 10,
        fontWeight: '500',
    },
    messageText: {
        fontSize: 13,
        fontWeight: '500',
        lineHeight: 18,
    },
    dismissButton: {
        padding: 4,
    },
    // Action Button Styles
    actionButton: {
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 6,
        marginRight: 8,
        justifyContent: 'center',
        alignItems: 'center',
    },
    actionButtonText: {
        color: '#FFFFFF',
        fontSize: 11,
        fontWeight: '600',
    }
});

export default ServiceErrorBanner;
