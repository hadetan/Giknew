#!/usr/bin/env node
const { loadConfig } = require('../src/config');
const { fetchFreshSlice } = require('../src/github/apiClient');
const path = require('path');
const prisma = require(path.join(__dirname, '..', 'src', 'lib', 'prisma'));

async function main() {
  const telegramIdArg = process.argv[2];
  if (!telegramIdArg) {
    console.error('Usage: node scripts/run_fetch_slice.js <telegramId>');
    process.exit(2);
  }
  const tg = BigInt(telegramIdArg);
  const user = await prisma.user.findUnique({ where: { telegramId: tg } });
  if (!user) {
    console.error('No user for telegramId', telegramIdArg);
    process.exit(3);
  }
  const cfg = loadConfig();
  const slice = await fetchFreshSlice({ github: cfg.github, longcat: cfg.longcat, security: cfg.security }, user, { reposPerInstallation: 100, prsPerRepo: 10, totalLineCap: 50 });
  console.log('PR summary:\n', slice.prSummary);
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(4); });
