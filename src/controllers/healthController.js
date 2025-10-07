function getHealth(config) {
  return (req, res) => {
    res.json({ status: 'ok', uptime: process.uptime(), env: config.env, version: '0.1.0' });
  };
}

module.exports = { getHealth };
