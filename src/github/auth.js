const jwt = require('jsonwebtoken');
const fetch = require('node-fetch');
const { logger } = require('../utils/logger');

function createAppJwt(appId, privateKey) {
    const now = Math.floor(Date.now() / 1000);
    const payload = {
        iat: now - 30,
        exp: now + 540,
        iss: appId
    };
    return jwt.sign(payload, privateKey, { algorithm: 'RS256' });
}

async function getInstallationToken(appConfig, installationId) {
    const jwtToken = createAppJwt(appConfig.appId, appConfig.privateKey);
    const url = `https://api.github.com/app/installations/${installationId}/access_tokens`;
    const resp = await fetch(url, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${jwtToken}`,
            Accept: 'application/vnd.github+json'
        }
    });
    if (!resp.ok) {
        const text = await resp.text();
        logger.error({ status: resp.status, text }, 'Failed to get installation token');
        throw new Error('installation_token_error');
    }
    const json = await resp.json();
    return { token: json.token, expiresAt: json.expires_at };
}

module.exports = { createAppJwt, getInstallationToken };
