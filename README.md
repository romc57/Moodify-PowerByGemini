# Moodify - AI-Powered Autonomous Music DJ

> An intelligent, adaptive music recommendation system built on **Gemini 3 Pro** that acts as a personal DJ — understanding your vibe, curating playlists through **Spotify**, self-correcting when you skip, and learning your taste over time through a personal music knowledge graph. Zero hallucinations: every AI suggestion is validated before it ever plays.

**Built for the [Google DeepMind Gemini 3 Hackathon](https://gemini3.devpost.com/)**

---

## Screenshots

<p align="center">
  <img src="assets/screenshots/setup.png" width="220" alt="Setup — Enter your Gemini API key and connect Spotify">&nbsp;&nbsp;
  <img src="assets/screenshots/vibes.png" width="220" alt="Vibe Selection — Pick from 8 AI-curated vibes">&nbsp;&nbsp;
  <img src="assets/screenshots/graph.png" width="220" alt="Knowledge Graph — Interactive visualization of your music taste">&nbsp;&nbsp;
  <img src="assets/screenshots/player.png" width="220" alt="Now Playing — Playback with Auto DJ and Rescue Mode">
</p>

<p align="center">
  <em>Setup &amp; API Validation</em>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
  <em>AI Vibe Curation</em>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
  <em>Knowledge Graph</em>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
  <em>Now Playing</em>
</p>

---

## Gemini 3 Integration

Moodify uses Gemini 3 Pro as its core reasoning engine to power an **autonomous music DJ agent** that runs continuously during a listening session. The app leverages three Gemini 3-specific features that are central to its operation:

**Thought Signatures** maintain conversational continuity across the DJ session. Each Gemini response returns a `thoughtSignature` that is passed back in subsequent requests, allowing the model to remember prior reasoning about the user's mood, skipped tracks, and vibe trajectory — turning isolated API calls into a coherent, stateful DJ session.

**Thinking Levels** (`minimal`, `low`, `medium`) are calibrated per task: `low` for fast track generation, `medium` for skip-pattern analysis in Rescue Mode (where the model reasons about *why* the user is skipping and pivots direction), and `minimal` for quick validation. This keeps latency under control while preserving reasoning depth where it matters.

**Structured JSON output** with `responseMimeType: "application/json"` ensures every response is machine-parseable, feeding directly into the Spotify validation pipeline with no manual extraction.

The model operates as an **orchestrating agent** — not a chatbot. It autonomously generates vibes, expands queues, detects dissatisfaction through skip patterns, and rescues sessions, all without user intervention.

---

## Table of Contents

- [Screenshots](#screenshots)
- [Problem Statement](#problem-statement)
- [Features](#features)
- [How It Works](#how-it-works)
- [Architecture](#architecture)
- [Core Algorithms](#core-algorithms)
- [Gemini 3 Technical Details](#gemini-3-technical-details)
- [Setup & Configuration](#setup--configuration)
- [Tech Stack](#tech-stack)
- [Third-Party Integrations](#third-party-integrations)
- [Services Reference](#services-reference)
- [State Management](#state-management)
- [Testing](#testing)
- [Scripts](#scripts)
- [Development Guide](#development-guide)
- [License](#license)

---

## Problem Statement

**Playlist fatigue is real.** Existing music apps trap users in filter bubbles or require constant manual input to find the right music. Algorithmic playlists go stale. Radio stations repeat. And "AI playlists" are often just static lists generated once and never adapted.

Moodify solves this by creating a **live, adaptive DJ** that:

1. **Understands context** — not just genre tags, but the *feeling* behind what you want to hear
2. **Validates everything** — AI models hallucinate song names; Moodify verifies every track against Spotify before queuing
3. **Self-corrects in real-time** — detects when you're skipping and automatically pivots to a new direction
4. **Learns over time** — builds a personal music knowledge graph that improves recommendations with every session

---

## Features

| Feature | Description |
|---------|-------------|
| **Vibe-Based Curation** | Describe a mood ("driving at sunset with 80s synthwave") and get 8 verified vibe options, each with a seed track |
| **Zero Hallucinations** | Every AI-suggested track is fuzzy-matched and validated against Spotify's catalog before playing |
| **Rescue Mode** | Detects 3+ consecutive skips and autonomously pivots the vibe using Gemini's reasoning |
| **Auto DJ** | Monitors queue depth and automatically expands when running low — no user interaction needed |
| **Knowledge Graph** | Builds a personal music graph (songs, artists, genres, vibes) that improves recommendations over time |
| **Graph Visualization** | Interactive D3.js-powered visualization of your personal music knowledge graph |
| **Hybrid Recommendations** | Combines Gemini's creative discovery with graph-based familiar tracks for balanced playlists |
| **Model Fallback** | Automatic fallback through 4 Gemini models if the primary is unavailable |
| **Voice Feedback** | Announces vibe changes and track intros via text-to-speech |
| **Adaptive Themes** | 5 visual themes that shift based on current mood/vibe |

---

## How It Works

### User Flow

```
1. Setup: Enter Gemini API key + Connect Spotify account
2. Tap "Refresh Vibe" → AI generates 8 curated vibe options
3. Pick a vibe → AI expands it into 10+ validated tracks
4. Music plays → AutoDJ monitors and expands queue automatically
5. Skip 3+ tracks → Rescue Mode triggers a new vibe direction
6. Over time → Knowledge graph learns your taste and improves future vibes
```

### Three Core Loops

**Loop 1 — Vibe Selection:**
User requests vibes → Gemini generates 16 options (with graph context) → Spotify validates seed tracks → 8 verified options displayed → User picks one → Queue populated with validated tracks.

**Loop 2 — Auto Expansion:**
AutoDJ detects queue < 5 tracks → Gemini generates 5 discovery tracks + graph provides familiar neighbors → All validated against Spotify → Queue silently refilled.

**Loop 3 — Rescue:**
SkipTracker detects 3+ consecutive skips → Gemini analyzes skipped tracks, reasons about *why* they were skipped → Generates a pivot vibe in a completely new direction → Queue replaced with fresh, validated tracks.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                          UI Layer                               │
│  React Native / Expo Router                                     │
│  HomeScreen ─ VibeSelector ─ MiniPlayer ─ GraphView ─ Settings  │
└──────────────────────────────┬──────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                      State Management (Zustand)                 │
│  PlayerStore │ SettingsStore │ SkipTrackerStore │ ErrorStore     │
└──────────────────────────────┬──────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                       Orchestration Layer                       │
│  RecommendationService ──► ValidatedQueueService                │
│  useAutoDJ (hook) ──► SkipTrackerStore                          │
└────────────────┬─────────────────────────┬──────────────────────┘
                 │                         │
                 ▼                         ▼
┌────────────────────────────┐  ┌────────────────────────────┐
│     GeminiService          │  │   SpotifyRemoteService     │
│  (AI Reasoning Engine)     │  │   (Playback + Validation)  │
│  ├─ thoughtSignature       │  │   ├─ Search & Fuzzy Match  │
│  ├─ Thinking Levels        │  │   ├─ Queue Management      │
│  ├─ Model Fallback Chain   │  │   └─ OAuth / Token Refresh │
│  └─ JSON Response Parsing  │  └────────────────────────────┘
└──────────┬─────────────────┘
           │
           ▼
┌────────────────────────────┐  ┌────────────────────────────┐
│     GraphService           │  │   DatabaseService (SQLite) │
│  (Personal Music Graph)    │  │   ├─ Preferences & Tokens  │
│  ├─ Nodes: Song, Artist,   │  │   ├─ Listening History     │
│  │  Genre, Vibe, Feature   │  │   ├─ Graph Nodes & Edges   │
│  ├─ Edges: Similar, Next,  │  │   └─ Gemini Reasoning Log  │
│  │  Related, Has_Genre     │  └────────────────────────────┘
│  └─ Ingestion & Learning   │
└────────────────────────────┘
```

---

## Core Algorithms

### 1. Vibe Generation

Gemini receives compressed context (listening history, taste clusters from the graph, genre profile, audio features, favorites, exclusion list) and generates 16 vibe options following a diversity formula:

- **4 Familiar** — from user's taste clusters in the knowledge graph
- **4 Adjacent** — same energy/genre neighborhood, new artists
- **8 Discovery** — completely new genres and directions

Each vibe includes a seed track that is validated against Spotify. After validation filtering, 8 verified vibes are presented to the user.

### 2. Spotify Validation (Zero Hallucinations)

Every AI-suggested track passes through the `ValidatedQueueService`:

1. Search Spotify for `"track title artist name"`
2. Score each result using fuzzy matching (Dice coefficient):
   - Exact title match: **+30 pts** | Title contains: **+20 pts**
   - Exact artist match: **+30 pts** | Artist contains: **+15 pts**
   - High popularity (>60): **+10 pts**
   - Penalty for Live/Remix/Cover versions: **-20 pts each**
3. Accept if score >= **65/100**, reject otherwise
4. If too many rejections, request backfill alternatives from Gemini

### 3. Skip Detection & Rescue

The `SkipTrackerStore` monitors listening behavior:

- **Skip**: Track played < 30 seconds
- **Rescue trigger**: 3 consecutive skips
- **Expansion trigger**: 5 consecutive full listens (user is enjoying it)

When rescue triggers, Gemini receives the skipped tracks and reasons about what went wrong (wrong energy? wrong genre? wrong era?) before generating a completely different vibe direction.

### 4. Knowledge Graph

A personal music graph stored in SQLite:

- **Nodes**: `SONG`, `ARTIST`, `GENRE`, `VIBE`, `AUDIO_FEATURE`
- **Edges**: `SIMILAR`, `NEXT`, `RELATED`, `HAS_GENRE`, `HAS_FEATURE`
- **Ingestion**: Imports user's liked songs from Spotify, creates nodes and edges using in-memory hash tables to avoid duplicates
- **Learning**: Records play counts, builds NEXT edges between consecutively played songs, strengthens SIMILAR edges
- **Output**: `getNeighbors()` returns weighted similar songs; `getClusterRepresentatives()` provides diverse taste context for Gemini prompts

### 5. Auto DJ

The `useAutoDJ` hook runs a continuous monitoring loop:

- Checks queue length every cycle
- If queue < 5 tracks → triggers expansion (Gemini discovery + graph neighbors)
- If 5+ consecutive listens → triggers expansion (user is engaged)
- 15-second cooldown between expansions to prevent API spam
- Hybrid strategy: Gemini provides creative discovery tracks, graph provides familiar neighbors

---

## Gemini 3 Technical Details

### Models (Priority Fallback Order)

| # | Model | ID | Tier | Use Case |
|---|-------|----|------|----------|
| 1 | Gemini 3 Pro | `gemini-3-pro-preview` | Pro | Primary reasoning engine |
| 2 | Gemini 2.5 Pro | `gemini-2.5-pro` | Pro | Stable fallback |
| 3 | Gemini 2.0 Flash | `gemini-2.0-flash` | Flash | Fast validation |
| 4 | Gemini 2.5 Flash | `gemini-2.5-flash` | Flash | Emergency fallback |

If the primary model fails (quota, 500 error), the system automatically tries the next model. Auth errors (401/403) are not retried since they affect all models.

### Thought Signature Handling

Gemini 3 Pro uses Chain-of-Thought reasoning with cryptographic `thoughtSignature` tokens:

```
Request 1: Generate vibes → Response includes thoughtSignature "abc123"
Request 2: Expand vibe (includes thoughtSignature "abc123") → Response includes "def456"
Request 3: Rescue (includes "def456") → Model remembers full session context
```

This is only sent to `gemini-3-pro` — other models in the fallback chain do not support it and would return `400 INVALID_ARGUMENT`.

### Thinking Levels Per Operation

| Operation | Thinking Level | Token Limit | Rationale |
|-----------|---------------|-------------|-----------|
| `getVibeOptions` | `low` | 8192 | Fast generation, structured output |
| `expandVibe` | `low` | 4096 | Quick discovery, minimal reasoning |
| `generateRescueVibe` | `medium` | 2048 | Needs to *reason* about skip patterns |
| `assessCurrentMood` | `minimal` | 1024 | Simple classification |
| `validateKey` | `minimal` | 1 | Ping test only |

### Prompt Engineering

All prompts use compact pipe-delimited format to minimize token usage:

```
History: "Bohemian Rhapsody|Queen|P;Stairway to Heaven|Led Zeppelin|S"
```

Instead of verbose JSON context, this reduces input tokens by ~70% while preserving all information. Each prompt assigns a specific role (Expert music DJ, Adaptive DJ, Music curator) and constrains output to a strict JSON schema.

### JSON Response Safety

Gemini responses are processed through a multi-layer parser:

1. Strip markdown code fences (`\`\`\`json`)
2. Extract JSON portion (skip preamble text)
3. Bracket-depth matching to strip trailing text
4. Standard `JSON.parse`
5. If parse fails → **repair mode**: extract valid objects from truncated arrays, close unclosed braces
6. Emit typed error if all else fails

---

## Setup & Configuration

### Prerequisites

- **Node.js** >= 18
- **Expo CLI**: `npm install -g expo-cli`
- **Gemini API Key**: Get one free at [Google AI Studio](https://aistudio.google.com/)
- **Spotify Developer Account**: Create an app at [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
- **Spotify Premium** (required for playback control)

### Installation

```bash
# Clone the repository
git clone https://github.com/<your-username>/Moodify-PowerByGemini.git
cd Moodify-PowerByGemini

# Install dependencies
npm install
```

### Spotify App Setup

1. Go to [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
2. Create a new app
3. Set the **Redirect URI** to: `moodifymobile://callback`
4. Note your **Client ID**

### Running the App

```bash
# Start the Expo development server
npx expo start

# Or run on specific platform
npx expo run:android
npx expo run:ios
npx expo start --web
```

### In-App Configuration

On first launch, the app presents a setup screen:

1. **Enter your Gemini API key** — the app validates it against Gemini 2.0 Flash
2. **Connect Spotify** — OAuth flow opens in browser, returns to app via deep link
3. **Start listening** — tap "Refresh Vibe" to get your first AI-generated vibes

> **Note for judges**: API keys are entered through the app's Settings UI, not environment files. The app stores credentials securely via `expo-secure-store`. If you need to test, enter a valid Gemini API key and connect a Spotify Premium account.

### Environment Variables (Testing Only)

For running the automated test suite, create a `.env.test` file:

```bash
GEMINI_API_KEY=your_gemini_api_key
SPOTIFY_CLIENT_ID=your_client_id
SPOTIFY_ACCESS_TOKEN=your_access_token       # Optional
SPOTIFY_REFRESH_TOKEN=your_refresh_token     # Optional
SPOTIFY_REDIRECT_URI=http://127.0.0.1:8081
```

Get fresh Spotify tokens for testing:

```bash
node scripts/get-spotify-token.js
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Framework** | React Native 0.81.5 + Expo SDK 54 |
| **Routing** | Expo Router (file-based) |
| **Language** | TypeScript 5.9 (strict mode) |
| **State** | Zustand 5.0 |
| **AI** | Gemini 3 Pro API (via REST) |
| **Music** | Spotify Web API |
| **Database** | Expo SQLite (on-device) |
| **Graph Viz** | D3.js 7.9 + React Native SVG |
| **Animations** | React Native Reanimated 4.1 |
| **Auth** | Expo Auth Session (OAuth 2.0 PKCE) |
| **Security** | Expo Secure Store |
| **Audio** | Expo AV (background audio) |
| **Voice** | Expo Speech (TTS) |

---

## Third-Party Integrations

As required by competition rules, the following third-party services are used:

| Integration | Purpose | License/Terms |
|-------------|---------|---------------|
| **Spotify Web API** | Music search, playback control, user library access, track validation | [Spotify Developer Terms](https://developer.spotify.com/terms) |
| **Google Gemini API** | AI reasoning engine for recommendations, vibe generation, mood analysis | [Google AI Studio Terms](https://ai.google.dev/terms) |
| **D3.js** | Force-directed graph visualization | BSD 3-Clause |
| **Axios** | HTTP client for API requests | MIT |
| **Zustand** | State management | MIT |
| **Expo** | React Native framework and native modules | MIT |

All third-party integrations are used in accordance with their respective terms of service and licensing requirements.

---

## Services Reference

### GeminiService (`services/gemini/GeminiService.ts`)

Singleton AI service with automatic model fallback and thought signature management.

```typescript
gemini.getVibeOptions(history, tasteProfile, favorites, instruction, excludeTracks)
gemini.generateRescueVibe(recentSkips, favorites, excludeTracks)
gemini.expandVibe(seedTrack, history, neighbors, favorites, excludeTracks, topGenres)
gemini.assessCurrentMood(currentTrack, history, context)
gemini.validateKey(apiKey)
gemini.testConnection()
gemini.clearConversationState()  // Reset thoughtSignature
```

### GeminiPrompts (`services/gemini/GeminiPrompts.ts`)

Compact prompt templates with role framing:

| Prompt | Role | Output |
|--------|------|--------|
| `generateDJRecommendation` | "Expert music DJ" | 1 seed track |
| `generateVibeOptionsPrompt` | "Music curator" | 16 vibe options |
| `generateVibeExpansionPrompt` | "Curator" | 5 discovery tracks |
| `generateRescueVibePrompt` | "Adaptive DJ" | 10 pivot tracks + reasoning |
| `generateMoodAssessmentPrompt` | "Music analyst" | Mood analysis |

### ValidatedQueueService (`services/core/ValidatedQueueService.ts`)

Validates AI suggestions against Spotify with fuzzy matching. Scoring:

- Exact title match: +30 | Title contains: +20
- Exact artist match: +30 | Artist contains: +15
- High popularity (>60): +10
- Penalty for Live/Remix/Cover: -20 each
- Threshold: 65/100

### RecommendationService (`services/core/RecommendationService.ts`)

Orchestrates the full recommendation flow across Gemini, Spotify, and Graph services.

### GraphService (`services/graph/GraphService.ts`)

Personal music knowledge graph:

- **Nodes:** `SONG`, `ARTIST`, `VIBE`, `AUDIO_FEATURE`, `GENRE`
- **Edges:** `HAS_GENRE`, `RELATED`, `HAS_FEATURE`, `SIMILAR`, `NEXT`
- **Key methods:** `getNeighbors()`, `getClusterRepresentatives()`, `getGraphSnapshot()`, `processSession()`

### SpotifyRemoteService (`services/spotify/SpotifyRemoteService.ts`)

Handles all Spotify interactions (playback, search, queue, auth).

### DatabaseService (`services/database/DatabaseService.native.ts`)

SQLite storage with tables for preferences, tokens, listening history, tracks, daily play log, graph nodes, graph edges, and Gemini reasoning logs.

---

## State Management

Uses **Zustand** for lightweight, modular state:

| Store | Responsibility |
|-------|---------------|
| `PlayerStore` | Playback state, queue, session history, current vibe |
| `SkipTrackerStore` | Skip pattern detection, rescue triggers |
| `SettingsStore` | App preferences, API keys |
| `ErrorStore` | Centralized typed error handling |
| `GeminiStore` | Model selection, model availability statuses |

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
│       └── GraphService.test.ts
└── utils/             # Test utilities
    ├── testDb.ts
    ├── testApiKeys.ts
    ├── sqliteNodeAdapter.js   # In-memory SQLite mock for Jest
    └── PlaybackTracker.ts
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

---

## Scripts

| Script | Command | Purpose |
|--------|---------|---------|
| `get-spotify-token.js` | `node scripts/get-spotify-token.js` | Get fresh OAuth tokens for testing |
| `check_models.ts` | `npx ts-node scripts/check_models.ts` | Test Gemini model availability |
| `debug_vibe.js` | `node scripts/debug_vibe.js` | Debug vibe generation flow |
| `reset-project.js` | `npm run reset-project` | Reset project to clean state |

---

## Development Guide

### Adding a New Prompt

1. Add template in `GeminiPrompts.ts` (compact pipe-delimited format)
2. Add method in `GeminiService.ts` using `makeRequest()` with appropriate `TOKEN_LIMITS` and `thinkingLevel`
3. Always include `thoughtSignature` for conversational continuity

### Adding a New Graph Node Type

1. Add to node type union in `GraphService.ts`
2. Add color mapping in `graphColors.ts`
3. Update ingestion logic in `processSession()`

### Model Fallback

Edit `MODEL_PRIORITY` in `services/gemini/constants.ts`:

```typescript
export const MODEL_PRIORITY: ModelId[] = [
    'gemini-3-pro',     // Try first
    'gemini-2.5-pro',   // Fallback
    'gemini-2.0-flash',
    'gemini-2.5-flash'
];
```

### Error Handling

Use typed errors from `ServiceError.ts`:

```typescript
import { GeminiErrors, SpotifyErrors } from '@/services/core/ServiceError';

this.emitError(GeminiErrors.rateLimited(message));
this.emitError(SpotifyErrors.noActiveSession());
```

---

## License

MIT

---

*Built for the [Google DeepMind Gemini 3 Hackathon](https://gemini3.devpost.com/) — February 2026*
