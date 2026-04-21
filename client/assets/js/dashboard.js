import {
  addWatchlistAsset,
  fetchAnalysis,
  fetchAssets,
  removeWatchlistAsset,
} from './api.js';
import { setState, subscribe } from './state.js';
import { renderMetricBars } from './components/metric-bars.js';
import { renderScoreCard } from './components/score-card.js';

const elements = {
  refreshButton: document.getElementById('refreshButton'),
  addAssetButton: document.getElementById('addAssetButton'),
  removeAssetButton: document.getElementById('removeAssetButton'),
  assetSelect: document.getElementById('assetSelect'),
  assetSearchInput: document.getElementById('assetSearchInput'),
  intervalSelect: document.getElementById('intervalSelect'),
  assetEyebrow: document.getElementById('assetEyebrow'),
  errorAlert: document.getElementById('errorAlert'),
  metricBars: document.getElementById('metricBars'),
  generatedAt: document.getElementById('generatedAt'),
  macroStats: document.getElementById('macroStats'),
  macroEvents: document.getElementById('macroEvents'),
  macroDrivers: document.getElementById('macroDrivers'),
  geopoliticsStats: document.getElementById('geopoliticsStats'),
  geopoliticsDrivers: document.getElementById('geopoliticsDrivers'),
  volatilityStats: document.getElementById('volatilityStats'),
  knowledgeMatches: document.getElementById('knowledgeMatches'),
  llmPanel: document.getElementById('llmPanel'),
};

let assetsBySymbol = new Map();

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

function formatDateTime(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return '--';
  }

  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function compactSource(value) {
  return String(value || '--').replaceAll('-', ' ');
}

function riskForEvent(event) {
  const date = new Date(event?.startsAt);
  if (!Number.isFinite(date.getTime())) {
    return event?.importance || 'low';
  }

  const hours = Math.abs(date.getTime() - Date.now()) / 3_600_000;
  if (hours <= 24) return 'high';
  if (hours <= 72) return 'medium';
  return event?.importance || 'low';
}

function renderMacroEvents(events = []) {
  if (!elements.macroEvents) return;

  const upcoming = events
    .filter((event) => new Date(event.startsAt).getTime() >= Date.now() - 86_400_000)
    .slice(0, 3);

  if (!upcoming.length) {
    elements.macroEvents.innerHTML = '<p class="text-secondary mb-0">No scheduled macro events in range.</p>';
    return;
  }

  elements.macroEvents.innerHTML = upcoming
    .map((event) => {
      const risk = riskForEvent(event);
      return `
        <div class="event-item">
          <div class="event-item-header">
            <span class="event-title">${escapeHtml(event.type || 'Macro')}</span>
            <span class="event-badge ${escapeHtml(risk)}">${escapeHtml(risk)}</span>
          </div>
          <span class="event-meta">${escapeHtml(formatDateTime(event.startsAt))} · ${escapeHtml(compactSource(event.source))}</span>
        </div>
      `;
    })
    .join('');
}

function renderMacroDrivers(indicators = []) {
  if (!elements.macroDrivers) return;

  const drivers = indicators
    .filter((indicator) => ['inflation', 'rates', 'volatility', 'credit', 'growth', 'labor'].includes(indicator.group))
    .slice(0, 4);

  if (!drivers.length) {
    elements.macroDrivers.innerHTML = '<p class="text-secondary mb-0">Live macro drivers unavailable; fallback state is active.</p>';
    return;
  }

  elements.macroDrivers.innerHTML = drivers
    .map((indicator) => {
      const value = `${formatNumber(indicator.value, { maximumFractionDigits: 2 })}${indicator.unit ? ` ${indicator.unit}` : ''}`;
      const stale = indicator.stale ? ' · stale' : '';
      return `
        <div class="driver-item">
          <div class="driver-item-header">
            <span class="driver-title">${escapeHtml(indicator.label)}</span>
            <span class="driver-title">${escapeHtml(value)}</span>
          </div>
          <span class="driver-meta">${escapeHtml(indicator.trend || 'stable')} · ${escapeHtml(indicator.date || '--')}${escapeHtml(stale)}</span>
        </div>
      `;
    })
    .join('');
}

