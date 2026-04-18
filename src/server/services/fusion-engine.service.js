const { clamp, round, scoreFromRange } = require('../utils/math');

function computeFusion(historicalFeatures, marketFeatures, options = {}) {
  const historical = historicalFeatures || {};
  const market = marketFeatures || {};
  const highMomentumThreshold = options.highMomentumThreshold ?? 0.5;
  const traderMomentumThreshold = options.traderMomentumThreshold ?? 0.55;
  const volatilityMultiplier = options.volatilityMultiplier ?? 1.5;

  const marketMomentumHigh = Number(market.momentum) >= highMomentumThreshold;
  const traderRecentEdge = Number(historical.winRate20 || historical.momentum) >= traderMomentumThreshold;
  const momentumAligned = traderRecentEdge && marketMomentumHigh;

  const historicalTrend = Number(historical.trendNormalized || historical.trend || 0);
  const marketTrend = Number(market.trend || 0);
  const trendAligned =
    Math.sign(historicalTrend) === Math.sign(marketTrend) && Math.sign(historicalTrend) !== 0;

  const comfortVolatility = Number(historical.comfortVolatility || 0);
  const marketVolatility = Number(market.volatility || 0);
  const volatilityRatio = comfortVolatility > 0 ? marketVolatility / comfortVolatility : marketVolatility;
  const volatilityRisk =
    comfortVolatility > 0
      ? marketVolatility > comfortVolatility * volatilityMultiplier
      : marketVolatility > (options.defaultHighVolatility ?? 0.03);

  let alignmentScore = 50;
  alignmentScore += momentumAligned ? 20 : -8;
  alignmentScore += trendAligned ? 18 : -10;
  alignmentScore += volatilityRisk ? -25 : 10;
  alignmentScore += scoreFromRange(Number(historical.winRate20 || 0), 0.35, 0.75) * 0.1 - 5;

  return {
    alignmentScore: round(clamp(alignmentScore, 0, 100), 2),
    signals: {
      momentumAligned,
      trendAligned,
      volatilityRisk,
    },
    context: {
      marketMomentumHigh,
      traderRecentEdge,
      volatilityRatio: round(volatilityRatio, 6),
    },
  };
}

module.exports = {
  computeFusion,
};
