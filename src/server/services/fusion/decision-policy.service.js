const { POSITION_SIZING, RISK_THRESHOLDS, SIGNAL_THRESHOLDS } = require('../../config/thresholds');
const { clamp, round } = require('../../utils/math');

function signalFromScore(score) {
  const normalized = Number(score || 0);
  return SIGNAL_THRESHOLDS.find((threshold) => normalized >= threshold.min)?.signal || 'WAIT';
}

function riskLevelFromContext({ volatility, geopolitics, macro } = {}) {
  const danger = Number(volatility?.state?.dangerLevel || volatility?.details?.dangerLevel || 0);
  const geopoliticalHigh = geopolitics?.riskLevel === 'high';
  const eventHigh = macro?.eventRisk === 'high';

  if (danger >= RISK_THRESHOLDS.highDanger || geopoliticalHigh || eventHigh) {
    return 'high';
  }

  if (danger >= RISK_THRESHOLDS.lowDanger || geopolitics?.riskLevel === 'medium' || macro?.eventRisk === 'medium') {
    return 'medium';
  }

  return 'low';
}

function confidenceFromScore(totalScore, riskLevel, components = {}) {
  const absoluteScore = Math.abs(Number(totalScore || 0));
  let confidence = 42 + absoluteScore * 0.58;

  if (riskLevel === 'medium') confidence -= 8;
  if (riskLevel === 'high') confidence -= 18;

  const componentValues = Object.values(components)
    .map((component) => Number(component?.score || 0))
    .filter(Number.isFinite);
  const positive = componentValues.filter((value) => Math.sign(value) === Math.sign(totalScore) && Math.abs(value) >= 8).length;
  confidence += positive * 3;

  return round(clamp(confidence, 0, 100), 2);
}

function positionSizingForRisk(riskLevel, confidence) {
  const multiplier =
    riskLevel === 'high'
      ? POSITION_SIZING.highRiskMultiplier
      : riskLevel === 'medium'
        ? POSITION_SIZING.mediumRiskMultiplier
        : POSITION_SIZING.lowRiskMultiplier;
  const confidenceMultiplier = clamp(Number(confidence || 0) / 75, 0.35, 1.15);
  const suggestedRiskPct = clamp(
    POSITION_SIZING.baseRiskPct * multiplier * confidenceMultiplier,
    POSITION_SIZING.minRiskPct,
    POSITION_SIZING.maxRiskPct,
  );

  const note =
    riskLevel === 'high'
      ? 'High-risk context: reduce size, require confirmation, and avoid forcing directional trades.'
      : riskLevel === 'medium'
        ? 'Mixed-risk context: use reduced size and define invalidation before entry.'
        : 'Lower-risk context: standard risk range is acceptable if the setup matches the plan.';

  return {
    suggestedRiskPct: round(suggestedRiskPct, 2),
    note,
  };
}

module.exports = {
  confidenceFromScore,
  positionSizingForRisk,
  riskLevelFromContext,
  signalFromScore,
};
