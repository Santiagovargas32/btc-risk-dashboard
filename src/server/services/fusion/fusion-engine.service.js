const { FUSION_WEIGHTS, TIMEFRAME_WEIGHTS } = require('../../config/weights');
const { round } = require('../../utils/math');
const { normalizeScore, weightedScore } = require('./score-normalizer.service');
const {
  confidenceFromScore,
  positionSizingForRisk,
  riskLevelFromContext,
  signalFromScore,
} = require('./decision-policy.service');

function classifyAlignment(score) {
  if (score >= 25) return 'bullish';
  if (score <= -25) return 'bearish';
  return 'mixed';
}

function extractComponentScore(component) {
  if (component && Number.isFinite(Number(component.score))) {
    return Number(component.score);
  }

  if (component && Number.isFinite(Number(component.assetImpactBias))) {
    return Number(component.assetImpactBias);
  }

  return 0;
}

function buildComponent(component, fallbackDetails = {}) {
  return {
    score: normalizeScore(extractComponentScore(component)),
    details: component?.details || component?.state || component?.features || fallbackDetails || {},
  };
}

function summaryForSignal(signal, riskLevel, components) {
  const componentText = Object.entries(components)
    .map(([name, component]) => `${name} ${component.score >= 0 ? '+' : ''}${component.score}`)
    .join(', ');

  if (signal === 'WAIT') {
    return `Deterministic engine is not showing enough edge for a new trade. Component scores: ${componentText}.`;
  }

  return `${signal.replaceAll('_', ' ')} setup with ${riskLevel} risk. Component scores: ${componentText}. This is probabilistic decision support, not a price prediction.`;
}

function applyKnowledgeAdjustments(baseRiskPct, knowledgeMatches = []) {
  const riskAdjustments = knowledgeMatches
    .filter((match) => match.category === 'risk_rules')
    .map((match) => Number(match.positionSizingAdjustment || match.rule?.positionSizingAdjustment || 0))
    .filter(Number.isFinite);
  const totalAdjustment = riskAdjustments.reduce((total, value) => total + value, 0);

  return round(Math.max(0.1, baseRiskPct * (1 + totalAdjustment)), 2);
}

function runFusion(input = {}) {
  const components = {
    technical: buildComponent(input.technical),
    macro: buildComponent(input.macro),
    geopolitics: buildComponent(input.geopolitics, input.geopolitics),
    volatility: buildComponent(input.volatility),
  };
  const totalScore = weightedScore(
    Object.entries(FUSION_WEIGHTS).map(([name, weight]) => ({
      score: components[name].score,
      weight,
    })),
  );
  const riskLevel = riskLevelFromContext(input);
  const confidence = confidenceFromScore(totalScore, riskLevel, components);
  const signal = signalFromScore(totalScore);
  const sizing = positionSizingForRisk(riskLevel, confidence);
  const adjustedRiskPct = applyKnowledgeAdjustments(sizing.suggestedRiskPct, input.knowledgeMatches || []);

  return {
    signal,
    totalScore,
    confidence,
    riskLevel,
    components,
    alignment: {
      intraday: classifyAlignment(input.alignment?.intradayScore ?? components.technical.score),
      swing: classifyAlignment(input.alignment?.swingScore ?? components.technical.score),
      macro: classifyAlignment(components.macro.score + components.geopolitics.score * 0.5),
    },
    positionSizing: {
      suggestedRiskPct: adjustedRiskPct,
      note:
        adjustedRiskPct !== sizing.suggestedRiskPct
          ? `${sizing.note} Knowledge risk rules adjusted suggested size.`
          : sizing.note,
    },
    summary: summaryForSignal(signal, riskLevel, components),
    weights: FUSION_WEIGHTS,
  };
}

function scoreTimeframeGroups(timeframeAnalyses = []) {
  const byInterval = new Map(
    timeframeAnalyses.map((analysis) => [analysis.interval, Number(analysis.technical?.score || analysis.score || 0)]),
  );

  const intradayScore = weightedScore(
    Object.entries(TIMEFRAME_WEIGHTS.intraday).map(([interval, weight]) => ({
      score: byInterval.get(interval) || 0,
      weight: byInterval.has(interval) ? weight : 0,
    })),
  );
  const swingScore = weightedScore(
    Object.entries(TIMEFRAME_WEIGHTS.swing).map(([interval, weight]) => ({
      score: byInterval.get(interval) || 0,
      weight: byInterval.has(interval) ? weight : 0,
    })),
  );

  return {
    intradayScore,
    swingScore,
    intraday: classifyAlignment(intradayScore),
    swing: classifyAlignment(swingScore),
  };
}

function runMultiTimeframeFusion(input = {}) {
  const alignment = scoreTimeframeGroups(input.timeframes || []);
  const technicalScore = weightedScore([
    { score: alignment.intradayScore, weight: TIMEFRAME_WEIGHTS.final.intraday },
    { score: alignment.swingScore, weight: TIMEFRAME_WEIGHTS.final.swing },
  ]);

  return runFusion({
    ...input,
    technical: {
      score: technicalScore,
      details: {
        timeframes: input.timeframes,
      },
    },
    alignment,
  });
}

module.exports = {
  classifyAlignment,
  runFusion,
  runMultiTimeframeFusion,
  scoreTimeframeGroups,
};
