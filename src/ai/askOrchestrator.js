const { chatCompletion } = require('./longcatClient');
const { logger } = require('../utils/logger');
const { loadContextMessages, storeTurn } = require('./contextService');
const { fetchFreshSlice } = require('../github/apiClient');
const { formatAnswer } = require('./formatAnswer');

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
      let editCount = 0;
      let fallback = false;
      const minIntervalMs = 900; // throttle edits
      const failureThreshold = 3;
      let failures = 0;
      let finalResult;
      finalResult = await chatCompletion({
        baseUrl: config.longcat.baseUrl,
        apiKey: config.longcat.apiKey,
        mode: mode || user.mode,
        messages,
        stream: true,
        onChunk: async (delta, full) => {
          if (fallback) return; // stop sending after fallback triggered
          const now = Date.now();
          // auto fallback if edit rate risk or too many failures
          if (editCount >= 8 && (now - start) < 12000) {
            fallback = true;
            return;
          }
          if (now - lastEdit >= minIntervalMs) {
            lastEdit = now;
            try {
              editCount++;
              await sendStreaming(full);
            } catch (e) {
              failures++;
              if (failures >= failureThreshold) {
                fallback = true;
              }
            }
          }
        }
      });
      // persist assistant turn after streaming completes
      const formatted = formatAnswer(finalResult.text || '');
      if (threadRootId) {
        try { await storeTurn({ masterKey: config.security.masterKey, userId: user.id, threadRootId, role: 'assistant', content: formatted }); } catch (e) { logger.warn({ err: e }, 'store_stream_turn_failed'); }
      }
      return { ...finalResult, text: formatted };
    }
    const result = await chatCompletion({
      baseUrl: config.longcat.baseUrl,
      apiKey: config.longcat.apiKey,
      mode: mode || user.mode,
      messages,
      stream: false
    });
    const formatted = formatAnswer(result.text || '');
    if (threadRootId) {
      await storeTurn({ masterKey: config.security.masterKey, userId: user.id, threadRootId, role: 'assistant', content: formatted });
    }
    return { ...result, text: formatted };
  } catch (e) {
    logger.error({ err: e }, 'ask pipeline failure');
    throw e;
  } finally {
    const latency = Date.now() - start;
    logger.info({ latencyMs: latency }, 'ask_complete');
  }
}

module.exports = { runAsk };
