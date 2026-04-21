const assetCatalog = require('../services/assets/asset-catalog.service');

function requireSymbol(symbol) {
  const value = String(symbol || '').trim();
  if (!value) {
    const error = new Error('Asset symbol is required.');
    error.status = 400;
    throw error;
  }

  return value;
}

async function getAssets(req, res, next) {
  try {
    const assets = await assetCatalog.listConfiguredAssets();
    res.json({ assets });
  } catch (error) {
    next(error);
  }
}

async function resolveAsset(req, res, next) {
  try {
    const symbol = requireSymbol(req.query.symbol);
    const payload = await assetCatalog.validateAndResolveAsset(symbol, {
      interval: req.query.interval,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
    });
    res.json(payload);
  } catch (error) {
    next(error);
  }
}

async function addWatchlistAsset(req, res, next) {
  try {
    const symbol = requireSymbol(req.body?.symbol);
    const payload = await assetCatalog.addAssetToWatchlist(symbol, {
      interval: req.body?.interval || req.query.interval,
      limit: req.body?.limit ? Number(req.body.limit) : undefined,
    });
    res.status(payload.added ? 201 : 200).json(payload);
  } catch (error) {
    next(error);
  }
}

async function removeWatchlistAsset(req, res, next) {
  try {
    const symbol = requireSymbol(req.params.symbol);
    const payload = await assetCatalog.removeAssetFromWatchlist(symbol);
    res.json(payload);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  addWatchlistAsset,
  getAssets,
  removeWatchlistAsset,
  resolveAsset,
};
