const express = require('express');
const { loadConfig } = require('./config');
const { logger } = require('./utils/logger');
const requestId = require('./middleware/requestId');
const buildHealthRoutes = require('./routes/healthRoutes');
const buildWebhookRoutes = require('./routes/webhookRoutes');
const buildJobRoutes = require('./routes/jobRoutes');

function rawBodySaver(req, _res, buf) { req.rawBody = buf; }

function createApp() {
    let config;
    try { config = loadConfig(); } catch (e) { console.error(e.message); process.exit(1); }

    const app = express();
    app.use(express.json({ verify: rawBodySaver }));
    app.use(requestId());
    app.use(buildHealthRoutes(config));
    app.use(buildWebhookRoutes(config));
    app.use(buildJobRoutes(config));
    app.use((err, req, res, next) => {
        logger.error({ err, requestId: req.requestId }, 'Unhandled error');
        res.status(500).json({ error: 'Internal error' });
    });

    return { app, config };
}

module.exports = { createApp };
