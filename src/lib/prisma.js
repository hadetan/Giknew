const { PrismaClient } = require('@prisma/client');

let prisma = global._prisma;
if (!prisma) {
    prisma = new PrismaClient({ log: ['error', 'warn'] });
    if (process.env.NODE_ENV !== 'production') {
        global._prisma = prisma;
    }
}

module.exports = prisma;
