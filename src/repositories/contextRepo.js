const prisma = require('../lib/prisma');

const CONTEXT_LIMIT = 12;

async function appendMessage(userId, threadRootId, role, contentEnc) {
  return prisma.contextMessage.create({
    data: { userId, threadRootId: BigInt(threadRootId), role, contentEnc }
  });
}

async function fetchThreadContext(userId, threadRootId, maxTurns = 6) {
  const rows = await prisma.contextMessage.findMany({
    where: { userId, threadRootId: BigInt(threadRootId) },
    orderBy: { createdAt: 'desc' },
    take: Math.min(CONTEXT_LIMIT, maxTurns * 2)
  });
  return rows.reverse();
}

async function pruneOld(userId, threadRootId, keep = CONTEXT_LIMIT) {
  const threadId = BigInt(threadRootId);
  const excess = await prisma.contextMessage.findMany({
    where: { userId, threadRootId: threadId },
    orderBy: { createdAt: 'desc' },
    skip: keep,
    select: { id: true }
  });
  if (!excess.length) return 0;
  const ids = excess.map(r => r.id);
  await prisma.contextMessage.deleteMany({ where: { id: { in: ids } } });
  return ids.length;
}

module.exports = { appendMessage, fetchThreadContext, pruneOld };
