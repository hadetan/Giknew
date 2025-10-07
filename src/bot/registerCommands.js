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
    const placeholder = await ctx.reply('Thinking...');
    try {
      const { text: answer } = await runAsk({ config, user, question: text, mode: user.mode, stream: false, threadRootId });
      await ctx.telegram.editMessageText(placeholder.chat.id, placeholder.message_id, undefined, answer || '(no answer)');
    } catch (e) {
      logger.error({ err: e }, 'ask_failed');
      await ctx.telegram.editMessageText(placeholder.chat.id, placeholder.message_id, undefined, 'Error answering your question.');
    }
  });

  bot.command('linkgithub', async (ctx) => {
    await ensureUser(ctx);
    ctx.reply('Link flow not implemented yet.');
  });

  bot.command('unlink', async (ctx) => {
    ctx.reply('Unlink not implemented yet.');
  });

  bot.on('inline_query', async (ctx) => {
    // Return minimal placeholder result so inline works
    return ctx.answerInlineQuery([
      { type: 'article', id: 'placeholder', title: 'Giknew', description: 'Inline query not ready', input_message_content: { message_text: 'Inline query feature coming soon.' } }
    ], { cache_time: 0 });
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
