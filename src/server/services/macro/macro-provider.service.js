const axios = require('axios');
const env = require('../../config/env');
const { round } = require('../../utils/math');
const macroCache = require('./macro-cache.service');
const fredClient = require('./fred-client.service');
const {
  filterCalendarEvents,
  parseBeaScheduleEvents,
  parseFomcEvents,
  parseIcsEvents,
} = require('./economic-calendar.service');

const FRED_SERIES = {
  cpi: 'CPIAUCSL',
  coreCpi: 'CPILFESL',
  fedFunds: 'FEDFUNDS',
  twoYearYield: 'DGS2',
  vix: 'VIXCLS',
  highYieldSpread: 'BAMLH0A0HYM2',
  nfci: 'NFCI',
  fedBalanceSheet: 'WALCL',
  reverseRepo: 'RRPONTSYD',
  treasuryGeneralAccount: 'WTREGEN',
  realGdp: 'GDPC1',
  unemploymentRate: 'UNRATE',
};

const SERIES_LABELS = {
  cpi: ['CPI YoY', '%', 'inflation'],
  coreCpi: ['Core CPI YoY', '%', 'inflation'],
  fedFunds: ['Fed Funds', '%', 'rates'],
  twoYearYield: ['2Y Treasury', '%', 'rates'],
  vix: ['VIX', '', 'volatility'],
  highYieldSpread: ['HY OAS', '%', 'credit'],
  nfci: ['NFCI', '', 'credit'],
  realGdp: ['Real GDP', 'bn chained USD', 'growth'],
  unemploymentRate: ['Unemployment', '%', 'labor'],
};

const STALE_DAYS = {
  cpi: 62,
  coreCpi: 62,
  fedFunds: 62,
  twoYearYield: 10,
  vix: 10,
  highYieldSpread: 10,
  nfci: 21,
  fedBalanceSheet: 21,
  reverseRepo: 10,
  treasuryGeneralAccount: 21,
  realGdp: 130,
  unemploymentRate: 62,
};

function latest(observations = []) {
  for (let index = observations.length - 1; index >= 0; index -= 1) {
    if (Number.isFinite(observations[index]?.value)) {
      return observations[index];
    }
  }

  return null;
}

function observationAgo(observations = [], periodsAgo = 1) {
  const valid = observations.filter((observation) => Number.isFinite(observation.value));
  return valid.length > periodsAgo ? valid[valid.length - 1 - periodsAgo] : null;
}

function daysSince(dateValue, now = new Date()) {
  const date = new Date(dateValue);
  if (!Number.isFinite(date.getTime())) {
    return null;
  }

  return Math.max(0, (now.getTime() - date.getTime()) / 86_400_000);
}

function percentChange(current, previous) {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous === 0) {
    return null;
  }

  return ((current - previous) / previous) * 100;
}

function yoyAt(observations = [], index) {
  const current = observations[index];
  const previous = observations[index - 12];
  if (!current || !previous) {
    return null;
  }

  return percentChange(current.value, previous.value);
}

function latestYoy(observations = []) {
  return yoyAt(observations, observations.length - 1);
}

function yoyMomentum(observations = [], monthsAgo = 3) {
  const currentIndex = observations.length - 1;
  const previousIndex = currentIndex - monthsAgo;
  const current = yoyAt(observations, currentIndex);
  const previous = yoyAt(observations, previousIndex);
  if (!Number.isFinite(current) || !Number.isFinite(previous)) {
    return null;
  }

  return current - previous;
}

function classifyFromMomentum(values = [], threshold = 0.1) {
  const usable = values.filter(Number.isFinite);
  if (!usable.length) {
    return null;
  }

  if (usable.every((value) => value <= -threshold)) {
    return 'down';
  }

  if (usable.every((value) => value >= threshold)) {
    return 'up';
  }

  return 'stable';
}

function classifyInflationTrend(series = {}) {
  return classifyFromMomentum([
    yoyMomentum(series.cpi?.observations || []),
    yoyMomentum(series.coreCpi?.observations || []),
  ]);
}