function renderGeopoliticsDrivers(geopolitics = {}) {
  if (!elements.geopoliticsDrivers) return;

  const drivers = geopolitics.diagnostics?.topDrivers || geopolitics.topDrivers || [];
  if (!drivers.length) {
    elements.geopoliticsDrivers.innerHTML = '<p class="text-secondary mb-0">No geopolitical drivers reported.</p>';
    return;
  }

  elements.geopoliticsDrivers.innerHTML = drivers
    .slice(0, 4)
    .map((driver) => `
      <div class="driver-item">
        <span class="driver-title">${escapeHtml(driver)}</span>
      </div>
    `)
    .join('');
}

function assetLabel(asset) {
  const type = asset.type ? ` (${asset.type})` : '';
  return `${asset.symbol}${type}`;
}

function renderAssetOptions(assets = [], selectedSymbol = 'BTCUSDT') {
  assetsBySymbol = new Map(assets.map((asset) => [asset.symbol, asset]));
  const fallbackSymbol = assetsBySymbol.has(selectedSymbol)
    ? selectedSymbol
    : assetsBySymbol.has('BTCUSDT')
      ? 'BTCUSDT'
      : assets[0]?.symbol;

  elements.assetSelect.innerHTML = assets
    .map((asset) => `<option value="${escapeHtml(asset.symbol)}">${escapeHtml(assetLabel(asset))}</option>`)
    .join('');

  if (fallbackSymbol) {
    elements.assetSelect.value = fallbackSymbol;
    elements.assetSearchInput.value = fallbackSymbol;
  }

  updateRemoveButtonState();
  return fallbackSymbol;
}

function selectedAsset() {
  return assetsBySymbol.get(elements.assetSelect.value);
}

function updateRemoveButtonState() {
  const asset = selectedAsset();
  elements.removeAssetButton.disabled = !asset || asset.source !== 'watchlist';
}

function setControlsDisabled(disabled) {
  elements.refreshButton.disabled = disabled;
  elements.assetSelect.disabled = disabled;
  elements.assetSearchInput.disabled = disabled;
  elements.intervalSelect.disabled = disabled;
  elements.addAssetButton.disabled = disabled;

  if (disabled) {
    elements.removeAssetButton.disabled = true;
  } else {
    updateRemoveButtonState();
  }
}

function renderDashboard(payload) {
  const analysis = payload.analysis;
  const macro = analysis?.components?.macro || {};
  const geopolitics = analysis?.components?.geopolitics || {};
  const volatility = analysis?.components?.volatility?.state || {};

  renderScoreCard(payload);
  renderMetricBars(elements.metricBars, analysis?.scores || {});

  elements.assetEyebrow.textContent = analysis?.asset?.symbol || elements.assetSelect.value;
  elements.generatedAt.textContent = analysis?.generatedAt || payload.generatedAt
    ? new Date(analysis?.generatedAt || payload.generatedAt).toLocaleString()
    : '--';

  renderStats(elements.macroStats, [
    ['Regime', macro.regime || '--'],
    ['Trend', macro.trendClassification || '--'],
    ['Rates', macro.ratesTrend || '--'],
    ['Inflation', macro.inflationTrend || '--'],
    ['Event Risk', macro.eventRisk || '--'],
    ['Event Source', compactSource(macro.eventRiskSource)],
    ['Source', compactSource(macro.source || macro.provider)],
    ['Updated', macro.updatedAt ? formatDateTime(macro.updatedAt) : '--'],
    ['Score', formatNumber(analysis?.scores?.macro, { maximumFractionDigits: 1 })],
  ]);
  renderMacroEvents(macro.events || []);
  renderMacroDrivers(macro.indicators || []);

  renderStats(elements.geopoliticsStats, [
    ['Sentiment', geopolitics.sentiment || '--'],
    ['Risk', geopolitics.riskLevel || '--'],
    ['Themes', (geopolitics.themes || []).join(', ') || '--'],
    ['Countries', (geopolitics.relevantCountries || []).join(', ') || '--'],
    ['Source', geopolitics.source || '--'],
    ['Quality', geopolitics.diagnostics?.sourceMode || geopolitics.diagnostics?.dataQuality?.mode || '--'],
    ['Score', formatNumber(analysis?.scores?.geopolitics, { maximumFractionDigits: 1 })],
  ]);
  renderGeopoliticsDrivers(geopolitics);

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
  setControlsDisabled(true);
  elements.refreshButton.textContent = 'Loading';
  const symbol = elements.assetSelect.value;
  const interval = elements.intervalSelect.value;

  try {
    const analysis = await fetchAnalysis({
      symbol,
      interval,
    });
    const data = {
      analysis,
    };
    setState({ data, loading: false, error: null });
  } catch (error) {
    setState({ loading: false, error: error.message });
  } finally {
    setControlsDisabled(false);
    elements.refreshButton.textContent = 'Refresh';
  }
}

