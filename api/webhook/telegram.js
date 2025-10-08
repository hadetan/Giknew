const { createApp } = require('../../src/app');

let appInstance;
try {
  appInstance = createApp().app;
} catch (e) {
  module.exports = (req, res) => {
    res.statusCode = 500;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ error: 'server_not_configured', message: e.message }));
  };
  return;
}

module.exports = (req, res) => {
  if (req.url && req.url.startsWith('/api')) req.url = req.url.replace(/^\/api/, '') || '/';
  appInstance(req, res);
};
