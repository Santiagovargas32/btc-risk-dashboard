const env = require('../../config/env');
const { clamp, round } = require('../../utils/math');
const macroCache = require('./macro-cache.service');
const { classifyEventRisk, parseEventDates } = require('./economic-calendar.service');
const { getFallbackMacroState } = require('../market-data/macro-market-data.service');

function scoreMacro(macroState = {}) {
  let score = 0;
  const details = {};

  const regimeScores = { risk_on: 24, mixed: 0, risk_off: -28 };
  details.regime = regimeScores[macroState.regime] ?? 0;
  score += details.regime;

  const inflationScores = { down: 10, stable: 0, up: -14 };
  details.inflationTrend = inflationScores[macroState.inflationTrend] ?? 0;
  score += details.inflationTrend;

  const ratesScores = { falling: 14, stable: 0, rising: -18 };
  details.ratesTrend = ratesScores[macroState.ratesTrend] ?? 0;
  score += details.ratesTrend;

  const volatilityScores = { calm: 12, stressed: -15, panic: -34 };
  details.volatilityRegime = volatilityScores[macroState.volatilityRegime] ?? 0;
  score += details.volatilityRegime;

  const eventScores = { low: 4, medium: -8, high: -20 };
  details.eventRisk = eventScores[macroState.eventRisk] ?? 0;
  score += details.eventRisk;

  const liquidityScores = { expanding: 14, neutral: 0, tightening: -16 };
  details.liquidity = liquidityScores[macroState.liquidity] ?? 0;
  score += details.liquidity;

  return {
    score: round(clamp(score, -100, 100), 2),
    details,
  };
}

function classifyMacroTrend(macroState = {}) {
  const scoring = scoreMacro(macroState);

  if (scoring.score >= 30) {
    return 'supportive';
  }

  if (scoring.score <= -30) {
    return 'hostile';
  }

  return 'neutral';
}

async function getMacroSnapshot(options = {}) {
  return macroCache.wrap('snapshot', async () => {
    const eventDates = parseEventDates(options.eventDates || process.env.MACRO_EVENT_DATES);
    const fallback = getFallbackMacroState(options);
    const state = {
      ...fallback,
      eventRisk: options.eventRisk || (eventDates.length ? classifyEventRisk(new Date(), eventDates) : fallback.eventRisk || env.MACRO_EVENT_RISK),
    };
    const scoring = scoreMacro(state);

    return {
      ...state,
      score: scoring.score,
      details: scoring.details,
      trendClassification: classifyMacroTrend(state),
    };
  });
}

module.exports = {
  classifyMacroTrend,
  getMacroSnapshot,
  scoreMacro,
};
