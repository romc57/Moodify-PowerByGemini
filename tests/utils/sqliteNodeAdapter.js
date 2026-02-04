/**
 * In-memory SQLite-compatible adapter for Jest.
 * Pure JS, no sql.js/WASM, so no OOM. Implements the exact SQL patterns DatabaseService uses.
 */

const user_preferences = new Map();
const user_services = new Map();
const app_secrets = new Map();
const listening_history = [];
const tracks = new Map();
const daily_play_log = new Map();
const feedback_history = [];
const gemini_reasoning = [];
let listening_history_id = 0;
let feedback_id = 0;
let reasoning_id = 0;

function createDb() {
    return {
        execAsync(sql) {
            return Promise.resolve();
        },
        runAsync(sql, params = []) {
            const p = Array.isArray(params) ? params : [];
            const s = sql.replace(/\s+/g, ' ').trim();
            if (s.startsWith('INSERT OR REPLACE INTO user_preferences')) {
                const key = p[0];
                const value = p[1];
                user_preferences.set(key, value);
                return Promise.resolve({ lastInsertRowId: 0, changes: 1 });
            }
            if (s.startsWith('INSERT INTO user_services')) {
                const service = p[0];
                const token = p[1];
                const refresh = p[2] || null;
                user_services.set(service, { access_token: token, refresh_token: refresh });
                return Promise.resolve({ lastInsertRowId: 0, changes: 1 });
            }
            if (s.startsWith('DELETE FROM user_services WHERE service_name')) {
                const service = p[0];
                user_services.delete(service);
                return Promise.resolve({ lastInsertRowId: 0, changes: 1 });
            }
            if (s.startsWith('DELETE FROM daily_play_log')) {
                daily_play_log.clear();
                return Promise.resolve({ lastInsertRowId: 0, changes: 1 });
            }
            if (s.startsWith('INSERT INTO listening_history')) {
                listening_history_id++;
                listening_history.unshift({
                    id: listening_history_id,
                    spotify_track_id: p[0],
                    track_name: p[1],
                    artist_name: p[2],
                    skipped: p[3] ? 1 : 0,
                    context: p[4] || null
                });
                return Promise.resolve({ lastInsertRowId: listening_history_id, changes: 1 });
            }
            if (s.startsWith('INSERT INTO tracks') && s.includes('ON CONFLICT')) {
                const id = p[0];
                const name = p[1];
                const artist = p[2];
                const existing = tracks.get(id);
                tracks.set(id, {
                    spotify_track_id: id,
                    track_name: name,
                    artist_name: artist,
                    play_count: existing ? (existing.play_count || 1) + 1 : 1
                });
                return Promise.resolve({ lastInsertRowId: 0, changes: 1 });
            }
            if (s.startsWith('INSERT OR REPLACE INTO daily_play_log')) {
                daily_play_log.set(p[0], { played_at: Date.now() });
                return Promise.resolve({ lastInsertRowId: 0, changes: 1 });
            }
            if (s.startsWith('INSERT INTO app_secrets')) {
                app_secrets.set(p[0], p[1]);
                return Promise.resolve({ lastInsertRowId: 0, changes: 1 });
            }
            if (s.startsWith('INSERT INTO feedback_history')) {
                feedback_id++;
                feedback_history.unshift({ id: feedback_id, track: p[0], feedback: p[1], timestamp: p[2] });
                return Promise.resolve({ lastInsertRowId: feedback_id, changes: 1 });
            }
            if (s.startsWith('INSERT INTO gemini_reasoning')) {
                reasoning_id++;
                return Promise.resolve({ lastInsertRowId: reasoning_id, changes: 1 });
            }
            return Promise.resolve({ lastInsertRowId: 0, changes: 0 });
        },
        getFirstAsync(sql, params = []) {
            const p = Array.isArray(params) ? params : [];
            const s = sql.replace(/\s+/g, ' ').trim();
            if (s.includes('user_preferences') && s.includes('key = ?')) {
                const key = p[0];
                const value = user_preferences.get(key);
                return Promise.resolve(value != null ? (s.includes('last_clear') ? { last_clear: value } : { value }) : null);
            }
            if (s.includes('user_preferences') && (s.includes("'last_daily_clear'") || (p[0] === 'last_daily_clear'))) {
                const value = user_preferences.get('last_daily_clear');
                return Promise.resolve(value != null ? { last_clear: value } : null);
            }
            if (s.includes('user_services') && s.includes('access_token')) {
                const service = p[0];
                const row = user_services.get(service);
                return Promise.resolve(row ? { access_token: row.access_token } : null);
            }
            if (s.includes('user_services') && s.includes('refresh_token')) {
                const service = p[0];
                const row = user_services.get(service);
                return Promise.resolve(row ? { refresh_token: row.refresh_token || null } : null);
            }
            if (s.includes('app_secrets') && s.includes('key = ?')) {
                const key = p[0];
                const value = app_secrets.get(key);
                return Promise.resolve(value != null ? { value } : null);
            }
            if (s.includes('gemini_reasoning') && s.includes('ORDER BY timestamp DESC LIMIT 1')) {
                return Promise.resolve(reasoning_id ? gemini_reasoning[0] || null : null);
            }
            if (s.includes('COUNT(*)') && s.includes('listening_history')) {
                return Promise.resolve({ count: listening_history.filter(r => r.skipped === 1).length });
            }
            if (s.includes('daily_play_log') && s.includes('track_name') && s.includes('artist_name')) {
                const rows = [];
                for (const [tid, _] of daily_play_log) {
                    const t = tracks.get(tid);
                    if (t) rows.push({ track_name: t.track_name, artist_name: t.artist_name });
                }
                return Promise.resolve(rows[0] ? { track_name: rows[0].track_name, artist_name: rows[0].artist_name } : null);
            }
            if (s.includes('daily_play_log') && s.includes('spotify_track_id') && !s.includes('track_name')) {
                const first = daily_play_log.keys().next().value;
                return Promise.resolve(first ? { spotify_track_id: first } : null);
            }
            return Promise.resolve(null);
        },
        getAllAsync(sql, params = []) {
            const p = Array.isArray(params) ? params : [];
            const s = sql.replace(/\s+/g, ' ').trim();
            if (s.includes('listening_history') && s.includes('play_count') && s.includes('ORDER BY h.played_at DESC')) {
                const limit = p[0] || 20;
                return Promise.resolve(listening_history.slice(0, limit).map(h => {
                    const t = tracks.get(h.spotify_track_id);
                    return { ...h, play_count: t ? t.play_count : 1 };
                }));
            }
            if (s.includes('daily_play_log') && s.includes('track_name') && s.includes('artist_name')) {
                const rows = [];
                for (const [tid] of daily_play_log) {
                    const t = tracks.get(tid);
                    if (t) rows.push({ track_name: t.track_name, artist_name: t.artist_name });
                }
                return Promise.resolve(rows);
            }
            if (s.includes('daily_play_log') && s.includes('spotify_track_id') && !s.includes('track_name')) {
                return Promise.resolve(Array.from(daily_play_log.keys()).map(spotify_track_id => ({ spotify_track_id })));
            }
            if (s.includes('feedback_history') && s.includes('ORDER BY timestamp DESC LIMIT')) {
                const limit = p[0] || 5;
                return Promise.resolve(feedback_history.slice(0, limit));
            }
            return Promise.resolve([]);
        },
        closeAsync() {
            return Promise.resolve();
        }
    };
}

async function openDatabaseAsync(dbName) {
    return createDb();
}

module.exports = {
    openDatabaseAsync
};
