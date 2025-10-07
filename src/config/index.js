const required = [
  'TELEGRAM_BOT_TOKEN',
  'GITHUB_APP_ID',
  'GITHUB_APP_PRIVATE_KEY',
  'GITHUB_WEBHOOK_SECRET',
  'LONGCAT_API_KEY',
  'DATABASE_URL',
  'MASTER_KEY',
  'CRON_JOB_SECRET'
];

function loadConfig() {
  for (const key of required) {
    if (!process.env[key] || process.env[key].trim() === '') {
      throw new Error(`Missing required env var ${key}`);
    }
  }
  if (Buffer.from(process.env.MASTER_KEY, 'utf8').length < 32) {
    throw new Error('MASTER_KEY must be a 32-byte value (hex or raw).');
  }
  return {
    telegramToken: process.env.TELEGRAM_BOT_TOKEN,
    github: {
      appId: process.env.GITHUB_APP_ID,
      privateKey: process.env.GITHUB_APP_PRIVATE_KEY.replace(/\\n/g, '\n'),
      webhookSecret: process.env.GITHUB_WEBHOOK_SECRET
    },
    longcat: {
      apiKey: process.env.LONGCAT_API_KEY,
      baseUrl: process.env.LONGCAT_BASE_URL || 'https://api.longcat.chat/openai'
    },
    db: { url: process.env.DATABASE_URL },
    security: {
      masterKey: process.env.MASTER_KEY,
      cronSecret: process.env.CRON_JOB_SECRET
    },
    streamingEnabled: /true/i.test(process.env.STREAMING_ENABLED || 'false'),
    env: process.env.NODE_ENV || 'development'
  };
}

module.exports = { loadConfig };
