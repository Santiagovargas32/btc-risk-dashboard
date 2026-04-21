const axios = require('axios');
const env = require('../../config/env');
const logger = require('../../utils/logger');

const DEFAULT_QUERY = [
  '"central bank"',
  'inflation',
  'tariff',
  'sanctions',
  'conflict',
  'war',
  '"oil supply"',
  '"shipping disruption"',
  '"financial crisis"',
].join(' OR ');

function isEnabled(options = {}) {
  return options.gdeltEnabled ?? options.enabled ?? env.GDELT_ENABLED;
}

function articleRiskScore(article = {}) {
  const text = [
    article.title,
    article.seendate,
    article.domain,
    article.sourcecountry,
  ].filter(Boolean).join(' ').toLowerCase();

  if (/\bwar\b|\binvasion\b|\bmissile\b|\bnuclear\b|\bterror\b|\bfinancial crisis\b/.test(text)) {
    return 78;
  }

  if (/\bsanction|\bstrike\b|\bescalat|\bshipping disruption\b|\boil supply\b|\btariff\b/.test(text)) {
    return 55;
  }

  return 25;
}

function articleToRiskItem(article = {}) {
  return {
    _ogidKind: 'gdelt',
    title: article.title,
    url: article.url,
    domain: article.domain,
    countryCode: article.sourcecountry,
    language: article.language,
    publishedAt: article.seendate,
    riskScore: articleRiskScore(article),
    sentiment: {
      label: articleRiskScore(article) >= 55 ? 'negative' : 'neutral',
      score: articleRiskScore(article) >= 55 ? -1 : 0,
    },
  };
}

function normalizeDocResponse(payload = {}) {
  const articles = Array.isArray(payload.articles) ? payload.articles : [];

  return {
    news: articles.map(articleToRiskItem),
    meta: {
      sourceMode: 'live',
      dataQuality: {
        gdelt: {
          mode: 'live',
          synthetic: false,
          count: articles.length,
        },
      },
    },
  };
}

async function getRiskNews(params = {}, options = {}) {
  if (!isEnabled(options)) {
    return {
      ok: false,
      unavailable: true,
      reason: 'GDELT integration disabled',
      data: null,
    };
  }

  try {
    const response = await axios.get('/doc/doc', {
      baseURL: options.baseUrl || env.GDELT_BASE_URL,
      timeout: options.timeoutMs || env.MACRO_PROVIDER_TIMEOUT_MS,
      params: {
        query: params.query || options.query || `(${DEFAULT_QUERY})`,
        mode: 'artlist',
        format: 'json',
        sort: 'datedesc',
        timespan: params.timespan || options.timespan || env.GDELT_TIMESPAN,
        maxrecords: params.maxRecords || options.maxRecords || env.GDELT_MAX_RECORDS,
      },
    });

    const data = normalizeDocResponse(response.data);
    return {
      ok: true,
      unavailable: false,
      data,
      meta: data.meta,
      raw: response.data,
    };
  } catch (error) {
    logger.warn('gdelt.request.failed', {
      message: error.message,
    });

    return {
      ok: false,
      unavailable: true,
      reason: error.message,
      data: null,
    };
  }
}

module.exports = {
  articleRiskScore,
  articleToRiskItem,
  getRiskNews,
  isEnabled,
  normalizeDocResponse,
};
