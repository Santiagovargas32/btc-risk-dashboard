const assert = require('node:assert/strict');
const { getAsset } = require('../src/server/services/assets/asset-registry.service');
const { unwrapEnvelope } = require('../src/server/services/geopolitics/ogid-client.service');
const {
  buildContextFromResponses,
  deriveOgidRiskContext,
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

  const newsEnvelope = unwrapEnvelope({
    ok: true,
    data: {
      news: [
        {
          title: 'Iran Revolutionary Guard sidelines president',
          countryMentions: ['US', 'IR'],
          analysisScore: 76,
          sentiment: { label: 'negative', score: -2, negativeHits: 4, positiveHits: 2 },
          conflict: { totalWeight: 9, tags: [{ tag: 'Military', count: 2, weight: 3 }] },
        },
      ],
      meta: {
        activeCountries: ['US', 'IL', 'IR'],
        sourceMode: 'live',
        dataQuality: { news: { mode: 'live', synthetic: false } },
      },
    },
  });
  assert.equal(newsEnvelope.ok, true);
  assert.equal(newsEnvelope.data.news.length, 1);
  assert.equal(newsEnvelope.meta.sourceMode, 'live');

  const riskPayload = {
    countries: {
      US: {
        iso2: 'US',
        country: 'United States',
        score: 873,
        level: 'Critical',
        trend: 'Declining',
        metrics: { newsVolume: 47, negativeSentiment: 29, conflictTagWeight: 173 },
        topTags: [{ tag: 'Military', count: 45 }, { tag: 'Nuclear Risk', count: 8 }],
      },
      IL: {
        iso2: 'IL',
        country: 'Israel',
        score: 359,
        level: 'Critical',
        trend: 'Rising',
        metrics: { newsVolume: 20, negativeSentiment: 13, conflictTagWeight: 70 },
        topTags: [{ tag: 'Military', count: 15 }],
      },
      IR: {
        iso2: 'IR',
        country: 'Iran',
        score: 947,
        level: 'Critical',
        trend: 'Declining',
        metrics: { newsVolume: 63, negativeSentiment: 35, conflictTagWeight: 179 },
        topTags: [{ tag: 'Military', count: 37 }, { tag: 'Nuclear Risk', count: 18 }],
      },
    },
  };
  const insightsPayload = {
    insights: [
      {
        id: 'insight-IR-1',
        country: 'Iran',
        iso2: 'IR',
        level: 'Critical',
        summary: 'Iran is at critical risk with sustained conflict pressure.',
        drivers: ['news-volume:63', 'negative-sentiment:35', 'conflict-weight:179', 'military:37'],
        score: 947,
      },
    ],
  };
  const impactPayload = {
    impact: {
      items: [
        {
          ticker: 'BTCUSDT',
          impactScore: 0,
          eventScore: 0,
          level: 'Low',
          linkedCountries: [],
        },
      ],
    },
  };
  const analyticsPayload = {
    impactItems: [
      {
        ticker: 'LMT',
        impactScore: 68,
        eventScore: 37,
        level: 'High',
        linkedCountries: ['US', 'IR'],
      },
    ],
  };

  const derived = deriveOgidRiskContext([
    newsEnvelope.data,
    riskPayload,
    insightsPayload,
    impactPayload,
    analyticsPayload,
  ]);
  assert.equal(derived.riskLevel, 'high');
  assert.equal(derived.sentiment, 'risk_off');
  assert.ok(derived.relevantCountries.includes('US'));
  assert.ok(derived.relevantCountries.includes('IL'));
  assert.ok(derived.relevantCountries.includes('IR'));
  assert.ok(derived.itemCounts.news >= 1);
  assert.ok(derived.itemCounts.countries >= 3);
  assert.ok(derived.itemCounts.insights >= 1);
  assert.ok(derived.itemCounts.impact >= 2);

  const ogidContext = buildContextFromResponses(btc, {
    news: { data: newsEnvelope.data, meta: newsEnvelope.meta },
    risks: { data: riskPayload },
    insights: { data: insightsPayload },
    impact: { data: impactPayload },
    analytics: { data: analyticsPayload },
  });
  assert.equal(ogidContext.riskLevel, 'high');
  assert.equal(ogidContext.sentiment, 'risk_off');
  assert.ok(ogidContext.relevantCountries.includes('US'));
  assert.ok(ogidContext.relevantCountries.includes('IL'));
  assert.ok(ogidContext.relevantCountries.includes('IR'));
  assert.ok(ogidContext.assetImpactBias < 0);
  assert.equal(ogidContext.diagnostics.sourceMode, 'live');
}

module.exports = {
  name: 'geopolitical scoring handles risk-off OGID-style payloads',
  run,
};
