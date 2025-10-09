const prisma = require('../lib/prisma');

async function isBanned(telegramId) {
    if (!telegramId) return false;
    const rec = await prisma.bannedUser.findUnique({ where: { telegramId: BigInt(telegramId) } }).catch(() => null);
    return !!rec;
}

async function ban(telegramId) {
    if (!telegramId) throw new Error('telegramId required');
    try {
        await prisma.bannedUser.create({ data: { telegramId: BigInt(telegramId) } });
    } catch (e) {}
    return true;
}

async function unban(telegramId) {
    if (!telegramId) throw new Error('telegramId required');
    try {
        await prisma.bannedUser.delete({ where: { telegramId: BigInt(telegramId) } });
    } catch (e) {}
    return true;
}

async function listBanned() {
    const rows = await prisma.bannedUser.findMany({ orderBy: { createdAt: 'desc' } });
    return rows.map(r => String(r.telegramId));
}

module.exports = { isBanned, ban, unban, listBanned };
