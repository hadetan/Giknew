const fetch = require('node-fetch');
require('dotenv').config();

async function removeWebhook() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return console.error('TELEGRAM_BOT_TOKEN is required');
  const resp = await fetch(`https://api.telegram.org/bot${token}/deleteWebhook`, { method: 'POST' });
  const json = await resp.json();
  console.log(json);
}

removeWebhook().catch(err => { console.error(err); process.exit(1); });
