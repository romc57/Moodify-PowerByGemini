# Bug Solved: Wrong Vibe/Song Selection

## The Issue
Users reported that selecting a vibe sometimes resulted in the playing of a "wrong song" (a track unrelated to the vibe) or the "wrong vibe" entirely.

## Root Cause
1.  **Blind Fallback Search**: In `index.tsx`, if the AI-suggested vibe option lacked a pre-validated Spotify URI, the app would perform a "blind" search using `spotifyRemote.search` and play the *first result* without verification. This meant if the search result was a cover, a remix, or an unrelated song with a similar title, it would play immediately.
2.  **Loose Validation**: `ValidatedQueueService` accepted "Live" or "Remix" versions too easily in some cases, even if the user didn't ask for them.

## The Fix
1.  **Removed Blind Fallback**: Modified `app/(tabs)/index.tsx` to **strictly require** a validated URI in the vibe option. If `option.track.uri` is missing, the app now alerts the user ("Song Not Found") instead of guessing.
2.  **Stricter Scoring**: Updated `ValidatedQueueService.ts` to apply a heavier penalty (-30 points) to "Live", "Remix", and other alternate versions if the original request didn't specify them.
3.  **Smart Backfill**: Logic was already in place but is now relied upon as the *only* source of truth.

## Verification
- **Unit Tests**: Added `ValidatedQueueService.test.ts` to verify that low-popularity or alternate version matches are rejected.
- **Manual Test**: Selected a vague vibe (e.g., "Obscure Indie") and confirmed that if Spotify couldn't find the exact match, it didn't play a random popular song instead.
