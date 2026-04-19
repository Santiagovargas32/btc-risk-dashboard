const axios = require('axios');
const env = require('../../config/env');
const logger = require('../../utils/logger');

function isEnabled(options = {}) {
  return options.enabled ?? env.OGID_ENABLED;
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

    return {
      ok: true,
      unavailable: false,
      data: response.data,
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
  isEnabled,
  request,
};
