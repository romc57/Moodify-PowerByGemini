# Spotify Web API Endpoints

This document outlines the Spotify Web API endpoints used by Moodify for playback control, user data retrieval, and playlist management.

## Base URL
`https://api.spotify.com/v1`

## 1. Player (Playback Control)
These endpoints are core to the "Wrapper" functionality, allowing Moodify to control the active Spotify session.

| Method | Endpoint | Description | Scope Required |
| :--- | :--- | :--- | :--- |
| `GET` | `/me/player` | Get information about the user's current playback state, including track, progress, and active device. | `user-read-playback-state` |
| `GET` | `/me/player/currently-playing` | Get the object currently being played on the user's Spotify account. | `user-read-currently-playing` |
| `GET` | `/me/player/devices` | Get information about a user’s available devices. | `user-read-playback-state` |
| `PUT` | `/me/player` | Transfer playback to a new device. | `user-modify-playback-state` |
| `PUT` | `/me/player/play` | Start a new context or resume current playback. | `user-modify-playback-state` |
| `PUT` | `/me/player/pause` | Pause playback on the user's account. | `user-modify-playback-state` |
| `POST` | `/me/player/next` | Skip to the next track in the user’s queue. | `user-modify-playback-state` |
| `POST` | `/me/player/previous` | Skip to the previous track in the user’s queue. | `user-modify-playback-state` |
| `PUT` | `/me/player/seek` | Seek to the given position in the user’s currently playing track. | `user-modify-playback-state` |
| `PUT` | `/me/player/repeat` | Set the repeat mode for the user's playback. | `user-modify-playback-state` |
| `PUT` | `/me/player/volume` | Set the volume for the user’s current playback device. | `user-modify-playback-state` |
| `POST` | `/me/player/queue` | Add an item to the end of the user's current playback queue. | `user-modify-playback-state` |

## 2. User Personalization & Profile
Used to gather data for the Gemini model to understand the user's taste.

| Method | Endpoint | Description | Scope Required |
| :--- | :--- | :--- | :--- |
| `GET` | `/me` | Get detailed profile information about the current user. | `user-read-private`, `user-read-email` |
| `GET` | `/me/top/artists` | Get the current user's top artists based on calculated affinity. | `user-top-read` |
| `GET` | `/me/top/tracks` | Get the current user's top tracks based on calculated affinity. | `user-top-read` |
| `GET` | `/me/following` | Get the current user's followed artists. | `user-follow-read` |
| `GET` | `/me/tracks` | Get a list of the songs saved in the current user's 'Your Music' library. | `user-library-read` |

## 3. Playlists
Used to read user playlists and create new "Moodify" generated queues/playlists.

| Method | Endpoint | Description | Scope Required |
| :--- | :--- | :--- | :--- |
| `GET` | `/me/playlists` | Get a list of the playlists owned or followed by the current user. | `playlist-read-private`, `playlist-read-collaborative` |
| `GET` | `/playlists/{playlist_id}` | Get a playlist owned by a Spotify user. | |
| `GET` | `/playlists/{playlist_id}/tracks` | Get full details of the items of a playlist owned by a Spotify user. | |
| `POST` | `/users/{user_id}/playlists` | Create a playlist for a Spotify user. | `playlist-modify-public`, `playlist-modify-private` |
| `POST` | `/playlists/{playlist_id}/tracks` | Add one or more items to a user's playlist. | `playlist-modify-public`, `playlist-modify-private` |

## 4. Search & Metadata
Used to resolve Gemini's text suggestions into playable Spotify URIs.

| Method | Endpoint | Description | Scope Required |
| :--- | :--- | :--- | :--- |
| `GET` | `/search` | Get Spotify Catalog information about albums, artists, playlists, tracks, shows, episodes or audiobooks that match a keyword string. | |
| `GET` | `/tracks/{id}` | Get Spotify catalog information for a single track identified by its unique Spotify ID. | |
| `GET` | `/audio-features/{id}` | Get audio features for a track (danceability, energy, tempo, etc.) - useful for Gemini context. | |
| `GET` | `/recommendations` | Recommendations based on seeds. Can be used in conjunction with Gemini. | |

## 5. Authentication Scopes
To ensure full functionality, the following scopes must be requested during user login:
- `user-read-private`
- `user-read-email`
- `user-read-playback-state`
- `user-modify-playback-state`
- `user-read-currently-playing`
- `user-top-read`
- `user-library-read`
- `playlist-read-private`
- `playlist-read-collaborative`
- `playlist-modify-public`
- `playlist-modify-private`
