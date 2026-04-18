function getHealth(req, res) {
  res.json({
    status: 'ok',
    service: 'btc-risk-dashboard',
    timestamp: new Date().toISOString(),
  });
}

module.exports = {
  getHealth,
};