function classifyRatesTrend(series = {}) {
  const twoYear = series.twoYearYield?.observations || [];
  const latestTwoYear = latest(twoYear);
  const previousTwoYear = observationAgo(twoYear, 20);
  if (latestTwoYear && previousTwoYear) {
    const change = latestTwoYear.value - previousTwoYear.value;
    if (change <= -0.25) return 'falling';
    if (change >= 0.25) return 'rising';
    return 'stable';
  }

  const fedFunds = series.fedFunds?.observations || [];
  const latestFedFunds = latest(fedFunds);
  const previousFedFunds = observationAgo(fedFunds, 3);
  if (latestFedFunds && previousFedFunds) {
    const change = latestFedFunds.value - previousFedFunds.value;
    if (change <= -0.25) return 'falling';
    if (change >= 0.25) return 'rising';
    return 'stable';
  }

  return null;
}

function classifyVolatilityRegime(series = {}) {
  const vix = latest(series.vix?.observations || [])?.value;
  const highYieldSpread = latest(series.highYieldSpread?.observations || [])?.value;
  const nfci = latest(series.nfci?.observations || [])?.value;
  const values = [vix, highYieldSpread, nfci].filter(Number.isFinite);
  if (!values.length) {
    return null;
  }

  if (vix >= 30 || highYieldSpread >= 6 || nfci >= 0.75) {
    return 'panic';
  }

  if (vix >= 20 || highYieldSpread >= 4 || nfci >= 0) {
    return 'stressed';
  }

  return 'calm';
}

function liquidityProxyAt(series = {}, periodsAgo = 0) {
  const fedBalanceSheet = observationAgo(series.fedBalanceSheet?.observations || [], periodsAgo);
  const reverseRepo = observationAgo(series.reverseRepo?.observations || [], periodsAgo);
  const treasuryGeneralAccount = observationAgo(series.treasuryGeneralAccount?.observations || [], periodsAgo);

  if (!fedBalanceSheet || !reverseRepo || !treasuryGeneralAccount) {
    return null;
  }

  return fedBalanceSheet.value - reverseRepo.value - treasuryGeneralAccount.value;
}

function classifyLiquidity(series = {}) {
  const current = liquidityProxyAt(series, 0);
  const previous = liquidityProxyAt(series, 4);
  if (!Number.isFinite(current) || !Number.isFinite(previous)) {
    return null;
  }

  const change = current - previous;
  const threshold = Math.abs(previous) > 100_000 ? 100_000 : 100;
  if (change >= threshold) return 'expanding';
  if (change <= -threshold) return 'tightening';
  return 'neutral';
}

function classifyRegime(state = {}) {
  const supportive = [
    state.inflationTrend === 'down',
    state.ratesTrend === 'falling',
    state.volatilityRegime === 'calm',
    state.liquidity === 'expanding',
  ].filter(Boolean).length;
  const hostile = [
    state.inflationTrend === 'up',
    state.ratesTrend === 'rising',
    ['stressed', 'panic'].includes(state.volatilityRegime),
    state.liquidity === 'tightening',
  ].filter(Boolean).length;

  if (hostile >= 2 || state.volatilityRegime === 'panic') return 'risk_off';
  if (supportive >= 3) return 'risk_on';
  return null;
}

function buildIndicator(key, response, options = {}) {
  const observations = response?.observations || [];
  const latestObservation = latest(observations);
  if (!latestObservation) {
    return null;
  }

  const [label, unit, group] = SERIES_LABELS[key] || [key, '', 'macro'];
  const yoyValue = ['cpi', 'coreCpi'].includes(key) ? latestYoy(observations) : null;
  const value = Number.isFinite(yoyValue) ? yoyValue : latestObservation.value;
  const ageDays = daysSince(latestObservation.date, options.now || new Date());

  return {
    key,
    label,
    group,
    value: round(value, 2),
    unit,
    date: latestObservation.date,
    trend: indicatorTrend(key, observations),
    source: `fred:${response.seriesId || FRED_SERIES[key]}`,
    stale: ageDays === null ? true : ageDays > (STALE_DAYS[key] || 30),
  };
}

