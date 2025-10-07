const pino = require('pino');

const redact = {
  paths: ['*.token', '*.apiKey', '*.privateKey', '*.authorization', 'token', 'apiKey', 'privateKey'],
  censor: '[REDACTED]'
};

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  redact
});

module.exports = { logger };
