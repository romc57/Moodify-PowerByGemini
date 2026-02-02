/**
 * Secure Logger Utility
 *
 * Only logs in development mode to prevent sensitive data exposure in production.
 * Sanitizes error objects to remove potentially sensitive information.
 */

const isDev = __DEV__;

interface SanitizedError {
    message: string;
    name?: string;
    code?: string;
}

function sanitizeError(error: any): SanitizedError | string {
    if (!error) return 'Unknown error';

    if (typeof error === 'string') {
        return error;
    }

    const sanitized: SanitizedError = {
        message: error.message || 'Unknown error',
    };

    if (error.name) sanitized.name = error.name;
    if (error.code) sanitized.code = error.code;

    // Exclude sensitive fields like response data, headers, config
    return sanitized;
}

function formatArgs(...args: any[]): any[] {
    return args.map(arg => {
        if (arg instanceof Error) {
            return sanitizeError(arg);
        }
        return arg;
    });
}

export const logger = {
    /**
     * Debug logs - only in development
     */
    debug: (...args: any[]) => {
        if (isDev) {
            console.log(...formatArgs(...args));
        }
    },

    /**
     * Info logs - only in development
     */
    info: (...args: any[]) => {
        if (isDev) {
            console.log(...formatArgs(...args));
        }
    },

    /**
     * Warning logs - only in development
     */
    warn: (...args: any[]) => {
        if (isDev) {
            console.warn(...formatArgs(...args));
        }
    },

    /**
     * Error logs - sanitized, logged in all environments
     * Critical errors should still be visible for debugging but without sensitive data
     */
    error: (message: string, error?: any) => {
        const sanitized = error ? sanitizeError(error) : undefined;
        if (isDev) {
            console.error(message, sanitized);
        } else {
            // In production, only log the message without details
            console.error(message);
        }
    },
};
