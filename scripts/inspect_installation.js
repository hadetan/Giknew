#!/usr/bin/env node
const fetch = require('node-fetch');
const { loadConfig } = require('../src/config');
const { getInstallationToken } = require('../src/github/auth');

async function main() {
    const installationId = process.argv[2] || process.env.INSTALLATION_ID;
    if (!installationId) {
        console.error('Usage: node scripts/inspect_installation.js <installation_id>');
        process.exit(2);
    }
    const cfg = loadConfig();
    try {
        const tokenData = await getInstallationToken(cfg.github, String(installationId));
        console.log('Got token (expires at)', tokenData.expiresAt);
        const headers = { Authorization: `Bearer ${tokenData.token}`, Accept: 'application/vnd.github+json' };
        const reposResp = await fetch('https://api.github.com/installation/repositories?per_page=100', { headers });
        console.log('Repositories HTTP', reposResp.status);
        const reposJson = await reposResp.json();
        const repos = reposJson.repositories || [];
        console.log('Accessible repos count:', repos.length);
        for (const r of repos) {
            console.log(`- ${r.full_name} (id:${r.id})`);
            const prsResp = await fetch(`https://api.github.com/repos/${r.full_name}/pulls?state=open&per_page=10`, { headers });
            if (!prsResp.ok) { console.log(`  PRs fetch failed: ${prsResp.status}`); continue; }
            const prs = await prsResp.json();
            if (!prs.length) { console.log('  No open PRs'); continue; }
            for (const pr of prs) {
                console.log(`  PR #${pr.number} ${pr.title} by ${pr.user?.login}`);
            }
        }
    } catch (e) {
        console.error('Failed to inspect installation:', e && e.message);
        process.exit(3);
    }
}

main();
