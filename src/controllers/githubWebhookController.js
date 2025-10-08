const { handleGithubEvent } = require('../github/webhookHandler');
const { logger } = require('../utils/logger');

async function githubWebhook(config, req, res) {
    try {
        await handleGithubEvent(req.body, req.headers, config);
        res.status(200).json({ ok: true });
    } catch (e) {
        logger.error({ err: e, requestId: req.requestId }, 'GitHub webhook error');
        res.status(500).json({ error: 'Webhook handling failed' });
    }
}

module.exports = { githubWebhook };
