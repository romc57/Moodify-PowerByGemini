export const GeminiPrompts = {
  generateDJRecommendation: (
    recentHistory: any[],
    favorites: string[],
    skipRate: number,
    userInstruction: string,
    strategy: 'conservative' | 'exploratory' | 'refined' = 'conservative',
    triggerCount: number = 0
  ) => `
You are Moodify, an expert AI DJ. Respond with valid JSON only.

Analyze the listening session and recommend exactly 1 song for Spotify Radio seeding.

Strategy: ${strategy.toUpperCase()} (Trigger: ${triggerCount + 1})
${strategy === 'conservative'
      ? `Stay close to current style. Fresh but safe.`
      : strategy === 'exploratory'
        ? `Calculated risks. Same energy/mood, different genre/era.`
        : `Analyze skip patterns. Find the sweet spot.`}

Context:
Recent:
${recentHistory.map((h: any) => `- "${h.track_name}" by ${h.artist_name} [${h.skipped ? 'SKIP' : 'PLAY'}]`).join('\n')}

Stats: ${skipRate} skips/5min
Favorites: ${favorites.slice(0, 10).join(', ') || 'None'}
Request: ${userInstruction || 'Use patterns'}

Constraints:
1. Exact 1 track
2. NOT in Recent list
3. Moderate-high popularity
4. If skip_rate > 2, shift direction
5. No mega-hits, prefer deep cuts

Output JSON:
{
  "reasoning": "1-2 sentences",
  "items": [
    {
      "type": "track",
      "title": "Exact Title",
      "artist": "Primary Artist",
      "reason": "Why it fits",
      "query": "Title Artist"
    }
  ]
}`,

  generateVibeOptionsPrompt: (
    recentHistory: any[],
    favorites: string[],
    userInstruction: string,
    excludeTracks: string[] = []
  ) => {
    // Optimized: condensed format, fewer items (10 instead of 12), lean schema
    const excludeText = excludeTracks.length > 0
      ? `CRITICAL: DO NOT PLAY these songs (Heard Today): ${excludeTracks.slice(0, 50).join('; ')}`
      : 'None';

    const historySummary = recentHistory.slice(0, 10).map((h: any) =>
      `${h.track_name} - ${h.artist_name}`
    ).join('; ');

    return `
JSON only. 16 vibe options with seed tracks. Pick POPULAR tracks that exist on Spotify.

Recent: ${historySummary}
Faves: ${favorites.slice(0, 7).join('; ') || 'None'}
${userInstruction ? `Hint: ${userInstruction}` : ''}
${excludeText}

Rules: Diverse genres/eras. 2-4 word titles. Major label artists preferred. Include description.

{"options":[{"id":"v1","title":"Vibe Name","description":"Short mood description","track":{"title":"Song Title","artist":"Artist Name"},"reason":"Why"}]}`;
  },

  generateVibeExpansionPrompt: (
    seedTrack: { title: string; artist: string },
    recentHistory: any[],
    favorites: string[],
    excludeTracks: string[] = []
  ) => {
    // Optimized: minimal context, lean schema, emphasis on Spotify existence
    const excludeText = excludeTracks.length > 0
      ? `CRITICAL: DO NOT PLAY these songs (Heard Today): ${excludeTracks.slice(0, 50).join('; ')}`
      : 'None';

    return `
JSON only. 12 tracks matching vibe of: ${seedTrack.title} - ${seedTrack.artist}

${excludeText}

Rules: Match energy/mood. POPULAR tracks on Spotify. Major artists. No seed track.

{"mood":"short vibe description","items":[{"title":"Song","artist":"Artist"}]}`;
  },

  generateRescueVibePrompt: (
    recentSkips: any[],
    favorites: string[],
    excludeTracks: string[] = []
  ) => {
    // Optimized: condensed skip info, emphasis on direction change and Spotify existence
    const skipSummary = recentSkips.map((s: any) =>
      `${s.track_name} - ${s.artist_name}`
    ).join('; ');

    const excludeText = excludeTracks.length > 0
      ? `CRITICAL: DO NOT PLAY these songs (Heard Today): ${excludeTracks.slice(0, 50).join('; ')}`
      : 'None';

    return `
JSON only. User skipping these - change direction completely. 12 POPULAR tracks on Spotify.

Skipped: ${skipSummary}
Faves: ${favorites.slice(0, 7).join('; ')}
${excludeText}

Analyze skips → avoid similar. Pick NEW genre/energy. Major label artists.

{"vibe":"2-4 word name","why":"1 sentence strategy","items":[{"title":"Song","artist":"Artist"}]}`;
  },

  generateMoodAssessmentPrompt: (
    currentTrack: { title: string; artist: string } | null,
    recentHistory: any[],
    userContext?: string
  ) => {
    const trackInfo = currentTrack
      ? `Playing: "${currentTrack.title}" by ${currentTrack.artist}`
      : 'None';

    return `
You are Moodify. Assess the user's mood. Respond with valid JSON only.

Context:
${trackInfo}
Recent:
${recentHistory.slice(0, 10).map((h: any) => `- "${h.track_name}" by ${h.artist_name}`).join('\n')}
${userContext ? `User: ${userContext}` : ''}

Output JSON:
{
  "mood": "1 word (energetic, chill, etc)",
  "mood_description": "2-3 sentences",
  "energy_level": "low/medium/high",
  "recommended_direction": "keep_current/shift_energy/change_genre"
}`;
  }
};

