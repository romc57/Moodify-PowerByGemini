/**
 * In-memory SQLite-compatible adapter for Jest.
 * Pure JS, no sql.js/WASM, so no OOM. Implements the exact SQL patterns DatabaseService uses.
 */

// ============================================================================
// Data Store
// ============================================================================
const store = {
    user_preferences: new Map(),
    user_services: new Map(),
    app_secrets: new Map(),
    listening_history: [],
    tracks: new Map(),
    daily_play_log: new Map(),
    feedback_history: [],
    gemini_reasoning: [],
    graph_nodes: new Map(),
    graph_edges: [],

    // Auto-increment counters
    ids: {
        listening_history: 0,
        feedback: 0,
        reasoning: 0,
        graph_node: 0,
    },

    reset(table) {
        if (table === 'graph_nodes') {
            this.graph_nodes.clear();
            this.ids.graph_node = 0;
        } else if (table === 'graph_edges') {
            this.graph_edges.length = 0;
        } else if (table === 'daily_play_log') {
            this.daily_play_log.clear();
        }
    }
};

// ============================================================================
// Helper Functions
// ============================================================================
const result = (lastInsertRowId = 0, changes = 1) => ({ lastInsertRowId, changes });
const normalize = (sql) => sql.replace(/\s+/g, ' ').trim();

// ============================================================================
// RUN Handlers (INSERT, UPDATE, DELETE)
// ============================================================================
const runHandlers = {
    // User Preferences
    'INSERT OR REPLACE INTO user_preferences': (p) => {
        store.user_preferences.set(p[0], p[1]);
        return result();
    },

    // User Services
    'INSERT INTO user_services': (p) => {
        store.user_services.set(p[0], { access_token: p[1], refresh_token: p[2] || null });
        return result();
    },
    'DELETE FROM user_services WHERE service_name': (p) => {
        store.user_services.delete(p[0]);
        return result();
    },

    // Daily Play Log
    'DELETE FROM daily_play_log': () => {
        store.reset('daily_play_log');
        return result();
    },
    'INSERT OR REPLACE INTO daily_play_log': (p) => {
        store.daily_play_log.set(p[0], { played_at: Date.now() });
        return result();
    },

    // Listening History
    'INSERT INTO listening_history': (p) => {
        const id = ++store.ids.listening_history;
        store.listening_history.unshift({
            id,
            spotify_track_id: p[0],
            track_name: p[1],
            artist_name: p[2],
            skipped: p[3] ? 1 : 0,
            context: p[4] || null
        });
        return result(id);
    },

    // Tracks
    'INSERT INTO tracks': (p, sql) => {
        if (!sql.includes('ON CONFLICT')) return result(0, 0);
        const existing = store.tracks.get(p[0]);
        store.tracks.set(p[0], {
            spotify_track_id: p[0],
            track_name: p[1],
            artist_name: p[2],
            play_count: existing ? (existing.play_count || 1) + 1 : 1
        });
        return result();
    },

    // App Secrets
    'INSERT INTO app_secrets': (p) => {
        store.app_secrets.set(p[0], p[1]);
        return result();
    },

    // Feedback History
    'INSERT INTO feedback_history': (p) => {
        const id = ++store.ids.feedback;
        store.feedback_history.unshift({ id, track: p[0], feedback: p[1], timestamp: p[2] });
        return result(id);
    },

    // Gemini Reasoning
    'INSERT INTO gemini_reasoning': () => {
        return result(++store.ids.reasoning);
    },

    // Graph Nodes
    'INSERT INTO graph_nodes': (p) => {
        const id = ++store.ids.graph_node;
        store.graph_nodes.set(id, {
            id,
            type: p[0],
            spotify_id: p[1],
            name: p[2],
            data: p[3],
            play_count: 0,
            last_played_at: 0,
            created_at: p[4],
            last_accessed: p[5]
        });
        return result(id);
    },
    'UPDATE graph_nodes SET spotify_id': (p) => {
        const node = store.graph_nodes.get(p[2]);
        if (node) {
            node.spotify_id = p[0];
            node.data = p[1];
        }
        return result(0, node ? 1 : 0);
    },
    'UPDATE graph_nodes SET play_count': (p) => {
        const node = store.graph_nodes.get(p[1]);
        if (node) {
            node.play_count = (node.play_count || 0) + 1;
            node.last_played_at = p[0];
        }
        return result(0, node ? 1 : 0);
    },
    'DELETE FROM graph_nodes': () => {
        store.reset('graph_nodes');
        return result();
    },

    // Graph Edges
    'INSERT INTO graph_edges': (p) => {
        store.graph_edges.push({
            source_id: p[0],
            target_id: p[1],
            type: p[2],
            weight: p[3],
            created_at: p[4]
        });
        return result();
    },
    'UPDATE graph_edges SET weight': (p) => {
        const edge = store.graph_edges.find(e =>
            e.source_id === p[2] && e.target_id === p[3] && e.type === p[4]
        );
        if (edge) {
            edge.weight = p[0];
            edge.created_at = p[1];
        }
        return result(0, edge ? 1 : 0);
    },
    'DELETE FROM graph_edges': () => {
        store.reset('graph_edges');
        return result();
    },
};

