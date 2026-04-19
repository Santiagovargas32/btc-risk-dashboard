const assert = require('node:assert/strict');
const { getAsset } = require('../src/server/services/assets/asset-registry.service');
const {
  buildContextFromResponses,
  scoreGeopolitics,
} = require('../src/server/services/geopolitics/geopolitical-engine.service');

function run() {
  const btc = getAsset('BTCUSDT');
  const gld = getAsset('GLD');
  const context = {
    sentiment: 'risk_off',
    riskLevel: 'high',
    themes: ['conflict', 'energy', 'sanctions'],
  };

  assert.ok(scoreGeopolitics(context, btc).score < 0);
  assert.ok(scoreGeopolitics(context, gld).score > scoreGeopolitics(context, btc).score);

  const fromOgid = buildContextFromResponses(btc, {
    news: {
      data: {
        news: [
          {
            title: 'Oil shipping conflict escalates',
            country: 'IR',
            riskScore: 82,
          },
        ],
      },
    },
  });
  assert.equal(fromOgid.riskLevel, 'high');
  assert.ok(fromOgid.themes.includes('energy'));
}

module.exports = {
  name: 'geopolitical scoring handles risk-off OGID-style payloads',
  run,
};
