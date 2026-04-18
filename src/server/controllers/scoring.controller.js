const { buildDashboardPayload } = require('./dashboard.controller');

async function getScoring(req, res, next) {
  try {
    const payload = await buildDashboardPayload({
      interval: req.query.interval,
    });
    res.json({
      score: payload.score,
      decision: payload.decision,
      components: payload.components,
      summary: payload.summary,
      fusion: payload.fusion,
      generatedAt: payload.generatedAt,
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getScoring,
};
