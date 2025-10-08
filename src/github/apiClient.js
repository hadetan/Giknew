const fetch = require('node-fetch');
const { getInstallationToken } = require('./auth');
const { logger } = require('../utils/logger');
const { getInstallationsForUser } = require('../repositories/installationRepo');

const pMap = async (items, mapper, concurrency = 6) => {
    const results = [];
    const executing = new Set();
    for (const item of items) {
        const p = (async () => mapper(item))();
        results.push(p);
        executing.add(p);
        const clean = () => executing.delete(p);
        p.then(clean).catch(clean);
        if (executing.size >= concurrency) {
            await Promise.race(executing);
        }
    }
    return Promise.all(results);
};

async function fetchFreshSlice(config, user, options = {}) {
    const { maxInstallations = 5, reposPerInstallation = 100, prsPerRepo = 5, totalLineCap = 12, includeChecks = true } = options;

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
                logger.warn({ installation: inst.installationId, status: reposResp.status }, 'installation_repos_forbidden');
                lines.push(`(installation ${inst.installationId} access forbidden)`);
                break;
            }
            if (!reposResp.ok) {
                const text = await reposResp.text().catch(() => '');
                logger.warn({ installation: inst.installationId, status: reposResp.status, text }, 'installation_repo_list_failed');
                lines.push(`(installation ${inst.installationId} repo list error)`);
                continue;
            }
            const reposJson = await reposResp.json();
            const repos = reposJson.repositories || [];
            if (!repos.length) {
                logger.info({ installation: inst.installationId }, 'installation_has_no_accessible_repos');
                lines.push(`(installation ${inst.installationId} no accessible repos)`);
                continue;
            }

            const repoFullNames = new Set(repos.map(r => r.full_name));
            const owners = Array.from(new Set(repos.map(r => r.owner?.login || r.owner?.name).filter(Boolean)));
            const USE_SEARCH_THRESHOLD = 20;
            if (repos.length > USE_SEARCH_THRESHOLD && owners.length > 0) {
                for (const owner of owners) {
                    if (lines.length >= totalLineCap || rateLimited) break;
                    try {
                        const q = encodeURIComponent(`is:pr is:open user:${owner}`);
                        const searchResp = await fetch(`https://api.github.com/search/issues?q=${q}&per_page=100`, { headers });
                        if (searchResp.status === 403) { rateLimited = true; lines.push('(rate limited searching PRs)'); break; }
                        if (!searchResp.ok) continue;
                        const searchJson = await searchResp.json();
                        const items = searchJson.items || [];
                        for (const it of items) {
                            if (lines.length >= totalLineCap) break;
                            const repoUrl = it.repository_url || '';
                            const repoFull = repoUrl.replace('https://api.github.com/repos/', '');
                            if (!repoFullNames.has(repoFull)) continue;
                            const title = (it.title || '').slice(0, 70);
                            lines.push(`✅ #${it.number} ${title} (${repoFull.split('/').pop()})`);
                        }
                    } catch (e) {
                        logger.debug({ err: e, owner }, 'search_prs_failed');
                    }
                }
                if (lines.length >= totalLineCap || rateLimited) break;
                if (lines.length) continue;
            }

            const repoTasks = repos.slice(0, reposPerInstallation).map((repo) => async () => {
                if (lines.length >= totalLineCap || rateLimited) return;
                try {
                    const prsResp = await fetch(`https://api.github.com/repos/${repo.full_name}/pulls?state=open&per_page=${prsPerRepo}`, { headers });
                    if (prsResp.status === 403) { rateLimited = true; lines.push('(rate limited fetching PRs)'); return; }
                    if (!prsResp.ok) return;
                    const prs = await prsResp.json();
                    if (!prs.length) return;
                    for (const pr of prs) {
                        if (lines.length >= totalLineCap || rateLimited) break;
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
                    }
                } catch (e) {
                    logger.debug({ err: e, repo: repo.full_name }, 'repo_prs_fetch_failed');
                }
            });
            await pMap(repoTasks, t => t(), 1);
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