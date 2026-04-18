const { clamp, round, scoreFromRange } = require('../../utils/math');

const WEIGHTS = {
  momentumScore: 0.22,
  trendScore: 0.18,
  volatilityScore: 0.2,
  drawdownScore: 0.15,
  alignmentScore: 0.25,
};

function decisionFromScore(score) {
  if (score > 75) {
    return 'YES';
  }

  if (score >= 50) {
    return 'CAUTION';
  }

  return 'NO';
}

function buildSummary(score, decision, fusion) {
  const signals = fusion?.signals || {};

  if (decision === 'YES') {
    return 'Current market conditions are strongly aligned with historically favorable trading conditions.';
  }

  if (decision === 'CAUTION') {
    const risks = [];
    if (!signals.momentumAligned) risks.push('momentum alignment is weak');
    if (!signals.trendAligned) risks.push('trend alignment is weak');
    if (signals.volatilityRisk) risks.push('volatility is elevated');

    return risks.length > 0
      ? `Trade only with reduced risk: ${risks.join(', ')}.`
      : 'Conditions are mixed; wait for stronger confirmation before increasing risk.';
  }

  return score < 30
    ? 'Trading conditions are materially misaligned with historical performance.'
    : 'The current setup does not justify a new trade under the deterministic rules.';
}

function scoreTrade(historicalFeatures, marketFeatures, fusionOutput) {
  const historical = historicalFeatures || {};
  const market = marketFeatures || {};
  const fusion = fusionOutput || { alignmentScore: 0, signals: {} };

  const historicalMomentum = scoreFromRange(Number(historical.winRate20 || historical.momentum || 0), 0.3, 0.75);
  const marketMomentum = scoreFromRange(Number(market.momentum || 0), -3, 3);
  const momentumScore = historicalMomentum * 0.65 + marketMomentum * 0.35;

  const historicalTrendPositive = Number(historical.trend || 0) > 0;
  const marketTrendPositive = Number(market.trend || 0) > 0;
  const trendScore =
    historicalTrendPositive && marketTrendPositive
      ? 85
      : historicalTrendPositive || marketTrendPositive
        ? 55
        : 30;

  const volatilityScore = fusion.signals?.volatilityRisk
    ? 25
    : clamp(90 - Number(market.volatility || 0) * 1000, 35, 95);

  const drawdownPct = Number(historical.drawdownPct || 0);
  const drawdownScore = clamp(100 - drawdownPct * 250, 10, 100);
  const alignmentScore = Number(fusion.alignmentScore || 0);

  const components = {
    momentumScore: round(clamp(momentumScore, 0, 100), 2),
    trendScore: round(clamp(trendScore, 0, 100), 2),
    volatilityScore: round(clamp(volatilityScore, 0, 100), 2),
    drawdownScore: round(clamp(drawdownScore, 0, 100), 2),
    alignmentScore: round(clamp(alignmentScore, 0, 100), 2),
  };

  const score = round(
    Object.entries(WEIGHTS).reduce(
      (total, [component, weight]) => total + components[component] * weight,
      0,
    ),
    2,
  );
  const decision = decisionFromScore(score);

  return {
    score,
    decision,
    components,
    weights: WEIGHTS,
    summary: buildSummary(score, decision, fusion),
  };
}

module.exports = {
  WEIGHTS,
  decisionFromScore,
  scoreTrade,
};
