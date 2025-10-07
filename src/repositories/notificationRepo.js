const prisma = require('../lib/prisma');

async function recordNotification(userId, eventType, externalId) {
  try {
    return await prisma.notificationLog.create({
      data: { userId, eventType, externalId }
    });
  } catch (e) {
    if (e.code === 'P2002') {
      return null;
    }
    throw e;
  }
}

async function recentlySent(userId, eventType, externalId, withinMinutes = 60) {
  const since = new Date(Date.now() - withinMinutes * 60000);
  const row = await prisma.notificationLog.findFirst({
    where: { userId, eventType, externalId, sentAt: { gte: since } }
  });
  return !!row;
}

module.exports = { recordNotification, recentlySent };
