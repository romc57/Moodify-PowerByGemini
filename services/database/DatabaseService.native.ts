import * as SQLite from 'expo-sqlite';

export interface FeedbackItem {
    id: number;
    track: string;
    feedback: string;
    timestamp: number;
}

/**
 * Simple mutex for database operation serialization
 */
class Mutex {
    private locked = false;
    private queue: (() => void)[] = [];

    async acquire(): Promise<void> {
        if (!this.locked) {
            this.locked = true;
            return;
        }
        return new Promise(resolve => this.queue.push(resolve));
    }

    release(): void {
        const next = this.queue.shift();
        if (next) {
            next();
        } else {
            this.locked = false;
        }
    }
}

class DatabaseService {
    private db: SQLite.SQLiteDatabase | null = null;
    private initPromise: Promise<void> | null = null;
    private mutex = new Mutex();

    constructor() {
        // Don't await in constructor - use ensureInit() pattern
        this.initPromise = this.init();
    }

    public get database(): SQLite.SQLiteDatabase | null {
        return this.db;
    }

    /**
     * Ensure database is initialized before operations
     */
    private async ensureInit(): Promise<void> {
        if (this.initPromise) {
            await this.initPromise;
        }
    }

    async init() {
        this.db = await SQLite.openDatabaseAsync('moodify.db');
        await this.db.execAsync(`
      PRAGMA journal_mode = WAL;

      CREATE TABLE IF NOT EXISTS user_services (
        service_name TEXT PRIMARY KEY,
        access_token TEXT,
        refresh_token TEXT,
        expires_at INTEGER
      );
      CREATE TABLE IF NOT EXISTS app_secrets (
        key TEXT PRIMARY KEY,
        value TEXT
      );
      CREATE TABLE IF NOT EXISTS feedback_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        track TEXT,
        feedback TEXT,
        timestamp INTEGER
      );
      CREATE TABLE IF NOT EXISTS user_preferences (
        key TEXT PRIMARY KEY NOT NULL,
        value TEXT
      );

      CREATE TABLE IF NOT EXISTS listening_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        spotify_track_id TEXT NOT NULL,
        track_name TEXT,
        artist_name TEXT,
        played_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        skipped BOOLEAN DEFAULT 0,
        context TEXT
      );

      CREATE TABLE IF NOT EXISTS tracks (
        spotify_track_id TEXT PRIMARY KEY,
        track_name TEXT,
        artist_name TEXT,
        play_count INTEGER DEFAULT 1,
        last_played_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS daily_play_log (
        spotify_track_id TEXT PRIMARY KEY,
        played_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_history_played_at ON listening_history(played_at);
      CREATE INDEX IF NOT EXISTS idx_history_track_id ON listening_history(spotify_track_id);
      CREATE INDEX IF NOT EXISTS idx_tracks_play_count ON tracks(play_count);

      CREATE TABLE IF NOT EXISTS gemini_reasoning (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        user_context_snapshot TEXT,
        model_reasoning TEXT,
        suggested_action TEXT
      );

      CREATE TABLE IF NOT EXISTS graph_nodes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL, -- 'SONG', 'ARTIST', 'VIBE', 'AUDIO_FEATURE', 'GENRE'
        spotify_id TEXT,
        name TEXT,
        data TEXT, -- JSON
        play_count INTEGER DEFAULT 0,
        last_played_at INTEGER,
        created_at INTEGER,
        last_accessed INTEGER
      );

      CREATE TABLE IF NOT EXISTS graph_edges (
        source_id INTEGER,
        target_id INTEGER,
        type TEXT, -- 'SIMILAR', 'NEXT', 'RELATED', 'HAS_FEATURE', 'HAS_GENRE'
        weight REAL DEFAULT 1.0,
        created_at INTEGER,
        FOREIGN KEY(source_id) REFERENCES graph_nodes(id),
        FOREIGN KEY(target_id) REFERENCES graph_nodes(id),
        UNIQUE(source_id, target_id, type)
      );

      CREATE INDEX IF NOT EXISTS idx_graph_spotify_id ON graph_nodes(spotify_id);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_graph_nodes_spotify_id_unique ON graph_nodes(spotify_id) WHERE spotify_id IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_graph_edges_source ON graph_edges(source_id);
      CREATE INDEX IF NOT EXISTS idx_graph_edges_target ON graph_edges(target_id);
      CREATE INDEX IF NOT EXISTS idx_graph_edges_type ON graph_edges(type);
    `);
        console.log('[Database] Initialized with New Schema');

        // Clear daily log if it's a new day (simple check)
        this.checkAndClearDailyLog();
    }

