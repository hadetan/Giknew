const prisma = require('../lib/prisma');

async function addInstallation(userId, installationId) {
    const instIdBig = BigInt(installationId);
    const existing = await prisma.installation.findFirst({ where: { installationId: instIdBig } });
    if (existing) {
        return prisma.installation.update({ where: { id: existing.id }, data: { userId } });
    }
    return prisma.installation.create({ data: { installationId: instIdBig, userId } });
}

async function getInstallationsForUser(userId) {
    return prisma.installation.findMany({ where: { userId } });
}

async function removeInstallation(installationId) {
    const instIdBig = BigInt(installationId);
    const existing = await prisma.installation.findFirst({ where: { installationId: instIdBig } });
    if (!existing) return null;
    return prisma.installation.delete({ where: { id: existing.id } });
}

module.exports = { addInstallation, getInstallationsForUser, removeInstallation };