// ============================================================================
// GET FIRST Handlers (SELECT single row)
// ============================================================================
const getFirstHandlers = [
    // User Preferences
    {
        match: (s) => s.includes('user_preferences') && s.includes('key = ?'),
        handle: (p, s) => {
            const value = store.user_preferences.get(p[0]);
            if (value == null) return null;
            return s.includes('last_clear') ? { last_clear: value } : { value };
        }
    },
    {
        match: (s) => s.includes('user_preferences') && s.includes("'last_daily_clear'"),
        handle: () => {
            const value = store.user_preferences.get('last_daily_clear');
            return value != null ? { last_clear: value } : null;
        }
    },

    // User Services
    {
        match: (s) => s.includes('user_services') && s.includes('access_token'),
        handle: (p) => {
            const row = store.user_services.get(p[0]);
            return row ? { access_token: row.access_token } : null;
        }
    },
    {
        match: (s) => s.includes('user_services') && s.includes('refresh_token'),
        handle: (p) => {
            const row = store.user_services.get(p[0]);
            return row ? { refresh_token: row.refresh_token || null } : null;
        }
    },

    // App Secrets
    {
        match: (s) => s.includes('app_secrets') && s.includes('key = ?'),
        handle: (p) => {
            const value = store.app_secrets.get(p[0]);
            return value != null ? { value } : null;
        }
    },

    // Gemini Reasoning
    {
        match: (s) => s.includes('gemini_reasoning') && s.includes('ORDER BY timestamp DESC'),
        handle: () => store.gemini_reasoning[0] || null
    },

    // Listening History Count
    {
        match: (s) => s.includes('COUNT(*)') && s.includes('listening_history'),
        handle: () => ({ count: store.listening_history.filter(r => r.skipped === 1).length })
    },

    // Daily Play Log
    {
        match: (s) => s.includes('daily_play_log') && s.includes('track_name'),
        handle: () => {
            for (const [tid] of store.daily_play_log) {
                const t = store.tracks.get(tid);
                if (t) return { track_name: t.track_name, artist_name: t.artist_name };
            }
            return null;
        }
    },
    {
        match: (s) => s.includes('daily_play_log') && s.includes('spotify_track_id'),
        handle: () => {
            const first = store.daily_play_log.keys().next().value;
            return first ? { spotify_track_id: first } : null;
        }
    },

    // Graph Nodes
    {
        match: (s) => s.includes('graph_nodes') && s.includes('spotify_id = ?'),
        handle: (p) => {
            for (const node of store.graph_nodes.values()) {
                if (node.spotify_id === p[0]) return { ...node };
            }
            return null;
        }
    },
    {
        match: (s) => s.includes('graph_nodes') && s.includes('type = ?') && s.includes('name = ?'),
        handle: (p) => {
            for (const node of store.graph_nodes.values()) {
                if (node.type === p[0] && node.name === p[1]) return { ...node };
            }
            return null;
        }
    },
    {
        // Only match direct "WHERE id = ?" not JOIN conditions like "ON e.target_id = n.id"
        match: (s) => s.includes('graph_nodes') && s.includes('WHERE') && s.includes('id = ?') && !s.includes('graph_edges'),
        handle: (p) => {
            const node = store.graph_nodes.get(p[0]);
            return node ? { ...node } : null;
        }
    },

    // Graph Edges
    {
        match: (s) => s.includes('graph_edges') && s.includes('source_id = ?') && s.includes('target_id = ?'),
        handle: (p) => {
            const edge = store.graph_edges.find(e =>
                e.source_id === p[0] && e.target_id === p[1] && e.type === p[2]
            );
            return edge ? { weight: edge.weight } : null;
        }
    },

    // Graph Next Suggested Node
    {
        match: (s) => s.includes('graph_edges') && s.includes('graph_nodes') && s.includes('last_played_at <'),
        handle: (p) => {
            const sourceId = p[0];
            const todayTimestamp = p[1];
            const candidates = store.graph_edges
                .filter(e => e.source_id === sourceId)
                .map(e => ({ edge: e, node: store.graph_nodes.get(e.target_id) }))
                .filter(({ node }) => node && node.last_played_at < todayTimestamp)
                .sort((a, b) => b.edge.weight - a.edge.weight);

            if (candidates.length === 0) return null;
            return { ...candidates[0].node };
        }
    },
];

