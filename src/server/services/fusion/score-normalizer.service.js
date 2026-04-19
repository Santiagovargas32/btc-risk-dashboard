const { clamp, round } = require('../../utils/math');

function normalizeScore(value, min = -100, max = 100) {
  return round(clamp(Number(value || 0), min, max), 2);
}

function weightedScore(entries = []) {
  const clean = entries.filter((entry) => Number.isFinite(Number(entry.score)) && Number.isFinite(Number(entry.weight)));
  const totalWeight = clean.reduce((total, entry) => total + entry.weight, 0);

  if (totalWeight === 0) {
    return 0;
  }

  return normalizeScore(
    clean.reduce((total, entry) => total + entry.score * entry.weight, 0) / totalWeight,
  );
}

module.exports = {
  normalizeScore,
  weightedScore,
};
