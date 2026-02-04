# 🎵 Moodify - Vibe Code with Gemini 3 Pro

**Moodify** is an intelligent, AI-powered DJ that curates music based on your "vibe," not just genres. Built for the Google Gemini API Developer Competition, it leverages the advanced reasoning capabilities of **Gemini 3 Pro** to understand complex mood descriptions, validate tracks against Spotify's real-time catalog, and deliver a seamless listening experience.

## 🚀 The Problem
Music recommendation algorithms often feel repetitive. "Radio" features stick to safe bets, and finding the perfect song for a specific, nuanced feeling (e.g., "driving down PCH at sunset with 80s synthwave nostalgia") is difficult. Most AI wrappers just hallucinate song titles that don't exist.

## 💡 The Solution
Moodify solves this by combining **Gemini 3 Pro's** reasoning with a **Multi-Stage Validation Agent**.
1.  **Understand**: Gemini analyzes your listening history and current context to generate a "Vibe".
2.  **Reason**: It brainstorms tracklists that fit the *feeling*, not just the metadata.
3.  **Validate**: A custom `ValidatedQueueService` checks every AI suggestion against Spotify's API.
4.  **Refine**: If a song doesn't exist, the agent "re-thinks" (Chain-of-Thought) to find a verified alternative that matches the vibe, ensuring **Zero Hallucinations** in the final queue.

## ✨ Features (Creativity & Impact)
-   **🧠 Reasoning-Based DJ**: Uses Gemini 3's `thoughtSignature` to maintain context across turns, allowing for "Rescue Mode" (detecting skips and pivoting the vibe instantly).
-   **🛡️ Hallucination Guardrails**: A specialized agent penalizes "Live", "Remix", or "Cover" versions unless explicitly requested, solving the "Wrong Song" problem.
-   **🔄 Smart Sync**: Real-time bidirectional synchronization with Spotify. Control playback, queue songs, and visualize progress smoothly.
-   **🎨 Dynamic UI**: Glassmorphism design that adapts to the current mood and album art.

## 🛠️ Technical Implementation
Built with **React Native (Expo)**, **Google Gemini 3 Pro**, and **Spotify Web API**.

### Architecture
-   **Gemini Service**: Handles interaction with `gemini-3-pro-preview`. Uses `thinking_level` for complex vibe analysis and `thoughtSignature` for stateful conversations.
-   **Validated Queue Service**: The "Brain" that bridges AI and Reality. It scores Spotify search results against Gemini's suggestions using fuzzy matching and heuristic penalties.
-   **Spotify Remote**: Manages the playback state, polling, and queue synchronization.

### Gemini 3 Integration
We use Gemini 3 Pro for:
-   **Vibe Generation**: "Generate a playlist for a rainy sunday coffee shop."
-   **Reasoning**: "Why did the user skip this track? Adjust the next 5 songs to be more upbeat."
-   **Context Retention**: Passing `thoughtSignature` allows the model to "remember" why it picked the previous song when asked to expand the playlist.

## 📸 Demo & Screenshots
*(Add your video demo link here)*
*(Add screenshots here)*

## 📦 Installation
1.  **Clone the Repo**
    ```bash
    git clone https://github.com/your-username/moodify.git
    cd moodify
    ```
2.  **Install Dependencies**
    ```bash
    npm install
    ```
3.  **Configure Keys**
    -   Create a helper or add keys in the app settings.
    -   Spotify Client ID (hardcoded or env).
    -   Gemini API Key (enter in App Settings).
4.  **Run**
    ```bash
    npx expo start
    ```

## 🧪 Testing

### Setup
1. **Create `.env.test` file** (copy from `.env.test.example` if available):
   ```bash
   cp .env.test.example .env.test
   ```

2. **Add your test API keys** to `.env.test`:
   ```
   GEMINI_API_KEY=your_gemini_api_key_here
   SPOTIFY_CLIENT_ID=your_spotify_client_id_here
   SPOTIFY_ACCESS_TOKEN=your_spotify_access_token_here
   SPOTIFY_REFRESH_TOKEN=your_spotify_refresh_token_here
   ```

   **Note**: The `.env.test` file is gitignored and will not be committed.

### Running Tests

**Unit Tests** (fast, mocked - no API keys required):
```bash
npm test
```

**Integration Tests** (slower, requires real API keys):
- Integration tests will automatically run if API keys are present in `.env.test`
- If keys are missing, integration tests will be skipped
- Integration tests verify the full flow: Gemini suggestions → Spotify validation

**Test Structure**:
- `tests/unit/` - Unit tests with mocked dependencies
- `tests/integration/` - Integration tests with real API calls
- `tests/utils/` - Test utilities and helpers

### Test Coverage
- ✅ Unit tests for core services (RecommendationService, ValidatedQueueService)
- ✅ Integration tests for Gemini → Spotify flow
- ✅ Error handling and edge cases
- ✅ Track validation and scoring algorithms

## 🏆 Hackathon Checklist
-   [x] **Impact**: Solves the "playlist fatigue" and "AI hallucination" problem.
-   [x] **Technology**: Deep integration of Gemini 3 Pro reasoning & multi-step agents.
-   [x] **Creativity**: "Rescue Vibe" and "Vibe Expansion" are novel UX patterns.
-   [ ] **Video Demo**: (Pending User Submission).

---
*Built with ❤️ by [Your Name] for the Google Gemini API Developer Competition.*
