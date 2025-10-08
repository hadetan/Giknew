const prisma = require('../lib/prisma');
let startedAt = Date.now();

function getHealth(config) {
    return async (req, res) => {
        try {
            const users = await prisma.user.count();
            const installations = await prisma.installation.count();
            const contexts = await prisma.contextMessage.count();
            const lastNotif = await prisma.notificationLog.findFirst({ orderBy: { sentAt: 'desc' }, select: { sentAt: true } });
            let concurrency = null;
            if (global.__notify_bot && global.__notify_bot._concurrencyStats) {
                concurrency = global.__notify_bot._concurrencyStats();
            }
            res.json({
                status: 'ok',
                uptimeSeconds: process.uptime(),
                startedAt,
                env: config.env,
                version: process.env.COMMIT_HASH || 'dev',
                counts: { users, installations, contexts },
                lastNotificationAt: lastNotif?.sentAt || null,
                concurrency
            });
        } catch (e) {
            res.status(500).json({ status: 'error', error: 'health_failed' });
        }
    };
}

module.exports = { getHealth };
