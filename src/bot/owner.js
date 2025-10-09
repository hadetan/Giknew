/**
 * Owner helper utilities
 * Exports:
 *  - isOwner(ctx): boolean
 *  - ensureOwner(ctx): Promise<boolean>
 */
function envOwnerId() {
    return process.env.OWNER_ID ? String(process.env.OWNER_ID).replace(/"/g, '') : undefined;
}

function isOwner(ctx) {
    try {
        const owner = envOwnerId();
        if (!owner) return false;
        const fromId = ctx?.from?.id;
        if (!fromId) return false;
        return String(fromId) === String(owner);
    } catch (_) {
        return false;
    }
}

async function ensureOwner(ctx) {
    if (isOwner(ctx)) return true;
    try {
        await ctx.reply('This command is available only to the bot owner.');
    } catch (_) { /* ignore */ }
    return false;
}

module.exports = { isOwner, ensureOwner };
