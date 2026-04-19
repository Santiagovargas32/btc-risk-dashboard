const assert = require('node:assert/strict');
const {
  buildKnowledgeFromText,
  classifyChunk,
} = require('../src/server/services/knowledge/pdf-knowledge-engine.service');

function run() {
  const text = `
Trend following breakout systems work best when volatility compression resolves with volume expansion.

If inflation cools and central bank rates are falling, liquidity can support risk assets.

Geopolitical conflict can lift oil and defense assets while creating risk-off pressure.

High volatility drawdown periods require reduced position size and strict stop loss rules.
`;
  const extracted = buildKnowledgeFromText(text, 'sample.pdf');

  assert.ok(classifyChunk(text).includes('trading_strategies'));
  assert.ok(extracted.trading_strategies.strategies.length > 0);
  assert.ok(extracted.macro_rules.rules.length > 0);
  assert.ok(extracted.event_rules.rules.length > 0);
  assert.ok(extracted.risk_rules.rules.length > 0);
}

module.exports = {
  name: 'pdf knowledge engine normalizes text into reusable JSON categories',
  run,
};
