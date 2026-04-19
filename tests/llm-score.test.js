const assert = require('node:assert/strict');
const { fallbackResponse, scoreWithLlm } = require('../src/server/services/scoring/llm-score.service');

async function run() {
  const fallback = fallbackResponse('missing key');
  const disabled = await scoreWithLlm({ deterministic: { signal: 'WAIT' } }, { enabled: false });

  assert.equal(fallback.enabled, false);
  assert.equal(disabled.enabled, false);
  assert.equal(disabled.sentiment, 'neutral');
  assert.ok(Array.isArray(disabled.contradictions));
}

module.exports = {
  name: 'llm service falls back safely when OpenAI is disabled',
  run,
};
