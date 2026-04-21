const env = require('../../config/env');
const fileRepository = require('../../repositories/file.repository');
const { cloneAsset, inferAsset, normalizeSymbol } = require('./asset-registry.service');

function watchlistPath(options = {}) {
  return options.configPath || env.ASSET_CONFIG_PATH;
}

function normalizeTags(tags) {
  return Array.from(
    new Set(
      (Array.isArray(tags) ? tags : [])
        .map((tag) => String(tag || '').trim())
        .filter(Boolean),
    ),
  );
}

function sanitizeAsset(asset = {}) {
  const inferred = inferAsset(asset.symbol);
  const symbol = normalizeSymbol(asset.symbol);

  return {
    symbol,
    type: asset.type || inferred.type,
    market: asset.market || inferred.market,
    quoteCurrency: asset.quoteCurrency || inferred.quoteCurrency,
    tags: normalizeTags(Array.isArray(asset.tags) && asset.tags.length ? asset.tags : inferred.tags),
    addedAt: asset.addedAt || new Date().toISOString(),
  };
}

async function ensureWatchlist(options = {}) {
  const targetPath = watchlistPath(options);
  if (!(await fileRepository.exists(targetPath))) {
    await fileRepository.writeJson(targetPath, { assets: [] });
  }
}

async function readWatchlist(options = {}) {
  await ensureWatchlist(options);
  const payload = await fileRepository.readJson(watchlistPath(options), { assets: [] });
  const assets = Array.isArray(payload?.assets) ? payload.assets : [];
  return assets.map(sanitizeAsset);
}

async function writeWatchlist(assets, options = {}) {
  const normalizedAssets = assets.map(sanitizeAsset).sort((a, b) => a.symbol.localeCompare(b.symbol));
  await fileRepository.writeJson(watchlistPath(options), { assets: normalizedAssets });
  return normalizedAssets;
}

async function addWatchlistAsset(asset, options = {}) {
  const normalized = sanitizeAsset(asset);
  const assets = await readWatchlist(options);
  const existing = assets.find((candidate) => candidate.symbol === normalized.symbol);

  if (existing) {
    return {
      asset: cloneAsset(existing, 'watchlist'),
      added: false,
      assets: assets.map((candidate) => cloneAsset(candidate, 'watchlist')),
    };
  }

  const updated = await writeWatchlist([...assets, normalized], options);
  return {
    asset: cloneAsset(normalized, 'watchlist'),
    added: true,
    assets: updated.map((candidate) => cloneAsset(candidate, 'watchlist')),
  };
}

async function removeWatchlistAsset(symbol, options = {}) {
  const normalized = normalizeSymbol(symbol);
  const assets = await readWatchlist(options);
  const updated = assets.filter((asset) => asset.symbol !== normalized);
  await writeWatchlist(updated, options);

  return {
    removed: updated.length !== assets.length,
    assets: updated.map((asset) => cloneAsset(asset, 'watchlist')),
  };
}

module.exports = {
  addWatchlistAsset,
  readWatchlist,
  removeWatchlistAsset,
  sanitizeAsset,
  writeWatchlist,
};
