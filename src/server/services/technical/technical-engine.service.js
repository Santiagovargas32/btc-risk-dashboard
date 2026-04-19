const {
  closeToCloseReturns,
  momentumPercent,
  normalizedSlope,
  relativeStrengthIndex,
  volatilityFromPrices,
} = require('../../utils/indicators');
const { average, clamp, round, safeDivide, stdDeviation } = require('../../utils/math');
const { TECHNICAL_WEIGHTS } = require('../../config/weights');

function ema(values, period) {
  const clean = values.map(Number).filter(Number.isFinite);
  if (clean.length === 0) {
    return null;
  }

  const smoothing = 2 / (period + 1);
  let current = clean.slice(0, Math.min(period, clean.length)).reduce((sum, value) => sum + value, 0) / Math.min(period, clean.length);

  for (let index = period; index < clean.length; index += 1) {
    current = clean[index] * smoothing + current * (1 - smoothing);
  }

  return current;
}

function trueRanges(candles) {
  const ranges = [];

  for (let index = 0; index < candles.length; index += 1) {
    const candle = candles[index];
    const previousClose = index > 0 ? candles[index - 1].close : candle.close;
    ranges.push(
      Math.max(
        candle.high - candle.low,
        Math.abs(candle.high - previousClose),
        Math.abs(candle.low - previousClose),
      ),
    );
  }

  return ranges;
}

function averageTrueRange(candles, period = 14) {
  return average(trueRanges(candles).slice(-period), 0);
}

function zScore(latest, values) {
  const baseline = values.slice(0, -1);
  const mean = average(baseline, 0);
  const deviation = stdDeviation(baseline, 0);
  return deviation > 0 ? (latest - mean) / deviation : 0;
}

function detectSupportResistance(candles, lookback = 40) {
  const recent = candles.slice(-lookback);
  const highs = recent.map((candle) => candle.high);
  const lows = recent.map((candle) => candle.low);
  const close = candles[candles.length - 1]?.close || 0;
  const resistance = Math.max(...highs);
  const support = Math.min(...lows);

  return {
    support: round(support, 6),
    resistance: round(resistance, 6),
    supportDistancePct: round(safeDivide(close - support, close, 0) * 100, 4),
    resistanceDistancePct: round(safeDivide(resistance - close, close, 0) * 100, 4),
  };
}

function classifyRegime(features) {
  const absTrend = Math.abs(features.trendStrength);
  const absMomentum = Math.abs(features.momentum);

  if (features.atrPct >= 4.5 && absTrend < 25) {
    return 'high_vol_noise';
  }

  if (
    absMomentum >= 1.1 &&
    features.volumeZscore >= 0.6 &&
    (features.supportResistance.resistanceDistancePct <= 0.25 ||
      features.supportResistance.supportDistancePct <= 0.25)
  ) {
    return 'breakout';
  }

  if (absTrend >= 28 && features.maAlignment !== 'mixed') {
    return 'trend';
  }

  return 'range';
}

function movingAverageAlignment(close, emaFast, emaSlow) {
  if (!Number.isFinite(emaFast) || !Number.isFinite(emaSlow)) {
    return 'mixed';
  }

  if (close > emaFast && emaFast > emaSlow) {
    return 'bullish';
  }

  if (close < emaFast && emaFast < emaSlow) {
    return 'bearish';
  }

  return 'mixed';
}

