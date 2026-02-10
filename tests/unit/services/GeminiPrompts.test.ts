/**
 * GeminiPrompts Unit Tests
 *
 * Tests prompt generation functions produce correct structure.
 * Pure functions - no mocks needed.
 */
import { GeminiPrompts } from '../../../services/gemini/GeminiPrompts';

describe('GeminiPrompts', () => {
    describe('generateDJRecommendation', () => {
        it('should include history in compact format', () => {
            const prompt = GeminiPrompts.generateDJRecommendation(
                [{ track_name: 'Song A', artist_name: 'Artist A', skipped: false }],
                ['fav1', 'fav2'],
                0.3,
                'chill vibes'
            );

            expect(prompt).toContain('Song A|Artist A|P');
            expect(prompt).toContain('fav1');
            expect(prompt).toContain('chill vibes');
            expect(prompt).toContain('JSON');
        });

        it('should mark skipped tracks with S', () => {
            const prompt = GeminiPrompts.generateDJRecommendation(
                [{ track_name: 'Skipped', artist_name: 'X', skipped: true }],
                [], 0.5, ''
            );
            expect(prompt).toContain('Skipped|X|S');
        });

        it('should use strategy hints', () => {
            const conservative = GeminiPrompts.generateDJRecommendation([], [], 0, '', 'conservative');
            expect(conservative).toContain('similar');

            const exploratory = GeminiPrompts.generateDJRecommendation([], [], 0, '', 'exploratory');
            expect(exploratory).toContain('new-genre-same-energy');

            const refined = GeminiPrompts.generateDJRecommendation([], [], 0, '', 'refined');
            expect(refined).toContain('analyze-skips');
        });

        it('should handle empty inputs', () => {
            const prompt = GeminiPrompts.generateDJRecommendation([], [], 0, '');
            expect(prompt).toContain('JSON');
            expect(prompt).toContain('items');
        });

        it('should limit history to 8 items', () => {
            const history = Array.from({ length: 15 }, (_, i) => ({
                track_name: `Song${i}`, artist_name: `Artist${i}`, skipped: false
            }));
            const prompt = GeminiPrompts.generateDJRecommendation(history, [], 0, '');
            expect(prompt).not.toContain('Song14'); // index 14 = 15th item
            expect(prompt).toContain('Song7');       // index 7 = 8th item
        });
    });

    describe('generateVibeOptionsPrompt', () => {
        const baseTaste = {
            clusterReps: [{ name: 'Creep', artist: 'Radiohead', playCount: 10 }],
            topGenres: [{ name: 'alt-rock', songCount: 50 }],
            recentVibes: ['Chill Evening'],
            audioProfile: { energy: 0.7, valence: 0.5, danceability: 0.6 },
        };

        it('should include taste profile data', () => {
            const prompt = GeminiPrompts.generateVibeOptionsPrompt(
                [{ track_name: 'X', artist_name: 'Y' }],
                baseTaste, ['fav1'], 'afternoon vibes'
            );

            expect(prompt).toContain('Creep|Radiohead(10)');
            expect(prompt).toContain('alt-rock(50)');
            expect(prompt).toContain('Chill Evening');
            expect(prompt).toContain('E:0.7|V:0.5|D:0.6');
            expect(prompt).toContain('16 vibe options');
            expect(prompt).toContain('afternoon vibes');
        });

        it('should include exclusion list', () => {
            const prompt = GeminiPrompts.generateVibeOptionsPrompt(
                [], baseTaste, [], '', ['Song A|Artist A', 'Song B|Artist B']
            );
            expect(prompt).toContain('EXCLUDE:Song A|Artist A;Song B|Artist B');
        });

        it('should handle empty taste profile', () => {
            const prompt = GeminiPrompts.generateVibeOptionsPrompt(
                [], { clusterReps: [] }, [], ''
            );
            expect(prompt).toContain('Ctx(Taste Clusters):None');
            expect(prompt).toContain('Ctx(History):None');
        });

        it('should request 4 Familiar + 4 Adjacent + 8 Discovery', () => {
            const prompt = GeminiPrompts.generateVibeOptionsPrompt(
                [], baseTaste, [], ''
            );
            expect(prompt).toContain("4 'Familiar'");
            expect(prompt).toContain("4 'Adjacent'");
            expect(prompt).toContain("8 'Discovery'");
        });
    });

    describe('generateVibeExpansionPrompt', () => {
        it('should include seed track and neighbors', () => {
            const prompt = GeminiPrompts.generateVibeExpansionPrompt(
                { title: 'Creep', artist: 'Radiohead' },
                [{ track_name: 'X', artist_name: 'Y' }],
                [{ name: 'Karma Police', artist: 'Radiohead' }],
                ['fav1'],
                ['exclude1'],
                ['alt-rock', 'britpop']
            );

            expect(prompt).toContain('Creep|Radiohead');
            expect(prompt).toContain('Karma Police|Radiohead');
            expect(prompt).toContain('EXCLUDE:exclude1');
            expect(prompt).toContain('alt-rock;britpop');
            expect(prompt).toContain('5 DISTINCT tracks');
        });

        it('should handle empty neighbors and genres', () => {
            const prompt = GeminiPrompts.generateVibeExpansionPrompt(
                { title: 'Seed', artist: 'X' }, [], [], [], [], []
            );
            expect(prompt).toContain('Seed|X');
            expect(prompt).not.toContain('Ctx(User Genres):');
        });
    });

    describe('generateRescueVibePrompt', () => {
        it('should include skipped tracks and request 10 new tracks', () => {
            const prompt = GeminiPrompts.generateRescueVibePrompt(
                [{ track_name: 'Bad1', artist_name: 'X' }, { track_name: 'Bad2', artist_name: 'Y' }],
                ['fav1'],
                ['exclude1']
            );

            expect(prompt).toContain('Bad1|X;Bad2|Y');
            expect(prompt).toContain('10 tracks');
            expect(prompt).toContain('change direction');
            expect(prompt).toContain('EXCLUDE:exclude1');
        });

        it('should handle empty skips', () => {
            const prompt = GeminiPrompts.generateRescueVibePrompt([], [], []);
            expect(prompt).toContain('Skipped:');
            expect(prompt).toContain('10 tracks');
        });
    });

    describe('generateMoodAssessmentPrompt', () => {
        it('should include current track and history', () => {
            const prompt = GeminiPrompts.generateMoodAssessmentPrompt(
                { title: 'Now Playing', artist: 'Artist' },
                [{ track_name: 'Prev', artist_name: 'A' }],
                'working from home'
            );

            expect(prompt).toContain('Now Playing|Artist');
            expect(prompt).toContain('Prev|A');
            expect(prompt).toContain('working from home');
            expect(prompt).toContain('energy_level');
        });

        it('should handle null current track', () => {
            const prompt = GeminiPrompts.generateMoodAssessmentPrompt(null, []);
            expect(prompt).toContain('Now:none');
        });

        it('should omit context line when no userContext', () => {
            const prompt = GeminiPrompts.generateMoodAssessmentPrompt(null, []);
            expect(prompt).not.toContain('Ctx:');
        });
    });
});
