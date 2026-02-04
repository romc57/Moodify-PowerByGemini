// jest-env-setup.js
// Load .env.test file for test environment variables
const path = require('path');
const result = require('dotenv').config({ path: path.resolve(process.cwd(), '.env.test') });

if (result.error) {
    console.warn('[jest-env-setup] Warning: Could not load .env.test file:', result.error.message);
    console.warn('[jest-env-setup] Make sure .env.test exists in the project root');
} else {
    console.log('[jest-env-setup] Loaded .env.test file');
    // Log which keys are present (but not their values)
    const keys = Object.keys(result.parsed || {});
    console.log(`[jest-env-setup] Found ${keys.length} environment variables in .env.test`);
}
