const { createBot, handleUpdate } = require('../bot');
let botInstance;

async function telegramWebhook(config, req, res) {
  if (!botInstance) {
    botInstance = createBot(config);
  }
  const update = req.body;
  await handleUpdate(botInstance, update, res);
  if (!res.headersSent) {
    res.status(200).json({ ok: true });
  }
}

module.exports = { telegramWebhook };
