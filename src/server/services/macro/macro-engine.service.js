const env = require('../../config/env');
const { clamp, round } = require('../../utils/math');
const macroCache = require('./macro-cache.service');
const macroProvider = require('./macro-provider.service');
const {
  classifyEventRisk,
  highestEventRisk,
  parseEventDates,
} = require('./economic-calendar.service');
const { getFallbackMacroState } = require('../market-data/macro-market-data.service');
const gdeltClient = require('../geopolitics/gdelt-client.service');
const ogidClient = require('../geopolitics/ogid-client.service');
const { deriveOgidRiskContext } = require('../geopolitics/geopolitical-engine.service');

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

function normalizeEventRisk(value) {
  const normalized = String(value || '').toLowerCase();
  return ['low', 'medium', 'high'].includes(normalized) ? normalized : null;
}

function eventRiskRank(value) {
  return { low: 0, medium: 1, high: 2 }[normalizeEventRisk(value) || 'low'];
}

function eventRiskOptions(options = {}) {
  return {
    now: options.now || new Date(),
    highWindowHours: options.highWindowHours || env.MACRO_EVENT_HIGH_WINDOW_HOURS,
    mediumWindowHours: options.mediumWindowHours || env.MACRO_EVENT_MEDIUM_WINDOW_HOURS,
  };
}

async function getOgidMacroContext(options = {}) {
  if (options.ogidContext) {
    return options.ogidContext;
  }

  if (options.ogidSnapshot) {
    const context = deriveOgidRiskContext([options.ogidSnapshot]);
    return {
      eventRisk: context.riskLevel,
      eventRiskSource: 'ogid',
      contextSource: 'ogid',
      ogidDrivers: context.topDrivers,
    };
  }

  const countries = options.countries || env.OGID_COUNTRIES;
  const response = await ogidClient.getSnapshot(
    {
      countries,
      limit: options.limit || 50,
      windowMin: options.windowMin || 120,
    },
    options,
  );

  if (response.unavailable) {
    return {
      eventRisk: null,
      eventRiskSource: 'env-fallback',
      contextSource: 'fallback',
      ogidDrivers: [],
    };
  }

  const context = deriveOgidRiskContext([response.data]);

  return {
    eventRisk: context.riskLevel,
    eventRiskSource: 'ogid',
    contextSource: 'ogid',
    ogidDrivers: context.topDrivers,
    ogidDiagnostics: {
      activeCountries: response.meta?.activeCountries || response.meta?.watchlistCountries || [],
      dataQuality: response.dataQuality || response.meta?.dataQuality || null,
      itemCounts: context.itemCounts,
      sourceMode: response.meta?.sourceMode || response.data?.meta?.sourceMode || null,
    },
  };
}

async function getGdeltMacroContext(options = {}) {
  if (options.gdeltContext) {
    return options.gdeltContext;
  }

  if (options.gdeltSnapshot) {
    const context = deriveOgidRiskContext([options.gdeltSnapshot]);
    return {
      eventRisk: context.riskLevel,
      eventRiskSource: 'gdelt',
      contextSource: 'gdelt',
      gdeltDrivers: context.topDrivers,
    };
  }

  if (!gdeltClient.isEnabled(options)) {
    return {
      eventRisk: null,
      eventRiskSource: 'env-fallback',
      contextSource: 'fallback',
      gdeltDrivers: [],
    };
  }

  const response = await gdeltClient.getRiskNews({ maxRecords: options.gdeltMaxRecords }, options);
  if (response.unavailable) {
    return {
      eventRisk: null,
      eventRiskSource: 'env-fallback',
      contextSource: 'fallback',
      gdeltDrivers: [],
      gdeltDiagnostics: { reason: response.reason },
    };
  }

  const context = deriveOgidRiskContext([response.data]);
  return {
    eventRisk: context.riskLevel,
    eventRiskSource: 'gdelt',
    contextSource: 'gdelt',
    gdeltDrivers: context.topDrivers,
    gdeltDiagnostics: {
      itemCounts: context.itemCounts,
      sourceMode: response.meta?.sourceMode || response.data?.meta?.sourceMode || null,
    },
  };
}

function chooseHighestRisk(candidates = [], fallback = {}) {
  const usable = candidates
    .map((candidate) => ({
      ...candidate,
      eventRisk: normalizeEventRisk(candidate.eventRisk) || 'low',
    }))
    .filter((candidate) => candidate.eventRiskSource);

  if (!usable.length) {
    return {
      eventRisk: fallback.eventRisk || env.MACRO_EVENT_RISK,
      eventRiskSource: 'env-fallback',
      contextSource: fallback.source,
      ogidDrivers: [],
      gdeltDrivers: [],
    };
  }

  return usable.reduce((best, candidate) => {
    if (eventRiskRank(candidate.eventRisk) > eventRiskRank(best.eventRisk)) {
      return candidate;
    }
    return best;
  }, usable[0]);
}

