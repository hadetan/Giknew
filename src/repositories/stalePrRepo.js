const prisma = require('../lib/prisma');

async function markStaleNotified(userId, repoId, prNumber) {
    return prisma.stalePrState.upsert({
        where: { userId_repoId_prNumber: { userId, repoId: BigInt(repoId), prNumber } },
        update: { lastNotifiedAt: new Date() },
        create: { userId, repoId: BigInt(repoId), prNumber }
    });
}

async function lastNotified(userId, repoId, prNumber) {
    return prisma.stalePrState.findUnique({
        where: { userId_repoId_prNumber: { userId, repoId: BigInt(repoId), prNumber } }
    });
}

module.exports = { markStaleNotified, lastNotified };
