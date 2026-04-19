const assert = require('node:assert/strict');
const { buildCandles } = require('./helpers');
const {
  computeTechnicalFeatures,
  scoreTechnical,
} = require('../src/server/services/technical/technical-engine.service');

function run() {
  const features = computeTechnicalFeatures(buildCandles(90, { step: 0.7 }));
  const scoring = scoreTechnical(features);

  assert.equal(features.trend, 'up');
  assert.ok(Number.isFinite(features.rsi));
  assert.ok(features.atrPct > 0);
  assert.ok(['bullish', 'bearish', 'mixed'].includes(features.maAlignment));
  assert.ok(scoring.score > 0);
  assert.ok(Object.hasOwn(scoring.details, 'weights'));
}

module.exports = {
  name: 'technical engine computes explainable features and score',
  run,
};