    private async checkAndClearDailyLog() {
        if (!this.db) return;
        try {
            const result = await this.db.getFirstAsync<{ last_clear: string }>(
                "SELECT value as last_clear FROM user_preferences WHERE key = 'last_daily_clear'"
            );

            const today = new Date().toISOString().split('T')[0];
            if (!result || result.last_clear !== today) {
                console.log('[Database] New Day - Clearing Daily Log');
                await this.db.runAsync('DELETE FROM daily_play_log');
                await this.setPreference('last_daily_clear', today);
            }
        } catch (e) {
            console.warn('[Database] Daily Clear Check Failed', e);
        }
    }

    // --- New Features (Moodification) ---

    // Preferences
    async getPreference(key: string): Promise<string | null> {
        await this.ensureInit();
        try {
            const result = await this.db!.getFirstAsync<{ value: string }>(
                'SELECT value FROM user_preferences WHERE key = ?;',
                [key]
            );
            return result ? result.value : null;
        } catch (e) {
            console.warn('[Database] GetPreference missed, trying app_secrets');
            return this.getSecret(key); // Fallback
        }
    }

    async setPreference(key: string, value: string) {
        await this.ensureInit();
        await this.mutex.acquire();
        try {
            await this.db!.runAsync(
                'INSERT OR REPLACE INTO user_preferences (key, value) VALUES (?, ?);',
                [key, value]
            );
        } catch (e) {
            console.error('[Database] SetPreference Error', e);
        } finally {
            this.mutex.release();
        }
    }

    // Listening History & Skips (Unified Recording)
    async recordPlay(
        spotifyTrackId: string,
        trackName: string,
        artistName: string,
        skipped: boolean,
        context: object
    ) {
        await this.ensureInit();
        await this.mutex.acquire();
        try {
            // 1. Log to History
            await this.db!.runAsync(
                `INSERT INTO listening_history (spotify_track_id, track_name, artist_name, skipped, context)
                 VALUES (?, ?, ?, ?, ?);`,
                [spotifyTrackId, trackName, artistName, skipped, JSON.stringify(context)]
            );

            // 2. Upsert Track Count (Only if NOT skipped)
            if (!skipped) {
                await this.db!.runAsync(
                    `INSERT INTO tracks (spotify_track_id, track_name, artist_name, play_count, last_played_at)
                     VALUES (?, ?, ?, 1, CURRENT_TIMESTAMP)
                     ON CONFLICT(spotify_track_id) DO UPDATE SET
                        play_count = play_count + 1,
                        last_played_at = CURRENT_TIMESTAMP;`,
                    [spotifyTrackId, trackName, artistName]
                );

                // 3. Add to Daily Log (Upsert safe)
                await this.db!.runAsync(
                    `INSERT OR REPLACE INTO daily_play_log (spotify_track_id, played_at)
                     VALUES (?, CURRENT_TIMESTAMP);`,
                    [spotifyTrackId]
                );
            }
        } catch (e) {
            console.error('[Database] RecordPlay Transaction Error', e);
        } finally {
            this.mutex.release();
        }
    }

    /**
     * @deprecated Use recordPlay instead
     */
    async addHistoryItem(
        spotifyTrackId: string,
        trackName: string,
        artistName: string,
        skipped: boolean,
        context: object
    ) {
        return this.recordPlay(spotifyTrackId, trackName, artistName, skipped, context);
    }

    async getRecentHistory(limit: number = 20): Promise<any[]> {
        if (!this.db) await this.init();
        try {
            // Join with tracks to get play_count
            return await this.db!.getAllAsync(
                `SELECT h.*, t.play_count 
                 FROM listening_history h
                 LEFT JOIN tracks t ON h.spotify_track_id = t.spotify_track_id
                 ORDER BY h.played_at DESC LIMIT ?;`,
                [limit]
            );
        } catch (e) {
            console.error('[Database] GetRecentHistory Error', e);
            return [];
        }
    }

    async getSkipRate(minutes: number = 5): Promise<number> {
        // Input validation to prevent SQL injection
        if (!Number.isInteger(minutes) || minutes < 0 || minutes > 1440) {
            console.warn('[Database] Invalid minutes parameter for getSkipRate:', minutes);
            return 0;
        }

        if (!this.db) await this.init();
        try {
            const result = await this.db!.getFirstAsync<{ count: number }>(
                `SELECT COUNT(*) as count FROM listening_history
       WHERE skipped = 1
       AND played_at > datetime('now', '-' || ? || ' minutes');`,
                [minutes]
            );
            return result?.count || 0;
        } catch (e) {
            console.error('[Database] GetSkipRate Error', e);
            return 0;
        }
    }

    /**
     * Get daily history as "Track Name - Artist Name" format (for Gemini prompts)
     */
    async getDailyHistory(): Promise<string[]> {
        if (!this.db) await this.init();
        try {
            const resultWithNames = await this.db!.getAllAsync<{ track_name: string, artist_name: string }>(
                `SELECT t.track_name, t.artist_name
                 FROM daily_play_log d
                 JOIN tracks t ON d.spotify_track_id = t.spotify_track_id`
            );
            return resultWithNames.map(item => `${item.track_name} - ${item.artist_name}`);
        } catch (e) {
            console.error('[Database] GetDailyHistory Error', e);
            return [];
        }
    }

