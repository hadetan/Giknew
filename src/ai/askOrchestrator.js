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

    /**
     * Streaming edit policy:
     * - Do not edit more frequently than every 900ms (Telegram rate comfort)
     * - If >8 edits occur within first 12s, fallback to suppress further partials
     * - On 3 consecutive edit failures, fallback
     */
    if (stream && config.streamingEnabled) {
      let lastEdit = Date.now();
      let editCount = 0;
      let fallback = false;
      const minIntervalMs = 900;
      const failureThreshold = 3;
      let failures = 0;
      let finalResult;
      finalResult = await chatCompletion({
        baseUrl: config.longcat.baseUrl, apiKey: config.longcat.apiKey, mode: mode || user.mode, messages, stream: true,
        onChunk: async (delta, full) => {
          if (fallback) return;
          const now = Date.now();
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
      const formatted = formatAnswer(finalResult.text || '');
      if (threadRootId) {
        try { await storeTurn({ masterKey: config.security.masterKey, userId: user.id, threadRootId, role: 'assistant', content: formatted }); } catch (e) { logger.warn({ err: e }, 'store_stream_turn_failed'); }
      }
      let decorated = formatted;
      if (fresh.rateLimited) {
        decorated = '⚠️ GitHub rate limit encountered; partial data shown. Try again later.\n\n' + decorated;
      }
      return { ...finalResult, text: decorated };
    }
    const result = await chatCompletion({ baseUrl: config.longcat.baseUrl, apiKey: config.longcat.apiKey, mode: mode || user.mode, messages, stream: false });
    const formatted = formatAnswer(result.text || '');
    if (threadRootId) {
      await storeTurn({ masterKey: config.security.masterKey, userId: user.id, threadRootId, role: 'assistant', content: formatted });
    }
    let decorated = formatted;
    if (fresh.rateLimited) {
      decorated = '⚠️ GitHub rate limit encountered; partial data shown. Try again later.\n\n' + decorated;
    }
    return { ...result, text: decorated };
  } catch (e) {
    logger.error({ err: e }, 'ask pipeline failure');
    const isTimeout = /timeout/i.test(e.message || '');
    const fallbackMsg = isTimeout ? 'LongCat timed out preparing an answer. Please try again in a moment.' : 'Internal error processing your question.';
    return { text: fallbackMsg, error: true };
  } finally {
    const latency = Date.now() - start;
    logger.info({ latencyMs: latency }, 'ask_complete');
  }
}

module.exports = { runAsk };
