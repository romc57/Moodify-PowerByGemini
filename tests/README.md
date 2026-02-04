# Tests Documentation

## Overview

This test suite validates the Moodify application logic against real Spotify and Gemini APIs. Tests are divided into **Unit Tests** (with mocks) and **Integration Tests** (no mocks, real APIs).

## Test Structure

```
tests/
├── unit/                    # Unit tests with mocked dependencies
│   └── services/
│       ├── RecommendationService.test.ts
│       ├── ValidatedQueueService.test.ts
│       ├── GeminiService.test.ts
│       └── SpotifyRemoteService.test.ts
├── integration/            # Integration tests with real APIs
│   ├── GeminiSpotifyIntegration.test.ts
│   └── FullFlowIntegration.test.ts
└── utils/                  # Test utilities
    ├── testApiKeys.ts      # Load API keys from .env.test
    ├── testDb.ts           # Database test helpers
    └── mockHelpers.ts      # Mock data factories
```

## Setup

### Prerequisites

1. Create `.env.test` file in project root:
```bash
GEMINI_API_KEY=your_gemini_api_key_here
SPOTIFY_CLIENT_ID=your_spotify_client_id_here
SPOTIFY_ACCESS_TOKEN=your_spotify_access_token_here
SPOTIFY_REFRESH_TOKEN=your_spotify_refresh_token_here  # Optional, can be retrieved at runtime
```

2. Install dependencies:
```bash
npm install
```

### Running Tests

```bash
# Run all tests
npm test

# Run only unit tests
npm test -- tests/unit

# Run only integration tests
npm test -- tests/integration
```

## Unit Tests

### RecommendationService.test.ts

**What is tested:**
- Vibe options generation flow
- Integration between Gemini and ValidatedQueueService
- Error handling for empty responses

**How it's tested:**
- Mocks Gemini, ValidatedQueueService, and SpotifyRemoteService
- Tests service orchestration logic

**Input/Output:**

| Test Case | Input | Expected Output | Actual Output |
|-----------|-------|-----------------|---------------|
| `should return validated options when Gemini returns suggestions` | `getVibeOptions('Happy')` | Array with validated tracks (URIs present) | Array of vibe options with `track.uri` |
| `should handle empty Gemini response gracefully` | `getVibeOptions()` with empty Gemini response | Empty array `[]` | Empty array |
| `should handle missing API keys gracefully` | `getVibeOptions()` with no API keys | Empty array `[]` | Empty array |

**Integration Test (if API keys available):**
- **Input:** `getVibeOptions('happy upbeat music')` with real APIs
- **Expected:** Array of vibe options with validated Spotify URIs
- **Validates:** Gemini suggestions are actually validated against Spotify

---

### ValidatedQueueService.test.ts

**What is tested:**
- Track validation against Spotify search
- Scoring algorithm (exact match, similarity, alternate version penalties)
- Duplicate detection
- Low match score rejection

**How it's tested:**
- Mocks SpotifyRemoteService.search() for unit tests
- Uses real Spotify API for integration tests

**Input/Output:**

| Test Case | Input | Expected Output | Actual Output |
|-----------|-------|-----------------|---------------|
| `should return a valid track when an exact match is found` | `{ title: 'Bohemian Rhapsody', artist: 'Queen' }` | ValidatedTrack with URI | Track object with `uri: 'spotify:track:123'` |
| `should reject a track with a low match score` | `{ title: 'Bohemian Rhapsody', artist: 'Queen' }` with unrelated search result | `null` | `null` (score < 65) |
| `should penalize alternate versions when not requested` | `{ title: 'Shape of You', artist: 'Ed Sheeran' }` with only Live version available | `null` (score drops below threshold) | `null` (penalty applied) |
| `should accept alternate version if requested in title` | `{ title: 'Shape of You (Live)', artist: 'Ed Sheeran' }` | ValidatedTrack | Track object with URI |
| `should detect and reject duplicates` | Same track validated twice | First: ValidatedTrack, Second: `null` | First: Track, Second: `null` |

**Integration Test (if Spotify keys available):**
- **Input:** Real track suggestions validated against Spotify API
- **Expected:** Validated tracks with correct URIs
- **Validates:** Scoring algorithm works with real Spotify responses

---

### GeminiService.test.ts

**What is tested:**
- Concurrent request blocking
- Rate limiting retry logic (429, 5xx errors)
- Authentication error handling (401, 403)
- Network error handling
- Missing API key handling

**How it's tested:**
- Mocks axios and database service
- Simulates various error conditions

**Input/Output:**

| Test Case | Input | Expected Output | Actual Output |
|-----------|-------|-----------------|---------------|
| `should block concurrent requests` | Two simultaneous `makeRequest()` calls | First succeeds, second throws `'Concurrent Request Blocked'` | First: Response, Second: Error |
| `should retry on 429 rate limit errors` | Request that returns 429 then 200 | Response after retry | Response with 2 API calls |
| `should retry on 5xx server errors` | Request that returns 500 then 200 | Response after retry | Response with 2 API calls |
| `should handle invalid API key errors` | Request with 401 response | `{ text: null, error: defined }` | Error object returned |
| `should handle network connection errors` | Request with network error | `{ text: null, error: defined }` | Error object returned |

