const assert = require('node:assert/strict');
const axios = require('axios');
const {
  parseBeaScheduleEvents,
  parseFomcEvents,
  parseIcsEvents,
} = require('../src/server/services/macro/economic-calendar.service');
const fredClient = require('../src/server/services/macro/fred-client.service');
const {
  deriveMacroState,
  getMacroSnapshot,
} = require('../src/server/services/macro/macro-provider.service');

function obs(date, value) {
  return { date, value };
}

function monthlySeries(values, startYear = 2024) {
  return values.map((value, index) => {
    const date = new Date(Date.UTC(startYear, index, 1));
    return obs(date.toISOString().slice(0, 10), value);
  });
}

function datedSeries(values, startDay = 1) {
  return values.map((value, index) => obs(`2026-04-${String(startDay + index).padStart(2, '0')}`, value));
}

function seriesPayload(seriesId, observations) {
  return {
    ok: true,
    unavailable: false,
    seriesId,
    observations,
  };
}

function buildSupportiveSeries() {
  const easingCpi = monthlySeries([
    100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100,
    104, 103.5, 102.8, 102,
  ]);
  const fallingRates = datedSeries([
    4.1, 4.08, 4.07, 4.05, 4.03, 4.01, 4, 3.98, 3.96, 3.94,
    3.92, 3.9, 3.88, 3.86, 3.84, 3.82, 3.8, 3.78, 3.76, 3.74,
    3.5,
  ]);

  return {
    cpi: seriesPayload('CPIAUCSL', easingCpi),
    coreCpi: seriesPayload('CPILFESL', easingCpi),
    fedFunds: seriesPayload('FEDFUNDS', monthlySeries([4, 4, 4, 4])),
    twoYearYield: seriesPayload('DGS2', fallingRates),
    vix: seriesPayload('VIXCLS', datedSeries([15])),
    highYieldSpread: seriesPayload('BAMLH0A0HYM2', datedSeries([3])),
    nfci: seriesPayload('NFCI', datedSeries([-0.2])),
    fedBalanceSheet: seriesPayload('WALCL', datedSeries([7800, 7825, 7850, 7900, 8000])),
    reverseRepo: seriesPayload('RRPONTSYD', datedSeries([600, 575, 550, 525, 500])),
    treasuryGeneralAccount: seriesPayload('WTREGEN', datedSeries([800, 775, 750, 725, 700])),
    realGdp: seriesPayload('GDPC1', monthlySeries([23000])),
    unemploymentRate: seriesPayload('UNRATE', monthlySeries([4.1])),
  };
}

async function run() {
  const originalGet = axios.get;
  axios.get = async () => ({
    data: {
      observations: [
        { date: '2026-01-01', value: '.' },
        { date: '2026-03-01', value: '3.5' },
        { date: '2026-02-01', value: '3.7' },
      ],
    },
  });

  try {
    const fetched = await fredClient.fetchSeries('DGS2', { apiKey: 'test-key' });
    assert.equal(fetched.ok, true);
    assert.deepEqual(fetched.observations.map((item) => item.value), [3.7, 3.5]);
  } finally {
    axios.get = originalGet;
  }

  const ics = [
    'BEGIN:VEVENT',
    'DTSTART:20260512T123000Z',
    'SUMMARY:Consumer Price Index for April 2026',
    'END:VEVENT',
    'BEGIN:VEVENT',
    'DTSTART:20260508T123000Z',
    'SUMMARY:Employment Situation for April 2026',
    'END:VEVENT',
  ].join('\n');
  const blsEvents = parseIcsEvents(ics);
  assert.deepEqual(blsEvents.map((event) => event.type), ['NFP', 'CPI']);

  const fomcHtml = '<h4>2026 FOMC Meetings</h4><p>April</p><p>28-29</p><p>June</p><p>16-17*</p>';
  const fomcEvents = parseFomcEvents(fomcHtml);
  assert.equal(fomcEvents[0].type, 'FOMC');
  assert.equal(fomcEvents[0].startsAt.slice(0, 10), '2026-04-28');

  const beaHtml = '<div>Year 2026</div><div>April 30</div><div>8:30 AM</div><div>News</div><div>GDP (Advance Estimate), 1st Quarter 2026</div>';
  const beaEvents = parseBeaScheduleEvents(beaHtml);
  assert.equal(beaEvents[0].type, 'GDP');
  assert.equal(beaEvents[0].startsAt.slice(0, 10), '2026-04-30');

  const series = buildSupportiveSeries();
  const derived = deriveMacroState(series);
  assert.equal(derived.inflationTrend, 'down');
  assert.equal(derived.ratesTrend, 'falling');
  assert.equal(derived.volatilityRegime, 'calm');
  assert.equal(derived.liquidity, 'expanding');
  assert.equal(derived.regime, 'risk_on');

  const snapshot = await getMacroSnapshot({
    cache: false,
    series,
    calendarEvents: [
      {
        type: 'FOMC',
        startsAt: '2026-04-28T18:00:00.000Z',
        source: 'fed-fomc-calendar',
      },
    ],
    now: new Date('2026-04-21T12:00:00.000Z'),
  });
  assert.equal(snapshot.provider, 'public');
  assert.equal(snapshot.regime, 'risk_on');
  assert.equal(snapshot.events.length, 1);
  assert.ok(snapshot.indicators.some((indicator) => indicator.label === 'CPI YoY'));
  assert.ok(Object.hasOwn(snapshot.diagnostics, 'dataFreshness'));
}

module.exports = {
  name: 'public macro provider parses calendars and derives live state',
  run,
};
