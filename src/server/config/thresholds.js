const SIGNAL_THRESHOLDS = [
  { min: 60, signal: 'STRONG_LONG' },
  { min: 40, signal: 'LONG' },
  { min: 20, signal: 'WEAK_LONG' },
  { min: -20, signal: 'WAIT' },
  { min: -40, signal: 'WEAK_SHORT' },
  { min: -60, signal: 'SHORT' },
  { min: Number.NEGATIVE_INFINITY, signal: 'STRONG_SHORT' },
];

const RISK_THRESHOLDS = {
  lowDanger: 35,
  highDanger: 70,
  highConfidence: 72,
  mediumConfidence: 52,
};

const POSITION_SIZING = {
  baseRiskPct: 0.75,
  minRiskPct: 0.1,
  maxRiskPct: 1.5,
  highRiskMultiplier: 0.45,
  mediumRiskMultiplier: 0.75,
  lowRiskMultiplier: 1,
};

module.exports = {
  POSITION_SIZING,
  RISK_THRESHOLDS,
  SIGNAL_THRESHOLDS,
};
