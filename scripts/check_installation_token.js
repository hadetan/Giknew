#!/usr/bin/env node
const fetch = require('node-fetch');
const { loadConfig } = require('../src/config');
const { createAppJwt } = require('../src/github/auth');

async function main() {
    const installationId = process.argv[2] || process.env.INSTALLATION_ID;
    if (!installationId) {
        console.error('Usage: node scripts/check_installation_token.js <installation_id>');
        process.exit(2);
    }
    const config = loadConfig();
    const jwt = createAppJwt(config.github.appId, config.github.privateKey);
    const url = `https://api.github.com/app/installations/${installationId}/access_tokens`;
    console.log('Requesting installation token for', installationId);
    try {
        const resp = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${jwt}`, Accept: 'application/vnd.github+json' } });
        console.log('HTTP', resp.status, resp.statusText);
        const text = await resp.text();
        try { console.log('Response JSON:', JSON.parse(text)); } catch (_) { console.log('Response body:', text); }
        if (!resp.ok) process.exit(3);
    } catch (e) {
        console.error('Fetch failed:', e && e.message);
        process.exit(4);
    }
}

main();
