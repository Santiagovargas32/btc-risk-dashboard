const assert = require('node:assert/strict');
const { getMacroSnapshot, scoreMacro } = require('../src/server/services/macro/macro-engine.service');

async function run() {
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

  const criticalOgidSnapshot = {
    countries: {
      IR: {
        iso2: 'IR',
        country: 'Iran',
        score: 947,
        level: 'Critical',
        metrics: { negativeSentiment: 35, conflictTagWeight: 179 },
        topTags: [{ tag: 'Military', count: 37 }],
      },
    },
  };

  const explicit = await getMacroSnapshot({
    cache: false,
    eventRisk: 'medium',
    ogidSnapshot: criticalOgidSnapshot,
  });
  assert.equal(explicit.eventRisk, 'medium');
  assert.equal(explicit.eventRiskSource, 'option');

  const calendar = await getMacroSnapshot({
    cache: false,
    eventDates: new Date().toISOString(),
    ogidSnapshot: { news: [] },
  });
  assert.equal(calendar.eventRisk, 'high');
  assert.equal(calendar.eventRiskSource, 'calendar');

  const ogidDriven = await getMacroSnapshot({
    cache: false,
    eventDates: '',
    ogidSnapshot: criticalOgidSnapshot,
  });
  assert.equal(ogidDriven.eventRisk, 'high');
  assert.equal(ogidDriven.eventRiskSource, 'ogid');
  assert.ok(ogidDriven.ogidDrivers.length > 0);

  const publicDriven = await getMacroSnapshot({
    cache: false,
    enabled: false,
    eventDates: '',
    publicMacroContext: {
      provider: 'public',
      source: 'public-macro-provider',
      ratesTrend: 'falling',
      indicators: [{ label: '2Y Treasury', value: 3.5, unit: '%', source: 'fred:DGS2' }],
      events: [{ type: 'FOMC', startsAt: new Date().toISOString(), source: 'fed-fomc-calendar' }],
      diagnostics: {
        missingSeries: [],
        providerErrors: [],
        calendarSources: ['fed-fomc-calendar'],
        dataFreshness: {},
      },
      updatedAt: new Date().toISOString(),
    },
  });
  assert.equal(publicDriven.provider, 'public');
  assert.equal(publicDriven.ratesTrend, 'falling');
  assert.equal(publicDriven.eventRisk, 'high');
  assert.equal(publicDriven.eventRiskSource, 'fed-fomc-calendar');
  assert.ok(publicDriven.indicators.length > 0);

  const fallback = await getMacroSnapshot({
    cache: false,
    enabled: false,
    eventDates: '',
  });
  assert.equal(fallback.eventRisk, 'low');
  assert.equal(fallback.eventRiskSource, 'env-fallback');
}

module.exports = {
  name: 'macro scoring rewards supportive environments and penalizes hostile ones',
  run,
};
