const crypto = require('crypto');

// AES-256-GCM helper. MASTER_KEY expected as 32 raw bytes or 64 hex chars.
function getKey(masterKey) {
  if (/^[0-9a-fA-F]{64}$/.test(masterKey)) {
    return Buffer.from(masterKey, 'hex');
  }
  const buf = Buffer.from(masterKey, 'utf8');
  if (buf.length !== 32) {
    throw new Error('MASTER_KEY must be 32 bytes (raw or 64 hex chars)');
  }
  return buf;
}

function encrypt(masterKey, plaintext) {
  const key = getKey(masterKey);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    cipher: enc.toString('base64'),
    iv: iv.toString('base64'),
    tag: tag.toString('base64')
  };
}

function decrypt(masterKey, { cipher, iv, tag }) {
  const key = getKey(masterKey);
  const ivBuf = Buffer.from(iv, 'base64');
  const tagBuf = Buffer.from(tag, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, ivBuf);
  decipher.setAuthTag(tagBuf);
  const dec = Buffer.concat([
    decipher.update(Buffer.from(cipher, 'base64')),
    decipher.final()
  ]);
  return dec.toString('utf8');
}

module.exports = { encrypt, decrypt };
