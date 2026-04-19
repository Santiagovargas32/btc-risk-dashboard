const { SUPPORTED_INTERVALS } = require('../../config/weights');
const { getAsset } = require('../assets/asset-registry.service');
const cryptoMarketData = require('../market-data/crypto-market-data.service');
const equityMarketData = require('../market-data/equity-market-data.service');
const { analyzeTechnical } = require('./technical-engine.service');

function marketDataForAsset(asset) {
  return asset.market === 'binance' ? cryptoMarketData : equityMarketData;
}

async function analyzeTimeframe(options = {}) {
  const asset = getAsset(options.symbol);
  const interval = options.interval || '1h';
  const service = marketDataForAsset(asset);
  const candles = await service.fetchCandles({
    symbol: asset.symbol,
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
