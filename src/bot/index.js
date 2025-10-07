const { Telegraf } = require('telegraf');
const { logger } = require('../utils/logger');
const { registerCommands } = require('./registerCommands');

function createBot(config) {
  const bot = new Telegraf(config.telegramToken, { handlerTimeout: 30_000 });
  registerCommands(bot, config);
  return bot;
}

async function handleUpdate(bot, update, res) {
  try {
    await bot.handleUpdate(update, res);
  } catch (err) {
    logger.error({ err }, 'Telegram update handling failed');
  }
}

module.exports = { createBot, handleUpdate };
