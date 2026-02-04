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

        // Clear existing timer for this service
        const existingTimer = state.dismissTimers.get(error.service);
        if (existingTimer) {
            clearTimeout(existingTimer);
        }

        // Add to history (keep last 20)
        const newHistory = [error, ...state.history].slice(0, 20);

        // Create new maps (immutable update)
        const newErrors = new Map(state.errors);
        newErrors.set(error.service, error);

        const newTimers = new Map(state.dismissTimers);

        // Set up auto-dismiss for transient errors
        const dismissDuration = getAutoDismissDuration(error);
        if (dismissDuration !== null && isTransientError(error)) {
            const timer = setTimeout(() => {
                get().clearError(error.service);
            }, dismissDuration);
            newTimers.set(error.service, timer);
        }

        set({
            errors: newErrors,
            history: newHistory,
            dismissTimers: newTimers
        });

        // Log for debugging
        console.log(`[ErrorStore] ${error.severity.toUpperCase()} [${error.service}]: ${error.code} - ${error.userMessage}`);
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


