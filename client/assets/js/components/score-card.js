const BADGE_CLASSES = {
  YES: 'text-bg-success',
  CAUTION: 'text-bg-warning',
  NO: 'text-bg-danger',
};

export function renderScoreCard(payload) {
  const scoreValue = document.getElementById('scoreValue');
  const decisionBadge = document.getElementById('decisionBadge');
  const scoreSummary = document.getElementById('scoreSummary');

  scoreValue.textContent = Number(payload.score ?? 0).toFixed(1);
  decisionBadge.textContent = payload.decision || '--';
  decisionBadge.className = `badge decision-badge ${BADGE_CLASSES[payload.decision] || 'text-bg-secondary'}`;
  scoreSummary.textContent = payload.summary || '';
}
