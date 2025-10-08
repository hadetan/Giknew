#!/usr/bin/env node
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const installs = await prisma.installation.findMany({ include: { user: true } });
    if (!installs.length) {
        console.log('No installations recorded in DB');
        process.exit(0);
    }
    for (const inst of installs) {
        console.log(`installationId=${inst.installationId.toString()} userId=${inst.userId} telegramId=${inst.user.telegramId.toString()}`);
    }
    process.exit(0);
}

main().catch(e => { console.error(e); process.exit(2); });
