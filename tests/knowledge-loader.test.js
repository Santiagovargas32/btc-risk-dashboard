const assert = require('node:assert/strict');
const { matchKnowledge } = require('../src/server/services/knowledge/knowledge-loader.service');

async function run() {
  const matches = await matchKnowledge({
    asset: { type: 'crypto', tags: ['risk_on'] },
    technical: { features: { regime: 'breakout' } },
    macro: {
      regime: 'risk_on',
      ratesTrend: 'falling',
      volatilityRegime: 'calm',
      eventRisk: 'low',
    },
    geopolitics: { themes: ['conflict', 'energy'], riskLevel: 'medium' },
    volatility: { state: { regime: 'compressed_range', dangerLevel: 25 } },
  });

  assert.ok(matches.some((match) => match.category === 'trading_strategies'));
  assert.ok(matches.some((match) => match.category === 'macro_rules'));
  assert.ok(matches.some((match) => match.category === 'event_rules'));
}

module.exports = {
  name: 'knowledge loader matches deterministic context',
  run,
};
