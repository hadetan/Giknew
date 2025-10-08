const fetch = require('node-fetch');
require('dotenv').config();

async function setWebhook() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const base = process.env.APP_BASE_URL;
  if (!token) return console.error('TELEGRAM_BOT_TOKEN is required');
  if (!base) return console.error('APP_BASE_URL is required');
  const url = `${base.replace(/\/$/, '')}/api/webhook/telegram`;
  const resp = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url })
  });
  const json = await resp.json();
  console.log(json);
}

setWebhook().catch(err => { console.error(err); process.exit(1); });
