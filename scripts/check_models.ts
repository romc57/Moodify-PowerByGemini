
const axios = require('axios');

const API_KEY = 'AIzaSyDhdmfftnjz-SGJy8a-QhxIOlGTSgEhPVA';

const MODELS_TO_TEST = [
    // Current Configurations
    {
        name: 'CURRENT: Gemini 3 Pro (Preview)',
        url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-preview:generateContent'
    },
    {
        name: 'CURRENT: Gemini 2.5 Pro (Old Preview)',
        url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro-preview-06-05:generateContent'
    },
    {
        name: 'CURRENT: Gemini 2.0 Flash',
        url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent'
    },

    // Proper Stable Candidates?
    {
        name: 'CANDIDATE: Gemini 2.5 Pro (Stable)',
        url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent'
    },
    {
        name: 'CANDIDATE: Gemini 2.5 Flash',
        url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent'
    },

    // Other potential variations
    {
        name: 'CANDIDATE: Gemini 1.5 Flash',
        url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent'
    }
];

async function testModel(model) {
    const start = Date.now();
    try {
        const response = await axios.post(
            `${model.url}?key=${API_KEY}`,
            {
                contents: [{ parts: [{ text: 'Hello' }] }],
                generationConfig: { maxOutputTokens: 10 }
            },
            { timeout: 10000 }
        );
        const latency = Date.now() - start;
        console.log(`[PASS] ${model.name} (${latency}ms) - Status: ${response.status}`);
        return true;
    } catch (error) {
        const latency = Date.now() - start;
        const status = error.response ? error.response.status : 'N/A';
        const msg = error.response?.data?.error?.message || error.message;
        console.log(`[FAIL] ${model.name} (${latency}ms) - Status: ${status} - Error: ${msg}`);
        return false;
    }
}

async function run() {
    console.log('Starting Gemini Model Verification...');
    console.log('----------------------------------------');

    for (const model of MODELS_TO_TEST) {
        await testModel(model);
    }

    console.log('----------------------------------------');
    console.log('Verification Complete.');
}

run();
