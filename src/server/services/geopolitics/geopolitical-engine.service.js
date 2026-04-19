const { clamp, round } = require('../../utils/math');
const { isGrowthRiskAsset, isSafeHaven } = require('../assets/asset-registry.service');
const ogidClient = require('./ogid-client.service');

const THEME_KEYWORDS = {
  defense: ['defense', 'missile', 'military', 'air defense', 'arms'],
  energy: ['oil', 'gas', 'pipeline', 'lng', 'refinery', 'opec'],
  sanctions: ['sanction', 'export control', 'embargo'],
  shipping: ['shipping', 'strait', 'tanker', 'maritime', 'red sea'],
  macro: ['central bank', 'inflation', 'tariff', 'sovereign', 'debt'],
  conflict: ['conflict', 'war', 'attack', 'strike', 'invasion'],
};

function extractItems(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.news)) return payload.news;
  if (Array.isArray(payload?.risks)) return payload.risks;
  if (Array.isArray(payload?.insights)) return payload.insights;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
}

function textForItem(item) {
  return [item.title, item.headline, item.summary, item.description, item.theme, item.eventType]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
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
    const values = [item.country, item.countryCode, item.iso2, ...(Array.isArray(item.countries) ? item.countries : [])];
    values.filter(Boolean).forEach((value) => countries.add(String(value).toUpperCase()));
  }

  return [...countries];
}

function normalizeRiskLevel(items) {
  const text = items.map(textForItem).join(' ');
  const numericScores = items
    .map((item) => Number(item.riskScore ?? item.score ?? item.risk ?? item.intensity))
    .filter(Number.isFinite);
  const maxScore = numericScores.length ? Math.max(...numericScores) : 0;

  if (maxScore >= 75 || /\bcritical\b|\bpanic\b|\bwar\b|\binvasion\b/.test(text)) {
    return 'high';
  }

  if (maxScore >= 45 || /\bsanction\b|\bstrike\b|\bmissile\b|\bescalat/.test(text)) {
    return 'medium';
  }

  return 'low';
}

function inferSentiment(themes, riskLevel) {
  if (riskLevel === 'high') {
    return 'risk_off';
  }

  if (themes.includes('conflict') || themes.includes('sanctions') || themes.includes('shipping')) {
    return riskLevel === 'medium' ? 'risk_off' : 'neutral';
  }

  if (themes.includes('defense') || themes.includes('energy')) {
    return 'bullish';
  }

  return 'neutral';
}

function buildContextFromResponses(asset, responses = {}) {
  const items = [
    ...extractItems(responses.news?.data),
    ...extractItems(responses.insights?.data),
    ...extractItems(responses.risks?.data),
    ...extractItems(responses.impact?.data),
    ...extractItems(responses.analytics?.data),
  ];
  const themes = detectThemes(items);
  const riskLevel = responses.unavailable ? 'low' : normalizeRiskLevel(items);
  const sentiment = responses.unavailable ? 'neutral' : inferSentiment(themes, riskLevel);
  const scoring = scoreGeopolitics({ sentiment, riskLevel, themes }, asset);

  return {
    sentiment,
    riskLevel,
    relevantCountries: detectCountries(items),
    themes,
    assetImpactBias: scoring.score,
    explanation: responses.unavailable
      ? 'OGID unavailable or disabled; geopolitical score is neutral.'
      : buildExplanation(sentiment, riskLevel, themes, asset),
    source: responses.unavailable ? 'fallback' : 'ogid',
    unavailable: Boolean(responses.unavailable),
    details: scoring.details,
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
  const countries = options.countries || 'US,IL,IR';
  const tickers = options.tickers || asset.symbol;
  const params = { countries, limit: options.limit || 50 };

  const [news, insights, risks, impact, analytics] = await Promise.all([
    ogidClient.getNews(params, options),
    ogidClient.getInsights({ countries }, options),
    ogidClient.getRisks({ countries }, options),
    ogidClient.getMarketImpact({ countries, tickers, windowMin: options.windowMin || 120 }, options),
    ogidClient.getMarketAnalytics({ countries, tickers, windowMin: options.windowMin || 120 }, options),
  ]);

  return buildContextFromResponses(asset, {
    news,
    insights,
    risks,
    impact,
    analytics,
    unavailable: [news, insights, risks, impact, analytics].every((response) => response.unavailable),
  });
}

module.exports = {
  buildContextFromResponses,
  detectThemes,
  getGeopoliticalContext,
  scoreGeopolitics,
};
