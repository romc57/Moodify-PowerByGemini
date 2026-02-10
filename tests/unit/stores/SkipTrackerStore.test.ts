/**
 * SkipTrackerStore Unit Tests
 *
 * Tests skip/listen counting, rescue triggers, expansion triggers,
 * AI strategy progression, and rescue mode locking.
 * NO MOCKS - uses real dbService and graphService (test DB / in-memory graph).
 */

import { dbService } from '../../../services/database';
import { useSkipTracker } from '../../../stores/SkipTrackerStore';
import { initializeTestDatabase } from '../../utils/testDb';

const getState = () => useSkipTracker.getState();

describe('SkipTrackerStore', () => {
    beforeAll(async () => {
        await initializeTestDatabase();
        await dbService.init();
    });

    beforeEach(() => {
        getState().reset();
    });

    describe('onTrackStart', () => {
        it('should set current track info and start time', () => {
            const before = Date.now();
            getState().onTrackStart('t1', 'Song 1', 'Artist 1');

            const s = getState();
            expect(s.currentTrackId).toBe('t1');
            expect(s.currentTrackName).toBe('Song 1');
            expect(s.currentArtist).toBe('Artist 1');
            expect(s.listeningStartTime).toBeGreaterThanOrEqual(before);
        });
    });

    describe('onTrackChange - skip detection', () => {
        it('should count as skip when listened < 30 seconds', () => {
            // Start a track
            getState().onTrackStart('t1', 'Song 1', 'Artist 1');
            // Override start time to simulate 5 seconds ago
            useSkipTracker.setState({ listeningStartTime: Date.now() - 5000 });

            getState().onTrackChange('t2', 'Song 2', 'Artist 2');

            expect(getState().consecutiveSkips).toBe(1);
            expect(getState().consecutiveListens).toBe(0);
        });

        it('should count as listen when listened >= 30 seconds', () => {
            getState().onTrackStart('t1', 'Song 1', 'Artist 1');
            useSkipTracker.setState({ listeningStartTime: Date.now() - 35000 });

            getState().onTrackChange('t2', 'Song 2', 'Artist 2');

            expect(getState().consecutiveSkips).toBe(0);
            expect(getState().consecutiveListens).toBe(1);
        });

        it('should accumulate consecutive skips', () => {
            for (let i = 0; i < 4; i++) {
                getState().onTrackStart(`t${i}`, `Song ${i}`, 'A');
                useSkipTracker.setState({ listeningStartTime: Date.now() - 3000 });
                getState().onTrackChange(`t${i + 1}`, `Song ${i + 1}`, 'A');
            }

            expect(getState().consecutiveSkips).toBe(4);
            expect(getState().consecutiveListens).toBe(0);
        });

        it('should reset consecutive skips on a listen', () => {
            // 2 skips
            getState().onTrackStart('t1', 'S1', 'A');
            useSkipTracker.setState({ listeningStartTime: Date.now() - 3000 });
            getState().onTrackChange('t2', 'S2', 'A');

            getState().onTrackStart('t2', 'S2', 'A');
            useSkipTracker.setState({ listeningStartTime: Date.now() - 3000 });
            getState().onTrackChange('t3', 'S3', 'A');

            expect(getState().consecutiveSkips).toBe(2);

            // Now a listen
            useSkipTracker.setState({ listeningStartTime: Date.now() - 60000 });
            getState().onTrackChange('t4', 'S4', 'A');

            expect(getState().consecutiveSkips).toBe(0);
            expect(getState().consecutiveListens).toBe(1);
        });

        it('should ignore track changes during rescue mode', () => {
            getState().setRescueMode(true);
            getState().onTrackStart('t1', 'S1', 'A');
            useSkipTracker.setState({ listeningStartTime: Date.now() - 3000 });
            getState().onTrackChange('t2', 'S2', 'A');

            // Should NOT count as skip
            expect(getState().consecutiveSkips).toBe(0);
        });

        it('should store recent skips (max 10)', () => {
            for (let i = 0; i < 15; i++) {
                getState().onTrackStart(`t${i}`, `S${i}`, 'A');
                useSkipTracker.setState({ listeningStartTime: Date.now() - 3000 });
                getState().onTrackChange(`t${i + 1}`, `S${i + 1}`, 'A');
            }

            expect(getState().recentSkips).toHaveLength(10);
        });

        it('should handle first track (no previous state)', () => {
            getState().onTrackChange('t1', 'S1', 'A');

            expect(getState().currentTrackId).toBe('t1');
            expect(getState().consecutiveSkips).toBe(0);
        });
    });

    describe('shouldTriggerAI', () => {
        it('should return true at 3 consecutive skips', () => {
            useSkipTracker.setState({ consecutiveSkips: 3 });
            expect(getState().shouldTriggerAI()).toBe(true);
        });

        it('should return false below 3 skips', () => {
            useSkipTracker.setState({ consecutiveSkips: 2 });
            expect(getState().shouldTriggerAI()).toBe(false);
        });

        it('should return true above 3 skips', () => {
            useSkipTracker.setState({ consecutiveSkips: 5 });
            expect(getState().shouldTriggerAI()).toBe(true);
        });
    });

    describe('AI strategy progression', () => {
        it('should start conservative (trigger 0)', () => {
            expect(getState().getAIStrategy()).toBe('conservative');
        });

        it('should be exploratory after first trigger', () => {
            getState().recordAITrigger('pick1');
            expect(getState().getAIStrategy()).toBe('exploratory');
        });

        it('should be refined after second trigger', () => {
            getState().recordAITrigger('pick1');
            getState().recordAITrigger('pick2');
            expect(getState().getAIStrategy()).toBe('refined');
        });

        it('should stay refined for subsequent triggers', () => {
            getState().recordAITrigger('pick1');
            getState().recordAITrigger('pick2');
            getState().recordAITrigger('pick3');
            expect(getState().getAIStrategy()).toBe('refined');
        });

        it('should reset consecutive counts on AI trigger', () => {
            useSkipTracker.setState({ consecutiveSkips: 5, consecutiveListens: 3 });
            getState().recordAITrigger('pick');
            expect(getState().consecutiveSkips).toBe(0);
            expect(getState().consecutiveListens).toBe(0);
        });

        it('should record trigger details', () => {
            getState().recordAITrigger('Bohemian Rhapsody');
            const h = getState().aiHistory;
            expect(h.triggerCount).toBe(1);
            expect(h.lastPickedTrack).toBe('Bohemian Rhapsody');
            expect(h.lastTriggerTime).toBeGreaterThan(0);
        });
    });

    describe('recordExpansionTrigger', () => {
        it('should reset consecutive listens', () => {
            useSkipTracker.setState({ consecutiveListens: 7 });
            getState().recordExpansionTrigger();
            expect(getState().consecutiveListens).toBe(0);
        });
    });

    describe('rescue mode', () => {
        it('should set and clear rescue mode', () => {
            expect(getState().isRescueMode).toBe(false);
            getState().setRescueMode(true);
            expect(getState().isRescueMode).toBe(true);
            getState().setRescueMode(false);
            expect(getState().isRescueMode).toBe(false);
        });
    });

    describe('reset', () => {
        it('should clear all state', () => {
            // Build up state
            getState().onTrackStart('t1', 'S1', 'A');
            useSkipTracker.setState({ consecutiveSkips: 5, consecutiveListens: 3 });
            getState().recordAITrigger('pick');

            getState().reset();

            const s = getState();
            expect(s.currentTrackId).toBeNull();
            expect(s.consecutiveSkips).toBe(0);
            expect(s.consecutiveListens).toBe(0);
            expect(s.aiHistory.triggerCount).toBe(0);
            expect(s.recentSkips).toEqual([]);
        });
    });

    describe('End-to-end: realistic skip/listen sequence', () => {
        it('should correctly track a session: 2 skips, 1 listen, 3 skips → trigger', () => {
            // Skip 1
            getState().onTrackStart('t1', 'S1', 'A');
            useSkipTracker.setState({ listeningStartTime: Date.now() - 5000 });
            getState().onTrackChange('t2', 'S2', 'A');
            expect(getState().consecutiveSkips).toBe(1);

            // Skip 2
            useSkipTracker.setState({ listeningStartTime: Date.now() - 10000 });
            getState().onTrackChange('t3', 'S3', 'A');
            expect(getState().consecutiveSkips).toBe(2);

            // Listen (resets skips)
            useSkipTracker.setState({ listeningStartTime: Date.now() - 45000 });
            getState().onTrackChange('t4', 'S4', 'A');
            expect(getState().consecutiveSkips).toBe(0);
            expect(getState().consecutiveListens).toBe(1);

            // Skip 1
            useSkipTracker.setState({ listeningStartTime: Date.now() - 3000 });
            getState().onTrackChange('t5', 'S5', 'A');

            // Skip 2
            useSkipTracker.setState({ listeningStartTime: Date.now() - 3000 });
            getState().onTrackChange('t6', 'S6', 'A');

            // Skip 3 → should trigger
            useSkipTracker.setState({ listeningStartTime: Date.now() - 3000 });
            getState().onTrackChange('t7', 'S7', 'A');

            expect(getState().consecutiveSkips).toBe(3);
            expect(getState().shouldTriggerAI()).toBe(true);
        });
    });
});
