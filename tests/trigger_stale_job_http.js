const http = require('http');
const { createApp } = require('../src/app');

(async function main(){
  try {
    const { app } = createApp();
    const server = http.createServer(app);
    await new Promise((r) => server.listen(0, r));
    const port = server.address().port;
    console.log('Server listening on', port);

    const options = {
      hostname: '127.0.0.1',
      port,
      path: '/jobs/stale-prs',
      method: 'POST',
      headers: { 'x-cron-secret': process.env.CRON_JOB_SECRET || 'dummy' }
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (c) => body += c.toString());
      res.on('end', () => {
        console.log('status', res.statusCode);
        console.log('headers', res.headers);
        console.log('body', body);
        server.close();
      });
    });
    req.on('error', (e) => { console.error('request error', e); server.close(); });
    req.end();
  } catch (e) {
    console.error('error', e && e.stack ? e.stack : e);
  }
})();
