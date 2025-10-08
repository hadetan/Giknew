const { logger } = require('../utils/logger');
const { findByTelegramId, createOrGet, updateMode } = require('../repositories/userRepo');
const { runAsk } = require('../ai/askOrchestrator');

function registerCommands(bot, config) {
    bot.start(async (ctx) => {
        await ensureUser(ctx);
        return ctx.reply('Hi! I can notify you about GitHub PR activity and answer questions about your work. Use /linkgithub to connect. /help for commands.');
    });

    bot.help(async (ctx) => {
        ctx.reply('/start - intro\n/linkgithub - connect your GitHub (coming soon)\n/unlink - remove GitHub link\n/mode fast|thinking - switch model\n/ask <question> - ask about your repos\n');
    });

    bot.command('mode', async (ctx) => {
        const parts = ctx.message.text.trim().split(/\s+/);
        const mode = parts[1];
        if (!['fast', 'thinking'].includes(mode)) {
            return ctx.reply('Usage: /mode fast|thinking');
        }
        const user = await ensureUser(ctx);
        await updateMode(user.id, mode);
        ctx.reply(`Mode updated to ${mode}`);
    });

    bot.command('ask', async (ctx) => {
        const text = ctx.message.text.replace(/^\/ask\s*/, '');
        if (!text) return ctx.reply('Provide a question: /ask <question>');
        const user = await ensureUser(ctx);
        const { acquire } = require('../ai/aiConcurrency');
        const lock = acquire(user.id);
        if (!lock.ok) {
            const msg = lock.reason === 'user_limit'
                ? 'You have too many active AI requests. Wait for one to finish.'
                : 'System is busy with many users. Please retry shortly.';
            return ctx.reply(msg);
        }
        const threadRootId = ctx.message.reply_to_message ? ctx.message.reply_to_message.message_id : ctx.message.message_id;
        const start = Date.now();
        let thinkingMsg;
        let upgraded = false;
        try {
            thinkingMsg = await ctx.reply('Thinking...');
        } catch (_) { }

        const timer = setTimeout(async () => {
            if (!thinkingMsg) return;
            try {
                await ctx.telegram.editMessageText(thinkingMsg.chat.id, thinkingMsg.message_id, undefined, 'Summarizing...');
                upgraded = true;
            } catch (_) { }
        }, 5000);

        const useStreaming = config.streamingEnabled;
        let streamingActive = false;
        let typingActive = true;
        const typingLoop = async () => {
            while (typingActive) {
                try { await ctx.telegram.sendChatAction(ctx.chat.id, 'typing'); } catch (_) {}
                await new Promise(r => setTimeout(r, 4000));
            }
        };
        typingLoop();
        try {
            const runPromise = runAsk({
                config,
                user,
                question: text,
                mode: user.mode,
                stream: useStreaming,
                threadRootId,
                sendStreaming: async (full) => {
                    if (!thinkingMsg) return;
                    streamingActive = true;
                    try {
                        await ctx.telegram.editMessageText(thinkingMsg.chat.id, thinkingMsg.message_id, undefined, (upgraded ? 'Summarizing...\n\n' : '') + full.slice(0, 3900));
                    } catch (_) { /* swallow edit rate errors */ }
                }
            });

            const timeoutPromise = new Promise((resolve) => setTimeout(() => resolve({ text: 'Request exceeded time limit. Try refining your question.' }), 25000));
            const { text: answer } = await Promise.race([runPromise, timeoutPromise]);
            clearTimeout(timer);
            const finalText = answer && answer.trim().length ? answer : '(no answer)';
            if (thinkingMsg) {
                try {
                    await ctx.telegram.editMessageText(thinkingMsg.chat.id, thinkingMsg.message_id, undefined, finalText);
                } catch (_) {
                    await ctx.reply(finalText);
                }
            } else {
                await ctx.reply(finalText);
            }
        } catch (e) {
            clearTimeout(timer);
            logger.error({ err: e }, 'ask_failed');
            const errText = /timeout/i.test(e.message||'') ? 'LongCat timed out preparing an answer. Try again shortly.' : 'Error answering your question.';
            if (thinkingMsg) {
                try { await ctx.telegram.editMessageText(thinkingMsg.chat.id, thinkingMsg.message_id, undefined, errText); } catch (_) { await ctx.reply(errText); }
            } else {
                await ctx.reply(errText);
            }
        } finally {
            typingActive = false;
            if (lock && lock.release) lock.release();
            const latency = Date.now() - start;
            logger.info({ latencyMs: latency, upgraded, streaming: useStreaming, streamingActive }, 'ask_user_command_complete');
        }
    });

    bot.command('linkgithub', async (ctx) => {
        const user = await ensureUser(ctx);
        const { createState } = require('../repositories/linkStateRepo');
        const state = await createState(user.id);
        const appSlug = process.env.GITHUB_APP_SLUG;
        const baseUrl = process.env.APP_BASE_URL || 'http://localhost:3000';
        if (appSlug) {
            const redirect = encodeURIComponent(`${baseUrl}/github/install/callback`);
            const url = `https://github.com/apps/${appSlug}/installations/new?state=${state}&redirect_url=${redirect}`;
            ctx.reply(`Tap to install the GitHub App and finish linking:\n${url}`);
        } else {
            ctx.reply('Missing GITHUB_APP_SLUG env. Provide slug then rerun /linkgithub. State: ' + state);
        }
    });

    bot.command('unlink', async (ctx) => {
        const user = await ensureUser(ctx);
        const { getInstallationsForUser, removeInstallation } = require('../repositories/installationRepo');
        const { markLinked } = require('../repositories/userRepo');
        const installs = await getInstallationsForUser(user.id);
        for (const inst of installs) {
            try { await removeInstallation(inst.installationId); } catch (_) { }
        }
        await markLinked(user.id, false);
        ctx.reply('GitHub link removed locally. You may also uninstall the App from GitHub settings.');
    });

    bot.command('exportmeta', async (ctx) => {
        const user = await ensureUser(ctx);
        const prisma = require('../lib/prisma');
        const installations = await prisma.installation.findMany({ where: { userId: user.id } });
        const contextCount = await prisma.contextMessage.count({ where: { userId: user.id } });
        const staleCount = await prisma.stalePrState.count({ where: { userId: user.id } });
        const notifCount = await prisma.notificationLog.count({ where: { userId: user.id } });
        const linked = user.linked;
        const meta = {
            telegramId: user.telegramId.toString(),
            linked,
            mode: user.mode,
            installations: installations.map(i => i.installationId.toString()),
            counts: { contextMessages: contextCount, stalePrTracked: staleCount, notifications: notifCount }
        };
        const json = JSON.stringify(meta, null, 2);
        if (json.length < 3800) {
            await ctx.reply('Export (metadata):\n```\n' + json + '\n```');
        } else {
            await ctx.reply('Export too large; counts only:\n' + JSON.stringify(meta.counts));
        }
    });

    bot.command('purge', async (ctx) => {
        const user = await ensureUser(ctx);
        const prisma = require('../lib/prisma');
        await prisma.contextMessage.deleteMany({ where: { userId: user.id } });
        await prisma.notificationLog.deleteMany({ where: { userId: user.id } });
        await prisma.stalePrState.deleteMany({ where: { userId: user.id } });
        await prisma.linkState.deleteMany({ where: { userId: user.id } });
        const installs = await prisma.installation.findMany({ where: { userId: user.id } });
        for (const inst of installs) {
            await prisma.secret.deleteMany({ where: { installationId: inst.id } });
            try { await prisma.installation.delete({ where: { id: inst.id } }); } catch (_) {}
        }
        await prisma.user.update({ where: { id: user.id }, data: { githubUserHash: 'purged', linked: false, mode: 'fast' } });
        await ctx.reply('Your data has been purged (metadata anonymized).');
    });

    bot.command('isolationdiag', async (ctx) => {
        const user = await ensureUser(ctx);
        const prisma = require('../lib/prisma');
        const installs = await prisma.installation.findMany({ where: { userId: user.id } });
        const foreignInstalls = installs.filter(i => i.userId !== user.id);
        const contextLeak = await prisma.contextMessage.findFirst({ where: { NOT: { userId: user.id } } });
        const issues = [];
        if (foreignInstalls.length) issues.push('Foreign installation ids present');
        if (contextLeak) issues.push('Context leak detected');
        if (!issues.length) {
            await ctx.reply('Isolation OK: installations and context confined to your user.');
        } else {
            await ctx.reply('Isolation issues: ' + issues.join('; '));
        }
    });

    bot.on('inline_query', async (ctx) => {
        const q = (ctx.inlineQuery.query || '').trim().toLowerCase();
        const user = await ensureUser(ctx);
        try {
            const { fetchFreshSlice } = require('../github/apiClient');
            const slice = await fetchFreshSlice({ github: config.github, longcat: config.longcat, security: config.security }, user);
            const lines = slice.prSummary.split(/\n+/).map(l => l.trim()).filter(Boolean);
            let filtered = lines.filter(l => !/^\(no open PR data\)$/i.test(l));
            if (q) {
                filtered = filtered.filter(l => l.toLowerCase().includes(q));
            }
            if (!filtered.length) {
                return ctx.answerInlineQuery([
                    { type: 'article', id: 'none', title: 'No matching PRs', description: 'Use /ask for broader queries', input_message_content: { message_text: 'No matching pull requests.' } }
                ], { cache_time: 0 });
            }
            const results = filtered.slice(0, 5).map((line, idx) => {
                const title = line.replace(/^#(\d+)\s*/, '#$1 ');
                return {
                    type: 'article',
                    id: String(idx),
                    title: title.slice(0, 64),
                    description: 'Open PR',
                    input_message_content: { message_text: `PR: ${line}` }
                };
            });
            return ctx.answerInlineQuery(results, { cache_time: 5 });
        } catch (e) {
            return ctx.answerInlineQuery([
                { type: 'article', id: 'error', title: 'Error fetching PRs', description: 'Try again shortly', input_message_content: { message_text: 'Error fetching PR summary.' } }
            ], { cache_time: 0 });
        }
    });

    bot.on('message', async (ctx, next) => {
        if (ctx.update.message.text && ctx.update.message.text.startsWith('/')) {
            return next();
        }
        return ctx.reply('Unknown command. /help for list.');
    });
}

async function ensureUser(ctx) {
    const telegramId = ctx.from.id;
    let user = await findByTelegramId(telegramId);
    if (!user) {
        const placeholderHash = `tg_${telegramId}`;
        user = await createOrGet(telegramId, placeholderHash);
    }
    return user;
}

module.exports = { registerCommands };
