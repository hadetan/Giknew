const { Telegraf } = require('telegraf');
const { logger } = require('../utils/logger');
const { registerCommands } = require('./registerCommands');

const perUserInFlight = new Map();
let globalInFlight = 0;
const USER_MAX = 5; // placeholder; will enforce in performance guard task
const GLOBAL_MAX = 25;

function incUser(userId) {
    const cur = perUserInFlight.get(userId) || 0;
    perUserInFlight.set(userId, cur + 1);
    globalInFlight++;
}
function decUser(userId) {
    const cur = perUserInFlight.get(userId) || 1;
    if (cur <= 1) perUserInFlight.delete(userId); else perUserInFlight.set(userId, cur - 1);
    globalInFlight = Math.max(0, globalInFlight - 1);
}

function createBot(config) {
    const bot = new Telegraf(config.telegramToken, { handlerTimeout: 30_000 });

    bot.catch((err, ctx) => {
        logger.error({ err }, 'telegraf_uncaught');
        try { ctx.reply('Internal error handling that update. Please retry.'); } catch (_) { }
    });

    bot.use(async (ctx, next) => {
        const userId = ctx.from?.id;
        let tracked = false;
        if (userId) {
            try { incUser(userId); tracked = true; } catch (_) { }
        }
        try {
            await next();
        } finally {
            if (tracked) decUser(userId);
        }
    });

    registerCommands(bot, config);
    bot._concurrencyStats = () => ({ perUserInFlight: perUserInFlight.size, globalInFlight });
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
