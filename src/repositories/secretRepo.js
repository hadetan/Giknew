const prisma = require('../lib/prisma');
const { encrypt, decrypt } = require('../security/crypto');
const MASTER_KEY = process.env.MASTER_KEY;

async function storeInstallationToken(installationId, tokenPlain) {
  const enc = encrypt(MASTER_KEY, tokenPlain);
  return prisma.secret.upsert({
    where: { installationId },
    update: { tokenCipher: enc.cipher, iv: enc.iv, tag: enc.tag },
    create: { installationId, tokenCipher: enc.cipher, iv: enc.iv, tag: enc.tag }
  });
}

async function getInstallationToken(installationId) {
  const row = await prisma.secret.findUnique({ where: { installationId } });
  if (!row) return null;
  try {
    return decrypt(MASTER_KEY, { cipher: row.tokenCipher, iv: row.iv, tag: row.tag });
  } catch (e) {
    console.log('Error in secret repo: ', e);
    return null;
  }
}

module.exports = { storeInstallationToken, getInstallationToken };
