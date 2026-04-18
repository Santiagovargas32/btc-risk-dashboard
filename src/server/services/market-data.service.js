const axios = require('axios');
const env = require('../config/env');
const cache = require('./cache.service');
const logger = require('../utils/logger');
const {
  momentumPercent,
  normalizedSlope,
  relativeStrengthIndex,
  volatilityFromPrices,
} = require('../utils/indicators');
const { round } = require('../utils/math');
const { candleSchema, marketFeaturesSchema, validateOrThrow } = require('../utils/validators');

const SUPPORTED_INTERVALS = ['1m', '5m', '15m', '30m', '1h', '4h', '1d'];

function normalizeInterval(interval) {
  const candidate = String(interval || env.MARKET_INTERVAL).trim();
  if (!SUPPORTED_INTERVALS.includes(candidate)) {
    const error = new Error(`Unsupported market interval "${candidate}".`);
    error.status = 400;
    error.supportedIntervals = SUPPORTED_INTERVALS;
    throw error;
  }

  return candidate;
}

function parseBinanceKline(kline) {
  const candle = {
    openTime: new Date(Number(kline[0])),
    open: Number(kline[1]),
    high: Number(kline[2]),
    low: Number(kline[3]),
    close: Number(kline[4]),
    volume: Number(kline[5]),
    closeTime: new Date(Number(kline[6])),
  };

  return validateOrThrow(candleSchema, candle, 'Invalid Binance candle');
}

function computeMarketFeatures(candles, options = {}) {
  const closes = candles.map((candle) => candle.close).filter(Number.isFinite);
  if (closes.length < 2) {
    throw new Error('At least two market candles are required to compute market features.');
  }

  const latestPrice = closes[closes.length - 1];
  const rsi = relativeStrengthIndex(closes, options.rsiPeriod ?? 14);
  const features = {
    price: round(latestPrice, 2),
    rsi: rsi === null ? null : round(rsi, 2),
    volatility: round(volatilityFromPrices(closes), 8),
    trend: round(normalizedSlope(closes), 8),
    momentum: round(momentumPercent(closes, options.momentumLookback ?? 24), 4),
  };

  return validateOrThrow(marketFeaturesSchema, features, 'Invalid market features');
}

async function fetchCandles(options = {}) {
  const baseUrl = options.baseUrl || env.BINANCE_BASE_URL;
  const symbol = options.symbol || env.MARKET_SYMBOL;
  const interval = normalizeInterval(options.interval);
  const limit = options.limit || env.MARKET_LIMIT;

  logger.info('market_data.fetch.start', {
    provider: 'binance',
    symbol,
    interval,
    limit,
  });

  const response = await axios.get('/api/v3/klines', {
    baseURL: baseUrl,
    timeout: 10_000,
    params: {
      symbol,
      interval,
      limit,
    },
  });

  if (!Array.isArray(response.data)) {
    throw new Error('Unexpected Binance klines response.');
  }

  const candles = response.data.map(parseBinanceKline);
  logger.info('market_data.fetch.success', {
    provider: 'binance',
    symbol,
    interval,
    candles: candles.length,
  });

  return candles;
}

async function getMarketFeatures(options = {}) {
  const symbol = options.symbol || env.MARKET_SYMBOL;
  const interval = normalizeInterval(options.interval);
  const limit = options.limit || env.MARKET_LIMIT;
  const cacheKey = `market:${symbol}:${interval}:${limit}`;
  const cached = cache.get(cacheKey);

  if (cached) {
    logger.info('market_data.cache.hit', {
      symbol,
      interval,
      ttlSeconds: env.CACHE_TTL_SECONDS,
    });
    return cached;
  }

  logger.info('market_data.cache.miss', {
    symbol,
    interval,
    ttlSeconds: env.CACHE_TTL_SECONDS,
  });

  const candles = await fetchCandles({ symbol, interval, limit, baseUrl: options.baseUrl });
  const features = {
    ...computeMarketFeatures(candles, options),
    symbol,
    interval,
    candleCount: candles.length,
    cacheTtlSeconds: env.CACHE_TTL_SECONDS,
    updatedAt: new Date().toISOString(),
  };

  logger.info('market_data.features.computed', {
    symbol,
    interval,
    price: features.price,
    rsi: features.rsi,
    volatility: features.volatility,
    trend: features.trend,
    momentum: features.momentum,
  });

  return cache.set(cacheKey, features, env.CACHE_TTL_SECONDS);
}

module.exports = {
  SUPPORTED_INTERVALS,
  computeMarketFeatures,
  fetchCandles,
  getMarketFeatures,
  normalizeInterval,
  parseBinanceKline,
};