async function loadAssets(selectedSymbol = 'BTCUSDT') {
  const payload = await fetchAssets();
  const symbol = renderAssetOptions(payload.assets || [], selectedSymbol);
  setState({ assets: payload.assets || [], symbol });
  return payload.assets || [];
}

async function handleAddAsset() {
  const symbol = elements.assetSearchInput.value.trim().toUpperCase();
  if (!symbol) {
    setState({ error: 'Asset symbol is required.' });
    return;
  }

  elements.addAssetButton.disabled = true;
  elements.addAssetButton.textContent = 'Adding';

  try {
    const payload = await addWatchlistAsset({
      symbol,
      interval: elements.intervalSelect.value,
    });
    const selected = payload.asset?.symbol || symbol;
    renderAssetOptions(payload.assets || [], selected);
    setState({ assets: payload.assets || [], symbol: selected, error: null });
    await loadDashboard();
  } catch (error) {
    setState({ error: error.message });
  } finally {
    elements.addAssetButton.textContent = 'Add';
    setControlsDisabled(false);
  }
}

async function handleRemoveAsset() {
  const asset = selectedAsset();
  if (!asset || asset.source !== 'watchlist') {
    updateRemoveButtonState();
    return;
  }

  elements.removeAssetButton.disabled = true;
  elements.removeAssetButton.textContent = 'Removing';

  try {
    const payload = await removeWatchlistAsset(asset.symbol);
    const nextSymbol = payload.assets?.some((candidate) => candidate.symbol === 'BTCUSDT')
      ? 'BTCUSDT'
      : payload.assets?.[0]?.symbol;
    renderAssetOptions(payload.assets || [], nextSymbol);
    setState({ assets: payload.assets || [], symbol: elements.assetSelect.value, error: null });
    await loadDashboard();
  } catch (error) {
    setState({ error: error.message });
  } finally {
    elements.removeAssetButton.textContent = 'Remove';
    setControlsDisabled(false);
  }
}

async function initializeDashboard() {
  try {
    await loadAssets();
    await loadDashboard();
  } catch (error) {
    setState({ loading: false, error: error.message });
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
elements.addAssetButton.addEventListener('click', handleAddAsset);
elements.removeAssetButton.addEventListener('click', handleRemoveAsset);
elements.assetSearchInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    handleAddAsset();
  }
});
elements.assetSelect.addEventListener('change', () => {
  setState({ symbol: elements.assetSelect.value });
  elements.assetSearchInput.value = elements.assetSelect.value;
  updateRemoveButtonState();
  loadDashboard();
});
elements.intervalSelect.addEventListener('change', () => {
  setState({ interval: elements.intervalSelect.value });
  loadDashboard();
});
initializeDashboard();
