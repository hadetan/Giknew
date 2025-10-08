const fetch = require('node-fetch');
const { getInstallationToken } = require('./auth');
const { logger } = require('../utils/logger');
const { getInstallationsForUser } = require('../repositories/installationRepo');

async function fetchFreshSlice(config, user, options = {}) {
  const { maxInstallations = 5, reposPerInstallation = 2, prsPerRepo = 5, totalLineCap = 12, includeChecks = true } = options;

  const installations = await getInstallationsForUser(user.id);
  for (const inst of installations) {
    if (inst.userId !== user.id) {
      logger.error({ installation: inst.installationId, foundUserId: inst.userId, expected: user.id }, 'isolation_violation_installation');
      return { prSummary: 'Isolation guard triggered; aborting data fetch.', checks: [] };
    }
  }
  if (!installations.length) return { prSummary: 'No linked installations.', checks: [] };

  const lines = [];
  const failingChecksAggregate = [];

  let rateLimited = false;
  for (const inst of installations.slice(0, maxInstallations)) {
    let tokenData;
    try {
      tokenData = await getInstallationToken(config.github, inst.installationId.toString());
    } catch (e) {
      logger.error({ err: e, installation: inst.installationId }, 'installation_token_fetch_failed');
      lines.push(`(installation ${inst.installationId} token error)`);
      continue;
    }
    const headers = {
      Authorization: `Bearer ${tokenData.token}`,
      Accept: 'application/vnd.github+json'
    };

    try {
      const reposResp = await fetch(`https://api.github.com/installation/repositories?per_page=${reposPerInstallation}`, { headers });
      if (reposResp.status === 403) {
        rateLimited = true;
        lines.push('(rate limited fetching repositories)');
        break;
      }
      if (!reposResp.ok) {
        lines.push(`(installation ${inst.installationId} repo list error)`);
        continue;
      }
      const reposJson = await reposResp.json();
      const repos = reposJson.repositories || [];
      for (const repo of repos.slice(0, reposPerInstallation)) {
        if (lines.length >= totalLineCap) break;
        const prsResp = await fetch(`https://api.github.com/repos/${repo.full_name}/pulls?state=open&per_page=${prsPerRepo}`, { headers });
        if (prsResp.status === 403) { rateLimited = true; lines.push('(rate limited fetching PRs)'); break; }
        if (!prsResp.ok) continue;
        const prs = await prsResp.json();
        for (const pr of prs) {
          if (lines.length >= totalLineCap) break;
          let failingCount = 0;
          if (includeChecks) {
            try {
              const checksResp = await fetch(`https://api.github.com/repos/${repo.full_name}/commits/${pr.head?.sha}/check-runs?per_page=20`, { headers });
              if (checksResp.status === 403) { rateLimited = true; lines.push('(rate limited fetching checks)'); break; }
              if (checksResp.ok) {
                const checksJson = await checksResp.json();
                const runs = checksJson.check_runs || [];
                failingCount = runs.filter(r => ['failure', 'timed_out', 'cancelled', 'action_required'].includes(r.conclusion)).length;
                if (failingCount > 0) {
                  failingChecksAggregate.push({ repo: repo.full_name, pr: pr.number, count: failingCount });
                }
              }
            } catch (e) {
              logger.debug({ err: e }, 'check_runs_fetch_failed');
            }
          }
          const failBadge = failingCount ? `❌${failingCount}` : '✅';
          lines.push(`${failBadge} #${pr.number} ${pr.title.slice(0, 70)} (${repo.name})`);
          if (rateLimited) break;
        }
        if (rateLimited) break;
      }
    } catch (e) {
      logger.warn({ err: e, installation: inst.installationId }, 'installation_aggregation_failed');
      lines.push(`(installation ${inst.installationId} aggregation error)`);
    }
    if (lines.length >= totalLineCap || rateLimited) break;
  }

  if (!lines.length) lines.push('(no open PR data)');

  lines.sort((a, b) => {
    const aFail = a.startsWith('❌');
    const bFail = b.startsWith('❌');
    if (aFail === bFail) return a.localeCompare(b);
    return aFail ? -1 : 1;
  });

  return {
    prSummary: lines.join('\n'),
    checks: failingChecksAggregate,
    rateLimited
  };
}

module.exports = { fetchFreshSlice };