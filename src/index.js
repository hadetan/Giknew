require('dotenv').config();
const { createApp } = require('./app');
const { logger } = require('./utils/logger');

const { app, config } = createApp();

if (require.main === module) {
  const port = process.env.PORT || 3000;
  app.listen(port, () => logger.info({ port }, 'Server listening'));
}

module.exports = { app, config };
