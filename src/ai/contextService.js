const { appendMessage, fetchThreadContext, pruneOld } = require('../repositories/contextRepo');
const { encrypt, decrypt } = require('../security/crypto');
const { logger } = require('../utils/logger');

function deriveThreadRoot(ctx) {
  const msg = ctx.update.message;
  if (msg?.reply_to_message?.message_id) return msg.reply_to_message.message_id;
  return msg?.message_id || Date.now();
}

async function storeTurn({ masterKey, userId, threadRootId, role, content }) {
  try {
    const { cipher, iv, tag } = encrypt(masterKey, content);
    const packed = JSON.stringify({ c: cipher, i: iv, t: tag });
    await appendMessage(userId, threadRootId, role, packed);
    await pruneOld(userId, threadRootId);
  } catch (e) {
    logger.error({ err: e }, 'store_turn_failed');
  }
}
function decryptRow(masterKey, row) {
  try {
    const parsed = JSON.parse(row.contentEnc);
    const text = decrypt(masterKey, { cipher: parsed.c, iv: parsed.i, tag: parsed.t });
    return { role: row.role, content: text };
  } catch (e) {
    logger.warn({ err: e }, 'decrypt_row_failed');
    return null;
  }
}

async function loadContextMessages(masterKey, userId, threadRootId, maxTurns) {
  const rows = await fetchThreadContext(userId, threadRootId, maxTurns);
  const msgs = [];
  for (const r of rows) {
    const dec = decryptRow(masterKey, r);
    if (dec) msgs.push(dec);
  }
  return msgs;
}

module.exports = { deriveThreadRoot, storeTurn, fetchThreadContext, loadContextMessages };
