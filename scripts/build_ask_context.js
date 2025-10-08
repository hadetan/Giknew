#!/usr/bin/env node
const { loadConfig } = require('../src/config');
const path = require('path');
const prisma = require(path.join(__dirname, '..', 'src', 'lib', 'prisma'));
const { runAsk } = require('../src/ai/askOrchestrator');

async function main() {
    const telegramId = process.argv[2];
    const question = process.argv.slice(3).join(' ');
    if (!telegramId || !question) {
        console.error('Usage: node scripts/build_ask_context.js <telegramId> <question...>');
        process.exit(2);
    }
    const user = await prisma.user.findUnique({ where: { telegramId: BigInt(telegramId) } });
    if (!user) { console.error('No user'); process.exit(3); }
    const cfg = loadConfig();
    const res = await runAsk({ config: cfg, user, question, mode: 'fast', stream: false });
    console.log('AI output:');
    console.log(res.text);
}

main().catch(e => { console.error(e); process.exit(4); });
