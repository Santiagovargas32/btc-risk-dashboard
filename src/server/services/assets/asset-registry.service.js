const SEED_ASSETS = [
  {
    symbol: 'BTCUSDT',
    type: 'crypto',
    market: 'binance',
    quoteCurrency: 'USDT',
    tags: ['risk_on', 'macro_sensitive', 'crypto'],
  },
  {
    symbol: 'ETHUSDT',
    type: 'crypto',
    market: 'binance',
    quoteCurrency: 'USDT',
    tags: ['risk_on', 'macro_sensitive', 'crypto'],
  },
  {
    symbol: 'AAPL',
    type: 'stock',
    market: 'yahoo',
    quoteCurrency: 'USD',
    tags: ['risk_on', 'tech', 'growth'],
  },
  {
    symbol: 'SPY',
    type: 'etf',
    market: 'yahoo',
    quoteCurrency: 'USD',
    tags: ['risk_on', 'broad_market'],
  },
  {
    symbol: 'GLD',
    type: 'commodity_proxy',
    market: 'yahoo',
    quoteCurrency: 'USD',
    tags: ['safe_haven', 'macro_sensitive'],
  },
  {
    symbol: 'TLT',
    type: 'etf',
    market: 'yahoo',
    quoteCurrency: 'USD',
    tags: ['rates_sensitive', 'safe_haven'],
  },
];

const KNOWN_ETF_SYMBOLS = new Set([
  'DIA',
  'EEM',
  'EFA',
  'GLD',
  'HYG',
  'IWM',
  'LQD',
  'QQQ',
  'SLV',
  'SPY',
  'TLT',
  'USO',
  'VOO',
  'VTI',
  'XLE',
  'XLF',
  'XLK',
]);

function normalizeSymbol(symbol) {
  return String(symbol || 'BTCUSDT').trim().toUpperCase();
}

function cloneAsset(asset, source) {
  const cloned = {
    ...asset,
    tags: Array.isArray(asset.tags) ? [...asset.tags] : [],
  };

  if (source) {
    cloned.source = source;
  }

  return cloned;
}

function inferAsset(symbol) {
  const normalized = normalizeSymbol(symbol);

  if (normalized.endsWith('USDT') || normalized.endsWith('USD')) {
    return {
      symbol: normalized,
      type: 'crypto',
      market: 'binance',
      quoteCurrency: normalized.endsWith('USDT') ? 'USDT' : 'USD',
      tags: ['risk_on', 'macro_sensitive', 'crypto'],
    };
  }

  if (KNOWN_ETF_SYMBOLS.has(normalized)) {
    return {
      symbol: normalized,
      type: 'etf',
      market: 'yahoo',
      quoteCurrency: 'USD',
      tags: ['risk_on', 'broad_market'],
    };
  }

  return {
    symbol: normalized,
    type: 'stock',
    market: 'yahoo',
    quoteCurrency: 'USD',
    tags: ['risk_on'],
  };
}

function getSeedAsset(symbol) {
  const normalized = normalizeSymbol(symbol);
  const asset = SEED_ASSETS.find((candidate) => candidate.symbol === normalized);
  return asset ? cloneAsset(asset) : null;
}

function getAsset(symbol) {
  const normalized = normalizeSymbol(symbol);
  return getSeedAsset(normalized) || inferAsset(normalized);
}

function listAssets() {
  return SEED_ASSETS.map((asset) => cloneAsset(asset));
}

function listSeedAssets() {
  return listAssets();
}

function mergeAssets(assetGroups = []) {
  const bySymbol = new Map();

  for (const group of assetGroups) {
    for (const asset of group || []) {
      const normalized = normalizeSymbol(asset.symbol);
      if (!bySymbol.has(normalized)) {
        bySymbol.set(normalized, cloneAsset({ ...asset, symbol: normalized }, asset.source));
      }
    }
  }

  return Array.from(bySymbol.values());
}

function isSafeHaven(asset) {
  const tags = asset?.tags || [];
  return tags.includes('safe_haven') || ['GLD', 'TLT'].includes(asset?.symbol);
}

function isGrowthRiskAsset(asset) {
  const tags = asset?.tags || [];
  return tags.includes('risk_on') || tags.includes('growth') || asset?.type === 'crypto';
}

module.exports = {
  cloneAsset,
  getAsset,
  getSeedAsset,
  inferAsset,
  isGrowthRiskAsset,
  isSafeHaven,
  listAssets,
  listSeedAssets,
  mergeAssets,
  normalizeSymbol,
};
