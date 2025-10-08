const { Telegraf } = require('telegraf');
const { logger } = require('../utils/logger');
const { registerCommands } = require('./registerCommands');

const perUserInFlight = new Map();
let globalInFlight = 0;
const USER_MAX = 5;
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
            try {
                incUser(userId); tracked = true;
                const perUserCount = perUserInFlight.get(userId) || 0;
                if (perUserCount > USER_MAX) {
                    decUser(userId);
                    return ctx.reply('Too many concurrent requests for your user. Please wait.');
                }
                if (globalInFlight > GLOBAL_MAX) {
                    decUser(userId);
                    return ctx.reply('System is busy handling many requests. Try again shortly.');
                }
            } catch (_) { /* ignore */ }
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
