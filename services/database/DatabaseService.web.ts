/**
 * Web-compatible DatabaseService using localStorage
 * This is used on web platform where expo-sqlite isn't fully supported
 */

export interface FeedbackItem {
    id: number;
    track: string;
    feedback: string;
    timestamp: number;
}

const STORAGE_KEYS = {
    USER_SERVICES: 'moodify_user_services',
    APP_SECRETS: 'moodify_app_secrets',
    FEEDBACK_HISTORY: 'moodify_feedback_history',
    USER_PREFERENCES: 'moodify_user_preferences',
    LISTENING_HISTORY: 'moodify_listening_history',
    TRACKS: 'moodify_tracks',
    DAILY_PLAY_LOG: 'moodify_daily_play_log',
    GEMINI_REASONING: 'moodify_gemini_reasoning',
};

// Check if we're in a browser environment (not SSR)
function isBrowser(): boolean {
    return typeof window !== 'undefined' && typeof localStorage !== 'undefined';
}

function getStorage<T>(key: string, defaultValue: T): T {
    if (!isBrowser()) {
        return defaultValue;
    }
    try {
        const data = localStorage.getItem(key);
        return data ? JSON.parse(data) : defaultValue;
    } catch {
        return defaultValue;
    }
}

function setStorage<T>(key: string, value: T): void {
    if (!isBrowser()) {
        return;
    }
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
        console.error('[DatabaseService.web] Storage error:', e);
    }
}

class DatabaseServiceWeb {
    private initPromise: Promise<void>;

    constructor() {
        this.initPromise = this.init();
    }

    private async ensureInit(): Promise<void> {
        await this.initPromise;
    }

    async init(): Promise<void> {
        console.log('[Database.web] Initialized with localStorage');
        this.checkAndClearDailyLog();
    }

    // Interface compatibility for Native/Web unified usage
    public get database(): any {
        return null;
    }

    private checkAndClearDailyLog() {
        try {
            const prefs = getStorage<Record<string, string>>(STORAGE_KEYS.USER_PREFERENCES, {});
            const today = new Date().toISOString().split('T')[0];
            if (prefs['last_daily_clear'] !== today) {
                console.log('[Database.web] New Day - Clearing Daily Log');
                setStorage(STORAGE_KEYS.DAILY_PLAY_LOG, []);
                prefs['last_daily_clear'] = today;
                setStorage(STORAGE_KEYS.USER_PREFERENCES, prefs);
            }
        } catch (e) {
            console.warn('[Database.web] Daily Clear Check Failed', e);
        }
    }

    // Preferences
    async getPreference(key: string): Promise<string | null> {
        await this.ensureInit();
        const prefs = getStorage<Record<string, string>>(STORAGE_KEYS.USER_PREFERENCES, {});
        return prefs[key] ?? this.getSecret(key);
    }

    async setPreference(key: string, value: string): Promise<void> {
        await this.ensureInit();
        const prefs = getStorage<Record<string, string>>(STORAGE_KEYS.USER_PREFERENCES, {});
        prefs[key] = value;
        setStorage(STORAGE_KEYS.USER_PREFERENCES, prefs);
    }

    // Listening History & Skips
    async recordPlay(
        spotifyTrackId: string,
        trackName: string,
        artistName: string,
        skipped: boolean,
        context: object
    ): Promise<void> {
        await this.ensureInit();

        // Log to history
        const history = getStorage<any[]>(STORAGE_KEYS.LISTENING_HISTORY, []);
        history.push({
            id: Date.now(),
            spotify_track_id: spotifyTrackId,
            track_name: trackName,
            artist_name: artistName,
            skipped,
            context: JSON.stringify(context),
            played_at: new Date().toISOString(),
        });
        setStorage(STORAGE_KEYS.LISTENING_HISTORY, history.slice(-1000)); // Keep last 1000

        if (!skipped) {
            // Update tracks
            const tracks = getStorage<Record<string, any>>(STORAGE_KEYS.TRACKS, {});
            if (tracks[spotifyTrackId]) {
                tracks[spotifyTrackId].play_count += 1;
                tracks[spotifyTrackId].last_played_at = new Date().toISOString();
            } else {
                tracks[spotifyTrackId] = {
                    spotify_track_id: spotifyTrackId,
                    track_name: trackName,
                    artist_name: artistName,
                    play_count: 1,
                    last_played_at: new Date().toISOString(),
                };
            }
            setStorage(STORAGE_KEYS.TRACKS, tracks);

            // Daily log
            const dailyLog = getStorage<Record<string, string>>(STORAGE_KEYS.DAILY_PLAY_LOG, {});
            dailyLog[spotifyTrackId] = new Date().toISOString();
            setStorage(STORAGE_KEYS.DAILY_PLAY_LOG, dailyLog);
        }
    }

    async addHistoryItem(
        spotifyTrackId: string,
        trackName: string,
        artistName: string,
        skipped: boolean,
        context: object
    ): Promise<void> {
        return this.recordPlay(spotifyTrackId, trackName, artistName, skipped, context);
    }

