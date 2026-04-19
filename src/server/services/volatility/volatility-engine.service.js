const { closeToCloseReturns } = require('../../utils/indicators');
const { average, clamp, round, stdDeviation } = require('../../utils/math');
const { proxyImpliedVolatility } = require('./options-proxy-engine.service');

function percentileRank(value, values) {
  const clean = values.filter(Number.isFinite);
  if (clean.length === 0) {
    return 50;
  }

  const below = clean.filter((candidate) => candidate <= value).length;
  return (below / clean.length) * 100;
}

function rollingRealizedVolatility(closes, window = 20) {
  const returns = closeToCloseReturns(closes);
  const vols = [];

  for (let index = window; index <= returns.length; index += 1) {
    vols.push(stdDeviation(returns.slice(index - window, index), 0) * 100);
  }

  return vols;
}

function computeVolatilityState(candles, technicalFeatures = {}) {
  const closes = candles.map((candle) => candle.close).filter(Number.isFinite);
  const currentRealized = Number(technicalFeatures.realizedVolatility || 0);
  const atrPct = Number(technicalFeatures.atrPct || 0);
  const vols = rollingRealizedVolatility(closes, 20);
  const volPercentile = percentileRank(currentRealized, vols);
  const shortRange = closes.slice(-12);
  const longRange = closes.slice(-48);
  const shortVol = stdDeviation(closeToCloseReturns(shortRange), 0) * 100;
  const longVol = stdDeviation(closeToCloseReturns(longRange), 0) * 100;
  const compressionRatio = longVol > 0 ? shortVol / longVol : 1;
  const trendStrength = Math.abs(Number(technicalFeatures.trendStrength || 0));
  const momentum = Math.abs(Number(technicalFeatures.momentum || 0));

  let regime = 'compressed_range';
  if (volPercentile >= 75 && trendStrength >= 35) {
    regime = 'high_vol_trend';
  } else if (volPercentile >= 70 && trendStrength < 25) {
    regime = 'high_vol_noise';
  } else if (compressionRatio <= 0.65 && momentum >= 0.8) {
    regime = 'low_vol_breakout';
  } else if (compressionRatio > 0.9 && volPercentile < 60) {
    regime = 'compressed_range';
  }

  const expansionProbability = clamp((100 - volPercentile) * 0.35 + Math.max(0, 1 - compressionRatio) * 70 + momentum * 4, 0, 100);
  const directionalClarity =
    regime === 'high_vol_noise'
      ? clamp(trendStrength * 0.35, 0, 45)
      : clamp(trendStrength * 0.65 + momentum * 7, 0, 100);
  const dangerLevel = clamp(volPercentile * 0.55 + atrPct * 8 + (regime === 'high_vol_noise' ? 25 : 0), 0, 100);
  const state = {
    regime,
    realizedVolatility: round(currentRealized || average(vols.slice(-3), 0), 4),
    atrPct: round(atrPct, 4),
    volPercentile: round(volPercentile, 2),
    compressionRatio: round(compressionRatio, 4),
    expansionProbability: round(expansionProbability, 2),
    directionalClarity: round(directionalClarity, 2),
    dangerLevel: round(dangerLevel, 2),
  };

  return {
    ...state,
    impliedVolatilityProxy: proxyImpliedVolatility(state),
  };
}

function scoreVolatility(volState = {}) {
  let score = 0;

  if (volState.regime === 'low_vol_breakout') {
    score += 28;
  }

  if (volState.regime === 'high_vol_trend') {
    score += 14;
  }

  if (volState.regime === 'compressed_range') {
    score -= 4;
  }

  if (volState.regime === 'high_vol_noise') {
    score -= 38;
  }

  score += clamp(Number(volState.directionalClarity || 0) - 50, -30, 30) * 0.45;
  score += clamp(Number(volState.expansionProbability || 0) - 50, -25, 25) * 0.25;
  score -= clamp(Number(volState.dangerLevel || 0) - 45, 0, 55) * 0.55;

  return {
    score: round(clamp(score, -100, 100), 2),
    details: {
      regime: volState.regime,
      expansionProbability: volState.expansionProbability,
      directionalClarity: volState.directionalClarity,
      dangerLevel: volState.dangerLevel,
      impliedVolatilityProxy: volState.impliedVolatilityProxy,
    },
  };
}

function analyzeVolatility(candles, technicalFeatures = {}) {
  const state = computeVolatilityState(candles, technicalFeatures);
  const scoring = scoreVolatility(state);

  return {
    score: scoring.score,
    state,
    details: scoring.details,
  };
}

module.exports = {
  analyzeVolatility,
  computeVolatilityState,
  percentileRank,
  rollingRealizedVolatility,
  scoreVolatility,
};
