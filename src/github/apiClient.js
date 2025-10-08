const fetch = require('node-fetch');
const { getInstallationToken } = require('./auth');
const { logger } = require('../utils/logger');
const { getInstallationsForUser } = require('../repositories/installationRepo');

const accessibleReposCache = new Map();
const CACHE_TTL_MS = Number(process.env.REPO_CACHE_TTL_MS || 60 * 1000);

function setAccessibleReposCache(userId, data) {
    accessibleReposCache.set(userId, { ts: Date.now(), data });
}

function getAccessibleReposCache(userId) {
    const row = accessibleReposCache.get(userId);
    if (!row) return null;
    if (Date.now() - row.ts > CACHE_TTL_MS) {
        accessibleReposCache.delete(userId);
        return null;
    }
    return row.data;
}

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
            await pMap(repoTasks, t => t(), 8);
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

async function findRepoByNameAcrossInstallations(config, user, repoName) {
    const cache = getAccessibleReposCache(user.id);
    if (cache) {
        const found = cache.find(r => r.name.toLowerCase() === repoName.toLowerCase() || r.full_name.toLowerCase().endsWith('/' + repoName.toLowerCase()));
        if (found) {
            try {
                const tokenData = await getInstallationToken(config.github, found.installationId.toString());
                const headers = { Authorization: `Bearer ${tokenData.token}`, Accept: 'application/vnd.github+json' };
                const repoResp = await fetch(`https://api.github.com/repos/${found.full_name}`, { headers });
                if (!repoResp.ok) return null;
                const data = await repoResp.json();
                return { installationId: found.installationId, repo: data };
            } catch (e) {}
        }
    }

    const installations = await getInstallationsForUser(user.id);
    const names = [];
    for (const inst of installations) {
        let tokenData;
        try {
            tokenData = await getInstallationToken(config.github, inst.installationId.toString());
        } catch (e) {
            continue;
        }
        const headers = { Authorization: `Bearer ${tokenData.token}`, Accept: 'application/vnd.github+json' };
        try {
            const reposResp = await fetch('https://api.github.com/installation/repositories?per_page=100', { headers });
            if (!reposResp.ok) continue;
            const reposJson = await reposResp.json();
            const repos = reposJson.repositories || [];
            for (const r of repos) {
                names.push({ name: r.name, full_name: r.full_name, installationId: inst.installationId });
            }
        } catch (e) {
            continue;
        }
    }
    if (names.length) setAccessibleReposCache(user.id, names);
    const found2 = names.find(r => r.name.toLowerCase() === repoName.toLowerCase() || r.full_name.toLowerCase().endsWith('/' + repoName.toLowerCase()));
    if (found2) {
        try {
            const tokenData = await getInstallationToken(config.github, found2.installationId.toString());
            const headers = { Authorization: `Bearer ${tokenData.token}`, Accept: 'application/vnd.github+json' };
            const repoResp = await fetch(`https://api.github.com/repos/${found2.full_name}`, { headers });
            if (!repoResp.ok) return null;
            const data = await repoResp.json();
            return { installationId: found2.installationId, repo: data };
        } catch (e) {
            return null;
        }
    }
    return null;
}

async function listAccessibleRepoNames(config, user, limit = 200) {
    const { getInstallationsForUser } = require('../repositories/installationRepo');
    // honor cache first
    const cached = getAccessibleReposCache(user.id);
    if (cached) {
        return Array.from(new Set(cached.map(r => r.name))).slice(0, limit);
    }
    const installations = await getInstallationsForUser(user.id);
    const names = [];
    for (const inst of installations) {
        let tokenData;
        try {
            tokenData = await getInstallationToken(config.github, inst.installationId.toString());
        } catch (e) {
            continue;
        }
        const headers = { Authorization: `Bearer ${tokenData.token}`, Accept: 'application/vnd.github+json' };
        try {
            const reposResp = await fetch('https://api.github.com/installation/repositories?per_page=100', { headers });
            if (!reposResp.ok) continue;
            const reposJson = await reposResp.json();
            const repos = reposJson.repositories || [];
            for (const r of repos) {
                if (names.length >= limit) break;
                names.push({ name: r.name, full_name: r.full_name, installationId: inst.installationId });
            }
            if (names.length >= limit) break;
        } catch (e) {
            continue;
        }
    }
    // populate cache with objects for faster findRepo lookups
    setAccessibleReposCache(user.id, names);
    return Array.from(new Set(names.map(r => r.name))).slice(0, limit);
}

module.exports = { fetchFreshSlice, findRepoByNameAcrossInstallations, listAccessibleRepoNames };
