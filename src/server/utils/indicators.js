const {
  average,
  linearRegressionSlope,
  percentChange,
  safeDivide,
  stdDeviation,
} = require('./math');

function closeToCloseReturns(prices) {
  const returns = [];

  for (let index = 1; index < prices.length; index += 1) {
    const previous = Number(prices[index - 1]);
    const current = Number(prices[index]);

    if (Number.isFinite(previous) && Number.isFinite(current) && previous !== 0) {
      returns.push((current - previous) / previous);
    }
  }

  return returns;
}

function relativeStrengthIndex(prices, period = 14) {
  if (!Array.isArray(prices) || prices.length <= period) {
    return null;
  }

  let gainTotal = 0;
  let lossTotal = 0;

  for (let index = 1; index <= period; index += 1) {
    const delta = prices[index] - prices[index - 1];
    if (delta >= 0) {
      gainTotal += delta;
    } else {
      lossTotal += Math.abs(delta);
    }
  }

  let averageGain = gainTotal / period;
  let averageLoss = lossTotal / period;

  for (let index = period + 1; index < prices.length; index += 1) {
    const delta = prices[index] - prices[index - 1];
    const gain = delta > 0 ? delta : 0;
    const loss = delta < 0 ? Math.abs(delta) : 0;

    averageGain = (averageGain * (period - 1) + gain) / period;
    averageLoss = (averageLoss * (period - 1) + loss) / period;
  }

  if (averageLoss === 0) {
    return 100;
  }

  const relativeStrength = averageGain / averageLoss;
  return 100 - 100 / (1 + relativeStrength);
}

function volatilityFromPrices(prices) {
  return stdDeviation(closeToCloseReturns(prices), 0);
}

function normalizedSlope(values) {
  const slope = linearRegressionSlope(values);
  const base = average(values, 0);
  return safeDivide(slope, Math.abs(base), 0);
}

function momentumPercent(prices, lookback = 24) {
  if (!Array.isArray(prices) || prices.length < 2) {
    return 0;
  }

  const endIndex = prices.length - 1;
  const startIndex = Math.max(0, endIndex - lookback);
  return percentChange(prices[startIndex], prices[endIndex], 0);
}

module.exports = {
  closeToCloseReturns,
  momentumPercent,
  normalizedSlope,
  relativeStrengthIndex,
  volatilityFromPrices,
};
