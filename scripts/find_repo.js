#!/usr/bin/env node
const { loadConfig } = require('../src/config');
const { findRepoByNameAcrossInstallations } = require('../src/github/apiClient');
const path = require('path');

async function main() {
    const repoName = process.argv[2];
    if (!repoName) {
        console.error('Usage: node scripts/find_repo.js <repoName>');
        process.exit(2);
    }
    const cfg = loadConfig();
    const prisma = require(path.join(__dirname, '..', 'src', 'lib', 'prisma'));
    const user = await prisma.user.findFirst();
    if (!user) {
        console.error('No user in DB'); process.exit(3);
    }
    const res = await findRepoByNameAcrossInstallations(cfg, user, repoName);
    if (!res) {
        console.log('Repo not found in linked installations');
        process.exit(0);
    }
    console.log('Found repo under installation', res.installationId);
    console.log('Repo metadata:');
    console.log(JSON.stringify(res.repo, null, 2));
}

main().catch(e => { 
    console.error(e);
    process.exit(4);
});
