# Moodify - Powered by Gemini

**Moodify** is a premium, intelligent Spotify wrapper that enhances your listening experience using Google Gemini 3 Pro. It learns from your habits, understands your mood, and curates the perfect queue for you.

## 🚀 Features

- **Plug & Go**: Standard Spotify Login + API Key input. No complex server setup.
- **Smart Queuing**: Moodify listens with you. If you skip a few songs, Gemini intervenes to rescue the vibe.
- **Premium UI**: "Eye-popping" design with multiple themes (Black, Blue, Red, White, Green) and Dark/Light modes.
- **Privacy First**: User data and preferences are stored locally on your device.
- **Gemini Powered**: Uses advanced reasoning to select songs and radio stations based on your realtime context and listening history.

## 📚 Documentation
Everything about the project is documented here.

### [Spotify Endpoints](./SPOTIFY_ENDPOINTS.md)
A comprehensive list of the Spotify API endpoints used to power Moodify's player and data features.

## 🛠 Architecture

- **Frontend**: React Native (Expo) - Android, iOS, Web.
- **State Management**: Zustand.
- **Database**: SQLite (Local storage for preferences and history).
- **AI**: Google Gemini 3 Pro (via API).
- **Music Provider**: Spotify Web API.

### Project Structure
- **/services**: Core logic for Spotify, Gemini, and Database interactions.
- **/components**: Reusable UI components.
- **/app**: Expo Router based navigation.
- **/constants**: Theme definitions and config.

## 📦 Data & Privacy
Moodify uses an internal SQLite database to store:
- User Preferences (Themes, API Keys).
- Listening History & Favorites (Synced from Spotify).
- Gemini's reasoning history.

We **do not** rewrite the Spotify or Gemini APIs; we wrapper them efficiently to provide a superior user experience.

## 🔧 Setup

1.  **Clone the repository**.
2.  **Install dependencies**:
    ```bash
    npm install
    ```
3.  **Run the app**:
    ```bash
    npx expo start
    ```
4.  **Configure**:
    - Open the App.
    - Go to **Settings**.
    - Enter your **Spotify Client ID** and **Gemini API Token**.
    - Choose your Theme.
    - Start Listening!

## 🎨 Design

The UI is designed to be cleaner and more engaging than the standard Spotify app.
- **Player**: Focused on the music. Big visuals, easy controls.
- **Themes**: thorough theming support to match your device or mood.

---
*Created by the Google Deepmind team for Advanced Agentic Coding.*
