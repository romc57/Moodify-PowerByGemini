# Moodify: Implementation Summary

## 1. Architecture Overview
*   **Frontend (Mobile)**: React Native (Expo). Acts as the UI, Player, and Sensor Hub.
*   **Backend (Brain)**: Node.js (Express) + Vertex AI (Gemini Pro 3). Acts as the Intelligence Layer and Service Aggregator.
*   **Database**: Firestore (User Profiles, History, Baselines).

## 2. Mobile Implementation (React Native)
**Goal**: Unified codebase for iOS (HealthKit) and Android (Health Connect).

### A. Vitals Ingestion
*   **Libraries**:
    *   iOS: `react-native-health`
    *   Android: `react-native-health-connect`
*   **Data Points**:
    *   `HeartRate` (BPM): Measure of arousal.
    *   `HeartRateVariability` (SDNN/RMSSD): Measure of stress (Low HRV = High Stress).
    *   `Steps` / `ActivityStatus`: Context (Running vs. Sitting).
*   **Strategy**:
    *   **Buffer**: App collects samples locally (e.g., every 5s).
    *   **Sync**: Batched upload to Backend every 60s OR on "Track End".
    *   **Emergency**: Immediate upload if `HR > Threshold` AND `Activity == Still`.

### B. The Player & UI
*   **Player**: Controls remote playback via Spotify SDK / YouTube IFrame.
*   **Feedback**:
    *   **Explicit**: Thumbs Up/Down buttons.
    *   **Implicit**: "Skip" button (Negative reward).

## 3. Backend Implementation (Node.js)
**Goal**: Abstract content sources and run Gemini logic.

### A. Service Layer (The "Big API")
*   **Interface**: `IContentService`
    *   `recommend(userContext)`: Returns content based on mood.
    *   `getDetails(id)`: Returns metadata.
*   **Providers**:
    *   `SpotifyService`: Uses Web API for search/recommendations.
    *   `YouTubeService`: Uses Data API for video content.

### B. Gemini "DJ" Agent
*   **Input**:
    *   `CurrentVitals`: { hr: 85, hrv: 20, activity: "STILL" }
    *   `UserBaseline`: { restingHR: 60, stressHR: 90 }
    *   `History`: Last 3 tracks.
*   **Logic (Chain-of-Thought)**:
    1.  **Analyze**: "User is physically still but HR is elevated (85 vs 60). HRV is low. Conclusion: Acute Stress/Anxiety."
    2.  **Strategize**: "Goal is to lower HR. Current genre (Techno) is counter-productive. Switch to Ambient/Lo-Fi."
    3.  **Select**: Call `SpotifyService.search("Lo-Fi", target_tempo=60)`.

### C. The Feedback Loop
*   **Trigger**: Track ends.
*   **Action**: Compare `Vitals_Start` vs `Vitals_End`.
*   **Gemini Prompt**: "User listened to [Song A]. HR dropped by 5bpm. User did NOT skip. Rate this intervention."
*   **Update**: Save result to `UserHistory` to refine future prompts.

## 4. Development Roadmap
1.  **Setup**: Initialize React Native (Expo) and Node.js projects.
2.  **Mocking**: Create a "Vitals Simulator" in React Native to test Gemini logic without a physical watch.
3.  **Backend Core**: Implement `SpotifyService` and Gemini Client.
4.  **Integration**: Connect Mobile "Simulator" to Backend.
5.  **Real Sensors**: Replace Simulator with HealthKit/HealthConnect.
