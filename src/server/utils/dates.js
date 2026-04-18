function isValidDate(value) {
  return value instanceof Date && !Number.isNaN(value.getTime());
}

function parseDate(value) {
  if (isValidDate(value)) {
    return value;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    const timestamp = value > 10_000_000_000 ? value : value * 1000;
    const parsed = new Date(timestamp);
    return isValidDate(parsed) ? parsed : null;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') {
      return null;
    }

    if (/^\d+$/.test(trimmed)) {
      return parseDate(Number(trimmed));
    }

    const parsed = new Date(trimmed);
    return isValidDate(parsed) ? parsed : null;
  }

  return null;
}

function toIsoString(value) {
  const parsed = parseDate(value);
  return parsed ? parsed.toISOString() : null;
}

function daysBetween(start, end) {
  const startDate = parseDate(start);
  const endDate = parseDate(end);
  if (!startDate || !endDate) {
    return 0;
  }

  return (endDate.getTime() - startDate.getTime()) / 86_400_000;
}

function isWithinDays(value, reference, days) {
  const date = parseDate(value);
  const anchor = parseDate(reference);
  if (!date || !anchor || !Number.isFinite(days)) {
    return false;
  }

  const cutoff = anchor.getTime() - days * 86_400_000;
  return date.getTime() >= cutoff && date.getTime() <= anchor.getTime();
}

module.exports = {
  daysBetween,
  isValidDate,
  isWithinDays,
  parseDate,
  toIsoString,
};
