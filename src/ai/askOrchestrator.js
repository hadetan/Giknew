const { chatCompletion } = require('./longcatClient');
const { logger } = require('../utils/logger');
const { loadContextMessages, storeTurn } = require('./contextService');
const { fetchFreshSlice, findRepoByNameAcrossInstallations } = require('../github/apiClient');
const { formatAnswer } = require('./formatAnswer');
const { listAccessibleRepoNames } = require('../github/apiClient');

async function runAsk({ config, user, question, mode, stream, sendStreaming, threadRootId, maxContextTurns = 6 }) {
    const fresh = await fetchFreshSlice(config, user);
    const system = { role: 'system', content: `You are Giknew, a GitHub assistant. Answer concisely and in a friendly, conversational tone. IMPORTANT: Do not invent facts or make up repositories, PRs, or statuses. Only use information explicitly provided in the context blocks below (PR_SUMMARY, FAILING_CHECKS, REPO_* metadata, and any previous user messages). Treat any prior assistant responses as unverified: you may quote them but must not assert them as fact unless they are also supported by the PR_SUMMARY or repository metadata. If you cannot confirm something from the provided context, say you cannot confirm it and suggest a safe next step (for example: ask the user to run a specific command, link the repo, or provide the repo full name).` };
    const maxContextLen = 3000;
    let prSummary = (fresh.prSummary || '').toString();
    if (prSummary.length > maxContextLen) prSummary = prSummary.slice(0, maxContextLen) + '\n... (truncated)';

    const checksBlock = (Array.isArray(fresh.checks) && fresh.checks.length) ? 'FAILING_CHECKS:\n' + fresh.checks.map(c => `- ${c.repo}#${c.pr}: ${c.count} failing checks`).join('\n') + '\n' : '';

    let repoMetaBlock = '';
    try {
        const patterns = [
            /(?:repo|repository)\s+(?:called|named|named as)?\s*["']?([A-Za-z0-9_.-]+)["']?/i,
            /do I have any repo(?:s)? called\s+["']?([A-Za-z0-9_.-]+)["']?/i,
            /check if I have (?:a )?repo(?:s)?(?: named)?\s*["']?([A-Za-z0-9_.-]+)["']?/i,
            /(?:what|where|show)\s+(?:is|are)\s+(?:my )?(?:repo|repository)\s+(?:called\s+)?["']?([A-Za-z0-9_.-]+)["']?/i,
            /have I got (?:a )?repo(?: named)?\s*["']?([A-Za-z0-9_.-]+)["']?/i
        ];
        let repoNameMatch = null;
        for (const p of patterns) {
            const m = (question.match(p) || [])[1];
            if (m) { repoNameMatch = m; break; }
        }

        if (!repoNameMatch) {
            const names = await listAccessibleRepoNames(config, user, 200);
            if (names && names.length) {
                const qTokens = question.toLowerCase().split(/[^a-z0-9_.-]+/i).filter(Boolean);
                qTokens.sort((a, b) => b.length - a.length);
                for (const token of qTokens) {
                    if (!/^[a-z0-9_.-]{3,40}$/i.test(token)) continue;
                    const foundName = names.find(n => n.toLowerCase() === token);
                    if (foundName) { repoNameMatch = foundName; break; }
                }
            }
        }

        if (repoNameMatch) {
            const found = await findRepoByNameAcrossInstallations(config, user, repoNameMatch);
            if (found && found.repo) {
                const r = found.repo;
                repoMetaBlock = `REPO_FOUND:\n- full_name: ${r.full_name}\n- description: ${r.description || ''}\n- created_at: ${r.created_at}\n- language: ${r.language || ''}\n- open_issues: ${r.open_issues || 0}\n- forks: ${r.forks || 0}\n- visibility: ${r.visibility || ''}\n`;
            } else if (found && found.multiple) {
                const sample = found.multiple.slice(0, 10).map(m => `${m.full_name}`).join(', ');
                repoMetaBlock = `REPO_AMBIGUOUS:\n- candidates: ${sample}\n`;
            }
        }
    } catch (e) {
        logger.debug({ err: e, question }, 'repo_lookup_failed');
    }

    const rateNote = fresh.rateLimited ? '\n(NOTE: GitHub rate-limited during fetch; results may be partial)\n' : '';

    const contextBlock = `PR_SUMMARY:\n${prSummary}\n${checksBlock}${repoMetaBlock}${rateNote}`;
    let prior = [];
    if (threadRootId) {
        prior = await loadContextMessages(config.security.masterKey, user.id, threadRootId, maxContextTurns);
    }
    const userMsg = { role: 'user', content: `${question}\n\n<context>\n${contextBlock}` };
    const messages = [system];
    for (const p of prior) {
        if (!p || !p.role) continue;
        if (p.role === 'user') {
            messages.push({ role: 'user', content: p.content });
        } else if (p.role === 'assistant') {
            messages.push({ role: 'system', content: `PREVIOUS_ASSISTANT_UNVERIFIED:\n${p.content}` });
        } else {
            messages.push({ role: p.role, content: p.content });
        }
    }
    messages.push(userMsg);

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
