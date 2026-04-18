const env = require('../config/env');
const fileRepository = require('../repositories/file.repository');
const { deserializeTrade } = require('../services/normalizer.service');
const { computeHistoricalFeatures } = require('../services/feature-engine.service');
const marketDataService = require('../services/market-data.service');
const { computeFusion } = require('../services/fusion-engine.service');
const { scoreTrade } = require('../services/scoring/rule-based-score.service');

async function loadHistoricalTrades() {
  const payload = await fileRepository.readJson(env.PROCESSED_TRADES_PATH, { trades: [] });
  const trades = Array.isArray(payload?.trades) ? payload.trades : [];
  return trades.map(deserializeTrade);
}

function getDashboardOptions(req) {
  return {
    interval: req?.query?.interval,
  };
}

async function buildDashboardPayload(options = {}) {
  const trades = await loadHistoricalTrades();
  const historical = computeHistoricalFeatures(trades);
  const market = await marketDataService.getMarketFeatures({
    interval: options.interval,
  });
  const fusion = computeFusion(historical, market);
  const scoring = scoreTrade(historical, market, fusion);

  return {
    score: scoring.score,
    decision: scoring.decision,
    components: scoring.components,
    summary: scoring.summary,
    historical,
    market,
    fusion,
    supportedIntervals: marketDataService.SUPPORTED_INTERVALS,
    generatedAt: new Date().toISOString(),
  };
}

async function getDashboard(req, res, next) {
  try {
    const payload = await buildDashboardPayload(getDashboardOptions(req));
    res.json(payload);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  buildDashboardPayload,
  getDashboard,
  getDashboardOptions,
  loadHistoricalTrades,
};
