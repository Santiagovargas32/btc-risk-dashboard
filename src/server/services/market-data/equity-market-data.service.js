const axios = require('axios');
const env = require('../../config/env');
const cache = require('../cache.service');
const logger = require('../../utils/logger');
const { candleSchema, validateOrThrow } = require('../../utils/validators');

const INTERVAL_TO_RANGE = {
  '1m': '1d',
  '5m': '5d',
  '15m': '5d',
  '30m': '1mo',
  '1h': '3mo',
  '4h': '6mo',
  '1d': '1y',
};

function normalizeYahooInterval(interval) {
  if (interval === '4h') {
    return '1h';
  }

  return interval;
}

function parseYahooCandles(payload) {
  const result = payload?.chart?.result?.[0];
  const timestamps = result?.timestamp || [];
  const quote = result?.indicators?.quote?.[0] || {};
  const candles = [];

  for (let index = 0; index < timestamps.length; index += 1) {
    const open = Number(quote.open?.[index]);
    const high = Number(quote.high?.[index]);
    const low = Number(quote.low?.[index]);
    const close = Number(quote.close?.[index]);
    const volume = Number(quote.volume?.[index] || 0);

    if ([open, high, low, close].every(Number.isFinite) && close > 0) {
      const openTime = new Date(Number(timestamps[index]) * 1000);
      candles.push(
        validateOrThrow(
          candleSchema,
          {
            openTime,
            closeTime: openTime,
            open,
            high: Math.max(high, low, open, close),
            low: Math.min(high, low, open, close),
            close,
            volume: Number.isFinite(volume) ? Math.max(0, volume) : 0,
          },
          'Invalid Yahoo candle',
        ),
      );
    }
  }

  return candles;
}

async function fetchCandles(options = {}) {
  const symbol = options.symbol;
  const interval = options.interval || '1h';
  const yahooInterval = normalizeYahooInterval(interval);
  const range = options.range || INTERVAL_TO_RANGE[interval] || '3mo';
  const limit = options.limit || env.MARKET_LIMIT;
  const cacheKey = `yahoo:candles:${symbol}:${interval}:${range}:${limit}`;

  return cache.wrap(cacheKey, env.CACHE_TTL_SECONDS, async () => {
    logger.info('market_data.fetch.start', {
      provider: 'yahoo',
      symbol,
      interval: yahooInterval,
      range,
    });

    const response = await axios.get(`/v8/finance/chart/${encodeURIComponent(symbol)}`, {
      baseURL: env.YAHOO_FINANCE_BASE_URL,
      timeout: 10_000,
      params: {
        interval: yahooInterval,
        range,
        includePrePost: 'false',
      },
    });

    const candles = parseYahooCandles(response.data).slice(-limit);
    if (candles.length < 2) {
      throw new Error(`Yahoo Finance did not return enough candles for ${symbol}.`);
    }

    logger.info('market_data.fetch.success', {
      provider: 'yahoo',
      symbol,
      interval,
      candles: candles.length,
    });

    return candles;
  });
}

module.exports = {
  fetchCandles,
  parseYahooCandles,
};
