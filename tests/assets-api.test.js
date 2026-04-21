const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const tmpDir = path.join(process.cwd(), 'tests/.tmp');
process.env.ASSET_CONFIG_PATH = path.join(tmpDir, 'watchlist-api.json');

const marketDataProvider = require('../src/server/services/market-data/market-data-provider.service');
const app = require('../src/server/app');

function listen() {
  return new Promise((resolve) => {
    const server = app.listen(0, () => resolve(server));
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

async function request(baseUrl, pathName, options = {}) {
  const response = await fetch(`${baseUrl}${pathName}`, {
    headers: {
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const payload = await response.json();
  return { payload, response };
}

async function run() {
  fs.rmSync(tmpDir, { recursive: true, force: true });

  const originalValidateSymbol = marketDataProvider.validateSymbol;
  marketDataProvider.validateSymbol = async (asset, options = {}) => ({
    valid: true,
    symbol: asset.symbol,
    provider: asset.market,
    interval: options.interval || '1h',
    candleCount: 120,
    updatedAt: new Date().toISOString(),
  });

  const server = await listen();
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  try {
    const list = await request(baseUrl, '/api/assets');
    assert.equal(list.response.status, 200);
    assert.equal(list.payload.assets.some((asset) => asset.symbol === 'SPY' && asset.source === 'seed'), true);

    const resolved = await request(baseUrl, '/api/assets/resolve?symbol=SPY&interval=1h');
    assert.equal(resolved.response.status, 200);
    assert.equal(resolved.payload.asset.symbol, 'SPY');
    assert.equal(resolved.payload.validation.provider, 'yahoo');

    const added = await request(baseUrl, '/api/assets/watchlist', {
      method: 'POST',
      body: {
        symbol: 'NVDA',
        interval: '1h',
      },
    });
    assert.equal(added.response.status, 201);
    assert.equal(added.payload.asset.symbol, 'NVDA');
    assert.equal(added.payload.asset.source, 'watchlist');

    const withWatchlist = await request(baseUrl, '/api/assets');
    assert.equal(
      withWatchlist.payload.assets.some((asset) => asset.symbol === 'NVDA' && asset.source === 'watchlist'),
      true,
    );

    const removed = await request(baseUrl, '/api/assets/watchlist/NVDA', { method: 'DELETE' });
    assert.equal(removed.response.status, 200);
    assert.equal(removed.payload.removed, true);
    assert.equal(removed.payload.assets.some((asset) => asset.symbol === 'NVDA'), false);
  } finally {
    marketDataProvider.validateSymbol = originalValidateSymbol;
    await close(server);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

module.exports = {
  name: 'assets API lists, resolves, adds, and removes watchlist assets',
  run,
};
