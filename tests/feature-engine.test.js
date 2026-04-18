const assert = require('node:assert/strict');
const { computeHistoricalFeatures } = require('../src/server/services/feature-engine.service');

function run() {
  const trades = Array.from({ length: 25 }, (_, index) => ({
    id: `t-${index}`,
    timestamp: new Date(Date.UTC(2025, 0, index + 1)),
    pnl: index % 5 === 0 ? -50 : 100,
    tradeSize: 1000,
    equity: null,
  }));

  const features = computeHistoricalFeatures(trades);

  assert.equal(features.tradeCount, 25);
  assert.equal(features.winRate20, 0.8);
  assert.equal(features.momentum, 0.8);
  assert.equal(features.avgTradeSize, 1000);
  assert.ok(features.totalPnl > 0);
  assert.ok(features.trend > 0);
  assert.ok(features.equityCurve.length > 0);
}

module.exports = {
  name: 'computeHistoricalFeatures derives deterministic historical metrics',
  run,
};
