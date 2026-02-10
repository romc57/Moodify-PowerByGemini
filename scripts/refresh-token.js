#!/usr/bin/env node
/**
 * Get Spotify OAuth tokens and auto-save to .env.test
 * Uses port 9876 to avoid conflicts with Expo dev server on 8081.
 *
 * Usage:
 *   node scripts/refresh-token.js          # full OAuth flow, writes .env.test
 *   node scripts/refresh-token.js --refresh # refresh existing token only
 */
const http = require('http');
const https = require('https');
const { URL } = require('url');
const crypto = require('crypto');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

const ENV_PATH = path.resolve(__dirname, '..', '.env.test');
require('dotenv').config({ path: ENV_PATH });

const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const REFRESH_TOKEN = process.env.SPOTIFY_REFRESH_TOKEN;
const PORT = 9876;
const REDIRECT_URI = `http://127.0.0.1:${PORT}`;

function updateEnvFile(accessToken, refreshToken) {
    let content = fs.readFileSync(ENV_PATH, 'utf-8');
    content = content.replace(/SPOTIFY_ACCESS_TOKEN=.*/, 'SPOTIFY_ACCESS_TOKEN=' + accessToken);
    content = content.replace(/SPOTIFY_REFRESH_TOKEN=.*/, 'SPOTIFY_REFRESH_TOKEN=' + refreshToken);
    fs.writeFileSync(ENV_PATH, content);
    console.log('Saved tokens to .env.test');
}

// --refresh flag: just refresh using existing token
if (process.argv.includes('--refresh')) {
    if (!CLIENT_ID || !REFRESH_TOKEN) {
        console.error('Missing SPOTIFY_CLIENT_ID or SPOTIFY_REFRESH_TOKEN in .env.test');
        process.exit(1);
    }
    const params = new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: REFRESH_TOKEN,
        client_id: CLIENT_ID,
    });
    const options = {
        hostname: 'accounts.spotify.com', path: '/api/token', method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(params.toString()) }
    };
    const req = https.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
            if (res.statusCode === 200) {
                const t = JSON.parse(data);
                updateEnvFile(t.access_token, t.refresh_token || REFRESH_TOKEN);
                console.log('Token refreshed. Expires in', t.expires_in, 'seconds');
            } else {
                console.error('Refresh failed:', res.statusCode, data);
                console.error('\nRefresh token may be revoked. Run without --refresh for full OAuth flow.');
                process.exit(1);
            }
        });
    });
    req.on('error', e => { console.error(e); process.exit(1); });
    req.write(params.toString());
    req.end();
} else {
    // Full OAuth flow
    if (!CLIENT_ID || CLIENT_ID === 'your_spotify_client_id_here') {
        console.error('Error: SPOTIFY_CLIENT_ID not set in .env.test');
        process.exit(1);
    }

    const codeVerifier = crypto.randomBytes(32).toString('base64url');
    const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');

    const SCOPES = [
        'user-read-playback-state', 'user-modify-playback-state', 'user-read-currently-playing',
        'user-read-private', 'user-read-email', 'user-library-read', 'user-library-modify',
        'user-top-read', 'playlist-read-private', 'streaming'
    ].join(' ');

    const authUrl = new URL('https://accounts.spotify.com/authorize');
    authUrl.searchParams.set('client_id', CLIENT_ID);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
    authUrl.searchParams.set('scope', SCOPES);
    authUrl.searchParams.set('code_challenge_method', 'S256');
    authUrl.searchParams.set('code_challenge', codeChallenge);

    console.log('\n=== Spotify Token Helper (port ' + PORT + ') ===\n');

    function exchangeCode(code) {
        return new Promise((resolve, reject) => {
            const params = new URLSearchParams({
                client_id: CLIENT_ID, grant_type: 'authorization_code',
                code, redirect_uri: REDIRECT_URI, code_verifier: codeVerifier
            });
            const opts = {
                hostname: 'accounts.spotify.com', path: '/api/token', method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(params.toString()) }
            };
            const req = https.request(opts, (res) => {
                let d = '';
                res.on('data', c => d += c);
                res.on('end', () => res.statusCode === 200 ? resolve(JSON.parse(d)) : reject(new Error(d)));
            });
            req.on('error', reject);
            req.write(params.toString());
            req.end();
        });
    }

    const server = http.createServer(async (req, res) => {
        const url = new URL(req.url, `http://localhost:${PORT}`);
        if (url.pathname === '/') {
            const code = url.searchParams.get('code');
            const error = url.searchParams.get('error');
            if (error) { res.writeHead(400); res.end(error); server.close(); process.exit(1); }
            if (code) {
                try {
                    const tokens = await exchangeCode(code);
                    res.writeHead(200, { 'Content-Type': 'text/html' });
                    res.end('<h1>Success!</h1><p>Tokens saved to .env.test. You can close this window.</p>');
                    updateEnvFile(tokens.access_token, tokens.refresh_token);
                    console.log('Expires in:', tokens.expires_in, 'seconds');
                    server.close();
                    process.exit(0);
                } catch (err) {
                    res.writeHead(500); res.end(err.message);
                    console.error(err); server.close(); process.exit(1);
                }
            }
        }
        res.writeHead(404); res.end();
    });

    server.listen(PORT, () => {
        console.log('Listening on', REDIRECT_URI);
        console.log('\nOpen this URL in your browser:\n');
        console.log(authUrl.toString());
        console.log('');
        const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
        exec(`${cmd} "${authUrl.toString()}"`, () => {});
    });

    setTimeout(() => { console.log('Timeout after 5 min'); server.close(); process.exit(1); }, 300000);
}
