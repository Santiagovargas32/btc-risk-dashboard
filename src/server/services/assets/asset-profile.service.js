const { isGrowthRiskAsset, isSafeHaven } = require('./asset-registry.service');

function buildAssetProfile(asset) {
  const tags = asset?.tags || [];

  return {
    symbol: asset.symbol,
    type: asset.type,
    market: asset.market,
    quoteCurrency: asset.quoteCurrency,
    source: asset.source,
    tags,
    behavior: {
      riskOnSensitive: isGrowthRiskAsset(asset),
      safeHaven: isSafeHaven(asset),
      ratesSensitive: tags.includes('rates_sensitive'),
      crypto: asset.type === 'crypto',
      defense: tags.includes('defense'),
      energy: tags.includes('energy'),
    },
  };
}

module.exports = {
  buildAssetProfile,
};