// ============================================================================
// GET ALL Handlers (SELECT multiple rows)
// ============================================================================
const getAllHandlers = [
    // Listening History
    {
        match: (s) => s.includes('listening_history') && s.includes('play_count'),
        handle: (p) => {
            const limit = p[0] || 20;
            return store.listening_history.slice(0, limit).map(h => {
                const t = store.tracks.get(h.spotify_track_id);
                return { ...h, play_count: t ? t.play_count : 1 };
            });
        }
    },

    // Daily Play Log
    {
        match: (s) => s.includes('daily_play_log') && s.includes('track_name'),
        handle: () => {
            const rows = [];
            for (const [tid] of store.daily_play_log) {
                const t = store.tracks.get(tid);
                if (t) rows.push({ track_name: t.track_name, artist_name: t.artist_name });
            }
            return rows;
        }
    },
    {
        match: (s) => s.includes('daily_play_log') && s.includes('spotify_track_id'),
        handle: () => Array.from(store.daily_play_log.keys()).map(id => ({ spotify_track_id: id }))
    },

    // Feedback History
    {
        match: (s) => s.includes('feedback_history'),
        handle: (p) => store.feedback_history.slice(0, p[0] || 5)
    },

    // Graph Nodes
    {
        match: (s) => s.includes('graph_nodes') && s.includes('ORDER BY last_played_at DESC'),
        handle: (p) => {
            const limit = p[0] || 5;
            return Array.from(store.graph_nodes.values())
                .filter(n => n.type === 'SONG')
                .sort((a, b) => b.last_played_at - a.last_played_at)
                .slice(0, limit);
        }
    },

    // Graph Neighbors
    {
        match: (s) => s.includes('graph_edges') && s.includes('graph_nodes') && s.includes('ORDER BY e.weight DESC'),
        handle: (p) => {
            const sourceId = p[0];
            const limit = p[1] || 5;
            return store.graph_edges
                .filter(e => e.source_id === sourceId)
                .sort((a, b) => b.weight - a.weight)
                .slice(0, limit)
                .map(e => {
                    const node = store.graph_nodes.get(e.target_id);
                    return node ? { name: node.name, data: node.data, weight: e.weight } : null;
                })
                .filter(Boolean);
        }
    },
];

// ============================================================================
// Database Factory
// ============================================================================
function createDb() {
    return {
        execAsync: () => Promise.resolve(),

        runAsync(sql, params = []) {
            const p = Array.isArray(params) ? params : [];
            const s = normalize(sql);

            for (const [prefix, handler] of Object.entries(runHandlers)) {
                if (s.startsWith(prefix)) {
                    return Promise.resolve(handler(p, s));
                }
            }
            return Promise.resolve(result(0, 0));
        },

        getFirstAsync(sql, params = []) {
            const p = Array.isArray(params) ? params : [];
            const s = normalize(sql);

            for (const { match, handle } of getFirstHandlers) {
                if (match(s)) {
                    return Promise.resolve(handle(p, s));
                }
            }
            return Promise.resolve(null);
        },

        getAllAsync(sql, params = []) {
            const p = Array.isArray(params) ? params : [];
            const s = normalize(sql);

            for (const { match, handle } of getAllHandlers) {
                if (match(s)) {
                    return Promise.resolve(handle(p, s));
                }
            }
            return Promise.resolve([]);
        },

        closeAsync: () => Promise.resolve()
    };
}

// ============================================================================
// Exports
// ============================================================================
module.exports = {
    openDatabaseAsync: () => Promise.resolve(createDb()),
    // Expose store for test inspection/reset if needed
    __store: store
};
