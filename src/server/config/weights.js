const SUPPORTED_INTERVALS = ['1m', '5m', '15m', '30m', '1h', '4h', '1d'];

const TECHNICAL_WEIGHTS = {
  trendStrength: 0.22,
  momentum: 0.18,
  rsi: 0.14,
  maAlignment: 0.14,
  volume: 0.1,
  breakout: 0.12,
  supportResistance: 0.1,
};

const FUSION_WEIGHTS = {
  technical: 0.45,
  macro: 0.2,
  geopolitics: 0.15,
  volatility: 0.2,
};

const TIMEFRAME_WEIGHTS = {
  intraday: {
    '1m': 0.2,
    '5m': 0.35,
    '15m': 0.45,
  },
  swing: {
    '1h': 0.25,
    '4h': 0.35,
    '1d': 0.4,
  },
  final: {
    intraday: 0.35,
    swing: 0.45,
    macro: 0.1,
    geopolitics: 0.05,
    volatility: 0.05,
  },
};

module.exports = {
  FUSION_WEIGHTS,
  SUPPORTED_INTERVALS,
  TECHNICAL_WEIGHTS,
  TIMEFRAME_WEIGHTS,
};
