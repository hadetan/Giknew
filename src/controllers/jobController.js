const { logger } = require('../utils/logger');
const prisma = require('../lib/prisma');
const fetch = require('node-fetch');
const { getInstallationToken } = require('../github/auth');
const { markStaleNotified, lastNotified } = require('../repositories/stalePrRepo');
const { recordNotification, recentlySent } = require('../repositories/notificationRepo');

const AGE_DAYS = 3;
const IDLE_HOURS = 24;
const MERGED_WINDOW_HOURS = 24;
async function stalePrJob(config, req, res) {
    try { logger.info({ headerPresent: !!req.headers['x-cron-secret'], headerLen: req.headers['x-cron-secret'] ? String(req.headers['x-cron-secret']).length : 0 }, 'cron_header_check'); } catch (_) { }
    if (req.headers['x-cron-secret'] !== config.security.cronSecret) {
        logger.warn({ headerPresent: !!req.headers['x-cron-secret'] }, 'cron_header_mismatch');
        return res.status(401).json({ error: 'unauthorized' });
    }
    const started = Date.now();
    let processed = 0, notified = 0;
    try {
        const users = await prisma.user.findMany({ where: { linked: true } });
        for (const user of users) {
            const installs = await prisma.installation.findMany({ where: { userId: user.id } });
            for (const inst of installs) {
                processed++;
                try {
                    const tokenData = await getInstallationToken(config.github, inst.installationId.toString());
                    const headers = { Authorization: `Bearer ${tokenData.token}`, Accept: 'application/vnd.github+json' };
                    const reposResp = await fetch('https://api.github.com/installation/repositories?per_page=5', { headers });
                    if (!reposResp.ok) continue;
                    const reposJson = await reposResp.json();
                    const repos = reposJson.repositories || [];
                    for (const repo of repos.slice(0, 3)) {
                        await scanRepoForStale({ repo, headers, user, config });
                    }
                } catch (e) {
                    logger.warn({ err: e }, 'stale_scan_install_failed');
                    continue;
                }
            }
        }
        res.json({ ok: true, processed, notified });
    } catch (e) {
        logger.error({ err: e }, 'stale_job_failed');
        res.status(500).json({ error: 'job_failed' });
    } finally {
        logger.info({ latencyMs: Date.now() - started, processed, notified }, 'stale_job_complete');
    }
}

async function scanRepoForStale({ repo, headers, user, config }) {
    const prsResp = await fetch(`https://api.github.com/repos/${repo.full_name}/pulls?state=open&per_page=10&sort=created&direction=asc`, { headers });
    if (!prsResp.ok) return;
    const prs = await prsResp.json();
    if (!Array.isArray(prs)) return;

    const sinceIso = new Date(Date.now() - MERGED_WINDOW_HOURS * 3600000).toISOString();
    let mergedCountRecent = 0;
    try {
        const searchResp = await fetch(`https://api.github.com/search/issues?q=repo:${repo.full_name}+is:pr+is:merged+merged:>=${sinceIso}`, { headers });
        if (searchResp.ok) {
            const searchJson = await searchResp.json();
            mergedCountRecent = searchJson.total_count || 0;
        }
    } catch (_) { }

    for (const pr of prs) {
        try {
            const created = new Date(pr.created_at);
            const ageDays = (Date.now() - created.getTime()) / 86400000;
            const lastCommitTime = new Date(pr.updated_at);
            const idleHours = (Date.now() - lastCommitTime.getTime()) / 3600000;
            if (ageDays < AGE_DAYS) continue;
            if (idleHours < IDLE_HOURS) continue;
            if (mergedCountRecent < 1) continue;
            const already = await lastNotified(user.id, repo.id, pr.number);
            if (already && (Date.now() - new Date(already.lastNotifiedAt).getTime()) < 24 * 3600000) continue;
            const eventType = 'stale_pr';
            const externalId = `stale_${repo.id}_${pr.number}`;
            if (await recentlySent(user.id, eventType, externalId, 24 * 60)) continue;
            const msg = `🕒 PR #${pr.number} may be stale in ${repo.full_name}\nTitle: ${pr.title.slice(0, 140)}\nAge: ${ageDays.toFixed(1)}d Idle: ${idleHours.toFixed(1)}h (merged PRs last 24h: ${mergedCountRecent})`;
            const { createBot } = require('../bot');
            if (!global.__notify_bot) global.__notify_bot = createBot(config);
            await recordNotification(user.id, eventType, externalId);
            await markStaleNotified(user.id, repo.id, pr.number);
            try { await global.__notify_bot.telegram.sendMessage(Number(user.telegramId), msg.slice(0, 3900)); } catch (e) { /* ignore send errors */ }
        } catch (e) {
            // continue next PR
        }
    }
}


module.exports = { stalePrJob };
