const axios = require('axios');
const env = require('../../config/env');
const logger = require('../../utils/logger');

function isEnabled(options = {}) {
  return options.enabled ?? env.OGID_ENABLED;
}

function unwrapEnvelope(payload) {
  const isEnvelope = payload && typeof payload === 'object' && !Array.isArray(payload) && Object.hasOwn(payload, 'data');
  const data = isEnvelope ? payload.data : payload;
  const meta = data?.meta || payload?.meta || null;

  return {
    ok: isEnvelope && Object.hasOwn(payload, 'ok') ? Boolean(payload.ok) : true,
    data,
    meta,
    dataQuality: meta?.dataQuality || data?.dataQuality || payload?.dataQuality || null,
    raw: payload,
  };
}

async function request(path, params = {}, options = {}) {
  if (!isEnabled(options)) {
    return {
      ok: false,
      unavailable: true,
      reason: 'OGID integration disabled',
      data: null,
    };
  }

  try {
    const response = await axios.get(path, {
      baseURL: options.baseUrl || env.OGID_BASE_URL,
      timeout: options.timeoutMs || env.OGID_TIMEOUT_MS,
      params,
    });
    const normalized = unwrapEnvelope(response.data);

    return {
      ok: normalized.ok,
      unavailable: !normalized.ok,
      data: normalized.data,
      dataQuality: normalized.dataQuality,
      meta: normalized.meta,
      reason: normalized.ok ? undefined : 'OGID response returned ok=false',
      raw: normalized.raw,
    };
  } catch (error) {
    logger.warn('ogid.request.failed', {
      path,
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

function getNews(params = {}, options = {}) {
  return request('/intel/news', params, options);
}

function getSnapshot(params = {}, options = {}) {
  return request('/intel/snapshot', params, options);
}

function getInsights(params = {}, options = {}) {
  return request('/intel/insights', params, options);
}

function getRisks(params = {}, options = {}) {
  return request('/intel/risks', params, options);
}

function getMarketImpact(params = {}, options = {}) {
  return request('/market/impact', params, options);
}

function getMarketAnalytics(params = {}, options = {}) {
  return request('/market/analytics', params, options);
}

module.exports = {
  getInsights,
  getMarketAnalytics,
  getMarketImpact,
  getNews,
  getRisks,
  getSnapshot,
  isEnabled,
  request,
  unwrapEnvelope,
};
