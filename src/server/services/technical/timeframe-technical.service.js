const { SUPPORTED_INTERVALS } = require('../../config/weights');
const { getAsset } = require('../assets/asset-registry.service');
const marketDataProvider = require('../market-data/market-data-provider.service');
const { analyzeTechnical } = require('./technical-engine.service');

function marketDataForAsset(asset) {
  return marketDataProvider.getProviderForAsset(asset);
}

async function analyzeTimeframe(options = {}) {
  const asset = options.asset || getAsset(options.symbol);
  const interval = options.interval || '1h';
  const candles = await marketDataProvider.fetchCandles({
    asset,
    interval,
    limit: options.limit,
  });

  return {
    asset,
    interval,
    candles,
    technical: analyzeTechnical(candles, options.technicalOptions),
  };
}

async function analyzeMultiTimeframe(options = {}) {
  const intervals = options.intervals || SUPPORTED_INTERVALS;
  const analyses = [];

  for (const interval of intervals) {
    analyses.push(await analyzeTimeframe({ ...options, interval }));
  }

  return analyses;
}

module.exports = {
  SUPPORTED_INTERVALS,
  analyzeMultiTimeframe,
  analyzeTimeframe,
  marketDataForAsset,
};
