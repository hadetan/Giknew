const fetch = require('node-fetch');
const { getInstallationToken } = require('./auth');
const { logger } = require('../utils/logger');
const { getInstallationsForUser } = require('../repositories/installationRepo');

async function fetchFreshSlice(config, user) {
  const installations = await getInstallationsForUser(user.id);
  if (!installations.length) return { prSummary: 'No linked installations.', checks: [] };
  const inst = installations[0];
  let tokenData;
  try {
    tokenData = await getInstallationToken(config.github, inst.installationId.toString());
  } catch (e) {
    logger.error({ err: e }, 'installation_token_fetch_failed');
    return { prSummary: 'Failed to get installation token.', checks: [] };
  }
  const headers = {
    Authorization: `Bearer ${tokenData.token}`,
    Accept: 'application/vnd.github+json'
  };

  // Fetch PRs across all repos of installation: use search as quick heuristic (limited to user hash context is not possible here yet) -> fallback to empty
  // Simpler: use a dummy list since we don't yet map user->repos; TODO: refine with GraphQL or installation repositories listing.
  // We'll attempt listing installation repositories then pick first repo and list its open PRs.
  let prLines = [];
  try {
    const reposResp = await fetch('https://api.github.com/installation/repositories?per_page=1', { headers });
    if (reposResp.ok) {
      const reposJson = await reposResp.json();
      const repo = reposJson.repositories?.[0];
      if (repo) {
        const prsResp = await fetch(`https://api.github.com/repos/${repo.full_name}/pulls?state=open&per_page=5`, { headers });
        if (prsResp.ok) {
          const prs = await prsResp.json();
            prLines = prs.map(pr => `#${pr.number} ${pr.title.slice(0,70)}`);
        }
      }
    }
  } catch (e) {
    logger.warn({ err: e }, 'pr_fetch_failed');
  }
  if (!prLines.length) prLines.push('(no open PR data)');
  return { prSummary: prLines.join('\n'), checks: [] };
}

module.exports = { fetchFreshSlice };