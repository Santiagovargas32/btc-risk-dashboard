const env = require('../../config/env');

function getFallbackMacroState(overrides = {}) {
  return {
    regime: overrides.regime || env.MACRO_REGIME,
    inflationTrend: overrides.inflationTrend || env.MACRO_INFLATION_TREND,
    ratesTrend: overrides.ratesTrend || env.MACRO_RATES_TREND,
    volatilityRegime: overrides.volatilityRegime || env.MACRO_VOLATILITY_REGIME,
    eventRisk: overrides.eventRisk || env.MACRO_EVENT_RISK,
    liquidity: overrides.liquidity || env.MACRO_LIQUIDITY,
    source: 'env-fallback',
    updatedAt: new Date().toISOString(),
  };
}

module.exports = {
  getFallbackMacroState,
};
