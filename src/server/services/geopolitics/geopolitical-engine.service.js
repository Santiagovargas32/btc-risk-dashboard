const env = require('../../config/env');
const { clamp, round } = require('../../utils/math');
const { isGrowthRiskAsset, isSafeHaven } = require('../assets/asset-registry.service');
const gdeltClient = require('./gdelt-client.service');
const ogidClient = require('./ogid-client.service');

const THEME_KEYWORDS = {
  defense: ['defense', 'missile', 'military', 'air defense', 'arms', 'weapons'],
  energy: ['oil', 'gas', 'pipeline', 'lng', 'refinery', 'opec', 'hormuz'],
  sanctions: ['sanction', 'export control', 'embargo'],
  shipping: ['shipping', 'strait', 'tanker', 'maritime', 'red sea', 'hormuz'],
  macro: ['central bank', 'inflation', 'tariff', 'sovereign', 'debt'],
  conflict: ['conflict', 'war', 'attack', 'strike', 'invasion', 'nuclear risk', 'terror', 'military'],
};

const COUNTRY_NAME_TO_ISO2 = {
  'UNITED STATES': 'US',
  USA: 'US',
  'U.S.': 'US',
  US: 'US',
  ISRAEL: 'IL',
  IRAN: 'IR',
};

function payloadFromResponse(response) {
  if (!response) return null;
  if (response.data && (Object.hasOwn(response, 'ok') || Object.hasOwn(response, 'unavailable'))) {
    return response.data;
  }
  return response;
}

function normalizeCountryCode(value) {
  const normalized = String(value || '').trim().toUpperCase();
  if (!normalized) return null;
  if (/^[A-Z]{2}$/.test(normalized)) return normalized;
  return COUNTRY_NAME_TO_ISO2[normalized] || normalized;
}

function tagText(item = {}) {
  const topTags = Array.isArray(item.topTags) ? item.topTags : [];
  const conflictTags = Array.isArray(item.conflict?.tags) ? item.conflict.tags : [];

  return [...topTags, ...conflictTags]
    .map((tag) => tag.tag || tag.name || tag.label || tag)
    .filter(Boolean)
    .join(' ');
}

