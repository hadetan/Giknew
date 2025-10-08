const http = require('http');
const { createApp } = require('../src/app');
const { createBot } = require('../src/bot');

async function run() {
    const { app, config } = createApp();
    const server = app.listen(0);
    const port = server.address().port;
    console.log('App listening on', port);

    const res = await new Promise((resolve, reject) => {
        const req = http.request({ hostname: '127.0.0.1', port, path: '/health', method: 'GET' }, (r) => {
            let data = '';
            r.on('data', c => data += c.toString());
            r.on('end', () => resolve({ status: r.statusCode, body: data }));
        });
        req.on('error', reject);
        req.end();
    });
    console.log('/health', res.status);

    const bot = createBot(config);
    const update = { update_id: 1, message: { message_id: 1, from: { id: 12345 }, chat: { id: 12345 }, text: '/start' } };
    try {
        await bot.handleUpdate(update);
        console.log('Bot handled synthetic /start update');
    } catch (e) {
        console.error('Bot update failed', e);
        process.exit(2);
    }

    server.close();
    process.exit(0);
}

run().catch(e => { console.error(e); process.exit(1); });
