const equityMarketData = require('./equity-market-data.service');

module.exports = {
  fetchCandles: equityMarketData.fetchCandles,
};
