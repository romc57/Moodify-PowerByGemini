import * as SQLite from 'expo-sqlite';

export interface VitalsHistoryItem {
    id: number;
    type: string; // 'heart_rate' | 'stress_level' | 'hrv'
    value: number;
    timestamp: number;
    context?: string; // 'spotify_session', 'baseline', etc.
}

export interface FeedbackItem {
    id: number;
    track: string;
    feedback: string;
    timestamp: number;
    vitals_change?: string; // e.g. "HR -5bpm"
}

class DatabaseService {
    private db: SQLite.SQLiteDatabase | null = null;

    constructor() {
        this.init();
    }

    async init() {
        this.db = await SQLite.openDatabaseAsync('moodify.db');
        await this.db.execAsync(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS vitals_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL,
        value REAL NOT NULL,
        timestamp INTEGER NOT NULL,
        context TEXT
      );
      CREATE TABLE IF NOT EXISTS baseline (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT,
        avg_hr REAL,
        avg_stress REAL,
        last_updated INTEGER
      );
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
      CREATE TABLE IF NOT EXISTS app_secrets (
        key TEXT PRIMARY KEY,
        value TEXT
      );
      CREATE TABLE IF NOT EXISTS feedback_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        track TEXT,
        feedback TEXT,
        timestamp INTEGER,
        vitals_change TEXT
      );
    `);
        console.log('[Database] Initialized');
    }

    async logVital(type: string, value: number, context: string = 'background') {
        if (!this.db) await this.init();
        try {
            await this.db!.runAsync(
                'INSERT INTO vitals_history (type, value, timestamp, context) VALUES (?, ?, ?, ?)',
                type, value, Date.now(), context
            );
        } catch (e) {
            console.error('[Database] Log Error', e);
        }
    }

    async logFeedback(track: string, feedback: string, vitalsChange?: string) {
        if (!this.db) await this.init();
        try {
            await this.db!.runAsync(
                'INSERT INTO feedback_history (track, feedback, timestamp, vitals_change) VALUES (?, ?, ?, ?)',
                track, feedback, Date.now(), vitalsChange || null
            );
        } catch (e) {
            console.error('[Database] LogFeedback Error', e);
        }
    }

    async getHistory(limit: number = 50): Promise<VitalsHistoryItem[]> {
        if (!this.db) await this.init();
        try {
            const result = await this.db!.getAllAsync<VitalsHistoryItem>(
                'SELECT * FROM vitals_history ORDER BY timestamp DESC LIMIT ?',
                limit
            );
            return result;
        } catch (e) {
            console.error('[Database] Fetch Error', e);
            return [];
        }
    }

    async getFeedbackHistory(limit: number = 5): Promise<FeedbackItem[]> {
        if (!this.db) await this.init();
        try {
            const result = await this.db!.getAllAsync<FeedbackItem>(
                'SELECT * FROM feedback_history ORDER BY timestamp DESC LIMIT ?',
                limit
            );
            return result;
        } catch (e) {
            console.error('[Database] FetchFeedback Error', e);
            return [];
        }
    }

    async setServiceToken(service: string, token: string, refreshToken?: string) {
        if (!this.db) await this.init();
        try {
            await this.db!.runAsync(
                `INSERT INTO user_services (service_name, access_token, refresh_token, expires_at) 
                 VALUES (?, ?, ?, ?) 
                 ON CONFLICT(service_name) DO UPDATE SET access_token=excluded.access_token, refresh_token=excluded.refresh_token`,
                service, token, refreshToken || null, Date.now() + 3600000 // Fake 1hr expiry
            );
        } catch (e) {
            console.error('[Database] SetToken Error', e);
        }
    }

    async getServiceToken(service: string): Promise<string | null> {
        if (!this.db) await this.init();
        try {
            const result = await this.db!.getFirstAsync<{ access_token: string }>(
                'SELECT access_token FROM user_services WHERE service_name = ?',
                service
            );
            return result?.access_token || null;
        } catch (e) {
            console.error('[Database] GetToken Error', e);
            return null;
        }
    }

    async getRefreshToken(service: string): Promise<string | null> {
        if (!this.db) await this.init();
        try {
            const result = await this.db!.getFirstAsync<{ refresh_token: string }>(
                'SELECT refresh_token FROM user_services WHERE service_name = ?',
                service
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
                key, value
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
                key
            );
            return result?.value || null;
        } catch (e) {
            console.error('[Database] GetSecret Error', e);
            return null;
        }
    }
}

export const dbService = new DatabaseService();
