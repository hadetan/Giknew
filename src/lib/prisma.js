const { PrismaClient } = require('@prisma/client');

let prisma = globalThis.__prismaClient;
if (!prisma) {
    prisma = new PrismaClient({ log: ['error', 'warn'] });
    try {
        globalThis.__prismaClient = prisma;
    } catch (_) {
    }
}

module.exports = prisma;
