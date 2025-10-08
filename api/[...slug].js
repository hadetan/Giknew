const { createApp } = require('../src/app');

// Initialize app once per container
let appInstance;
try {
  appInstance = createApp().app;
} catch (e) {
  // If config is missing during build-time, export a handler that returns 500
  module.exports = (req, res) => {
    res.statusCode = 500;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ error: 'server_not_configured', message: e.message }));
  };
  return;
}

module.exports = (req, res) => {
  // Strip leading /api from the path so Express routes (e.g. '/webhook/github') match
  if (req.url && req.url.startsWith('/api')) {
    req.url = req.url.replace(/^\/api/, '') || '/';
  }
  appInstance(req, res);
};