async function resolveEventRisk(options = {}, fallback = {}, providerContext = {}) {
  if (options.eventRisk) {
    return {
      eventRisk: options.eventRisk,
      eventRiskSource: 'option',
      contextSource: fallback.source,
      ogidDrivers: [],
    };
  }

  const riskOptions = eventRiskOptions(options);
  const candidates = [];
  const eventDates = parseEventDates(options.eventDates || process.env.MACRO_EVENT_DATES);
  if (eventDates.length) {
    candidates.push({
      eventRisk: classifyEventRisk(riskOptions.now, eventDates, riskOptions),
      eventRiskSource: 'calendar',
      contextSource: fallback.source,
      ogidDrivers: [],
      gdeltDrivers: [],
    });
  }

  if (Array.isArray(providerContext.events) && providerContext.events.length) {
    const officialRisk = highestEventRisk(providerContext.events, riskOptions);
    candidates.push({
      eventRisk: officialRisk.eventRisk,
      eventRiskSource: officialRisk.eventRiskSource || 'official-calendar',
      contextSource: providerContext.source || fallback.source,
      event: officialRisk.event,
      ogidDrivers: [],
      gdeltDrivers: [],
    });
  }

  const ogidContext = await getOgidMacroContext(options);
  const ogidEventRisk = normalizeEventRisk(ogidContext.eventRisk);
  if (ogidEventRisk) {
    candidates.push({
      ...ogidContext,
      eventRisk: ogidEventRisk,
      gdeltDrivers: [],
    });
  }

  const gdeltContext = await getGdeltMacroContext(options);
  const gdeltEventRisk = normalizeEventRisk(gdeltContext.eventRisk);
  if (gdeltEventRisk) {
    candidates.push({
      ...gdeltContext,
      eventRisk: gdeltEventRisk,
      ogidDrivers: [],
    });
  }

  return chooseHighestRisk(candidates, fallback);
}

function publicProviderEnabled(options = {}) {
  return (options.provider || env.MACRO_PROVIDER) === 'public';
}

async function getPublicMacroContext(options = {}) {
  if (options.publicMacroContext) {
    return options.publicMacroContext;
  }

  if (!publicProviderEnabled(options)) {
    return {
      provider: options.provider || env.MACRO_PROVIDER,
      source: 'env-fallback',
      indicators: [],
      events: [],
      diagnostics: {
        missingSeries: [],
        providerErrors: [],
        calendarSources: [],
        dataFreshness: {},
      },
    };
  }

  return macroProvider.getCachedMacroSnapshot(options);
}

function compactDefined(values = {}) {
  return Object.fromEntries(Object.entries(values).filter(([, value]) => value !== null && value !== undefined));
}

async function getMacroSnapshot(options = {}) {
  const producer = async () => {
    const fallback = getFallbackMacroState(options);
    const publicContext = await getPublicMacroContext(options);
    const eventContext = await resolveEventRisk(options, fallback, publicContext);
    const liveState = compactDefined({
      regime: publicContext.regime,
      inflationTrend: publicContext.inflationTrend,
      ratesTrend: publicContext.ratesTrend,
      volatilityRegime: publicContext.volatilityRegime,
      liquidity: publicContext.liquidity,
    });
    const state = {
      ...fallback,
      ...liveState,
      eventRisk: eventContext.eventRisk,
      eventRiskSource: eventContext.eventRiskSource,
      contextSource: eventContext.contextSource,
      provider: publicContext.provider || env.MACRO_PROVIDER,
      source: publicContext.source || fallback.source,
      indicators: publicContext.indicators || [],
      events: publicContext.events || [],
      ogidDrivers: eventContext.ogidDrivers || [],
      gdeltDrivers: eventContext.gdeltDrivers || [],
      ogidDiagnostics: eventContext.ogidDiagnostics,
      gdeltDiagnostics: eventContext.gdeltDiagnostics,
      diagnostics: {
        missingSeries: publicContext.diagnostics?.missingSeries || [],
        providerErrors: publicContext.diagnostics?.providerErrors || [],
        calendarSources: publicContext.diagnostics?.calendarSources || [],
        dataFreshness: publicContext.diagnostics?.dataFreshness || {},
        eventRiskSource: eventContext.eventRiskSource,
        event: eventContext.event,
      },
      updatedAt: publicContext.updatedAt || fallback.updatedAt,
    };
    const scoring = scoreMacro(state);

    return {
      ...state,
      score: scoring.score,
      details: scoring.details,
      trendClassification: classifyMacroTrend(state),
    };
  };

  if (options.cache === false) {
    return producer();
  }

  return macroCache.wrap('snapshot', producer);
}

module.exports = {
  classifyMacroTrend,
  getGdeltMacroContext,
  getMacroSnapshot,
  getOgidMacroContext,
  getPublicMacroContext,
  resolveEventRisk,
  scoreMacro,
};
