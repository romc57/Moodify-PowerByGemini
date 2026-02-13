/**
 * ServiceError - Unified error system for Moodify
 *
 * Provides typed error structures and factory functions for
 * consistent error handling across Gemini, Spotify, and other services.
 */

export type ServiceType = 'gemini' | 'spotify' | 'database' | 'network';

export type ErrorSeverity = 'warning' | 'error' | 'critical';

/**
 * Unified error structure for all services
 */
export interface ServiceError {
    /** Which service the error originated from */
    service: ServiceType;
    /** Error code for programmatic handling */
    code: string;
    /** Severity level affects UI presentation */
    severity: ErrorSeverity;
    /** Human-readable message for display */
    userMessage: string;
    /** Whether the operation can be retried */
    retryable: boolean;
    /** Timestamp of when error occurred */
    timestamp: number;
    /** Optional technical details for logging */
    details?: string;
    /** If true, only log — don't show UI banner (auto-recovered errors) */
    silent?: boolean;
}

/**
 * Create a base service error
 */
function createError(
    service: ServiceType,
    code: string,
    severity: ErrorSeverity,
    userMessage: string,
    retryable: boolean,
    details?: string,
    actionAction?: { label: string; link: string; type: 'navigate' | 'retry' | 'dismiss' },
    silent?: boolean
): ServiceError {
    return {
        service,
        code,
        severity,
        userMessage,
        retryable,
        timestamp: Date.now(),
        details,
        silent,
        actionLabel: actionAction?.label,
        actionLink: actionAction?.link,
        actionType: actionAction?.type
    };
}

/**
 * Gemini API error factories
 */
export const GeminiErrors = {
    /** Invalid or expired API key */
    invalidKey: (details?: string) => createError(
        'gemini',
        'INVALID_KEY',
        'critical',
        'Gemini API key is invalid. Please check Settings.',
        false,
        details,
        { label: 'Fix Key', link: '/settings', type: 'navigate' }
    ),

    /** Rate limited by API */
    rateLimited: (details?: string) => createError(
        'gemini',
        'RATE_LIMITED',
        'warning',
        'AI is busy. Retrying automatically...',
        true,
        details,
        undefined,
        true // silent — auto-retried
    ),

    /** Network error connecting to Gemini */
    networkError: (details?: string) => createError(
        'gemini',
        'NETWORK_ERROR',
        'error',
        'Cannot reach Gemini AI. Check your connection.',
        true,
        details
    ),

    /** thoughtSignature validation failed */
    signatureError: (details?: string) => createError(
        'gemini',
        'SIGNATURE_ERROR',
        'warning',
        'AI session expired. Restarting conversation...',
        true,
        details,
        undefined,
        true // silent — auto-recovered
    ),

    /** Generic Gemini error */
    unknown: (details?: string) => createError(
        'gemini',
        'UNKNOWN',
        'error',
        'AI encountered an error. Please try again.',
        true,
        details
    ),

    /** JSON parsing error from response */
    parseError: (details?: string) => createError(
        'gemini',
        'PARSE_ERROR',
        'warning',
        'AI response was malformed. Retrying...',
        true,
        details,
        undefined,
        true // silent — auto-retried with fallback
    ),

    /** Concurrent request blocked */
    concurrentBlocked: () => createError(
        'gemini',
        'CONCURRENT_BLOCKED',
        'warning',
        'AI is already processing a request.',
        false,
        undefined,
        undefined,
        true // silent — normal flow, first request still running
    )
};

/**
 * Spotify API error factories
 */
export const SpotifyErrors = {
    /** No active device found */
    noDevice: () => createError(
        'spotify',
        'NO_DEVICE',
        'error',
        'No Spotify device found. Open Spotify app and play something.',
        true
    ),

    /** Premium required for this action */
    premiumRequired: () => createError(
        'spotify',
        'PREMIUM_REQUIRED',
        'critical',
        'Spotify Premium is required for playback control.',
        false,
        undefined,
        { label: 'Open Spotify', link: 'spotify:', type: 'dismiss' }
    ),

    /** Not authenticated */
    notAuthenticated: () => createError(
        'spotify',
        'NOT_AUTHENTICATED',
        'critical',
        'Please connect your Spotify account in Settings.',
        false,
        undefined,
        { label: 'Connect Spotify', link: '/settings', type: 'navigate' }
    ),

    /** Token expired and refresh failed */
    authExpired: (details?: string) => createError(
        'spotify',
        'AUTH_EXPIRED',
        'error',
        'Spotify session expired. Please reconnect.',
        false,
        details
    ),

    /** Currently in auth lockout period */
    authLockout: (remainingMs: number) => createError(
        'spotify',
        'AUTH_LOCKOUT',
        'warning',
        `Spotify auth cooling down. Retry in ${Math.ceil(remainingMs / 1000)}s.`,
        true,
        `Lockout remaining: ${remainingMs}ms`,
        undefined,
        true // silent — temporary cooldown, auto-recovers
    ),

    /** Network error connecting to Spotify */
    networkError: (details?: string) => createError(
        'spotify',
        'NETWORK_ERROR',
        'error',
        'Cannot reach Spotify. Check your connection.',
        true,
        details
    ),

    /** Track not found */
    trackNotFound: (trackName?: string) => createError(
        'spotify',
        'TRACK_NOT_FOUND',
        'warning',
        trackName ? `Could not find "${trackName}" on Spotify.` : 'Track not found on Spotify.',
        false,
        trackName,
        undefined,
        true // silent — individual track skip, doesn't break flow
    ),

    /** Search failed */
    searchFailed: (details?: string) => createError(
        'spotify',
        'SEARCH_FAILED',
        'warning',
        'Spotify search failed. Trying alternatives...',
        true,
        details,
        undefined,
        true // silent — auto-retried with alternatives
    ),

    /** Generic Spotify error */
    unknown: (details?: string) => createError(
        'spotify',
        'UNKNOWN',
        'error',
        'Spotify encountered an error.',
        true,
        details
    )
};

/**
 * Database error factories
 */
export const DatabaseErrors = {
    /** Database connection failed */
    connectionFailed: (details?: string) => createError(
        'database',
        'CONNECTION_FAILED',
        'error',
        'Database connection failed.',
        true,
        details
    ),

    /** Query failed */
    queryFailed: (details?: string) => createError(
        'database',
        'QUERY_FAILED',
        'warning',
        'Database operation failed.',
        true,
        details,
        undefined,
        true // silent — internal, doesn't affect user flow
    )
};

/**
 * Network error factories
 */
export const NetworkErrors = {
    /** No internet connection */
    offline: () => createError(
        'network',
        'OFFLINE',
        'critical',
        'No internet connection.',
        true
    ),

    /** Request timeout */
    timeout: (details?: string) => createError(
        'network',
        'TIMEOUT',
        'error',
        'Request timed out. Please try again.',
        true,
        details
    )
};

/**
 * Helper to determine if an error is transient (should auto-dismiss)
 */
export function isTransientError(error: ServiceError): boolean {
    return error.retryable && error.severity !== 'critical';
}

/**
 * Helper to get auto-dismiss duration based on severity
 */
export function getAutoDismissDuration(error: ServiceError): number | null {
    if (error.severity === 'critical') return null; // Never auto-dismiss critical
    if (error.severity === 'error') return 8000; // 8 seconds
    return 5000; // 5 seconds for warnings
}
