import { fetchAnalysis, fetchDashboard } from './api.js';
import { setState, subscribe } from './state.js';
import { renderMetricBars } from './components/metric-bars.js';
import { renderScoreCard } from './components/score-card.js';
import { renderEquityChart } from './charts.js';

const elements = {
  refreshButton: document.getElementById('refreshButton'),
  assetSelect: document.getElementById('assetSelect'),
  intervalSelect: document.getElementById('intervalSelect'),
  assetEyebrow: document.getElementById('assetEyebrow'),
  errorAlert: document.getElementById('errorAlert'),
  metricBars: document.getElementById('metricBars'),
  generatedAt: document.getElementById('generatedAt'),
  tradeCount: document.getElementById('tradeCount'),
  marketCacheInfo: document.getElementById('marketCacheInfo'),
  marketStats: document.getElementById('marketStats'),
  historicalStats: document.getElementById('historicalStats'),
  macroStats: document.getElementById('macroStats'),
  geopoliticsStats: document.getElementById('geopoliticsStats'),
  volatilityStats: document.getElementById('volatilityStats'),
  knowledgeMatches: document.getElementById('knowledgeMatches'),
  llmPanel: document.getElementById('llmPanel'),
  equityChart: document.getElementById('equityChart'),
};

function formatNumber(value, options = {}) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return '--';
  }

  return Number(value).toLocaleString(undefined, options);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function renderStats(element, entries) {
  element.innerHTML = entries
    .map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`)
    .join('');
}

function renderDashboard(payload) {
  const analysis = payload.analysis;
  const technical = analysis?.components?.technical?.features || {};
  const macro = analysis?.components?.macro || {};
  const geopolitics = analysis?.components?.geopolitics || {};
  const volatility = analysis?.components?.volatility?.state || {};

  renderScoreCard(payload);
  renderMetricBars(elements.metricBars, analysis?.scores || payload.components);
  renderEquityChart(elements.equityChart, payload.historical?.equityCurve || []);

  elements.assetEyebrow.textContent = analysis?.asset?.symbol || elements.assetSelect.value;
  elements.generatedAt.textContent = analysis?.generatedAt || payload.generatedAt
    ? new Date(analysis?.generatedAt || payload.generatedAt).toLocaleString()
    : '--';
  elements.tradeCount.textContent = `${formatNumber(payload.historical?.tradeCount)} trades`;

  renderStats(elements.marketStats, [
    ['Price', `$${formatNumber(technical.price ?? payload.market?.price, { maximumFractionDigits: 2 })}`],
    ['Interval', analysis?.timeframe || payload.market?.interval || '--'],
    ['Regime', technical.regime || '--'],
    ['Trend', technical.trend || '--'],
    ['RSI 14', formatNumber(technical.rsi ?? payload.market?.rsi, { maximumFractionDigits: 2 })],
    ['Momentum', `${formatNumber(technical.momentum ?? payload.market?.momentum, { maximumFractionDigits: 2 })}%`],
  ]);

  elements.marketCacheInfo.textContent = `${analysis?.asset?.market || 'binance'} data; deterministic score is not a prediction.`;

  renderStats(elements.macroStats, [
    ['Regime', macro.regime || '--'],
    ['Trend', macro.trendClassification || '--'],
    ['Rates', macro.ratesTrend || '--'],
    ['Inflation', macro.inflationTrend || '--'],
    ['Event Risk', macro.eventRisk || '--'],
    ['Score', formatNumber(analysis?.scores?.macro, { maximumFractionDigits: 1 })],
  ]);

  renderStats(elements.geopoliticsStats, [
    ['Sentiment', geopolitics.sentiment || '--'],
    ['Risk', geopolitics.riskLevel || '--'],
    ['Themes', (geopolitics.themes || []).join(', ') || '--'],
    ['Countries', (geopolitics.relevantCountries || []).join(', ') || '--'],
    ['Source', geopolitics.source || '--'],
    ['Score', formatNumber(analysis?.scores?.geopolitics, { maximumFractionDigits: 1 })],
  ]);

  renderStats(elements.volatilityStats, [
    ['Regime', volatility.regime || '--'],
    ['ATR %', `${formatNumber(volatility.atrPct, { maximumFractionDigits: 2 })}%`],
    ['Vol Percentile', formatNumber(volatility.volPercentile, { maximumFractionDigits: 1 })],
    ['Clarity', formatNumber(volatility.directionalClarity, { maximumFractionDigits: 1 })],
    ['Danger', formatNumber(volatility.dangerLevel, { maximumFractionDigits: 1 })],
    ['Score', formatNumber(analysis?.scores?.volatility, { maximumFractionDigits: 1 })],
  ]);

  renderKnowledgeMatches(analysis?.knowledgeMatches || []);
  renderLlmPanel(analysis?.llm);

  renderStats(elements.historicalStats, [
    ['Win Rate 20', `${formatNumber((payload.historical?.winRate20 || 0) * 100, { maximumFractionDigits: 1 })}%`],
    ['PnL 7D', formatNumber(payload.historical?.pnl7d, { maximumFractionDigits: 2 })],
    ['Avg Trade Size', formatNumber(payload.historical?.avgTradeSize, { maximumFractionDigits: 2 })],
    ['Max Drawdown', formatNumber(payload.historical?.drawdown, { maximumFractionDigits: 2 })],
    ['Total PnL', formatNumber(payload.historical?.totalPnl, { maximumFractionDigits: 2 })],
  ]);
}

function renderKnowledgeMatches(matches) {
  if (!matches.length) {
    elements.knowledgeMatches.innerHTML = '<p class="text-secondary mb-0">No strategy or risk rules matched this state.</p>';
    return;
  }

  elements.knowledgeMatches.innerHTML = matches
    .slice(0, 6)
    .map(
      (match) => `
        <div class="match-item">
          <strong>${escapeHtml(match.name || match.id)}</strong>
          <span>${escapeHtml(match.category)}: ${escapeHtml(match.note || 'Matched current context.')}</span>
        </div>
      `,
    )
    .join('');
}

function renderLlmPanel(llm) {
  if (!llm || !llm.enabled) {
    elements.llmPanel.textContent = llm?.reasoning || 'OpenAI meta reasoning is unavailable; deterministic output remains active.';
    return;
  }

  elements.llmPanel.innerHTML = `
    <p><strong>${escapeHtml(llm.sentiment)}</strong> confidence ${formatNumber(llm.confidence, { maximumFractionDigits: 1 })}</p>
    <p>${escapeHtml(llm.reasoning)}</p>
    <p>${escapeHtml(llm.risk_note)}</p>
  `;
}

async function loadDashboard() {
  setState({ loading: true, error: null });
  elements.refreshButton.disabled = true;
  elements.assetSelect.disabled = true;
  elements.intervalSelect.disabled = true;
  elements.refreshButton.textContent = 'Loading';

  try {
    const [dashboard, analysis] = await Promise.all([
      fetchDashboard({
        interval: elements.intervalSelect.value,
      }),
      fetchAnalysis({
        symbol: elements.assetSelect.value,
        interval: elements.intervalSelect.value,
      }),
    ]);
    const data = {
      ...dashboard,
      analysis,
    };
    setState({ data, loading: false, error: null });
  } catch (error) {
    setState({ loading: false, error: error.message });
  } finally {
    elements.refreshButton.disabled = false;
    elements.assetSelect.disabled = false;
    elements.intervalSelect.disabled = false;
    elements.refreshButton.textContent = 'Refresh';
  }
}

subscribe((state) => {
  if (state.error) {
    elements.errorAlert.textContent = state.error;
    elements.errorAlert.classList.remove('d-none');
  } else {
    elements.errorAlert.classList.add('d-none');
  }

  if (state.data) {
    renderDashboard(state.data);
  }
});

elements.refreshButton.addEventListener('click', loadDashboard);
elements.assetSelect.addEventListener('change', () => {
  setState({ symbol: elements.assetSelect.value });
  loadDashboard();
});
elements.intervalSelect.addEventListener('change', () => {
  setState({ interval: elements.intervalSelect.value });
  loadDashboard();
});
loadDashboard();