function indicatorTrend(key, observations = []) {
  if (['cpi', 'coreCpi'].includes(key)) {
    const momentum = yoyMomentum(observations);
    if (!Number.isFinite(momentum)) return 'stable';
    if (momentum <= -0.1) return 'down';
    if (momentum >= 0.1) return 'up';
    return 'stable';
  }

  const latestObservation = latest(observations);
  const previous = observationAgo(observations, key === 'twoYearYield' || key === 'vix' ? 20 : 3);
  if (!latestObservation || !previous) return 'stable';
  const change = latestObservation.value - previous.value;
  if (change > 0) return 'up';
  if (change < 0) return 'down';
  return 'stable';
}

function diagnosticsForSeries(series = {}, options = {}) {
  const now = options.now || new Date();
  const missingSeries = [];
  const providerErrors = [];
  const dataFreshness = {};

  for (const [key, response] of Object.entries(series)) {
    const latestObservation = latest(response?.observations || []);
    if (!latestObservation) {
      missingSeries.push(FRED_SERIES[key] || key);
    } else {
      dataFreshness[key] = {
        seriesId: response.seriesId || FRED_SERIES[key],
        date: latestObservation.date,
        ageDays: round(daysSince(latestObservation.date, now) ?? 0, 1),
        stale: (daysSince(latestObservation.date, now) ?? Infinity) > (STALE_DAYS[key] || 30),
      };
    }

    if (response?.reason) {
      providerErrors.push({
        provider: 'fred',
        seriesId: response.seriesId || FRED_SERIES[key] || key,
        message: response.reason,
      });
    }
  }

  return {
    missingSeries,
    providerErrors,
    dataFreshness,
  };
}

async function getMacroIndicators(options = {}) {
  const series = options.series
    || options.seriesResponses
    || await fredClient.fetchSeriesMap(FRED_SERIES, {
      apiKey: options.apiKey,
      baseUrl: options.baseUrl,
      timeoutMs: options.timeoutMs,
      limit: options.limit || 160,
    });

  const indicators = Object.entries(series)
    .map(([key, response]) => buildIndicator(key, response, options))
    .filter(Boolean);

  return {
    indicators,
    series,
    diagnostics: diagnosticsForSeries(series, options),
  };
}

async function fetchText(url, options = {}) {
  const response = await axios.get(url, {
    timeout: options.timeoutMs || env.MACRO_PROVIDER_TIMEOUT_MS,
    responseType: 'text',
  });

  return response.data;
}

async function safeCalendarFetch(label, url, parser, options = {}) {
  if (!url) {
    return { events: [], error: `${label} URL is not configured` };
  }

  try {
    const raw = await fetchText(url, options);
    return {
      events: parser(raw, options),
      error: null,
    };
  } catch (error) {
    return {
      events: [],
      error: error.message,
    };
  }
}

