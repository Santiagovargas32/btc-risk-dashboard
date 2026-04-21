const assert = require('node:assert/strict');
const {
  getAsset,
  listSeedAssets,
  mergeAssets,
  normalizeSymbol,
} = require('../src/server/services/assets/asset-registry.service');

function run() {
  const seeds = listSeedAssets();
  const spy = getAsset('spy');
  const merged = mergeAssets([
    seeds.map((asset) => ({ ...asset, source: 'seed' })),
    [
      {
        symbol: 'SPY',
        type: 'etf',
        market: 'yahoo',
        quoteCurrency: 'USD',
        tags: ['duplicate'],
        source: 'watchlist',
      },
      {
        symbol: 'NVDA',
        type: 'stock',
        market: 'yahoo',
        quoteCurrency: 'USD',
        tags: ['risk_on'],
        source: 'watchlist',
      },
    ],
  ]);

  assert.equal(normalizeSymbol(' spy '), 'SPY');
  assert.equal(spy.market, 'yahoo');
  assert.equal(spy.type, 'etf');
  assert.equal(seeds.some((asset) => asset.symbol === 'BTCUSDT'), true);
  assert.equal(merged.filter((asset) => asset.symbol === 'SPY').length, 1);
  assert.equal(merged.find((asset) => asset.symbol === 'SPY').source, 'seed');
  assert.equal(merged.find((asset) => asset.symbol === 'NVDA').source, 'watchlist');
}

module.exports = {
  name: 'asset registry normalizes seeds and deduplicates watchlist entries',
  run,
};
