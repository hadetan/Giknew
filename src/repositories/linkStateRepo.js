const crypto = require('crypto');
const prisma = require('../lib/prisma');

function generateState() {
  return crypto.randomUUID();
}

async function createState(userId) {
  const state = generateState();
  const row = await prisma.linkState.create({ data: { userId, state } });
  return row.state;
}

async function consumeState(state) {
  return prisma.linkState.update({ where: { state }, data: { consumed: true } });
}

async function findByState(state) {
  return prisma.linkState.findUnique({ where: { state } });
}

module.exports = { createState, consumeState, findByState };