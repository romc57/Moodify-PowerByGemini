/**
 * Simple async lock to prevent concurrent execution of critical sections.
 * Used by useAutoDJ to guard rescue and expansion loops from racing.
 */
export function createAsyncLock() {
    let current: Promise<void> | null = null;

    return {
        get isLocked() {
            return current !== null;
        },

        /**
         * Run `fn` exclusively. If a lock is already held, returns false without executing.
         * Returns true when `fn` completes (or throws).
         */
        async acquire(fn: () => Promise<void>): Promise<boolean> {
            if (current) return false;

            current = fn().finally(() => {
                current = null;
            });

            await current;
            return true;
        },

        /**
         * Wait for any in-progress operation to finish, then return.
         */
        async wait(): Promise<void> {
            if (current) await current;
        },

        reset(): void {
            current = null;
        },
    };
}

export type AsyncLock = ReturnType<typeof createAsyncLock>;
