const ASSETS = [
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

function normalizeSymbol(symbol) {
  return String(symbol || 'BTCUSDT').trim().toUpperCase();
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

  return {
    symbol: normalized,
    type: 'stock',
    market: 'yahoo',
    quoteCurrency: 'USD',
    tags: ['risk_on'],
  };
}

function getAsset(symbol) {
  const normalized = normalizeSymbol(symbol);
  return ASSETS.find((asset) => asset.symbol === normalized) || inferAsset(normalized);
}

function listAssets() {
  return ASSETS.map((asset) => ({ ...asset, tags: [...asset.tags] }));
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
  getAsset,
  inferAsset,
  isGrowthRiskAsset,
  isSafeHaven,
  listAssets,
  normalizeSymbol,
};
