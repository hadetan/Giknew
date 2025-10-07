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
    const threadRootId = ctx.message.reply_to_message ? ctx.message.reply_to_message.message_id : ctx.message.message_id;
    const start = Date.now();
    let thinkingMsg;
    let upgraded = false;
    try {
      thinkingMsg = await ctx.reply('Thinking...');
    } catch (_) {}

    const timer = setTimeout(async () => {
      if (!thinkingMsg) return;
      try {
        await ctx.telegram.editMessageText(thinkingMsg.chat.id, thinkingMsg.message_id, undefined, 'Summarizing...');
        upgraded = true;
      } catch (_) {}
    }, 5000);

    const useStreaming = config.streamingEnabled;
    let accumulated = '';
    let streamingFinal = null;
    let streamingActive = false;
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
            accumulated = full;
            try {
              await ctx.telegram.editMessageText(thinkingMsg.chat.id, thinkingMsg.message_id, undefined, (upgraded ? 'Summarizing...\n\n' : '') + full.slice(0, 3900));
            } catch (_) { /* swallow edit rate errors */ }
        }
      });

      const { text: answer } = await runPromise;
      streamingFinal = answer;
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
      const errText = 'Error answering your question.';
      if (thinkingMsg) {
        try { await ctx.telegram.editMessageText(thinkingMsg.chat.id, thinkingMsg.message_id, undefined, errText); } catch (_) { await ctx.reply(errText); }
      } else {
        await ctx.reply(errText);
      }
    } finally {
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
      try { await removeInstallation(inst.installationId); } catch (_) {}
    }
    await markLinked(user.id, false);
    ctx.reply('GitHub link removed locally. You may also uninstall the App from GitHub settings.');
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
        const title = line.replace(/^#(\d+)\s*/, '#$1 '); // keep number tidy
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
