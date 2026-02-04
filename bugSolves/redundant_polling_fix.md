# Bug Solved: Redundant Polling & Gemini Config Issues

## The Issue
1.  **Redundant Polling**: The Home Screen (`index.tsx`) was running its own interval to fetch Spotify status every second, while `PlayerStore` also had logic (though unused by Home) for auto-syncing. This created potential for rate-limiting and race conditions where two different syncs could overwrite state.
2.  **API Config Error**: The `GeminiService` was sending a `thinking_level` parameter in its key validation check. This parameter is not supported for all models/modes in the v1beta API, potentially causing valid keys to fail validation with a `400 Invalid Argument` error.

## The Fix
1.  **Centralized Sync**: 
    - Refactored `app/(tabs)/index.tsx` to remove its local `setInterval`.
    - Updated `PlayerStore.ts` to track `progressMs` (playback progress) in its state.
    - Connected Home Screen to `PlayerStore`'s `startAutoSync` and `stopAutoSync` actions.
    - Now, only *one* interval runs (managed by the store), ensuring a single source of truth.
2.  **Cleaned Gemini Config**:
    - Removed the `thinking_level` parameter from the `validateKey` configuration in `GeminiService.ts`.

## Verification
-   **Manual**: verified that the progress bar on the Home Screen still updates smoothly.
-   **Manual**: Verified that switching screens stops the polling (via `stopAutoSync` on unmount), saving resources.
