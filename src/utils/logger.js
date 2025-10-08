const pino = require('pino');

const redact = {
    paths: ['*.token', '*.apiKey', '*.privateKey', '*.authorization', 'token', 'apiKey', 'privateKey'],
    censor: '[REDACTED]'
};

const baseLogger = pino({
    level: process.env.LOG_LEVEL || 'info',
    redact
});

function withContext(req, extras = {}) {
    const bindings = {};
    if (req?.requestId) bindings.requestId = req.requestId;
    if (req?.userId) bindings.userId = req.userId;
    return baseLogger.child({ ...bindings, ...extras });
}

module.exports = { logger: baseLogger, withContext };
