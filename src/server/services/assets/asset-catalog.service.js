const {
  cloneAsset,
  getSeedAsset,
  inferAsset,
  listSeedAssets,
  mergeAssets,
  normalizeSymbol,
} = require('./asset-registry.service');
const watchlistService = require('./asset-watchlist.service');
const marketDataProvider = require('../market-data/market-data-provider.service');

function withSource(asset, source) {
  return cloneAsset(asset, source);
}

async function listWatchlistAssets(options = {}) {
  const assets = await watchlistService.readWatchlist(options);
  return assets.map((asset) => withSource(asset, 'watchlist'));
}

async function listConfiguredAssets(options = {}) {
  const seedAssets = listSeedAssets().map((asset) => withSource(asset, 'seed'));
  const watchlistAssets = await listWatchlistAssets(options);
  return mergeAssets([seedAssets, watchlistAssets]);
}

async function resolveAsset(symbol, options = {}) {
  const normalized = normalizeSymbol(symbol);
  const seedAsset = getSeedAsset(normalized);
  if (seedAsset) {
    return withSource(seedAsset, 'seed');
  }

  const watchlistAssets = await listWatchlistAssets(options);
  const watchlistAsset = watchlistAssets.find((asset) => asset.symbol === normalized);
  if (watchlistAsset) {
    return watchlistAsset;
  }

  return withSource(inferAsset(normalized), 'inferred');
}

async function validateAndResolveAsset(symbol, options = {}) {
  const asset = await resolveAsset(symbol, options);
  const validation = await marketDataProvider.validateSymbol(asset, {
    interval: options.interval,
    limit: options.limit,
  });

  return {
    asset,
    validation,
  };
}

async function addAssetToWatchlist(symbol, options = {}) {
  const resolved = await validateAndResolveAsset(symbol, options);

  if (resolved.asset.source === 'seed') {
    return {
      ...resolved,
      added: false,
      assets: await listConfiguredAssets(options),
    };
  }

  const result = await watchlistService.addWatchlistAsset(resolved.asset, options);
  return {
    asset: withSource(result.asset, 'watchlist'),
    validation: resolved.validation,
    added: result.added,
    assets: await listConfiguredAssets(options),
  };
}

async function removeAssetFromWatchlist(symbol, options = {}) {
  const result = await watchlistService.removeWatchlistAsset(symbol, options);
  return {
    removed: result.removed,
    assets: await listConfiguredAssets(options),
  };
}

module.exports = {
  addAssetToWatchlist,
  listConfiguredAssets,
  listWatchlistAssets,
  removeAssetFromWatchlist,
  resolveAsset,
  validateAndResolveAsset,
};
