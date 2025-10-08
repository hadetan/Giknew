#!/usr/bin/env node
const { loadConfig } = require('../src/config');
const path = require('path');
const prisma = require(path.join(__dirname, '..', 'src', 'lib', 'prisma'));
const { fetchFreshSlice, findRepoByNameAcrossInstallations } = require('../src/github/apiClient');

async function main() {
    const telegramId = process.argv[2];
    const question = process.argv.slice(3).join(' ');
    if (!telegramId || !question) { console.error('Usage: node scripts/assemble_ask_context_only.js <telegramId> <question>'); process.exit(2); }
    const user = await prisma.user.findUnique({ where: { telegramId: BigInt(telegramId) } });
    if (!user) { console.error('No user'); process.exit(3); }
    const cfg = loadConfig();
    const fresh = await fetchFreshSlice(cfg, user);
    const system = { role: 'system', content: 'You are Giknew, a GitHub assistant. Use only provided context. If information is missing, state that.' };
    const maxContextLen = 3000;
    let prSummary = (fresh.prSummary || '').toString();
    if (prSummary.length > maxContextLen) prSummary = prSummary.slice(0, maxContextLen) + '\n... (truncated)';
    const checksBlock = (Array.isArray(fresh.checks) && fresh.checks.length) ? 'FAILING_CHECKS:\n' + fresh.checks.map(c => `- ${c.repo}#${c.pr}: ${c.count} failing checks`).join('\n') + '\n' : '';
    let repoMetaBlock = '';
    const repoNameMatch = (question.match(/(?:repo|repository)\s+(?:called|named)?\s*['"]?([A-Za-z0-9_.-]+)['"]?/i) || [])[1]
        || (question.match(/do I have any repo(?:s)? called\s+['"]?([A-Za-z0-9_.-]+)['"]?/i) || [])[1];
    if (repoNameMatch) {
        const found = await findRepoByNameAcrossInstallations(cfg, user, repoNameMatch);
        if (found && found.repo) {
            const r = found.repo;
            repoMetaBlock = `REPO_FOUND:\n- full_name: ${r.full_name}\n- description: ${r.description || ''}\n- created_at: ${r.created_at}\n- language: ${r.language || ''}\n`;
        } else {
            repoMetaBlock = 'REPO_NOT_FOUND_IN_LINKED_INSTALLATIONS\n';
        }
    }
    const rateNote = fresh.rateLimited ? '\n(NOTE: GitHub rate-limited during fetch; results may be partial)\n' : '';
    const contextBlock = `PR_SUMMARY:\n${prSummary}\n${checksBlock}${repoMetaBlock}${rateNote}`;
    const prior = [];
    const userMsg = { role: 'user', content: `${question}\n\n<context>\n${contextBlock}` };
    const messages = [system, ...prior, userMsg];
    console.log('Assembled messages:');
    console.log(JSON.stringify(messages, null, 2));
}

main().catch(e => { console.error(e); process.exit(4); });
