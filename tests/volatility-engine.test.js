const assert = require('node:assert/strict');
const { buildCandles } = require('./helpers');
const {
  analyzeVolatility,
  scoreVolatility,
} = require('../src/server/services/volatility/volatility-engine.service');

function run() {
  const analysis = analyzeVolatility(buildCandles(90), {
    realizedVolatility: 1.2,
    atrPct: 1.1,
    trendStrength: 55,
    momentum: 3,
  });
  const noisy = scoreVolatility({
    regime: 'high_vol_noise',
    expansionProbability: 40,
    directionalClarity: 20,
    dangerLevel: 90,
  });

  assert.ok(Number.isFinite(analysis.score));
  assert.ok(analysis.state.impliedVolatilityProxy.proxyIv >= 0);
  assert.ok(noisy.score < 0);
}

module.exports = {
  name: 'volatility engine classifies regimes and penalizes noisy danger',
  run,
};