async function produceMacroEvents(options = {}) {
  const now = options.now || new Date();
  const lookaheadDays = options.lookaheadDays || env.MACRO_EVENT_LOOKAHEAD_DAYS;
  const parserOptions = { now, lookaheadDays };
  const calendarSources = [];
  const providerErrors = [];
  const events = [];

  if (Array.isArray(options.calendarEvents)) {
    return {
      events: filterCalendarEvents(options.calendarEvents, parserOptions),
      diagnostics: { calendarSources: ['option'], providerErrors: [] },
    };
  }

  if (options.blsCalendarRaw) {
    events.push(...parseIcsEvents(options.blsCalendarRaw, { ...parserOptions, source: 'bls-calendar' }));
    calendarSources.push('bls-calendar');
  } else if (!options.disableRemoteCalendars) {
    const bls = await safeCalendarFetch('bls-calendar', options.blsCalendarUrl || env.BLS_CALENDAR_URL, parseIcsEvents, {
      ...parserOptions,
      source: 'bls-calendar',
      timeoutMs: options.timeoutMs,
    });
    events.push(...bls.events);
    calendarSources.push('bls-calendar');
    if (bls.error) providerErrors.push({ provider: 'bls-calendar', message: bls.error });
  }

  if (options.fomcCalendarRaw) {
    events.push(...parseFomcEvents(options.fomcCalendarRaw, { ...parserOptions, source: 'fed-fomc-calendar' }));
    calendarSources.push('fed-fomc-calendar');
  } else if (!options.disableRemoteCalendars) {
    const fomc = await safeCalendarFetch('fed-fomc-calendar', options.fomcCalendarUrl || env.FED_FOMC_CALENDAR_URL, parseFomcEvents, {
      ...parserOptions,
      source: 'fed-fomc-calendar',
      timeoutMs: options.timeoutMs,
    });
    events.push(...fomc.events);
    calendarSources.push('fed-fomc-calendar');
    if (fomc.error) providerErrors.push({ provider: 'fed-fomc-calendar', message: fomc.error });
  }

  if (options.beaScheduleRaw) {
    events.push(...parseBeaScheduleEvents(options.beaScheduleRaw, { ...parserOptions, source: 'bea-release-schedule' }));
    calendarSources.push('bea-release-schedule');
  } else if (!options.disableRemoteCalendars) {
    const bea = await safeCalendarFetch('bea-release-schedule', options.beaScheduleUrl || env.BEA_RELEASE_SCHEDULE_URL, parseBeaScheduleEvents, {
      ...parserOptions,
      source: 'bea-release-schedule',
      timeoutMs: options.timeoutMs,
    });
    events.push(...bea.events);
    calendarSources.push('bea-release-schedule');
    if (bea.error) providerErrors.push({ provider: 'bea-release-schedule', message: bea.error });
  }

  return {
    events: filterCalendarEvents(events, parserOptions),
    diagnostics: {
      calendarSources: [...new Set(calendarSources)],
      providerErrors,
    },
  };
}

async function getMacroEvents(options = {}) {
  const hasInlineCalendar =
    Array.isArray(options.calendarEvents)
    || options.blsCalendarRaw
    || options.fomcCalendarRaw
    || options.beaScheduleRaw;

  if (options.cache === false || hasInlineCalendar) {
    return produceMacroEvents(options);
  }

  return macroCache.wrap(
    'provider:public:events',
    () => produceMacroEvents(options),
    env.MACRO_CALENDAR_CACHE_TTL_SECONDS,
  );
}

function deriveMacroState(series = {}) {
  const state = {
    inflationTrend: classifyInflationTrend(series),
    ratesTrend: classifyRatesTrend(series),
    volatilityRegime: classifyVolatilityRegime(series),
    liquidity: classifyLiquidity(series),
  };

  return {
    ...state,
    regime: classifyRegime(state),
  };
}

async function getMacroSnapshot(options = {}) {
  const indicatorsPayload = await getMacroIndicators(options);
  const eventsPayload = await getMacroEvents(options);
  const derived = deriveMacroState(indicatorsPayload.series);
  const hasDerivedState = Object.values(derived).some(Boolean);

  return {
    provider: 'public',
    source: hasDerivedState ? 'public-macro-provider' : 'public-macro-provider-partial',
    ...Object.fromEntries(Object.entries(derived).filter(([, value]) => Boolean(value))),
    indicators: indicatorsPayload.indicators,
    events: eventsPayload.events,
    diagnostics: {
      missingSeries: indicatorsPayload.diagnostics.missingSeries,
      providerErrors: [
        ...indicatorsPayload.diagnostics.providerErrors,
        ...eventsPayload.diagnostics.providerErrors,
      ],
      calendarSources: eventsPayload.diagnostics.calendarSources,
      dataFreshness: indicatorsPayload.diagnostics.dataFreshness,
    },
    updatedAt: new Date().toISOString(),
  };
}

async function getCachedMacroSnapshot(options = {}) {
  if (options.cache === false) {
    return getMacroSnapshot(options);
  }

  return macroCache.wrap('provider:public:snapshot', () => getMacroSnapshot(options), env.MACRO_CACHE_TTL_SECONDS);
}

module.exports = {
  FRED_SERIES,
  classifyInflationTrend,
  classifyLiquidity,
  classifyRatesTrend,
  classifyRegime,
  classifyVolatilityRegime,
  deriveMacroState,
  getMacroEvents,
  getMacroIndicators,
  getMacroSnapshot,
  getCachedMacroSnapshot,
  latestYoy,
  yoyMomentum,
};
