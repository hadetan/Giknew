const prisma = require('../lib/prisma');

async function findByTelegramId(telegramId) {
  return prisma.user.findUnique({ where: { telegramId: BigInt(telegramId) } });
}

async function createOrGet(telegramId, githubUserHash) {
  let user = await findByTelegramId(telegramId);
  if (!user) {
    user = await prisma.user.create({
      data: { telegramId: BigInt(telegramId), githubUserHash, linked: false }
    });
  }
  return user;
}

async function updateMode(userId, mode) {
  return prisma.user.update({ where: { id: userId }, data: { mode } });
}

async function markLinked(userId, linked = true) {
  return prisma.user.update({ where: { id: userId }, data: { linked } });
}

module.exports = { findByTelegramId, createOrGet, updateMode, markLinked };
