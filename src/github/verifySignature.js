const crypto = require('crypto');

function timingSafeEqual(a, b) {
  const aBuf = Buffer.from(a, 'utf8');
  const bBuf = Buffer.from(b, 'utf8');
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

function computeSignature(secret, body) {
  return 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');
}

function verifyGithubSignature(secret) {
  return (req, res, next) => {
    const sig = req.headers['x-hub-signature-256'];
    if (!sig) return res.status(401).json({ error: 'Missing signature' });
    const expected = computeSignature(secret, req.rawBody || Buffer.from(JSON.stringify(req.body)));
    if (!timingSafeEqual(sig, expected)) {
      return res.status(401).json({ error: 'Bad signature' });
    }
    next();
  };
}

module.exports = { verifyGithubSignature };
