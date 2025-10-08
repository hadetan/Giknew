const { Router } = require('express');
const { stalePrJob } = require('../controllers/jobController');

module.exports = function buildJobRoutes(config) {
    const r = Router();
    r.post('/jobs/stale-prs', (req, res) => stalePrJob(config, req, res));
    return r;
};
