const axios = require('axios');
const env = require('../../config/env');
const logger = require('../../utils/logger');

function normalizeObservation(observation = {}) {
  const value = Number(observation.value);
  return {
    date: observation.date,
    value: Number.isFinite(value) ? value : null,
    realtimeStart: observation.realtime_start,
    realtimeEnd: observation.realtime_end,
  };
}

function validObservations(observations = []) {
  return observations
    .map(normalizeObservation)
    .filter((observation) => observation.date && Number.isFinite(observation.value))
    .sort((left, right) => new Date(left.date).getTime() - new Date(right.date).getTime());
}

async function fetchSeries(seriesId, options = {}) {
  const apiKey = options.apiKey ?? env.FRED_API_KEY;
  if (!apiKey) {
    return {
      ok: false,
      unavailable: true,
      reason: 'FRED_API_KEY is not configured',
      seriesId,
      observations: [],
    };
  }

  try {
    const response = await axios.get('/fred/series/observations', {
      baseURL: options.baseUrl || env.FRED_BASE_URL,
      timeout: options.timeoutMs || env.MACRO_PROVIDER_TIMEOUT_MS,
      params: {
        api_key: apiKey,
        file_type: 'json',
        series_id: seriesId,
        sort_order: 'desc',
        limit: options.limit || 120,
      },
    });

    return {
      ok: true,
      unavailable: false,
      seriesId,
      observations: validObservations(response.data?.observations || []),
      raw: response.data,
    };
  } catch (error) {
    logger.warn('fred.series.fetch.failed', {
      seriesId,
      message: error.message,
    });

    return {
      ok: false,
      unavailable: true,
      reason: error.message,
      seriesId,
      observations: [],
    };
  }
}

async function fetchSeriesMap(seriesMap = {}, options = {}) {
  const entries = Object.entries(seriesMap);
  const results = await Promise.all(
    entries.map(async ([key, seriesId]) => [key, await fetchSeries(seriesId, options)]),
  );

  return Object.fromEntries(results);
}

module.exports = {
  fetchSeries,
  fetchSeriesMap,
  normalizeObservation,
  validObservations,
};
