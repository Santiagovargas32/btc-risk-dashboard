function parseEventDates(raw) {
  if (!raw) {
    return [];
  }

  return String(raw)
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => new Date(value))
    .filter((date) => Number.isFinite(date.getTime()));
}

function classifyEventRisk(date = new Date(), events = []) {
  if (!events.length) {
    return 'low';
  }

  const now = date.getTime();
  const nearestHours = Math.min(
    ...events.map((eventDate) => Math.abs(eventDate.getTime() - now) / 3_600_000),
  );

  if (nearestHours <= 24) {
    return 'high';
  }

  if (nearestHours <= 72) {
    return 'medium';
  }

  return 'low';
}

module.exports = {
  classifyEventRisk,
  parseEventDates,
};
