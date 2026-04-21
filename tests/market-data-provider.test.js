const assert = require('node:assert/strict');
const { getAsset } = require('../src/server/services/assets/asset-registry.service');
const {
  getProviderForAsset,
} = require('../src/server/services/market-data/market-data-provider.service');

function run() {
  assert.equal(getProviderForAsset(getAsset('BTCUSDT')).name, 'binance');
  assert.equal(getProviderForAsset(getAsset('SPY')).name, 'yahoo');
  assert.throws(
    () => getProviderForAsset({ symbol: 'BAD', market: 'unknown' }),
    (error) => error.status === 400 && /Unsupported market provider/.test(error.message),
  );
}

module.exports = {
  name: 'market data provider routes assets to Binance or Yahoo',
  run,
};
