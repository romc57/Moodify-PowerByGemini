export const GeminiPrompts = {
  /**
   * DJ Recommendation - Single seed track for Spotify Radio
   * Output: { reasoning, items: [{ type, title, artist, reason, query }] }
   */
  generateDJRecommendation: (
    recentHistory: any[],
    favorites: string[],
    skipRate: number,
    userInstruction: string,
    strategy: 'conservative' | 'exploratory' | 'refined' = 'conservative',
    triggerCount: number = 0
  ) => {
    const historyCompact = recentHistory.slice(0, 8).map((h: any) =>
      `${h.track_name}|${h.artist_name}|${h.skipped ? 'S' : 'P'}`
    ).join(';');

    const strategyHint = strategy === 'conservative' ? 'similar'
      : strategy === 'exploratory' ? 'new-genre-same-energy' : 'analyze-skips';

    return `JSON. 1 seed track for Spotify Radio.
H(already played):${historyCompact}
Skip/5m:${skipRate}|Fav:${favorites.slice(0, 5).join(',')}
Mode:${strategyHint}|${userInstruction || 'auto'}
Rules:NEVER suggest songs from H list,popular,no mega-hits
{"reasoning":"1 line","items":[{"type":"track","title":"X","artist":"Y","reason":"Z","query":"X Y"}]}`;
  },

  /**
   * Vibe Options - 16 distinct mood-based playlists with seed tracks
   * Request 16 to get 8+ after Spotify validation failures
   * Output: { options: [{ id, title, description, track: { title, artist }, reason }] }
   */
  generateVibeOptionsPrompt: (
    recentHistory: any[],
    favorites: string[],
    userInstruction: string,
    excludeTracks: string[] = []
  ) => {
    const historyCompact = recentHistory.length > 0
      ? recentHistory.slice(0, 8).map((h: any) => `${h.track_name}|${h.artist_name}`).join(';')
      : 'None';

    const favCompact = favorites.length > 0 ? favorites.slice(0, 5).join(';') : 'Any';
    const excludeCompact = excludeTracks.length > 0 ? excludeTracks.slice(0, 30).join(';') : 'None';

    return `JSON. 16 vibe options with POPULAR Spotify tracks.
H:${historyCompact}
Fav:${favCompact}
${userInstruction ? `Hint:${userInstruction}` : ''}
EXCLUDE(already played today):${excludeCompact}
Rules:diverse genres/eras,major artists,2-4 word vibe names,NEVER suggest songs from EXCLUDE list
{"options":[{"id":"v1","title":"Vibe Name","description":"mood","track":{"title":"Song","artist":"Artist"},"reason":"why"}]}`;
  },

  /**
   * Vibe Expansion - 15 tracks matching a seed track's vibe
   * Request 15 to get 10+ after validation
   * Output: { mood, items: [{ title, artist }] }
   */
  generateVibeExpansionPrompt: (
    seedTrack: { title: string; artist: string },
    recentHistory: any[],
    favorites: string[],
    excludeTracks: string[] = []
  ) => {
    const excludeCompact = excludeTracks.slice(0, 30).join(';');

    return `JSON. 15 tracks like: ${seedTrack.title}|${seedTrack.artist}
EXCLUDE(already played today):${excludeCompact}
Rules:match energy/mood,POPULAR on Spotify,major artists,no seed track,NEVER suggest songs from EXCLUDE list
{"mood":"vibe","items":[{"title":"X","artist":"Y"}]}`;
  },

  /**
   * Rescue Vibe - Emergency direction change after 3+ skips
   * Request 15 tracks to get 10+ after validation
   * Output: { vibe, why, items: [{ title, artist }] }
   */
  generateRescueVibePrompt: (
    recentSkips: any[],
    favorites: string[],
    excludeTracks: string[] = []
  ) => {
    const skipsCompact = recentSkips.slice(0, 5).map((s: any) =>
      `${s.track_name}|${s.artist_name}`
    ).join(';');

    const favCompact = favorites.slice(0, 5).join(';');
    const excludeCompact = excludeTracks.slice(0, 30).join(';');

    return `JSON. User skipping - change direction. 15 POPULAR Spotify tracks.
Skipped:${skipsCompact}
Fav:${favCompact}
EXCLUDE(already played today):${excludeCompact}
Rules:avoid similar to skipped,new genre/energy,major artists,NEVER suggest songs from EXCLUDE list
{"vibe":"2-4 words","why":"strategy","items":[{"title":"X","artist":"Y"}]}`;
  },

  /**
   * Mood Assessment - Analyze user's current listening mood
   * Output: { mood, mood_description, energy_level, recommended_direction }
   */
  generateMoodAssessmentPrompt: (
    currentTrack: { title: string; artist: string } | null,
    recentHistory: any[],
    userContext?: string
  ) => {
    const nowPlaying = currentTrack ? `${currentTrack.title}|${currentTrack.artist}` : 'none';
    const historyCompact = recentHistory.slice(0, 8).map((h: any) =>
      `${h.track_name}|${h.artist_name}`
    ).join(';');

    return `JSON. Assess listening mood.
Now:${nowPlaying}
H:${historyCompact}
${userContext ? `Ctx:${userContext}` : ''}
{"mood":"word","mood_description":"2-3 sentences","energy_level":"low|medium|high","recommended_direction":"keep_current|shift_energy|change_genre"}`;
  }
};
