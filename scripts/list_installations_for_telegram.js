#!/usr/bin/env node
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const tg = process.argv[2];
  if (!tg) {
    console.error('Usage: node scripts/list_installations_for_telegram.js <telegramId>');
    process.exit(2);
  }
  const telegramId = BigInt(tg);
  const user = await prisma.user.findUnique({ where: { telegramId } });
  if (!user) {
    console.error('No user found for telegramId', tg);
    process.exit(3);
  }
  const installs = await prisma.installation.findMany({ where: { userId: user.id } });
  if (!installs.length) {
    console.log('No installations recorded for user', user.id);
  } else {
    console.log('Installations for user', user.id, installs.map(i => i.installationId.toString()));
  }
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(4); });