function textForItem(item = {}) {
  return [
    item.title,
    item.headline,
    item.summary,
    item.description,
    item.excerpt,
    item.content,
    item.theme,
    item.eventType,
    item.level,
    item.trend,
    tagText(item),
    ...(Array.isArray(item.drivers) ? item.drivers : []),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function withKind(item, kind) {
  if (!item || typeof item !== 'object') {
    return { value: item, _ogidKind: kind };
  }

  return {
    ...item,
    _ogidKind: item._ogidKind || kind,
  };
}

function countryRiskItem(country, iso2) {
  return withKind(
    {
      ...country,
      iso2: country.iso2 || iso2,
      countryCode: country.iso2 || iso2,
      title: `${country.country || iso2} ${country.level || ''} risk`,
      riskScore: country.currentRiskScore ?? country.score ?? country.cii,
      intensity: country.metrics?.conflictTagWeight,
    },
    'countries',
  );
}

function extractItems(payload, kind = 'payload') {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload.map((item) => withKind(item, kind));

  const items = [];
  const addArray = (value, nextKind) => {
    if (Array.isArray(value)) {
      items.push(...value.map((item) => withKind(item, nextKind)));
    }
  };

  addArray(payload.items, 'items');
  addArray(payload.news, 'news');
  addArray(payload.risks, 'risks');
  addArray(payload.insights, 'insights');
  addArray(payload.hotspots, 'hotspots');
  addArray(payload.predictions, 'predictions');
  addArray(payload.impactItems, 'impact');
  addArray(payload.impact?.items, 'impact');
  addArray(payload.analytics?.items, 'analytics');
  addArray(payload.analytics?.impactItems, 'analytics');
  addArray(payload.market?.impact?.items, 'impact');

  if (payload.countries && !Array.isArray(payload.countries) && typeof payload.countries === 'object') {
    for (const [iso2, country] of Object.entries(payload.countries)) {
      items.push(countryRiskItem(country, iso2));
    }
  }

  if (Array.isArray(payload.data)) {
    addArray(payload.data, 'data');
  } else if (payload.data && payload.data !== payload && typeof payload.data === 'object') {
    items.push(...extractItems(payload.data, kind));
  }

  return items;
}

function detectThemes(items) {
  const text = items.map(textForItem).join(' ');
  return Object.entries(THEME_KEYWORDS)
    .filter(([, keywords]) => keywords.some((keyword) => text.includes(keyword)))
    .map(([theme]) => theme);
}

function detectCountries(items) {
  const countries = new Set();

  for (const item of items) {
    const values = [
      item.countryCode,
      item.iso2,
      item.country,
      ...(Array.isArray(item.countries) ? item.countries : []),
      ...(Array.isArray(item.countryMentions) ? item.countryMentions : []),
      ...(Array.isArray(item.linkedCountries) ? item.linkedCountries : []),
    ];
    values
      .map(normalizeCountryCode)
      .filter(Boolean)
      .forEach((value) => countries.add(value));
  }

  return [...countries];
}

function numericRiskScore(item = {}) {
  const value = Number(
    item.riskScore
      ?? item.analysisScore
      ?? item.currentRiskScore
      ?? item.score
      ?? item.risk
      ?? item.intensity
      ?? item.cii
      ?? item.impactScore
      ?? item.eventScore,
  );
  return Number.isFinite(value) ? value : 0;
}

function conflictWeight(item = {}) {
  const values = [
    Number(item.conflict?.totalWeight),
    Number(item.metrics?.conflictTagWeight),
    Number(item.intensity),
  ].filter(Number.isFinite);

  return values.length ? Math.max(...values) : 0;
}

function levelForItem(item = {}) {
  return String(item.level || item.riskLevel || '').toLowerCase();
}

function normalizeRiskLevel(items) {
  const text = items.map(textForItem).join(' ');
  const maxScore = items.reduce((max, item) => Math.max(max, numericRiskScore(item)), 0);
  const maxConflictWeight = items.reduce((max, item) => Math.max(max, conflictWeight(item)), 0);
  const levels = items.map(levelForItem).join(' ');

  if (
    maxScore >= 75
    || maxConflictWeight >= 75
    || /\bcritical\b|\bhigh\b/.test(levels)
    || /\bpanic\b|\bwar\b|\binvasion\b/.test(text)
  ) {
    return 'high';
  }

  if (
    maxScore >= 45
    || maxConflictWeight >= 20
    || /\belevated\b|\bmedium\b|\bmoderate\b/.test(levels)
    || /\bsanction\b|\bstrike\b|\bmissile\b|\bescalat|\bnuclear\b|\bterror\b/.test(text)
  ) {
    return 'medium';
  }

  return 'low';
}

function sentimentEvidence(items) {
  return items.reduce(
    (evidence, item) => {
      const sentiment = item.sentiment || {};
      const label = String(sentiment.label || item.sentimentLabel || '').toLowerCase();
      const sentimentScore = Number(sentiment.score ?? item.sentimentScore);
      const negativeHits = Number(sentiment.negativeHits ?? item.metrics?.negativeSentiment);
      const positiveHits = Number(sentiment.positiveHits);
      const riskScore = numericRiskScore(item);
      const riskLevel = levelForItem(item);
      const pressure = conflictWeight(item);

      if (['negative', 'bearish', 'risk_off'].includes(label)) evidence.negative += 3;
      if (['positive', 'bullish', 'risk_on'].includes(label)) evidence.positive += 2;
      if (Number.isFinite(sentimentScore) && sentimentScore < 0) evidence.negative += Math.abs(sentimentScore);
      if (Number.isFinite(sentimentScore) && sentimentScore > 0) evidence.positive += sentimentScore;
      if (Number.isFinite(negativeHits)) evidence.negative += Math.min(Math.abs(negativeHits), 20) / 4;
      if (Number.isFinite(positiveHits)) evidence.positive += Math.min(Math.abs(positiveHits), 20) / 4;
      if (pressure >= 75) evidence.negative += 4;
      else if (pressure >= 8) evidence.negative += 2;
      if (riskScore >= 75) evidence.negative += 3;
      else if (riskScore >= 45) evidence.negative += 1;
      if (/\bcritical\b|\bhigh\b/.test(riskLevel)) evidence.negative += 3;

      return evidence;
    },
    { negative: 0, positive: 0 },
  );
}

function inferSentiment(themes, riskLevel, items = []) {
  const evidence = sentimentEvidence(items);

  if (riskLevel === 'high' && evidence.negative >= evidence.positive) {
    return 'risk_off';
  }

  if (evidence.negative - evidence.positive >= 4) {
    return 'risk_off';
  }

  if (themes.includes('conflict') || themes.includes('sanctions') || themes.includes('shipping')) {
    return riskLevel === 'medium' ? 'risk_off' : 'neutral';
  }

  if (evidence.positive - evidence.negative >= 4 || themes.includes('defense') || themes.includes('energy')) {
    return riskLevel === 'low' ? 'bullish' : 'neutral';
  }

  return 'neutral';
}

function driverLabel(item = {}) {
  const country = item.iso2 || item.countryCode || item.country;
  const level = item.level || item.riskLevel;
  const tags = Array.isArray(item.topTags)
    ? item.topTags.slice(0, 2).map((tag) => `${tag.tag || tag.name}:${tag.count || 1}`)
    : [];
  const drivers = Array.isArray(item.drivers) ? item.drivers.slice(0, 2) : [];

  if (country && level) return `${country} ${level} risk`;
  if (drivers.length) return drivers.join(', ');
  if (tags.length) return tags.join(', ');
  return item.title || item.headline || item.summary || null;
}

function collectTopDrivers(items, limit = 6) {
  const seen = new Set();

  return items
    .slice()
    .sort((a, b) => (numericRiskScore(b) + conflictWeight(b)) - (numericRiskScore(a) + conflictWeight(a)))
    .map(driverLabel)
    .filter(Boolean)
    .filter((label) => {
      const key = label.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit);
}

function countItemsByKind(items) {
  return items.reduce((counts, item) => {
    const kind = item._ogidKind || 'unknown';
    counts[kind] = (counts[kind] || 0) + 1;
    return counts;
  }, {});
}

function deriveOgidRiskContext(payloads = []) {
  const items = payloads.flatMap((payload) => extractItems(payload));
  const themes = detectThemes(items);
  const riskLevel = normalizeRiskLevel(items);
  const sentiment = inferSentiment(themes, riskLevel, items);

  return {
    items,
    themes,
    riskLevel,
    sentiment,
    relevantCountries: detectCountries(items),
    sentimentEvidence: sentimentEvidence(items),
    itemCounts: countItemsByKind(items),
    topDrivers: collectTopDrivers(items),
  };
}

function collectMeta(responses = [], payloads = []) {
  const metas = [
    ...responses.map((response) => response?.meta).filter(Boolean),
    ...payloads.map((payload) => payload?.meta).filter(Boolean),
  ];
  const meta = metas.find(Boolean) || {};
  const dataQuality =
    meta.dataQuality
    || responses.find((response) => response?.dataQuality)?.dataQuality
    || payloads.find((payload) => payload?.dataQuality)?.dataQuality
    || null;

  return {
    activeCountries: meta.activeCountries || meta.watchlistCountries || [],
    dataQuality,
    sourceMode: meta.sourceMode || null,
  };
}

function sourceFromResponses(responses = {}, unavailable = false) {
  if (unavailable) return 'fallback';

  const hasGdelt = responses.gdelt && !responses.gdelt.unavailable;
  const hasOgid = ['snapshot', 'news', 'insights', 'risks', 'impact', 'analytics']
    .some((key) => responses[key] && !responses[key].unavailable);

  if (hasGdelt && hasOgid) return 'ogid+gdelt';
  if (hasGdelt) return 'gdelt';
  if (hasOgid) return 'ogid';
  return 'fallback';
}

function buildContextFromResponses(asset, responses = {}) {
  const responseList = ['snapshot', 'news', 'insights', 'risks', 'impact', 'analytics', 'gdelt']
    .map((key) => responses[key])
    .filter(Boolean);
  const payloads = responseList.map(payloadFromResponse).filter(Boolean);
  const unavailable = Boolean(responses.unavailable) || (responseList.length > 0 && responseList.every((response) => response.unavailable));
  const riskContext = unavailable
    ? {
        themes: [],
        riskLevel: 'low',
        sentiment: 'neutral',
        relevantCountries: [],
        sentimentEvidence: { negative: 0, positive: 0 },
        itemCounts: {},
        topDrivers: [],
      }
    : deriveOgidRiskContext(payloads);
  const scoring = scoreGeopolitics(riskContext, asset);
  const meta = collectMeta(responseList, payloads);
  const activeCountries = meta.activeCountries.length ? meta.activeCountries : String(responses.countries || '').split(',').filter(Boolean);

  return {
    sentiment: riskContext.sentiment,
    riskLevel: riskContext.riskLevel,
    relevantCountries: riskContext.relevantCountries,
    themes: riskContext.themes,
    assetImpactBias: scoring.score,
    explanation: unavailable
      ? 'OGID unavailable or disabled; geopolitical score is neutral.'
      : buildExplanation(riskContext.sentiment, riskContext.riskLevel, riskContext.themes, asset),
    source: sourceFromResponses(responses, unavailable),
    unavailable,
    details: scoring.details,
    diagnostics: {
      activeCountries,
      dataQuality: meta.dataQuality,
      itemCounts: riskContext.itemCounts,
      sentimentEvidence: riskContext.sentimentEvidence,
      sourceMode: meta.sourceMode,
      topDrivers: riskContext.topDrivers,
    },
    updatedAt: new Date().toISOString(),
  };
}

function buildExplanation(sentiment, riskLevel, themes, asset) {
  const themeText = themes.length ? themes.join(', ') : 'no dominant theme';
  return `${asset.symbol} geopolitical context is ${sentiment} with ${riskLevel} risk; detected themes: ${themeText}.`;
}

function scoreGeopolitics(context = {}, asset = {}) {
  const themes = context.themes || [];
  let score = Number(context.assetImpactBias || 0);
  const details = {};

  const riskPenalty = context.riskLevel === 'high' ? -28 : context.riskLevel === 'medium' ? -12 : 0;
  details.broadRisk = riskPenalty;
  score += riskPenalty;

  if (context.sentiment === 'bullish') score += 12;
  if (context.sentiment === 'bearish') score -= 16;
  if (context.sentiment === 'risk_off') score -= 18;
  details.sentiment = round(score - riskPenalty, 2);

  if (isGrowthRiskAsset(asset) && context.sentiment === 'risk_off') {
    details.assetSensitivity = asset.type === 'crypto' ? -14 : -10;
    score += details.assetSensitivity;
  } else if (isSafeHaven(asset) && context.sentiment === 'risk_off') {
    details.assetSensitivity = 18;
    score += details.assetSensitivity;
  } else {
    details.assetSensitivity = 0;
  }

  if (themes.includes('defense') && asset.tags?.includes('defense')) {
    details.themeFit = 18;
    score += details.themeFit;
  } else if (themes.includes('energy') && asset.tags?.includes('energy')) {
    details.themeFit = 18;
    score += details.themeFit;
  } else if (themes.includes('shipping') && isGrowthRiskAsset(asset)) {
    details.themeFit = -8;
    score += details.themeFit;
  } else {
    details.themeFit = 0;
  }

  return {
    score: round(clamp(score, -100, 100), 2),
    details,
  };
}

async function getGeopoliticalContext(asset, options = {}) {
  const countries = options.countries || env.OGID_COUNTRIES;
  const tickers = options.tickers || asset.symbol;
  const windowMin = options.windowMin || 120;
  const params = { countries, limit: options.limit || 50 };
  const snapshot = await ogidClient.getSnapshot({ ...params, tickers, windowMin }, options);
  const gdelt = gdeltClient.isEnabled(options)
    ? await gdeltClient.getRiskNews({ maxRecords: options.gdeltMaxRecords }, options)
    : null;

  if (!snapshot.unavailable) {
    return buildContextFromResponses(asset, {
      snapshot,
      gdelt,
      countries,
    });
  }

  const [news, insights, risks, impact, analytics] = await Promise.all([
    ogidClient.getNews(params, options),
    ogidClient.getInsights({ countries }, options),
    ogidClient.getRisks({ countries }, options),
    ogidClient.getMarketImpact({ countries, tickers, windowMin }, options),
    ogidClient.getMarketAnalytics({ countries, tickers, windowMin }, options),
  ]);

  return buildContextFromResponses(asset, {
    news,
    insights,
    risks,
    impact,
    analytics,
    gdelt,
    countries,
    unavailable: [news, insights, risks, impact, analytics, gdelt].filter(Boolean).every((response) => response.unavailable),
  });
}

module.exports = {
  buildContextFromResponses,
  deriveOgidRiskContext,
  detectThemes,
  extractItems,
  getGeopoliticalContext,
  normalizeRiskLevel,
  scoreGeopolitics,
};