    async getRecentHistory(limit: number = 20): Promise<any[]> {
        await this.ensureInit();
        const history = getStorage<any[]>(STORAGE_KEYS.LISTENING_HISTORY, []);
        const tracks = getStorage<Record<string, any>>(STORAGE_KEYS.TRACKS, {});

        return history
            .slice(-limit)
            .reverse()
            .map(h => ({
                ...h,
                play_count: tracks[h.spotify_track_id]?.play_count ?? 0,
            }));
    }

    async getSkipRate(minutes: number = 5): Promise<number> {
        if (!Number.isInteger(minutes) || minutes < 0 || minutes > 1440) {
            return 0;
        }
        await this.ensureInit();
        const history = getStorage<any[]>(STORAGE_KEYS.LISTENING_HISTORY, []);
        const cutoff = new Date(Date.now() - minutes * 60 * 1000);

        return history.filter(h =>
            h.skipped && new Date(h.played_at) > cutoff
        ).length;
    }

    async getDailyHistory(): Promise<string[]> {
        await this.ensureInit();
        const dailyLog = getStorage<Record<string, string>>(STORAGE_KEYS.DAILY_PLAY_LOG, {});
        const tracks = getStorage<Record<string, any>>(STORAGE_KEYS.TRACKS, {});

        return Object.keys(dailyLog).map(trackId => {
            const track = tracks[trackId];
            return track ? `${track.track_name} - ${track.artist_name}` : trackId;
        });
    }

    async getDailyHistoryURIs(): Promise<string[]> {
        await this.ensureInit();
        const dailyLog = getStorage<Record<string, string>>(STORAGE_KEYS.DAILY_PLAY_LOG, {});
        return Object.keys(dailyLog);
    }

    // Gemini Reasoning
    async logReasoning(userContext: object, reasoning: string, suggestedAction: string): Promise<void> {
        await this.ensureInit();
        const logs = getStorage<any[]>(STORAGE_KEYS.GEMINI_REASONING, []);
        logs.push({
            id: Date.now(),
            timestamp: new Date().toISOString(),
            user_context_snapshot: JSON.stringify(userContext),
            model_reasoning: reasoning,
            suggested_action: suggestedAction,
        });
        setStorage(STORAGE_KEYS.GEMINI_REASONING, logs.slice(-100)); // Keep last 100
    }

    async getLastReasoning(): Promise<any | null> {
        await this.ensureInit();
        const logs = getStorage<any[]>(STORAGE_KEYS.GEMINI_REASONING, []);
        return logs.length > 0 ? logs[logs.length - 1] : null;
    }

    // Legacy Methods
    async logFeedback(track: string, feedback: string): Promise<void> {
        await this.ensureInit();
        const history = getStorage<FeedbackItem[]>(STORAGE_KEYS.FEEDBACK_HISTORY, []);
        history.push({
            id: Date.now(),
            track,
            feedback,
            timestamp: Date.now(),
        });
        setStorage(STORAGE_KEYS.FEEDBACK_HISTORY, history.slice(-500));
    }

    async getFeedbackHistory(limit: number = 5): Promise<FeedbackItem[]> {
        await this.ensureInit();
        const history = getStorage<FeedbackItem[]>(STORAGE_KEYS.FEEDBACK_HISTORY, []);
        return history.slice(-limit).reverse();
    }

    async setServiceToken(service: string, token: string, refreshToken?: string): Promise<void> {
        await this.ensureInit();
        const services = getStorage<Record<string, any>>(STORAGE_KEYS.USER_SERVICES, {});
        services[service] = {
            access_token: token,
            refresh_token: refreshToken && refreshToken !== 'null' ? refreshToken : null,
            expires_at: Date.now() + 3600000,
        };
        setStorage(STORAGE_KEYS.USER_SERVICES, services);
    }

    async getServiceToken(service: string): Promise<string | null> {
        await this.ensureInit();
        const services = getStorage<Record<string, any>>(STORAGE_KEYS.USER_SERVICES, {});
        return services[service]?.access_token ?? null;
    }

    async removeServiceToken(service: string): Promise<void> {
        await this.ensureInit();
        const services = getStorage<Record<string, any>>(STORAGE_KEYS.USER_SERVICES, {});
        delete services[service];
        setStorage(STORAGE_KEYS.USER_SERVICES, services);
        console.log(`[Database.web] Removed token for ${service}`);
    }

    async getRefreshToken(service: string): Promise<string | null> {
        await this.ensureInit();
        const services = getStorage<Record<string, any>>(STORAGE_KEYS.USER_SERVICES, {});
        return services[service]?.refresh_token ?? null;
    }

    async setSecret(key: string, value: string): Promise<void> {
        await this.ensureInit();
        const secrets = getStorage<Record<string, string>>(STORAGE_KEYS.APP_SECRETS, {});
        secrets[key] = value;
        setStorage(STORAGE_KEYS.APP_SECRETS, secrets);
    }

    async getSecret(key: string): Promise<string | null> {
        await this.ensureInit();
        const secrets = getStorage<Record<string, string>>(STORAGE_KEYS.APP_SECRETS, {});
        return secrets[key] ?? null;
    }
}

export const dbService = new DatabaseServiceWeb();
