const LABELS = {
  momentumScore: 'Momentum',
  trendScore: 'Trend',
  volatilityScore: 'Volatility',
  drawdownScore: 'Drawdown',
  alignmentScore: 'Alignment',
  technical: 'Technical',
  macro: 'Macro',
  geopolitics: 'Geopolitics',
  volatility: 'Volatility',
  total: 'Total',
};

export function renderMetricBars(element, components = {}) {
  element.innerHTML = '';
  const keys = Object.keys(components).filter((key) => LABELS[key]);

  keys.forEach((key) => {
    const label = LABELS[key];
    const value = Number(components[key] ?? 0);
    const bounded = Math.max(0, Math.min(100, Math.abs(value)));
    const row = document.createElement('div');
    row.className = 'metric-row';
    row.innerHTML = `
      <div class="metric-row-header">
        <span>${label}</span>
        <strong>${value >= 0 ? '+' : ''}${value.toFixed(1)}</strong>
      </div>
      <div class="progress" role="progressbar" aria-label="${label}" aria-valuemin="-100" aria-valuemax="100" aria-valuenow="${value}">
        <div class="progress-bar ${value < 0 ? 'negative' : ''}" style="width: ${bounded}%"></div>
      </div>
    `;

    element.appendChild(row);
  });
}
