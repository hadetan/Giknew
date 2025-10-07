const { logger } = require('../utils/logger');
const { addInstallation, removeInstallation } = require('../repositories/installationRepo');
const { markLinked } = require('../repositories/userRepo');
const prisma = require('../lib/prisma');
const { recordNotification, recentlySent } = require('../repositories/notificationRepo');

async function handleGithubEvent(payload, headers, config) {
  const event = headers['x-github-event'];
  switch (event) {
    case 'installation':
      await handleInstallation(payload);
      break;
    case 'installation_repositories':
      logger.info({ action: payload.action, installation: payload.installation?.id }, 'installation_repositories');
      break;
    case 'issue_comment':
      await handleIssueComment(payload, config);
      break;
    case 'pull_request':
      await handlePullRequest(payload, config);
      break;
    case 'check_run':
      await handleCheckRun(payload, config);
      break;
    case 'status':
      await handleStatus(payload, config);
      break;
    default:
      logger.debug({ event }, 'Unhandled GitHub event');
  }
}

async function handleInstallation(payload) {
  const { action, installation } = payload;
  const installationId = installation?.id;
  if (!installationId) return;

  if (action === 'deleted') {
    await safeRemoveInstallation(installationId);
    return;
  }
  if (action === 'created') {
    // Link will now be handled via explicit redirect callback; just log creation.
    logger.info({ installationId }, 'installation_created');
  }
}

async function safeRemoveInstallation(installationId) {
  try {
    await removeInstallation(installationId);
  } catch (e) {
  }
}

module.exports = { handleGithubEvent };

async function getUsersForInstallation(installationId) {
  const inst = await prisma.installation.findUnique({ where: { installationId: BigInt(installationId) }, include: { user: true } });
  if (!inst) return [];
  return [inst.user];
}

async function notifyUsers(users, text, eventType, externalId, config) {
  for (const user of users) {
    try {
      if (await recentlySent(user.id, eventType, externalId, 60)) continue;
      // Store first; if unique constraint fails we skip sending duplicate.
      const rec = await recordNotification(user.id, eventType, externalId);
      if (!rec) continue;
      await sendTelegram(user.telegramId, text, config);
    } catch (e) {
      logger.error({ err: e, userId: user.id }, 'notify_failed');
    }
  }
}

async function sendTelegram(telegramId, text, config) {
  // Lazy load bot to reuse existing factory without circular import
  const { createBot } = require('../bot');
  if (!global.__notify_bot) {
    global.__notify_bot = createBot(config);
  }
  try {
    await global.__notify_bot.telegram.sendMessage(Number(telegramId), text.slice(0, 3900));
  } catch (e) {
    logger.error({ err: e }, 'telegram_send_failed');
  }
}

async function handleIssueComment(payload, config) {
  try {
    if (payload.action !== 'created') return;
    const installationId = payload.installation?.id;
    if (!installationId) return;
    const users = await getUsersForInstallation(installationId);
    if (!users.length) return;
    const pr = payload.issue?.pull_request;
    if (!pr) return; // only notify PR comments, skip issues
    const body = payload.comment?.body || '';
    const repoFull = payload.repository?.full_name;
    const number = payload.issue?.number;
    const externalId = `comment_${payload.comment?.id}`;
    const text = `💬 Comment on PR #${number} (${repoFull}):\n${body.slice(0, 300)}${body.length>300?'…':''}`;
    await notifyUsers(users, text, 'issue_comment', externalId, config);
  } catch (e) {
    logger.error({ err: e }, 'handle_issue_comment_failed');
  }
}

async function handlePullRequest(payload, config) {
  try {
    if (payload.action !== 'opened') return; // placeholder for future granular triggers
    const installationId = payload.installation?.id;
    if (!installationId) return;
    const users = await getUsersForInstallation(installationId);
    if (!users.length) return;
    const repoFull = payload.repository?.full_name;
    const number = payload.pull_request?.number;
    const title = payload.pull_request?.title || '';
    const externalId = `pr_open_${payload.pull_request?.id}`;
    const text = `🆕 Opened PR #${number} (${repoFull})\n${title.slice(0,140)}`;
    await notifyUsers(users, text, 'pull_request_open', externalId, config);
  } catch (e) {
    logger.error({ err: e }, 'handle_pr_failed');
  }
}

async function handleCheckRun(payload, config) {
  try {
    const installationId = payload.installation?.id;
    if (!installationId) return;
    if (!['completed'].includes(payload.action)) return;
    const conclusion = payload.check_run?.conclusion;
    if (!conclusion || conclusion === 'success') return;
    const name = payload.check_run?.name || 'Check';
    const externalId = `check_${payload.check_run?.id}_${conclusion}`;
    const repoFull = payload.repository?.full_name;
    const users = await getUsersForInstallation(installationId);
    if (!users.length) return;
    const text = `❌ Failing check (${name}) in ${repoFull}: ${conclusion}`;
    await notifyUsers(users, text, 'check_run_fail', externalId, config);
  } catch (e) {
    logger.error({ err: e }, 'handle_check_run_failed');
  }
}

async function handleStatus(payload, config) {
  try {
    const installationId = payload.installation?.id;
    if (!installationId) return;
    if (payload.state !== 'failure' && payload.state !== 'error') return;
    const sha = payload.sha?.slice(0,7);
    const repoFull = payload.repository?.full_name;
    const externalId = `status_${payload.id}_${payload.state}`;
    const users = await getUsersForInstallation(installationId);
    if (!users.length) return;
    const text = `❌ Commit status failure (${payload.context}) on ${repoFull}@${sha}: ${payload.state}`;
    await notifyUsers(users, text, 'status_fail', externalId, config);
  } catch (e) {
    logger.error({ err: e }, 'handle_status_failed');
  }
}
