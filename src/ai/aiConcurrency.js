const perUser = new Map();
let globalCount = 0;

const USER_LIMIT = parseInt(process.env.AI_USER_CONCURRENCY || '5', 10);
const GLOBAL_LIMIT = parseInt(process.env.AI_GLOBAL_CONCURRENCY || '25', 10);

function stats() {
    return { global: globalCount, users: perUser.size };
}

function acquire(userId) {
    const cur = perUser.get(userId) || 0;
    if (cur >= USER_LIMIT) return { ok: false, reason: 'user_limit', userActive: cur };
    if (globalCount >= GLOBAL_LIMIT) return { ok: false, reason: 'global_limit', globalActive: globalCount };
    perUser.set(userId, cur + 1);
    globalCount++;
    let released = false;
    return {
        ok: true,
        release: () => {
            if (released) return;
            released = true;
            const now = perUser.get(userId) || 1;
            if (now <= 1) perUser.delete(userId); else perUser.set(userId, now - 1);
            globalCount = Math.max(0, globalCount - 1);
        }
    };
}

module.exports = { acquire, stats, USER_LIMIT, GLOBAL_LIMIT };
