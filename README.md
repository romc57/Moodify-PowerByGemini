# Moodify - AI-Powered Music DJ

An intelligent music recommendation system that uses **Gemini Pro API** to understand your "vibe" and curates playlists through **Spotify**, with zero hallucinations.

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Core Flow](#core-flow)
- [API Integration](#api-integration)
- [Services Reference](#services-reference)
- [State Management](#state-management)
- [Testing](#testing)
- [Scripts](#scripts)
- [Development Guide](#development-guide)

---

## Overview

Moodify solves the "playlist fatigue" problem by combining Gemini's reasoning capabilities with real-time Spotify validation. Every AI suggestion is verified against Spotify's catalog before being queued.

### Key Features

- **Vibe-Based Recommendations**: Describe a mood ("driving at sunset with 80s synthwave") and get matching tracks
- **Zero Hallucinations**: ValidatedQueueService verifies every track exists on Spotify
- **Rescue Mode**: Detects consecutive skips and pivots the vibe automatically
- **Graph Learning**: Builds a personal music graph to improve recommendations over time
- **Model Fallback**: Automatically falls back through model priority if one fails

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         UI Layer                                 │
│  (React Native / Expo)                                          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      State Management                            │
│  PlayerStore │ SettingsStore │ SkipTrackerStore │ ErrorStore    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Core Services                                │
│  RecommendationService ──► ValidatedQueueService                │
└─────────────────────────────────────────────────────────────────┘
                    │                       │
                    ▼                       ▼
┌────────────────────────┐    ┌────────────────────────┐
│    GeminiService       │    │   SpotifyRemoteService │
│  (AI Recommendations)  │    │   (Playback Control)   │
└────────────────────────┘    └────────────────────────┘
          │                             │
          ▼                             ▼
┌────────────────────────┐    ┌────────────────────────┐
│   GraphService         │    │   DatabaseService      │
│  (Learning Graph)      │    │   (SQLite Storage)     │
└────────────────────────┘    └────────────────────────┘
```

---

## Core Flow

### 1. Vibe Selection Flow

```
User Input ("chill evening jazz")
         │
         ▼
┌─────────────────────────────────────┐
│ RecommendationService.getVibeOptions │
└─────────────────────────────────────┘
         │
         ├──► Fetch user's top tracks (Spotify)
         ├──► Get graph context (GraphService)
         ├──► Build exclusion list (played today)
         │
         ▼
┌─────────────────────────────────────┐
│ GeminiService.getVibeOptions        │
│ - Sends prompt with context         │
│ - Returns 16 vibe options           │
└─────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────┐
│ ValidatedQueueService.validateVibeOptions │
│ - Search Spotify for each track     │
│ - Score matches (fuzzy matching)    │
│ - Filter invalid/duplicates         │
│ - Backfill if needed                │
└─────────────────────────────────────┘
         │
         ▼
    8 Verified Vibe Options
```

### 2. Rescue Vibe Flow (Skip Detection)

```
User skips 3+ tracks in 5 minutes
         │
         ▼
┌─────────────────────────────────────┐
│ SkipTrackerStore detects pattern    │
└─────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────┐
│ RecommendationService.getRescueVibe │
│ - Analyzes skipped tracks           │
│ - Pivots to new direction           │
└─────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────┐
│ GeminiService.generateRescueVibe    │
│ - Few-shot example guides analysis  │
│ - Returns pivot reasoning + tracks  │
└─────────────────────────────────────┘
         │
         ▼
    New Vibe with 15 Tracks
```

### 3. Queue Expansion Flow

```
Queue running low (< 3 tracks)
         │
         ▼
┌─────────────────────────────────────┐
│ RecommendationService.expandVibe    │
│ - Uses current track as seed        │
│ - Maintains vibe consistency        │
└─────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────┐
│ GeminiService.expandVibe            │
│ - Generates 15 similar tracks       │
└─────────────────────────────────────┘
         │
         ▼
    10 Validated Tracks Added
```

---

## API Integration

### Gemini API

**Base URL**: `https://generativelanguage.googleapis.com/v1beta/models/`

#### Available Models (Priority Order)

| Model | ID | Use Case | Latency |
|-------|-----|----------|---------|
| Gemini 3 Pro | `gemini-3-pro-preview` | Complex reasoning (requires quota) | High |
| Gemini 2.5 Pro | `gemini-2.5-pro` | Primary model (stable) | Medium |
| Gemini 2.0 Flash | `gemini-2.0-flash` | Fast validation | Low |
| Gemini 2.5 Flash | `gemini-2.5-flash` | Fast fallback | Low |

#### Request Structure

```typescript
{
  contents: [{ parts: [{ text: prompt }] }],
  generationConfig: {
    responseMimeType: "application/json",
    maxOutputTokens: 4096,
    temperature: 0.7,
    topP: 0.9,
    thinking_level: "low" | "medium" | "high"  // Gemini 3 Pro only
  },
  thoughtSignature: "..."  // Required for Gemini 3 Pro conversations
}
```

#### Token Limits

| Operation | Limit | Used By |
|-----------|-------|---------|
| LARGE | 4096 | getVibeOptions, generateRescueVibe |
| MEDIUM | 2048 | expandVibe |
| STANDARD | 1024 | generateDJRecommendation |
| SMALL | 768 | assessCurrentMood |

#### Thinking Levels (Gemini 3 Pro)

| Level | Latency | Use Case |
|-------|---------|----------|
| `minimal` | Fastest | Key validation |
| `low` | Fast | JSON generation, simple tasks |
| `medium` | Balanced | Skip pattern analysis |
| `high` | 15+ sec | Complex vibe reasoning |

#### Thought Signature (Gemini 3 Pro)

Gemini 3 Pro returns a `thoughtSignature` for Chain-of-Thought conversations. You MUST pass it back in subsequent requests:

```typescript
// Store from response
if (response.data.thoughtSignature) {
    this.lastThoughtSignature = response.data.thoughtSignature;
}

// Include in next request
if (modelId === 'gemini-3-pro' && this.lastThoughtSignature) {
    requestBody.thoughtSignature = this.lastThoughtSignature;
}
```

### Spotify API

**Base URL**: `https://api.spotify.com/v1/`

#### Required Scopes

```
user-read-playback-state
user-modify-playback-state
user-read-currently-playing
user-read-private
user-library-read
user-top-read
playlist-read-private
streaming
```

#### Key Endpoints Used

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/me` | GET | Validate session |
| `/me/player` | GET | Get playback state |
| `/me/player/play` | PUT | Start playback |
| `/me/player/queue` | POST | Add to queue |
| `/me/top/tracks` | GET | Get user favorites |
| `/search` | GET | Validate track existence |

#### Token Refresh

Tokens expire after 1 hour. Use refresh token flow:

```typescript
POST https://accounts.spotify.com/api/token
Content-Type: application/x-www-form-urlencoded

grant_type=refresh_token
refresh_token={refresh_token}
client_id={client_id}
```

---

## Services Reference

### GeminiService (`services/gemini/GeminiService.ts`)

Main AI service with automatic model fallback.

```typescript
// Key methods
gemini.getVibeOptions(history, favorites, instruction, excludeTracks)
gemini.generateRescueVibe(recentSkips, favorites, excludeTracks)
gemini.expandVibe(seedTrack, history, favorites, excludeTracks)
gemini.assessCurrentMood(currentTrack, history, context)
gemini.validateKey(apiKey)
gemini.testConnection()
gemini.clearConversationState()  // Reset thoughtSignature
```

### GeminiPrompts (`services/gemini/GeminiPrompts.ts`)

Prompt templates with role framing:

| Prompt | Role | Output |
|--------|------|--------|
| `generateDJRecommendation` | "Expert music DJ" | 1 seed track |
| `generateVibeOptionsPrompt` | "Music curator" | 16 vibe options |
| `generateVibeExpansionPrompt` | "Playlist curator" | 15 similar tracks |
| `generateRescueVibePrompt` | "Adaptive DJ" | 15 pivot tracks + reasoning |
| `generateMoodAssessmentPrompt` | "Music analyst" | Mood analysis |

### ValidatedQueueService (`services/core/ValidatedQueueService.ts`)

Validates AI suggestions against Spotify. Uses fuzzy matching with penalties:

```typescript
// Scoring system
- Exact title match: +30 points
- Exact artist match: +30 points
- High popularity (>60): +10 points
- Title contains: +20 points
- Artist contains: +15 points
- Penalty for "Live", "Remix", "Cover": -20 points each
```

### RecommendationService (`services/core/RecommendationService.ts`)

Orchestrates the full recommendation flow:

```typescript
recommendationService.getVibeOptions(instruction)
recommendationService.getRescueVibe(recentSkips)
recommendationService.expandVibe(seedTrack, vibeContext)
```

### GraphService (`services/graph/GraphService.ts`)

Builds a personal music graph for better recommendations.

**Nodes:** `SONG`, `ARTIST`, `VIBE`, `AUDIO_FEATURE`, `GENRE`. Genre nodes are created from artist genres; vibe nodes when listening to vibes (session commit).

**Edges (all from song perspective):** Song → Genre (`HAS_GENRE`), Song → Artist (`RELATED`), Song → Audio feature (`HAS_FEATURE`), Song → Vibe (`RELATED`), Song → Song (`SIMILAR`, `NEXT`).

**Ingestion:** Fetch all liked songs into memory, then iterate song-by-song. At build time the service keeps hash tables `genreToNode` and `artistToNode`: if a genre/artist node does not exist it is created and stored in the map; otherwise the existing node is used. This avoids missing connections and repeated lookups.

**Colors:** Node and edge colors for visualization are in `services/graph/graphColors.ts` (single source of truth).

**How data is output from the graph:**
1. **getGraphSnapshot()** — Returns `{ nodes, edges }` for debug visualization. Nodes are `GraphNode[]`; edges are normalized to `{ source, target, type, weight }[]` for d3.
2. **getCandidates(limit)** — Last N song nodes by `last_played_at` (context history).
3. **getNeighbors(nodeId, limit)** — Nodes linked from this node (by edge weight), returned as `{ name, artist, weight }[]`; used by RecommendationService for expansion.
4. **getNextSuggestedNode(currentNodeId)** — Highest-weight neighbor not played today; used by PlayerStore for “next” suggestion.
5. **getClusterRepresentatives(limit)** — Diverse song nodes (by play_count / artist diversity) for Gemini context.

```typescript
graphService.getEffectiveNode(type, name, spotifyId, data)
graphService.connectNodes(sourceId, targetId, type, weight)
graphService.getNeighbors(nodeId, limit)
graphService.processSession(songs, vibeName)
graphService.getNextSuggestedNode(currentNodeId)
graphService.getGraphSnapshot()  // nodes + edges for viz
```

### SpotifyRemoteService (`services/spotify/SpotifyRemoteService.ts`)

Handles all Spotify interactions:

```typescript
spotifyRemote.play(uri)
spotifyRemote.pause()
spotifyRemote.skipToNext()
spotifyRemote.addToQueue(uri)
spotifyRemote.search(query, types, limit)
spotifyRemote.getUserTopTracks(limit, timeRange)
spotifyRemote.getPlaybackState()
```

### DatabaseService (`services/database/DatabaseService.native.ts`)

SQLite storage for preferences, history, and graph:

**Tables:**
- `user_preferences` - App settings
- `user_services` - OAuth tokens
- `listening_history` - Play history
- `tracks` - Track metadata with play counts
- `daily_play_log` - Today's plays (for exclusion)
- `graph_nodes` - Music graph nodes
- `graph_edges` - Music graph relationships

---

## State Management

Uses **Zustand** for state management.

### PlayerStore (`stores/PlayerStore.ts`)

```typescript
interface PlayerState {
  isPlaying: boolean;
  currentTrack: Track | null;
  queue: Track[];
  sessionHistory: Track[];
  currentVibe: string | null;
}
```

### SkipTrackerStore (`stores/SkipTrackerStore.ts`)

Tracks skip patterns for Rescue Vibe trigger.

### SettingsStore (`stores/SettingsStore.ts`)

App preferences and API keys.

### ErrorStore (`stores/ErrorStore.ts`)

Centralized error handling with typed service errors.

---

## Testing

### Test Structure

```
tests/
├── 00-auth/           # Authentication tests (run first)
├── integration/       # Real API integration tests
│   ├── GeminiSpotifyIntegration.test.ts
│   ├── GraphServiceIntegration.test.ts
│   ├── FullFlowIntegration.test.ts
│   └── RealUserLoopIntegration.test.ts
├── unit/              # Unit tests with mocks
│   └── services/
│       ├── GraphService.test.ts
│       └── ...
└── utils/             # Test utilities
    ├── testDb.ts           # Database helpers
    ├── testApiKeys.ts      # API key loading
    ├── sqliteNodeAdapter.js # In-memory SQLite mock
    └── PlaybackTracker.ts  # Track test playback
```

### Setup

1. Create `.env.test`:

```bash
GEMINI_API_KEY=your_gemini_api_key
SPOTIFY_CLIENT_ID=your_client_id
SPOTIFY_ACCESS_TOKEN=your_access_token
SPOTIFY_REFRESH_TOKEN=your_refresh_token
SPOTIFY_REDIRECT_URI=http://127.0.0.1:8081
```

2. Get fresh Spotify tokens:

```bash
node scripts/get-spotify-token.js
```

### Running Tests

```bash
# All tests
npm test

# Specific test file
npm test -- --testPathPattern="GraphService"

# Specific test name
npm test -- --testNamePattern="should create"

# Watch mode
npm test -- --watch
```

### Test Database Adapter

The `sqliteNodeAdapter.js` provides an in-memory SQLite mock for Jest. It implements:

- All table operations (user_preferences, tracks, graph_nodes, etc.)
- Graph queries (node creation, edge traversal, neighbor lookup)
- Modular handler pattern for easy extension

To add new SQL pattern support:

```javascript
// In runHandlers (INSERT/UPDATE/DELETE)
'INSERT INTO new_table': (p) => {
    store.new_table.set(p[0], { ... });
    return result(id);
},

// In getFirstHandlers (SELECT single)
{
    match: (s) => s.includes('new_table') && s.includes('key = ?'),
    handle: (p) => store.new_table.get(p[0]) || null
},

// In getAllHandlers (SELECT multiple)
{
    match: (s) => s.includes('new_table'),
    handle: (p) => Array.from(store.new_table.values())
},
```

---

## Scripts

### `scripts/get-spotify-token.js`

Gets fresh Spotify OAuth tokens for testing:

```bash
node scripts/get-spotify-token.js
```

Opens browser for OAuth, returns tokens to paste in `.env.test`.

### `scripts/check_models.ts`

Tests availability of all Gemini models:

```bash
npx ts-node scripts/check_models.ts
```

### `scripts/debug_vibe.js`

Debug vibe generation flow:

```bash
node scripts/debug_vibe.js
```

### `scripts/reset-project.js`

Reset project to clean state:

```bash
npm run reset-project
```

---

## Development Guide

### Adding a New Prompt

1. Add template in `GeminiPrompts.ts`:

```typescript
generateNewPrompt: (params) => {
    return `You are a [role]. JSON. [task description].
Context: ${params.context}
Rules: [constraints]
{"expected":"output","format":"here"}`;
}
```

2. Add method in `GeminiService.ts`:

```typescript
async newMethod(params): Promise<Result> {
    const prompt = GeminiPrompts.generateNewPrompt(params);
    const response = await this.makeRequest(
        apiKey,
        prompt,
        { maxOutputTokens: TOKEN_LIMITS.STANDARD, thinkingLevel: 'low' },
        true  // includeThoughtSignature
    );
    return this.parseJsonResponse(response);
}
```

### Adding a New Table

1. Add schema in `DatabaseService.native.ts`:

```sql
CREATE TABLE IF NOT EXISTS new_table (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ...
);
```

2. Add handlers in `sqliteNodeAdapter.js` for tests.

### Model Fallback

Models are tried in priority order. To change priority, edit `MODEL_PRIORITY` in `constants.ts`:

```typescript
export const MODEL_PRIORITY: ModelId[] = [
    'gemini-3-pro',    // Try first
    'gemini-2.5-pro',  // Fallback
    'gemini-2.0-flash',
    'gemini-2.5-flash'
];
```

### Error Handling

Use typed errors from `ServiceError.ts`:

```typescript
import { GeminiErrors, SpotifyErrors } from '@/services/core/ServiceError';

// Emit error
this.emitError(GeminiErrors.rateLimited(message));
this.emitError(SpotifyErrors.noActiveSession());
```

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GEMINI_API_KEY` | Yes | Google AI Studio API key |
| `SPOTIFY_CLIENT_ID` | Yes | Spotify Developer Dashboard |
| `SPOTIFY_ACCESS_TOKEN` | For tests | OAuth access token |
| `SPOTIFY_REFRESH_TOKEN` | For tests | OAuth refresh token |
| `SPOTIFY_REDIRECT_URI` | For tests | OAuth redirect (default: `http://127.0.0.1:8081`) |

---

## License

MIT

---

*Built for the Google Gemini API Developer Competition*