---

### SpotifyRemoteService.test.ts

**What is tested:**
- Authentication failure scenarios
- Token refresh logic
- Network error retry
- Auth lockout mechanism

**How it's tested:**
- Mocks axios and database service
- Simulates auth failures and network issues

**Input/Output:**

| Test Case | Input | Expected Output | Actual Output |
|-----------|-------|-----------------|---------------|
| `should handle missing access token` | `search()` with no token | Empty array `[]` (graceful handling) | Empty array |
| `should handle invalid client ID` | `search()` with invalid client ID | Auth marked as failed | Auth status shows failure |
| `should handle invalid grant (expired refresh token)` | Token refresh with expired refresh token | Token removed, auth failed | `removeServiceToken` called |
| `should retry on network errors` | Request with network error then success | Response after retry | Response with retry |
| `should refresh token on 401 and retry request` | Request with 401, then token refresh, then retry | Success after refresh | New token set, request succeeds |

---

## Integration Tests

### GeminiSpotifyIntegration.test.ts

**What is tested:**
- Complete Gemini → Spotify validation flow
- Track validation accuracy with real APIs
- Error handling with real API failures

**How it's tested:**
- **NO MOCKS** - Uses real Gemini and Spotify APIs
- Only mocks database for test setup

**Input/Output:**

| Test Case | Input | Expected Output | Actual Output |
|-----------|-------|-----------------|---------------|
| `should get vibe options from Gemini and validate them against Spotify` | `getVibeOptions('happy upbeat music')` | Array of options with validated URIs | Options with `track.uri` matching Spotify |
| `should handle backfill when initial suggestions fail validation` | `getVibeOptions('obscure experimental music')` | Options with validated tracks (backfill used) | Validated options (some may be backfilled) |
| `should ensure no duplicate tracks in results` | `getVibeOptions('pop music')` | Array with unique URIs | No duplicate URIs in results |
| `should validate a real track suggestion from Gemini` | Track from Gemini `getVibeOptions()` | ValidatedTrack with Spotify URI | Track with valid URI |
| `should reject tracks that score below threshold` | Non-existent track suggestion | `null` | `null` (no match found) |
| `should handle Gemini API errors gracefully` | Request with invalid API key | Empty array (no throw) | Empty array |
| `should handle Spotify API errors gracefully` | Validation with invalid token | `null` (no throw) | `null` |

---

### FullFlowIntegration.test.ts

**What is tested:**
- **Complete end-to-end flow** without any mocks
- Vibe selection → Playback → Queue verification → Skips
- Rescue vibe after 3 skips
- Runtime expectation tracking (saves expected vs actual)

**How it's tested:**
- **NO MOCKS** - All real APIs (Gemini, Spotify)
- Controls actual Spotify playback
- Verifies queue state matches expectations
- Saves all expectations at runtime for comparison

**Test Flow:**

#### Test 1: Full Flow - Vibe Selection → Playback → Queue → Skips

**Step-by-Step:**

1. **Get Vibe Options**
   - **Input:** `getVibeOptions('happy upbeat music')` → Real Gemini API call
   - **Expected:** Array of vibe options with validated tracks
   - **Actual:** Array from Gemini, validated against Spotify
   - **Saved Expectation:** `{ type: 'array', minLength: 1 }`

2. **Select Vibe Randomly**
   - **Input:** Random selection from vibe options
   - **Expected:** Vibe with valid `track.uri`, `track.title`, `track.artist`
   - **Actual:** Selected vibe object
   - **Saved Expectation:** `{ hasUri: true, hasTitle: true, hasArtist: true }`

3. **Expand Vibe**
   - **Input:** `expandVibe(seedTrack, vibeDescription)` → Real Gemini API call
   - **Expected:** Array of expanded tracks (10+ tracks)
   - **Actual:** Expanded track list from Gemini, validated against Spotify
   - **Saved Expectation:** `{ minTracks: 1 }`

4. **Play Vibe**
   - **Input:** `spotifyRemote.play(allUris)` → Real Spotify API call
   - **Expected:** All tracks queued, first track playing
   - **Actual:** Spotify playback state
   - **Saved Expectation:** First track URI matches seed track

5. **Verify First Song Playing**
   - **Input:** `getCurrentState()` → Real Spotify API call
   - **Expected:** `{ uri: seedTrack.uri, title: seedTrack.title }`
   - **Actual:** Current playing track from Spotify
   - **Saved Expectation:** URI and title match Gemini's first track

6. **Wait 60 Seconds & Verify**
   - **Input:** Sleep 60s, then `getCurrentState()`
   - **Expected:** Song still matches selected vibe
   - **Actual:** Current track after 60 seconds
   - **Saved Expectation:** `{ uri: seedTrack.uri, stillMatches: true }`

7. **Verify Queue Status**
   - **Input:** `getUserQueue()` → Real Spotify API call
   - **Expected:** Queue contains expanded vibe tracks
   - **Actual:** Spotify queue URIs
   - **Saved Expectation:** Queue URIs match expected vibe track URIs

