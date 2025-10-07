const { Router } = require('express');
const { getHealth } = require('../controllers/healthController');

module.exports = function buildHealthRoutes(config) {
  const r = Router();
  r.get('/health', getHealth(config));
  return r;
};
