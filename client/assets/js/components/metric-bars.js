const LABELS = {
  momentumScore: 'Momentum',
  trendScore: 'Trend',
  volatilityScore: 'Volatility',
  drawdownScore: 'Drawdown',
  alignmentScore: 'Alignment',
};

export function renderMetricBars(element, components = {}) {
  element.innerHTML = '';

  Object.entries(LABELS).forEach(([key, label]) => {
    const value = Number(components[key] ?? 0);
    const row = document.createElement('div');
    row.className = 'metric-row';
    row.innerHTML = `
      <div class="metric-row-header">
        <span>${label}</span>
        <strong>${value.toFixed(1)}</strong>
      </div>
      <div class="progress" role="progressbar" aria-label="${label}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${value}">
        <div class="progress-bar" style="width: ${Math.max(0, Math.min(100, value))}%"></div>
      </div>
    `;

    element.appendChild(row);
  });
}
