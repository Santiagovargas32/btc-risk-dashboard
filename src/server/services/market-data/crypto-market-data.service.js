const binanceMarketData = require('../market-data.service');

async function fetchCandles(options = {}) {
  return binanceMarketData.fetchCandles(options);
}

async function getMarketFeatures(options = {}) {
  return binanceMarketData.getMarketFeatures(options);
}

module.exports = {
  SUPPORTED_INTERVALS: binanceMarketData.SUPPORTED_INTERVALS,
  fetchCandles,
  getMarketFeatures,
};
