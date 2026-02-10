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
    const safeHistory = recentHistory || [];
    const safeFavorites = favorites || [];

    const historyCompact = safeHistory.slice(0, 8).map((h: any) =>
      `${h.track_name}|${h.artist_name}|${h.skipped ? 'S' : 'P'}`
    ).join(';');

    const strategyHint = strategy === 'conservative' ? 'similar'
      : strategy === 'exploratory' ? 'new-genre-same-energy' : 'analyze-skips';

    return `You are an expert music DJ. JSON. 1 seed track for Spotify Radio.
H(already played):${historyCompact}
Skip/5m:${skipRate}|Fav:${safeFavorites.slice(0, 5).join(',')}
Mode:${strategyHint}|${userInstruction || 'auto'}
Rules:NEVER suggest songs from H list,popular,no mega-hits
{"reasoning":"1 line","items":[{"type":"track","title":"X","artist":"Y","reason":"Z","query":"X Y"}]}`;
  },

  /**
   * Vibe Options - 16 distinct mood-based playlists with seed tracks
   * Request 16 to get 8+ after Spotify validation failures
   * Output: { options: [{ id, title, description, track: { t, a }, reason }] }
   */
  generateVibeOptionsPrompt: (
    recentHistory: { track_name: string; artist_name: string }[],
    clusterReps: { name: string; artist: string }[],
    favorites: string[],
    userInstruction: string,
    excludeTracks: string[] = []
  ) => {
    const safeHistory = recentHistory || [];
    const safeClusters = clusterReps || [];
    const safeFavorites = favorites || [];
    const safeExclude = excludeTracks || [];

    const historyCompact = safeHistory.length > 0
      ? safeHistory.map(h => `${h.track_name}|${h.artist_name}`).join(';')
      : 'None';

    const clustersCompact = safeClusters.length > 0
      ? safeClusters.map(c => `${c.name}|${c.artist}`).join(';')
      : 'None';

    const favCompact = safeFavorites.length > 0 ? safeFavorites.slice(0, 8).join(';') : 'Any';
    const excludeCompact = safeExclude.length > 0 ? safeExclude.slice(0, 50).join(';') : 'None';

    const prompt = `You are a music curator. JSON. 16 vibe options.
Ctx(History):${historyCompact}
Ctx(Taste Clusters):${clustersCompact}
Fav:${favCompact}
${userInstruction ? `Hint:${userInstruction}` : ''}
EXCLUDE:${excludeCompact}
Rules:
1. 4 'Familiar' from Taste Clusters.
2. 4 'Adjacent' (similar genre).
3. 8 'Discovery' (new).
4. Diverse genres.
5. NEVER suggest songs from EXCLUDE.
Output:{"options":[{"id":"v1","title":"Name","description":"Mood","track":{"t":"Title","a":"Artist"},"reason":"Why (Context)"}]}`;

    return prompt;
  },

  /**
   * Vibe Expansion - 5 "Discovery" tracks matching seed
   * Hybrid Strategy: We mix these with Graph Neighbors later.
   * Output: { mood, items: [{ t, a }] }
   */
  generateVibeExpansionPrompt: (
    seedTrack: { title: string; artist: string },
    recentHistory: any[],
    neighbors: { name: string; artist: string }[],
    favorites: string[],
    excludeTracks: string[] = []
  ) => {
    const safeExclude = excludeTracks || [];
    const safeNeighbors = neighbors || [];
    const safeHistory = recentHistory || [];
    const safeFavorites = favorites || [];

    const excludeCompact = safeExclude.slice(0, 50).join(';');
    const neighborsCompact = safeNeighbors.slice(0, 10).map(n => `${n.name}|${n.artist}`).join(';');
    // Minimal history context
    const historyCompact = safeHistory.slice(0, 5).map(h => `${h.track_name}|${h.artist_name}`).join(';');

    return `Curator. JSON. 5 DISTINCT tracks like: ${seedTrack.title}|${seedTrack.artist}
Ctx(Neighbors-Avoid):${neighborsCompact}
Ctx(History):${historyCompact}
Fav:${safeFavorites.slice(0, 5).join(';')}
EXCLUDE:${excludeCompact}
Rules:
1. Suggest 5 'Discovery' songs (NOT in Neighbors).
2. Allow 'Fav' if not played recently.
3. Match energy/mood.
4. Minimal JSON keys (t=title, a=artist).
Output:{"mood":"vibe","items":[{"t":"Title","a":"Artist"}]}`;
  },

  /**
   * Rescue Vibe - Emergency change
   * Output: { vibe, why, items: [{ t, a }] }
   */
  generateRescueVibePrompt: (
    recentSkips: any[],
    favorites: string[],
    excludeTracks: string[] = []
  ) => {
    const safeSkips = recentSkips || [];
    const safeFavorites = favorites || [];
    const safeExclude = excludeTracks || [];

    const skipsCompact = safeSkips.slice(0, 5).map((s: any) => `${s.track_name}|${s.artist_name}`).join(';');
    const favCompact = safeFavorites.slice(0, 5).join(';');
    const excludeCompact = safeExclude.slice(0, 50).join(';');

    return `Adaptive DJ. JSON. User skipping - change direction. 10 tracks.
Skipped:${skipsCompact}
Fav:${favCompact}
EXCLUDE:${excludeCompact}
Rules:avoid similar to skipped,new genre,minimal JSON.
Output:{"vibe":"Name","why":"Reason","items":[{"t":"Title","a":"Artist"}]}`;
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
    const safeHistory = recentHistory || [];

    const nowPlaying = currentTrack ? `${currentTrack.title}|${currentTrack.artist}` : 'none';
    const historyCompact = safeHistory.slice(0, 8).map((h: any) =>
      `${h.track_name}|${h.artist_name}`
    ).join(';');

    return `You are a music analyst. JSON. Assess listening mood.
Now:${nowPlaying}
H:${historyCompact}
${userContext ? `Ctx:${userContext}` : ''}
{"mood":"word","mood_description":"2-3 sentences","energy_level":"low|medium|high","recommended_direction":"keep_current|shift_energy|change_genre"}`;
  }
};
