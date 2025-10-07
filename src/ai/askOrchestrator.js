const { chatCompletion } = require('./longcatClient');
const { logger } = require('../utils/logger');
const { loadContextMessages, storeTurn } = require('./contextService');
const { fetchFreshSlice } = require('../github/apiClient');

// NOTE: GitHub slice injection pending.

async function runAsk({ config, user, question, mode, stream, sendStreaming, threadRootId, maxContextTurns = 6 }) {
  const fresh = await fetchFreshSlice(config, user);
  const system = { role: 'system', content: 'You are Giknew, a GitHub assistant. Use only provided context. If information is missing, state that.' };
  const contextBlock = `PR_SUMMARY:\n${fresh.prSummary}\n`;
  let prior = [];
  if (threadRootId) {
    prior = await loadContextMessages(config.security.masterKey, user.id, threadRootId, maxContextTurns);
  }
  const userMsg = { role: 'user', content: `${question}\n\n<context>\n${contextBlock}` };
  const messages = [system, ...prior, userMsg];

  const start = Date.now();
  try {
    if (threadRootId) {
      await storeTurn({ masterKey: config.security.masterKey, userId: user.id, threadRootId, role: 'user', content: question });
    }

    if (stream && config.streamingEnabled) {
      let lastEdit = Date.now();
      return await chatCompletion({
        baseUrl: config.longcat.baseUrl,
        apiKey: config.longcat.apiKey,
        mode: mode || user.mode,
        messages,
        stream: true,
        onChunk: (delta, full) => {
          const now = Date.now();
            if (now - lastEdit > 500) {
              lastEdit = now;
              sendStreaming(full);
            }
        }
      });
    }
    const result = await chatCompletion({
      baseUrl: config.longcat.baseUrl,
      apiKey: config.longcat.apiKey,
      mode: mode || user.mode,
      messages,
      stream: false
    });
    if (threadRootId) {
      await storeTurn({ masterKey: config.security.masterKey, userId: user.id, threadRootId, role: 'assistant', content: result.text || '' });
    }
    return result;
  } catch (e) {
    logger.error({ err: e }, 'ask pipeline failure');
    throw e;
  } finally {
    const latency = Date.now() - start;
    logger.info({ latencyMs: latency }, 'ask_complete');
  }
}

module.exports = { runAsk };
