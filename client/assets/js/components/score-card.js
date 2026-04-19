const BADGE_CLASSES = {
  YES: 'text-bg-success',
  CAUTION: 'text-bg-warning',
  NO: 'text-bg-danger',
  STRONG_LONG: 'text-bg-success',
  LONG: 'text-bg-success',
  WEAK_LONG: 'text-bg-warning',
  WAIT: 'text-bg-secondary',
  WEAK_SHORT: 'text-bg-warning',
  SHORT: 'text-bg-danger',
  STRONG_SHORT: 'text-bg-danger',
};

export function renderScoreCard(payload) {
  const scoreValue = document.getElementById('scoreValue');
  const decisionBadge = document.getElementById('decisionBadge');
  const scoreSummary = document.getElementById('scoreSummary');
  const analysis = payload.analysis;
  const value = analysis ? analysis.confidence : payload.score;
  const signal = analysis ? analysis.signal : payload.decision;

  scoreValue.textContent = Number(value ?? 0).toFixed(1);
  decisionBadge.textContent = signal || '--';
  decisionBadge.className = `badge decision-badge ${BADGE_CLASSES[signal] || 'text-bg-secondary'}`;
  scoreSummary.textContent = analysis?.summary || payload.summary || '';
}