    /**
     * Get daily history as Spotify URIs (for deduplication checks)
     */
    async getDailyHistoryURIs(): Promise<string[]> {
        if (!this.db) await this.init();
        try {
            const result = await this.db!.getAllAsync<{ spotify_track_id: string }>(
                `SELECT spotify_track_id FROM daily_play_log`
            );
            return result.map(item => item.spotify_track_id);
        } catch (e) {
            console.error('[Database] GetDailyHistoryURIs Error', e);
            return [];
        }
    }

    // Gemini Reasoning
    async logReasoning(
        userContext: object,
        reasoning: string,
        suggestedAction: string
    ) {
        if (!this.db) await this.init();
        try {
            await this.db!.runAsync(
                `INSERT INTO gemini_reasoning (user_context_snapshot, model_reasoning, suggested_action)
       VALUES (?, ?, ?);`,
                [JSON.stringify(userContext), reasoning, suggestedAction]
            );
        } catch (e) {
            console.error('[Database] LogReasoning Error', e);
        }
    }

    async getLastReasoning(): Promise<any | null> {
        if (!this.db) await this.init();
        try {
            return await this.db!.getFirstAsync(
                'SELECT * FROM gemini_reasoning ORDER BY timestamp DESC LIMIT 1;'
            );
        } catch (e) {
            return null;
        }
    }

    // --- Legacy Methods ---

    async logFeedback(track: string, feedback: string) {
        if (!this.db) await this.init();
        try {
            await this.db!.runAsync(
                'INSERT INTO feedback_history (track, feedback, timestamp) VALUES (?, ?, ?)',
                [track, feedback, Date.now()]
            );
        } catch (e) {
            console.error('[Database] LogFeedback Error', e);
        }
    }

    async getFeedbackHistory(limit: number = 5): Promise<FeedbackItem[]> {
        if (!this.db) await this.init();
        try {
            const result = await this.db!.getAllAsync<FeedbackItem>(
                'SELECT * FROM feedback_history ORDER BY timestamp DESC LIMIT ?',
                [limit]
            );
            return result;
        } catch (e) {
            console.error('[Database] FetchFeedback Error', e);
            return [];
        }
    }

    async setServiceToken(service: string, token: string, refreshToken?: string) {
        await this.ensureInit();
        await this.mutex.acquire();
        try {
            // Ensure refreshToken is null, not undefined or string "null"
            const refreshValue = refreshToken && refreshToken !== 'null' ? refreshToken : null;
            await this.db!.runAsync(
                `INSERT INTO user_services (service_name, access_token, refresh_token, expires_at)
                 VALUES (?, ?, ?, ?)
                 ON CONFLICT(service_name) DO UPDATE SET access_token=excluded.access_token, refresh_token=excluded.refresh_token`,
                [service, token, refreshValue, Date.now() + 3600000]
            );
        } catch (e) {
            console.error('[Database] SetToken Error', e);
        } finally {
            this.mutex.release();
        }
    }

    async getServiceToken(service: string): Promise<string | null> {
        if (!this.db) await this.init();
        try {
            const result = await this.db!.getFirstAsync<{ access_token: string }>(
                'SELECT access_token FROM user_services WHERE service_name = ?',
                [service]
            );
            return result?.access_token || null;
        } catch (e) {
            console.error('[Database] GetToken Error', e);
            return null;
        }
    }

    async removeServiceToken(service: string) {
        if (!this.db) await this.init();
        try {
            await this.db!.runAsync(
                'DELETE FROM user_services WHERE service_name = ?',
                [service]
            );
            console.log(`[Database] Removed token for ${service}`);
        } catch (e) {
            console.error('[Database] RemoveToken Error', e);
        }
    }

    async getRefreshToken(service: string): Promise<string | null> {
        if (!this.db) await this.init();
        try {
            const result = await this.db!.getFirstAsync<{ refresh_token: string }>(
                'SELECT refresh_token FROM user_services WHERE service_name = ?',
                [service]
            );
            return result?.refresh_token || null;
        } catch (e) {
            console.error('[Database] GetRefreshToken Error', e);
            return null;
        }
    }

    async setSecret(key: string, value: string) {
        if (!this.db) await this.init();
        try {
            await this.db!.runAsync(
                'INSERT INTO app_secrets (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
                [key, value]
            );
        } catch (e) {
            console.error('[Database] SetSecret Error', e);
        }
    }

    async getSecret(key: string): Promise<string | null> {
        if (!this.db) await this.init();
        try {
            const result = await this.db!.getFirstAsync<{ value: string }>(
                'SELECT value FROM app_secrets WHERE key = ?',
                [key]
            );
            return result?.value || null;
        } catch (e) {
            console.error('[Database] GetSecret Error', e);
            return null;
        }
    }
}

export const dbService = new DatabaseService();
