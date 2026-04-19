const assert = require('node:assert/strict');
const {
  runFusion,
  runMultiTimeframeFusion,
} = require('../src/server/services/fusion/fusion-engine.service');

function run() {
  const strong = runFusion({
    technical: { score: 90 },
    macro: { score: 55, eventRisk: 'low' },
    geopolitics: { assetImpactBias: 20, riskLevel: 'low' },
    volatility: { score: 45, state: { dangerLevel: 20 } },
  });
  const weak = runFusion({
    technical: { score: -80 },
    macro: { score: -60, eventRisk: 'high' },
    geopolitics: { assetImpactBias: -40, riskLevel: 'high' },
    volatility: { score: -55, state: { dangerLevel: 88 } },
  });
  const multi = runMultiTimeframeFusion({
    timeframes: [
      { interval: '1m', technical: { score: 10 } },
      { interval: '5m', technical: { score: 30 } },
      { interval: '15m', technical: { score: 50 } },
      { interval: '1h', technical: { score: 60 } },
      { interval: '4h', technical: { score: 65 } },
      { interval: '1d', technical: { score: 70 } },
    ],
    macro: { score: 10, eventRisk: 'low' },
    geopolitics: { assetImpactBias: 0, riskLevel: 'low' },
    volatility: { score: 15, state: { dangerLevel: 25 } },
  });

  assert.equal(strong.signal, 'STRONG_LONG');
  assert.equal(weak.signal, 'STRONG_SHORT');
  assert.ok(multi.alignment.swing === 'bullish');
  assert.ok(strong.positionSizing.suggestedRiskPct > weak.positionSizing.suggestedRiskPct);
}

module.exports = {
  name: 'fusion engine returns structured thresholds and timeframe alignment',
  run,
};
