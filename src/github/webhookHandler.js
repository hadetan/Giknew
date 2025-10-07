const { logger } = require('../utils/logger');
const { addInstallation, removeInstallation } = require('../repositories/installationRepo');

async function handleGithubEvent(payload, headers, config) {
  const event = headers['x-github-event'];
  switch (event) {
    case 'installation':
      await handleInstallation(payload);
      break;
    case 'installation_repositories':
      logger.info({ action: payload.action, installation: payload.installation?.id }, 'installation_repositories');
      break;
    case 'pull_request':
    case 'issue_comment':
    case 'check_run':
    case 'status':
      logger.info({ event, action: payload.action }, 'event_received');
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
    // TODO: Associate with user after link flow (pending design). For now we just ensure presence.
    // We cannot know the userId yet; this will be updated once link mapping exists.
    // Placeholder: log only.
  }
}

async function safeRemoveInstallation(installationId) {
  try {
    await removeInstallation(installationId);
  } catch (e) {
  }
}

module.exports = { handleGithubEvent };
