require('dotenv').config();
const { createApp } = require('./app');
const { logger } = require('./utils/logger');
const { createBot } = require('./bot');

let botInstance;

async function launchBotWithResilience(config) {
    botInstance = createBot(config);
    const maxAttempts = 3;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            if (config.polling) {
                await botInstance.launch();
                logger.info({ mode: 'polling' }, 'Bot launched');
            } else if (config.appBaseUrl && config.autoSetWebhook) {
                const webhookUrl = `${config.appBaseUrl.replace(/\/$/, '')}/api/webhook/telegram`;
                await botInstance.telegram.deleteWebhook().catch(() => { });
                await botInstance.telegram.setWebhook(webhookUrl);
                logger.info({ webhookUrl, mode: 'webhook' }, 'Bot webhook configured');
            } else {
                logger.warn('Bot not started: enable TELEGRAM_POLLING=1 or set APP_BASE_URL & AUTO_SET_WEBHOOK=1');
            }
            return;
        } catch (err) {
            const isLast = attempt === maxAttempts;
            logger.error({ err, attempt }, 'Bot launch attempt failed');
            if (isLast) {
                logger.fatal('Bot failed to start after retries; continuing server without bot');
                return;
            }
            await new Promise(r => setTimeout(r, attempt * 1500));
        }
    }
}

const { app, config } = createApp();

process.on('unhandledRejection', (reason) => {
    logger.error({ err: reason }, 'unhandled_rejection');
});
process.on('uncaughtException', (err) => {
    logger.error({ err }, 'uncaught_exception');
});

if (require.main === module) {
    const port = process.env.PORT || 3000;
    app.listen(port, async () => {
        logger.info({ port }, 'Server listening');
        launchBotWithResilience(config);
    });
}

module.exports = { app, config };
