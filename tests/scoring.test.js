const assert = require('node:assert/strict');
const { computeFusion } = require('../src/server/services/fusion-engine.service');
const { decisionFromScore, scoreTrade } = require('../src/server/services/scoring/rule-based-score.service');

function run() {
  const historical = {
    winRate20: 0.7,
    momentum: 0.7,
    trend: 15,
    trendNormalized: 0.002,
    comfortVolatility: 0.02,
    drawdownPct: 0.08,
  };
  const market = {
    momentum: 1.8,
    trend: 0.001,
    volatility: 0.01,
  };
  const fusion = computeFusion(historical, market);
  const score = scoreTrade(historical, market, fusion);

  assert.ok(score.score >= 0 && score.score <= 100);
  assert.equal(score.decision, decisionFromScore(score.score));
  assert.equal(typeof score.summary, 'string');
  assert.ok(Object.hasOwn(score.components, 'alignmentScore'));
}

module.exports = {
  name: 'rule-based scoring returns a bounded decision payload',
  run,
};
