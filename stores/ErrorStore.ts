/**
 * ErrorStore - Centralized error state management
 *
 * Manages active errors per service for UI display.
 * Supports auto-dismissal and error history.
 */

import {
    ServiceError,
    ServiceType,
    getAutoDismissDuration,
    isTransientError
} from '@/services/core/ServiceError';
import { create } from 'zustand';

interface ErrorState {
    /** Active errors by service type */
    errors: Map<ServiceType, ServiceError>;

    /** Error history (last 20 errors for debugging) */
    history: ServiceError[];

    /** Auto-dismiss timers by service */
    dismissTimers: Map<ServiceType, NodeJS.Timeout>;

    // Actions
    setError: (error: ServiceError) => void;
    clearError: (service: ServiceType) => void;
    clearAllErrors: () => void;
    getLatestError: (service?: ServiceType) => ServiceError | null;
    hasActiveError: (service?: ServiceType) => boolean;
}

export const useErrorStore = create<ErrorState>((set, get) => ({
    errors: new Map(),
    history: [],
    dismissTimers: new Map(),

    setError: (error: ServiceError) => {
        const state = get();

        // Always log for debugging
        console.log(`[ErrorStore] ${error.severity.toUpperCase()} [${error.service}]: ${error.code} - ${error.userMessage}${error.silent ? ' (silent)' : ''}`);

        // Add to history (keep last 20) — silent or not, always track
        const newHistory = [error, ...state.history].slice(0, 20);

        // Silent errors: log + history only, no UI banner
        if (error.silent) {
            set({ history: newHistory });
            return;
        }

        // Clear existing timer for this service
        const existingTimer = state.dismissTimers.get(error.service);
        if (existingTimer) {
            clearTimeout(existingTimer);
        }

        // Create new maps (immutable update)
        const newErrors = new Map(state.errors);
        newErrors.set(error.service, error);

        const newTimers = new Map(state.dismissTimers);

        // Auto-dismiss non-critical errors (transient errors use configured duration,
        // non-transient errors use a longer 15s timeout so they don't get stuck)
        const dismissDuration = getAutoDismissDuration(error);
        if (dismissDuration !== null) {
            const timeout = isTransientError(error) ? dismissDuration : 15_000;
            const timer = setTimeout(() => {
                get().clearError(error.service);
            }, timeout);
            newTimers.set(error.service, timer);
        }

        set({
            errors: newErrors,
            history: newHistory,
            dismissTimers: newTimers
        });
    },

    clearError: (service: ServiceType) => {
        const state = get();

        // Clear timer if exists
        const timer = state.dismissTimers.get(service);
        if (timer) {
            clearTimeout(timer);
        }

        // Remove from maps
        const newErrors = new Map(state.errors);
        newErrors.delete(service);

        const newTimers = new Map(state.dismissTimers);
        newTimers.delete(service);

        set({
            errors: newErrors,
            dismissTimers: newTimers
        });
    },

    clearAllErrors: () => {
        const state = get();

        // Clear all timers
        state.dismissTimers.forEach(timer => clearTimeout(timer));

        set({
            errors: new Map(),
            dismissTimers: new Map()
        });
    },

    getLatestError: (service?: ServiceType) => {
        const state = get();

        if (service) {
            return state.errors.get(service) || null;
        }

        // Return most recent error from any service
        let latestError: ServiceError | null = null;
        state.errors.forEach(error => {
            if (!latestError || error.timestamp > latestError.timestamp) {
                latestError = error;
            }
        });

        return latestError;
    },

    hasActiveError: (service?: ServiceType) => {
        const state = get();

        if (service) {
            return state.errors.has(service);
        }

        return state.errors.size > 0;
    }
}));

/**
 * Convenience hook to get all active errors as an array
 */
import { useShallow } from 'zustand/react/shallow';

/**
 * Convenience hook to get all active errors as an array
 */
export function useActiveErrors(): ServiceError[] {
    return useErrorStore(useShallow(state => Array.from(state.errors.values())));
}

/**
 * Convenience hook to check if a specific service has an error
 */
export function useServiceError(service: ServiceType): ServiceError | null {
    return useErrorStore(state => state.errors.get(service) || null);
}


