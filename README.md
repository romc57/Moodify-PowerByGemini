# Moodify - AI Powered Music Therapy

Moodify is a mobile application that uses **Generative AI (Gemini)** and **Biofeedback (Vitals)** to recommend music that improves your mood and lowers stress. 

Built with **React Native (Expo)**, it features a modular Service Architecture and a "Vitals Simulator" to mimic smartwatch logical integration.

## 🚀 Features

- **AI Recommendation Engine**: Uses Google Gemini 1.5 Pro to analyze your biometrics and suggest specific tracks/genres.
- **Vitals Simulator**: A built-in DevTool to manually control "Heart Rate" and "Stress Level" to test the app's reactive logic without physical hardware.
- **Service Hub**: Plug-and-play architecture for music providers (Spotify implemented).
- **Secure Architecture**: Client-side only. API Keys are stored securely in the device's hardware-backed Keystore/Keychain.
- **Privacy First**: All history and health data is stored locally (`SQLite`).

## 🛠️ Project Structure

```
moodify-mobile/
├── App.js                # Entry point
├── components/           # UI Components
│   ├── dashboard/        # Home screen & Vitals Card
│   └── SettingsScreen.tsx # API Key management
├── services/             # Logic Layer
│   ├── ServiceRegistry.ts # Manager for Spotify/YouTube etc.
│   ├── gemini/           # AI Prompting & API Wrapper
│   └── spotify/          # Spotify OAuth & Web API
└── vitals/               # Biofeedback Layer
    ├── VitalsStore.ts    # Global State (Zustand)
    └── providers/        # Mock & Real implementations
```

## ⚡ Setup & Installation

### Prerequisites
- Node.js (v18+)
- Android Studio (for Emulator) or a Physical Android Device.
- **Gemini API Key** (Get one from [Google AI Studio](https://aistudio.google.com/)).

### Installation
1.  **Navigate to the project directory**:
    ```bash
    cd moodify-mobile
    ```

2.  **Install Dependencies**:
    ```bash
    npm install
    ```

3.  **Configure Environment**:
    - Ensure your `ANDROID_HOME` is set (e.g., `/home/user/Android/Sdk`).
    - Java 17 is recommended.

## 📱 Running the App

### Android (Physical Device or Emulator)
```bash
npx expo run:android --device
```
*Note: This usually builds the native android folder. If you encounter errors, try `npx expo prebuild --clean` first.*

### iOS
```bash
npx expo run:ios
```
*(Requires macOS)*

## 🧪 How to Use

1.  **Set API Key**:
    - Launch the app.
    - Go to **Settings** Tab.
    - Enter your Gemini API Key and tap **Save**.
2.  **Simulate Vitals**:
    - Go to **Home** Tab.
    - Toggle **Monitoring Active** to ON.
    - Use the sliders to increase "Heart Rate".
    - Watch the app react (Notification/Recommendation logic coming soon).

## 🔧 Troubleshooting


## 🔒 Security

- **API Keys**: We use `expo-secure-store`. Keys are never committed to the repo.
- **Auth**: Spotify uses PKCE flow (Client ID only), so no Client Secrets are hardcoded.
