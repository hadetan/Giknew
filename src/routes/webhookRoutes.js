const { Router } = require('express');
const { githubWebhook } = require('../controllers/githubWebhookController');
const { telegramWebhook } = require('../controllers/telegramWebhookController');
const { verifyGithubSignature } = require('../github/verifySignature');

module.exports = function buildWebhookRoutes(config) {
  const r = Router();
  r.post('/webhook/github', verifyGithubSignature(config.github.webhookSecret), (req, res) => githubWebhook(config, req, res));
  r.post('/webhook/telegram', (req, res) => telegramWebhook(config, req, res));
  return r;
};