8. **Test 3 Skips**
   - **Input:** 3x `spotifyRemote.next()` → Real Spotify API calls
   - **Expected:** Each skip changes track, next track is from vibe list
   - **Actual:** Track before/after each skip
   - **Saved Expectation:** For each skip: `{ changed: true, expectedNextUri: vibeTrack.uri }`

9. **Verify Final State**
   - **Input:** `getCurrentState()` after 3 skips
   - **Expected:** Valid playing state, track from vibe
   - **Actual:** Final Spotify playback state
   - **Saved Expectation:** `{ hasUri: true, inVibeList: true }`

**Output:**
- All expectations saved to `expectations` array
- Console log of all expectations with ✓/✗ status
- Test passes if critical expectations match

#### Test 2: Rescue Vibe After 3 Skips

**Step-by-Step:**

1. **Play Initial Vibe**
   - **Input:** Get vibe, expand, play
   - **Expected:** Vibe playing on Spotify
   - **Actual:** Spotify playback state

2. **Perform 3 Skips**
   - **Input:** 3x `spotifyRemote.next()` → Real Spotify API calls
   - **Expected:** Each skip changes track
   - **Actual:** Track state before/after each skip
   - **Saved:** Skip history with skipped track URIs

3. **Get Rescue Vibe**
   - **Input:** `getRescueVibe(recentSkips)` → Real Gemini API call
   - **Expected:** `{ items: [...], vibe: string, reasoning: string }`
   - **Actual:** Rescue vibe from Gemini, validated against Spotify
   - **Saved Expectation:** `{ hasResult: true, hasItems: true, minItems: 1 }`

4. **Play Rescue Vibe**
   - **Input:** `spotifyRemote.play(rescueUris)` → Real Spotify API call
   - **Expected:** Different track than skipped ones
   - **Actual:** Current playing track
   - **Saved Expectation:** `{ isDifferent: true }` (not in skipped URIs)

5. **Verify Queue**
   - **Input:** `getUserQueue()` → Real Spotify API call
   - **Expected:** Queue contains rescue vibe tracks
   - **Actual:** Spotify queue URIs
   - **Saved Expectation:** Queue URIs match rescue vibe tracks

**Output:**
- All expectations logged
- Verification that rescue vibe is different from skipped tracks
- Queue matches rescue vibe expectations

---

## Runtime Expectation Tracking

The `FullFlowIntegration.test.ts` test saves all expectations at runtime:

```typescript
interface TestExpectation {
    timestamp: number;        // When expectation was checked
    description: string;      // What was being tested
    expected: any;           // Expected value/logic
    actual: any;            // Actual value from API
    match: boolean;          // Whether they match
}
```

**Example Expectations Saved:**
- Gemini response structure
- Spotify track URIs
- Queue contents
- Skip behavior
- Rescue vibe generation

All expectations are logged at the end of the test for review.

---

## Test Configuration

### Environment Variables (.env.test)

| Variable | Required | Purpose |
|----------|----------|---------|
| `GEMINI_API_KEY` | Yes | Real Gemini API calls (validated before tests run) |
| `SPOTIFY_CLIENT_ID` | Yes | Spotify authentication |
| `SPOTIFY_ACCESS_TOKEN` | Yes | Spotify API calls (validated before tests run) |
| `SPOTIFY_REFRESH_TOKEN` | Optional | Auto-retrieved from database if missing |
| `SPOTIFY_REDIRECT_URI` | Optional | Default: `http://127.0.0.1:8081` |

### Jest Configuration

- **Setup Files:**
  - `jest-env-setup.js` - Loads `.env.test`
  - `jest-setup.js` - Mocks Expo modules

- **Test Timeouts:**
  - Unit tests: Default (5s)
  - Integration tests: 30s - 180s (depending on API calls)

---

## Key Testing Principles

1. **No Mocks in Integration Tests** - Real APIs only
2. **Runtime Validation** - Save expectations and compare with actual results
3. **Full Flow Testing** - Test complete user workflows
4. **Real Spotify Control** - Actually play tracks and verify queue
5. **Error Handling** - Test graceful degradation with real API failures
6. **API Key Validation** - Tests fail early if API keys in `.env.test` are invalid
7. **Wait for API Calls** - All API calls wrapped with `waitForApiCall()` to ensure completion before continuing
8. **Fail on Invalid Keys** - Tests fail immediately if API keys are wrong (not skipped)

---

## Troubleshooting

### Tests Skipped
- **Cause:** Missing API keys in `.env.test`
- **Solution:** Add valid API keys to `.env.test`

### Integration Tests Fail
- **Cause:** Invalid API keys or network issues
- **Solution:** Verify keys are valid, check network connection

### Tests Timeout
- **Cause:** API calls taking too long
- **Solution:** Increase timeout in test (e.g., `, 180000` for 3 minutes)

### Queue Verification Fails
- **Cause:** Spotify queue may not update immediately
- **Solution:** Tests include delays (sleep) to allow queue to settle
