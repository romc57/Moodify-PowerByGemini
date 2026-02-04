
const axios = require('axios');
require('dotenv').config({ path: '.env.test' });

const API_KEY = process.env.GEMINI_API_KEY;
// Using the endpoint from constants.ts for Gemini 2.5 Pro
const MODEL_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent';

const PROMPT = `JSON. 16 vibe options with POPULAR Spotify tracks.
H:None
Fav:Pop,Rock
Rules:diverse genres/eras,major artists,2-4 word vibe names,NEVER suggest songs from EXCLUDE list
{"options":[{"id":"v1","title":"Vibe Name","description":"mood","track":{"title":"Song","artist":"Artist"},"reason":"why"}]}`;

async function testWithSignature() {
    console.log('--- Testing WITH thoughtSignature (simulating persisted state) ---');
    try {
        const response = await axios.post(
            `${MODEL_URL}?key=${API_KEY}`,
            {
                contents: [{ parts: [{ text: PROMPT }] }],
                // Simulate a previous signature (dummy or from 3-pro)
                // Note: Real signatures are long strings, but even a dummy check catches field rejection
                thoughtSignature: "dummy_valid_looking_signature_from_previous_turn",
                generationConfig: { maxOutputTokens: 2000 }
            }
        );
        console.log('Success!', response.status);
    } catch (error) {
        console.error('Failed:', error.response ? error.response.data : error.message);
    }
}

async function testWithoutSignature() {
    console.log('\n--- Testing WITHOUT thoughtSignature ---');
    try {
        const response = await axios.post(
            `${MODEL_URL}?key=${API_KEY}`,
            {
                contents: [{ parts: [{ text: PROMPT }] }],
                generationConfig: { maxOutputTokens: 2000 }
            }
        );
        console.log('Success! Response received.');
        const text = response.data.candidates[0].content.parts[0].text;
        console.log('Preview:', text.substring(0, 100));
    } catch (error) {
        console.error('Failed:', error.response ? error.response.data : error.message);
    }
}

async function run() {
    if (!API_KEY) {
        console.error('No API Key found in .env.test');
        return;
    }
    await testWithSignature();
    await testWithoutSignature();
}

run();
