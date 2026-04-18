import { fetchDashboard } from './api.js';
import { setState, subscribe } from './state.js';
import { renderMetricBars } from './components/metric-bars.js';
import { renderScoreCard } from './components/score-card.js';
import { renderEquityChart } from './charts.js';

const elements = {
  refreshButton: document.getElementById('refreshButton'),
  intervalSelect: document.getElementById('intervalSelect'),
  errorAlert: document.getElementById('errorAlert'),
  metricBars: document.getElementById('metricBars'),
  generatedAt: document.getElementById('generatedAt'),
  tradeCount: document.getElementById('tradeCount'),
  marketCacheInfo: document.getElementById('marketCacheInfo'),
  marketStats: document.getElementById('marketStats'),
  historicalStats: document.getElementById('historicalStats'),
  equityChart: document.getElementById('equityChart'),
};

function formatNumber(value, options = {}) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return '--';
  }

  return Number(value).toLocaleString(undefined, options);
}

function renderStats(element, entries) {
  element.innerHTML = entries
    .map(([label, value]) => `<div><dt>${label}</dt><dd>${value}</dd></div>`)
    .join('');
}

function renderDashboard(payload) {
  renderScoreCard(payload);
  renderMetricBars(elements.metricBars, payload.components);
  renderEquityChart(elements.equityChart, payload.historical?.equityCurve || []);

  elements.generatedAt.textContent = payload.generatedAt
    ? new Date(payload.generatedAt).toLocaleString()
    : '--';
  elements.tradeCount.textContent = `${formatNumber(payload.historical?.tradeCount)} trades`;

  renderStats(elements.marketStats, [
    ['Price', `$${formatNumber(payload.market?.price, { maximumFractionDigits: 2 })}`],
    ['Interval', payload.market?.interval || '--'],
    ['RSI 14', formatNumber(payload.market?.rsi, { maximumFractionDigits: 2 })],
    ['Volatility', formatNumber(payload.market?.volatility, { maximumFractionDigits: 5 })],
    ['Trend', formatNumber(payload.market?.trend, { maximumFractionDigits: 6 })],
    ['Momentum', `${formatNumber(payload.market?.momentum, { maximumFractionDigits: 2 })}%`],
  ]);

  elements.marketCacheInfo.textContent = `Binance cache: ${formatNumber(payload.market?.cacheTtlSeconds)}s per interval`;

  renderStats(elements.historicalStats, [
    ['Win Rate 20', `${formatNumber((payload.historical?.winRate20 || 0) * 100, { maximumFractionDigits: 1 })}%`],
    ['PnL 7D', formatNumber(payload.historical?.pnl7d, { maximumFractionDigits: 2 })],
    ['Avg Trade Size', formatNumber(payload.historical?.avgTradeSize, { maximumFractionDigits: 2 })],
    ['Max Drawdown', formatNumber(payload.historical?.drawdown, { maximumFractionDigits: 2 })],
    ['Total PnL', formatNumber(payload.historical?.totalPnl, { maximumFractionDigits: 2 })],
  ]);
}

async function loadDashboard() {
  setState({ loading: true, error: null });
  elements.refreshButton.disabled = true;
  elements.intervalSelect.disabled = true;
  elements.refreshButton.textContent = 'Loading';

  try {
    const data = await fetchDashboard({
      interval: elements.intervalSelect.value,
    });
    setState({ data, loading: false, error: null });
  } catch (error) {
    setState({ loading: false, error: error.message });
  } finally {
    elements.refreshButton.disabled = false;
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
elements.intervalSelect.addEventListener('change', () => {
  setState({ interval: elements.intervalSelect.value });
  loadDashboard();
});
loadDashboard();
