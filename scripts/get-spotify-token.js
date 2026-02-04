#!/usr/bin/env node
/**
 * Helper script to get Spotify OAuth tokens for testing
 *
 * Usage:
 *   node scripts/get-spotify-token.js
 *
 * This will start a local server and open the Spotify auth page.
 * After authorizing, you'll get tokens to paste into .env.test
 */

const http = require('http');
const https = require('https');
const { URL } = require('url');
const crypto = require('crypto');
const { exec } = require('child_process');

// Load from .env.test if available
require('dotenv').config({ path: '.env.test' });

const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const REDIRECT_URI = process.env.SPOTIFY_REDIRECT_URI || 'http://127.0.0.1:8081';
const PORT = new URL(REDIRECT_URI).port || 8081;

if (!CLIENT_ID || CLIENT_ID === 'your_spotify_client_id_here') {
    console.error('Error: SPOTIFY_CLIENT_ID not set in .env.test');
    console.error('Please add your Spotify Client ID from https://developer.spotify.com/dashboard');
    process.exit(1);
}

// PKCE code verifier and challenge
function generateCodeVerifier() {
    return crypto.randomBytes(32).toString('base64url');
}

function generateCodeChallenge(verifier) {
    return crypto.createHash('sha256').update(verifier).digest('base64url');
}

const codeVerifier = generateCodeVerifier();
const codeChallenge = generateCodeChallenge(codeVerifier);

// Scopes needed for playback control
const SCOPES = [
    'user-read-playback-state',
    'user-modify-playback-state',
    'user-read-currently-playing',
    'user-read-private',
    'user-read-email',
    'user-library-read',
    'user-library-modify',
    'user-top-read',
    'playlist-read-private',
    'streaming'
].join(' ');

const authUrl = new URL('https://accounts.spotify.com/authorize');
authUrl.searchParams.set('client_id', CLIENT_ID);
authUrl.searchParams.set('response_type', 'code');
authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
authUrl.searchParams.set('scope', SCOPES);
authUrl.searchParams.set('code_challenge_method', 'S256');
authUrl.searchParams.set('code_challenge', codeChallenge);

console.log('\n=== Spotify Token Helper ===\n');
console.log('Starting local server on port', PORT);
console.log('Opening Spotify authorization page...\n');

// Exchange code for tokens
function exchangeCodeForTokens(code) {
    return new Promise((resolve, reject) => {
        const params = new URLSearchParams({
            client_id: CLIENT_ID,
            grant_type: 'authorization_code',
            code: code,
            redirect_uri: REDIRECT_URI,
            code_verifier: codeVerifier
        });

        const options = {
            hostname: 'accounts.spotify.com',
            path: '/api/token',
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': Buffer.byteLength(params.toString())
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode === 200) {
                    resolve(JSON.parse(data));
                } else {
                    reject(new Error(`Token exchange failed: ${res.statusCode} - ${data}`));
                }
            });
        });

        req.on('error', reject);
        req.write(params.toString());
        req.end();
    });
}

// Start server to receive callback
const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${PORT}`);

    if (url.pathname === '/') {
        const code = url.searchParams.get('code');
        const error = url.searchParams.get('error');

        if (error) {
            res.writeHead(400, { 'Content-Type': 'text/html' });
            res.end(`<h1>Error</h1><p>${error}</p>`);
            console.error('Authorization error:', error);
            server.close();
            process.exit(1);
        }

        if (code) {
            try {
                const tokens = await exchangeCodeForTokens(code);

                res.writeHead(200, { 'Content-Type': 'text/html' });
                res.end(`
                    <h1>Success!</h1>
                    <p>Tokens received. Check your terminal for the values to add to .env.test</p>
                    <p>You can close this window.</p>
                `);

                console.log('\n=== SUCCESS! Add these to your .env.test file ===\n');
                console.log(`SPOTIFY_ACCESS_TOKEN=${tokens.access_token}`);
                console.log(`SPOTIFY_REFRESH_TOKEN=${tokens.refresh_token}`);
                console.log('\n=== Token Info ===');
                console.log(`Expires in: ${tokens.expires_in} seconds`);
                console.log(`Token type: ${tokens.token_type}`);
                console.log(`Scope: ${tokens.scope}`);
                console.log('\n');

                server.close();
                process.exit(0);
            } catch (err) {
                res.writeHead(500, { 'Content-Type': 'text/html' });
                res.end(`<h1>Error</h1><p>${err.message}</p>`);
                console.error('Token exchange error:', err);
                server.close();
                process.exit(1);
            }
        }
    }

    res.writeHead(404);
    res.end('Not found');
});

server.listen(PORT, () => {
    console.log(`Listening on ${REDIRECT_URI}`);
    console.log('\nIf browser doesn\'t open automatically, visit:');
    console.log(authUrl.toString());
    console.log('\n');

    // Try to open browser
    const openCommand = process.platform === 'darwin' ? 'open' :
                        process.platform === 'win32' ? 'start' : 'xdg-open';

    exec(`${openCommand} "${authUrl.toString()}"`, (err) => {
        if (err) {
            console.log('Could not open browser automatically.');
            console.log('Please open the URL above manually.');
        }
    });
});

// Timeout after 5 minutes
setTimeout(() => {
    console.log('\nTimeout: No callback received after 5 minutes');
    server.close();
    process.exit(1);
}, 5 * 60 * 1000);
