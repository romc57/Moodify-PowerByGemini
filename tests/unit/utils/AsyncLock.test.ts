/**
 * AsyncLock Unit Tests
 * Pure logic - no mocks needed.
 */
import { createAsyncLock } from '../../../utils/AsyncLock';

describe('AsyncLock', () => {
    it('should start unlocked', () => {
        const lock = createAsyncLock();
        expect(lock.isLocked).toBe(false);
    });

    it('should acquire lock and run fn', async () => {
        const lock = createAsyncLock();
        let ran = false;

        const acquired = await lock.acquire(async () => { ran = true; });

        expect(acquired).toBe(true);
        expect(ran).toBe(true);
        expect(lock.isLocked).toBe(false); // released after fn completes
    });

    it('should reject concurrent acquire (returns false)', async () => {
        const lock = createAsyncLock();
        let resolveFirst!: () => void;
        const firstDone = new Promise<void>(r => { resolveFirst = r; });

        // Start a long-running lock holder
        const firstPromise = lock.acquire(async () => { await firstDone; });
        expect(lock.isLocked).toBe(true);

        // Try to acquire while locked
        const secondAcquired = await lock.acquire(async () => {
            throw new Error('should not run');
        });
        expect(secondAcquired).toBe(false);

        // Cleanup
        resolveFirst();
        const firstAcquired = await firstPromise;
        expect(firstAcquired).toBe(true);
    });

    it('should release lock even if fn throws', async () => {
        const lock = createAsyncLock();

        await expect(lock.acquire(async () => {
            throw new Error('boom');
        })).rejects.toThrow('boom');

        expect(lock.isLocked).toBe(false);
    });

    it('should allow re-acquire after fn completes', async () => {
        const lock = createAsyncLock();

        await lock.acquire(async () => {});
        const secondAcquired = await lock.acquire(async () => {});

        expect(secondAcquired).toBe(true);
    });

    it('wait() should resolve immediately when not locked', async () => {
        const lock = createAsyncLock();
        await lock.wait(); // should not hang
    });

    it('wait() should block until lock releases', async () => {
        const lock = createAsyncLock();
        let resolveFirst!: () => void;
        const firstDone = new Promise<void>(r => { resolveFirst = r; });
        const order: string[] = [];

        lock.acquire(async () => {
            await firstDone;
            order.push('first-done');
        });

        // wait() should block until first completes
        const waitPromise = lock.wait().then(() => order.push('wait-resolved'));

        // Let first complete
        resolveFirst();
        await waitPromise;

        expect(order).toEqual(['first-done', 'wait-resolved']);
    });

    it('reset() should force-clear the lock', () => {
        const lock = createAsyncLock();

        // Start something but don't await
        lock.acquire(async () => {
            await new Promise(r => setTimeout(r, 10000));
        });
        expect(lock.isLocked).toBe(true);

        lock.reset();
        expect(lock.isLocked).toBe(false);
    });
});