function computeTechnicalFeatures(candles, options = {}) {
  const clean = Array.isArray(candles)
    ? candles.filter((candle) => [candle.open, candle.high, candle.low, candle.close].every(Number.isFinite))
    : [];

  if (clean.length < 20) {
    throw new Error('At least 20 candles are required for technical analysis.');
  }

  const closes = clean.map((candle) => candle.close);
  const volumes = clean.map((candle) => candle.volume || 0);
  const close = closes[closes.length - 1];
  const emaFast = ema(closes, options.fastEmaPeriod || 20);
  const emaSlow = ema(closes, options.slowEmaPeriod || 50);
  const atr = averageTrueRange(clean, options.atrPeriod || 14);
  const trendSlope = normalizedSlope(closes.slice(-(options.trendLookback || 50)));
  const supportResistance = detectSupportResistance(clean, options.supportLookback || 40);

  const features = {
    price: round(close, 6),
    trend: trendSlope > 0.00015 ? 'up' : trendSlope < -0.00015 ? 'down' : 'sideways',
    trendStrength: round(clamp(trendSlope * 10000, -100, 100), 2),
    momentum: round(momentumPercent(closes, options.momentumLookback || 20), 4),
    rsi: round(relativeStrengthIndex(closes, options.rsiPeriod || 14) ?? 50, 2),
    atr: round(atr, 6),
    atrPct: round(safeDivide(atr, close, 0) * 100, 4),
    volatility: round(volatilityFromPrices(closes) * 100, 4),
    realizedVolatility: round(stdDeviation(closeToCloseReturns(closes).slice(-30), 0) * 100, 4),
    volumeZscore: round(zScore(volumes[volumes.length - 1] || 0, volumes), 4),
    emaFast: round(emaFast, 6),
    emaSlow: round(emaSlow, 6),
    distanceFromEmaFastPct: round(safeDivide(close - emaFast, close, 0) * 100, 4),
    distanceFromEmaSlowPct: round(safeDivide(close - emaSlow, close, 0) * 100, 4),
    maAlignment: movingAverageAlignment(close, emaFast, emaSlow),
    supportResistance,
    candleCount: clean.length,
  };

  return {
    ...features,
    regime: classifyRegime(features),
  };
}

function scoreRsi(rsi) {
  if (rsi >= 80) return 35;
  if (rsi >= 55) return clamp((rsi - 55) * 4, 0, 100);
  if (rsi <= 20) return -35;
  if (rsi <= 45) return -clamp((45 - rsi) * 4, 0, 100);
  return 0;
}

function scoreTechnical(features) {
  const f = features || {};
  const momentumScore = clamp(Number(f.momentum || 0) * 18, -100, 100);
  const trendScore = clamp(Number(f.trendStrength || 0), -100, 100);
  const rsiScore = scoreRsi(Number(f.rsi || 50));
  const maScore = f.maAlignment === 'bullish' ? 75 : f.maAlignment === 'bearish' ? -75 : 0;
  const volumeScore =
    f.regime === 'high_vol_noise'
      ? -25
      : clamp(Number(f.volumeZscore || 0) * Math.sign(momentumScore || trendScore || 1) * 22, -45, 45);
  const breakoutScore =
    f.regime === 'breakout'
      ? clamp(Math.sign(momentumScore || trendScore || 1) * (55 + Math.abs(momentumScore) * 0.25), -100, 100)
      : f.regime === 'trend'
        ? Math.sign(trendScore) * 20
        : f.regime === 'high_vol_noise'
          ? -30
          : 0;
  const nearSupport = Number(f.supportResistance?.supportDistancePct ?? 100) <= 1;
  const nearResistance = Number(f.supportResistance?.resistanceDistancePct ?? 100) <= 1;
  const supportResistanceScore =
    nearSupport && momentumScore >= 0
      ? 22
      : nearResistance && momentumScore <= 0
        ? -22
        : nearResistance && Number(f.rsi || 50) > 68
          ? -18
          : 0;

  const details = {
    trendStrength: round(trendScore, 2),
    momentum: round(momentumScore, 2),
    rsi: round(rsiScore, 2),
    maAlignment: round(maScore, 2),
    volume: round(volumeScore, 2),
    breakout: round(breakoutScore, 2),
    supportResistance: round(supportResistanceScore, 2),
  };

  const score = Object.entries(TECHNICAL_WEIGHTS).reduce(
    (total, [key, weight]) => total + (details[key] || 0) * weight,
    0,
  );

  return {
    score: round(clamp(score, -100, 100), 2),
    details: {
      ...details,
      weights: TECHNICAL_WEIGHTS,
      regime: f.regime,
      trend: f.trend,
      maAlignment: f.maAlignment,
    },
  };
}

function analyzeTechnical(candles, options = {}) {
  const features = computeTechnicalFeatures(candles, options);
  const scoring = scoreTechnical(features);

  return {
    score: scoring.score,
    features,
    details: scoring.details,
  };
}

module.exports = {
  analyzeTechnical,
  averageTrueRange,
  computeTechnicalFeatures,
  ema,
  scoreTechnical,
};
