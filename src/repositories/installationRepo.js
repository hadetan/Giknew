const prisma = require('../lib/prisma');

async function addInstallation(userId, installationId) {
    return prisma.installation.upsert({
        where: { installationId: BigInt(installationId) },
        update: { userId },
        create: { installationId: BigInt(installationId), userId }
    });
}

async function getInstallationsForUser(userId) {
    return prisma.installation.findMany({ where: { userId } });
}

async function removeInstallation(installationId) {
    return prisma.installation.delete({ where: { installationId: BigInt(installationId) } });
}

module.exports = { addInstallation, getInstallationsForUser, removeInstallation };
