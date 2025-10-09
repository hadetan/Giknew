const { createBot, handleUpdate } = require('../bot');
let botInstance;

async function telegramWebhook(config, req, res) {
    try {
        if (!botInstance) {
            botInstance = createBot(config);
        }
        const update = req.body;

        const processing = handleUpdate(botInstance, update);

        const timeoutMs = 115000;
        const timeout = new Promise((resolve) => setTimeout(() => resolve('timeout'), timeoutMs));

        const result = await Promise.race([processing, timeout]);
        if (result === 'timeout') {
            console.warn('Telegram update processing timed out after', timeoutMs, 'ms');
            return res.status(200).json({ ok: true, warning: 'processing_timeout' });
        }

        return res.status(200).json({ ok: true });
    } catch (err) {
        console.error('telegram webhook error', err && err.stack ? err.stack : err);
        try { res.status(500).json({ ok: false, error: 'internal' }); } catch (_) { }
    }
}

module.exports = { telegramWebhook };
