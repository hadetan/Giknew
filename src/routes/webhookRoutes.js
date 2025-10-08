const { Router } = require('express');
const { githubWebhook } = require('../controllers/githubWebhookController');
const { installCallback } = require('../controllers/installCallbackController');
const { telegramWebhook } = require('../controllers/telegramWebhookController');
const { verifyGithubSignature } = require('../github/verifySignature');

module.exports = function buildWebhookRoutes(config) {
    const r = Router();
    r.post('/webhook/github', verifyGithubSignature(config.github.webhookSecret), (req, res) => githubWebhook(config, req, res));
    r.post('/webhook/telegram', (req, res, next) => {
        const body = req.body;
        if (!body || typeof body !== 'object' || typeof body.update_id !== 'number') {
            return res.status(400).json({ ok: false, error: 'invalid_update_envelope' });
        }
        const allowedTopLevel = ['update_id', 'message', 'inline_query', 'edited_message', 'callback_query'];
        const extraKeys = Object.keys(body).filter(k => !allowedTopLevel.includes(k));
        if (extraKeys.length) {
            return res.status(400).json({ ok: false, error: 'unexpected_fields', fields: extraKeys });
        }
        next();
    }, (req, res) => telegramWebhook(config, req, res));
    r.get('/github/callback', (req, res) => installCallback(config, req, res));
    return r;
};
