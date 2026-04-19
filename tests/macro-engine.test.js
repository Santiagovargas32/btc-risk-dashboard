const assert = require('node:assert/strict');
const { scoreMacro } = require('../src/server/services/macro/macro-engine.service');

function run() {
  const supportive = scoreMacro({
    regime: 'risk_on',
    inflationTrend: 'down',
    ratesTrend: 'falling',
    volatilityRegime: 'calm',
    eventRisk: 'low',
    liquidity: 'expanding',
  });
  const hostile = scoreMacro({
    regime: 'risk_off',
    inflationTrend: 'up',
    ratesTrend: 'rising',
    volatilityRegime: 'panic',
    eventRisk: 'high',
    liquidity: 'tightening',
  });

  assert.ok(supportive.score > 40);
  assert.ok(hostile.score < -60);
  assert.ok(Object.hasOwn(supportive.details, 'ratesTrend'));
}

module.exports = {
  name: 'macro scoring rewards supportive environments and penalizes hostile ones',
  run,
};
