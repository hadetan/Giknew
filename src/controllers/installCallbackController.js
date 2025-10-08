const { findByState, consumeState } = require('../repositories/linkStateRepo');
const { addInstallation } = require('../repositories/installationRepo');
const { markLinked } = require('../repositories/userRepo');
const { createAppJwt } = require('../github/auth');
const prisma = require('../lib/prisma');
const fetch = require('node-fetch');
const crypto = require('crypto');

function hashGithubAccountId(accountId, salt) {
    return crypto.createHash('sha256').update(String(accountId) + ':' + salt).digest('hex');
}

async function installCallback(config, req, res) {
    const { state, installation_id } = req.query;
    console.debug('installCallback called', { state: !!state, installation_id: !!installation_id });
    if (!state || !installation_id) return res.status(400).send('Missing state or installation_id');
    const row = await findByState(state);
    if (!row) {
        console.warn('installCallback: state not found', { state });
        return res.status(400).send('Invalid state');
    }
    if (row.consumed) {
        console.warn('installCallback: state already consumed', { state });
        return res.status(400).send('State already consumed');
    }
    try {
        const added = await addInstallation(row.userId, installation_id);
        console.debug('installCallback: installation added', { installationRecordId: added && added.id });
        await markLinked(row.userId, true);
        try { await consumeState(state); } catch (e) { console.debug('installCallback: consumeState non-fatal', e && e.message); }
        try {
            const jwt = createAppJwt(config.github.appId, config.github.privateKey);
            const instResp = await fetch(`https://api.github.com/app/installations/${installation_id}`, { headers: { Authorization: `Bearer ${jwt}`, Accept: 'application/vnd.github+json' } });
            if (instResp.ok) {
                const instJson = await instResp.json();
                const accountId = instJson.account?.id;
                if (accountId) {
                    const user = await prisma.user.findUnique({ where: { id: row.userId } });
                    if (user && user.githubUserHash.startsWith('tg_')) {
                        const hashed = hashGithubAccountId(accountId, config.security.githubUserSalt);
                        await prisma.user.update({ where: { id: row.userId }, data: { githubUserHash: hashed } });
                    }
                }
            }
        } catch (e) {
            console.debug('installCallback: github fetch failed', e && e.message);
        }
    } catch (e) {
        console.error('installCallback failure', e);
        return res.status(500).send('Link failure');
    }
    res.send('GitHub App linked. You can return to Telegram.');
}

module.exports = { installCallback };