require('dotenv').config({ path: '.env.test' });
const axios = require('axios');

async function test() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        console.error('No GEMINI_API_KEY');
        return;
    }

    const prompt = `You are a music curator. JSON. 16 vibe options.
Ctx(History):None
Ctx(Taste Clusters):None
Fav:Any
Hint:happy upbeat music
EXCLUDE:None
Rules:
1. 4 'Familiar' from Taste Clusters.
2. 4 'Adjacent' (similar genre).
3. 8 'Discovery' (new).
4. Diverse genres.
5. NEVER suggest songs from EXCLUDE.
Output:{"options":[{"id":"v1","title":"Name","description":"Mood","track":{"t":"Title","a":"Artist"},"reason":"Why (Context)"}]}`;

    console.log('Prompt length:', prompt.length);
    console.log('Sending request...');

    try {
        const response = await axios.post(
            'https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-preview:generateContent?key=' + apiKey,
            {
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: {
                    responseMimeType: 'application/json',
                    maxOutputTokens: 4096,
                    temperature: 0.7
                }
            },
            { timeout: 60000 }
        );

        const text = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
        console.log('\nRaw response (first 2000 chars):');
        console.log(text?.substring(0, 2000));

        if (text) {
            try {
                const parsed = JSON.parse(text);
                console.log('\nParsed keys:', Object.keys(parsed));
                console.log('Options length:', parsed.options?.length || 'undefined');
                if (parsed.options && parsed.options.length > 0) {
                    console.log('First option:', JSON.stringify(parsed.options[0], null, 2));
                }
            } catch (e) {
                console.error('Parse error:', e.message);
            }
        }
    } catch (error) {
        console.error('API Error:', error.response?.data || error.message);
    }
}

test();
