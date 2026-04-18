function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function toFiniteNumber(value, fallback = null) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : fallback;
  }

  if (typeof value === 'string') {
    const cleaned = value.replace(/[$,%\s]/g, '').replace(/,/g, '');
    if (cleaned === '') {
      return fallback;
    }

    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  return fallback;
}

function finiteValues(values) {
  return values.map((value) => toFiniteNumber(value)).filter(isFiniteNumber);
}

function sum(values) {
  return finiteValues(values).reduce((total, value) => total + value, 0);
}

function average(values, fallback = 0) {
  const clean = finiteValues(values);
  if (clean.length === 0) {
    return fallback;
  }

  return sum(clean) / clean.length;
}

function stdDeviation(values, fallback = 0) {
  const clean = finiteValues(values);
  if (clean.length < 2) {
    return fallback;
  }

  const mean = average(clean);
  const variance = average(clean.map((value) => (value - mean) ** 2));
  return Math.sqrt(variance);
}

function clamp(value, min, max) {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(max, Math.max(min, value));
}

function safeDivide(numerator, denominator, fallback = 0) {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) {
    return fallback;
  }

  return numerator / denominator;
}

function percentChange(start, end, fallback = 0) {
  if (!Number.isFinite(start) || !Number.isFinite(end) || start === 0) {
    return fallback;
  }

  return ((end - start) / Math.abs(start)) * 100;
}

function linearRegressionSlope(values) {
  const clean = finiteValues(values);
  const n = clean.length;
  if (n < 2) {
    return 0;
  }

  const meanX = (n - 1) / 2;
  const meanY = average(clean);
  let numerator = 0;
  let denominator = 0;

  for (let index = 0; index < n; index += 1) {
    const x = index - meanX;
    const y = clean[index] - meanY;
    numerator += x * y;
    denominator += x * x;
  }

  return safeDivide(numerator, denominator, 0);
}

function maxDrawdown(equityValues) {
  const clean = finiteValues(equityValues);
  if (clean.length === 0) {
    return { amount: 0, pct: 0 };
  }

  let peak = clean[0];
  let maxAmount = 0;
  let maxPct = 0;

  for (const equity of clean) {
    if (equity > peak) {
      peak = equity;
    }

    const amount = peak - equity;
    const pct = peak === 0 ? 0 : amount / Math.abs(peak);

    if (amount > maxAmount) {
      maxAmount = amount;
    }

    if (pct > maxPct) {
      maxPct = pct;
    }
  }

  return { amount: maxAmount, pct: maxPct };
}

function round(value, decimals = 2) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function scoreFromRange(value, min, max) {
  if (!Number.isFinite(value) || min === max) {
    return 50;
  }

  return clamp(((value - min) / (max - min)) * 100, 0, 100);
}

module.exports = {
  average,
  clamp,
  finiteValues,
  isFiniteNumber,
  linearRegressionSlope,
  maxDrawdown,
  percentChange,
  round,
  safeDivide,
  scoreFromRange,
  stdDeviation,
  sum,
  toFiniteNumber,
};
