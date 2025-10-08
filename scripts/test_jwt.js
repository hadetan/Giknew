const { loadConfig } = require('../src/config');
const { createAppJwt } = require('../src/github/auth');

try {
  const cfg = loadConfig();
  console.log('Loaded appId type:', typeof cfg.github.appId, cfg.github.appId);
  const token = createAppJwt(cfg.github.appId, cfg.github.privateKey);
  console.log('JWT length:', token.length);
  console.log('JWT preview:', token.split('.').slice(0,2).join('.') + '...');
  process.exit(0);
} catch (e) {
  console.error('ERROR:', e && e.message, e && e.stack);
  process.exit(2);
}
