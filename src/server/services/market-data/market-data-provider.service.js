const env = require('../../config/env');
const cache = require('../cache.service');
const legacyBinanceMarketData = require('../market-data.service');
const { getAsset } = require('../assets/asset-registry.service');
const cryptoMarketData = require('./crypto-market-data.service');
const equityMarketData = require('./equity-market-data.service');

const PROVIDERS = {
  binance: {
    name: 'binance',
    fetchCandles: cryptoMarketData.fetchCandles,
  },
  yahoo: {
    name: 'yahoo',
    fetchCandles: equityMarketData.fetchCandles,
  },
};

function marketDataError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function resolveAsset(options = {}) {
  if (options.asset) {
    return options.asset;
  }

  return getAsset(options.symbol);
}

function getProviderForAsset(asset = {}) {
  const provider = PROVIDERS[asset.market];
  if (!provider) {
    throw marketDataError(`Unsupported market provider "${asset.market}" for ${asset.symbol || 'asset'}.`);
  }

  return provider;
}

async function fetchCandles(options = {}) {
  const asset = resolveAsset(options);
  const provider = getProviderForAsset(asset);
  const interval = legacyBinanceMarketData.normalizeInterval(options.interval);
  const limit = options.limit || env.MARKET_LIMIT;
  const cacheKey = `market:candles:${provider.name}:${asset.symbol}:${interval}:${limit}`;

  return cache.wrap(cacheKey, env.CACHE_TTL_SECONDS, () =>
    provider.fetchCandles({
      ...options,
      symbol: asset.symbol,
      interval,
      limit,
    }),
  );
}

async function getMarketFeatures(options = {}) {
  const asset = resolveAsset(options);
  const provider = getProviderForAsset(asset);
  const interval = legacyBinanceMarketData.normalizeInterval(options.interval);
  const limit = options.limit || env.MARKET_LIMIT;
  const cacheKey = `market:features:${provider.name}:${asset.symbol}:${interval}:${limit}`;

  return cache.wrap(cacheKey, env.CACHE_TTL_SECONDS, async () => {
    const candles = await fetchCandles({
      ...options,
      asset,
      interval,
      limit,
    });
    const features = legacyBinanceMarketData.computeMarketFeatures(candles, options);

    return {
      ...features,
      symbol: asset.symbol,
      interval,
      candleCount: candles.length,
      provider: provider.name,
      market: asset.market,
      cacheTtlSeconds: env.CACHE_TTL_SECONDS,
      updatedAt: new Date().toISOString(),
    };
  });
}

async function validateSymbol(asset, options = {}) {
  const resolvedAsset = asset?.market ? asset : resolveAsset(asset || options);
  const interval = legacyBinanceMarketData.normalizeInterval(options.interval);
  const limit = options.limit || env.MARKET_LIMIT;
  const provider = getProviderForAsset(resolvedAsset);

  try {
    const candles = await fetchCandles({
      asset: resolvedAsset,
      interval,
      limit,
    });

    if (candles.length < 20) {
      throw marketDataError(`${resolvedAsset.symbol} did not return enough candles for analysis.`);
    }

    return {
      valid: true,
      symbol: resolvedAsset.symbol,
      provider: provider.name,
      interval,
      candleCount: candles.length,
      updatedAt: new Date().toISOString(),
    };
  } catch (error) {
    error.status = error.status || 400;
    throw error;
  }
}

module.exports = {
  PROVIDERS,
  SUPPORTED_INTERVALS: legacyBinanceMarketData.SUPPORTED_INTERVALS,
  fetchCandles,
  getMarketFeatures,
  getProviderForAsset,
  validateSymbol,
};
