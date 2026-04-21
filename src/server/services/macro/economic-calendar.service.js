const MONTH_INDEX = {
  january: 0,
  jan: 0,
  february: 1,
  feb: 1,
  march: 2,
  mar: 2,
  april: 3,
  apr: 3,
  may: 4,
  june: 5,
  jun: 5,
  july: 6,
  jul: 6,
  august: 7,
  aug: 7,
  september: 8,
  sep: 8,
  sept: 8,
  october: 9,
  oct: 9,
  november: 10,
  nov: 10,
  december: 11,
  dec: 11,
};

const RISK_RANK = { low: 0, medium: 1, high: 2 };

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

function dateFromEvent(event) {
  if (event instanceof Date) {
    return Number.isFinite(event.getTime()) ? event : null;
  }

  if (!event) {
    return null;
  }

  const value = event.startsAt || event.date || event.releaseAt || event;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function classifyEventRisk(date = new Date(), events = [], options = {}) {
  if (!events.length) {
    return 'low';
  }

  const highWindowHours = Number(options.highWindowHours || 24);
  const mediumWindowHours = Number(options.mediumWindowHours || 72);
  const now = date.getTime();
  const eventDates = events.map(dateFromEvent).filter(Boolean);

  if (!eventDates.length) {
    return 'low';
  }

  const nearestHours = Math.min(
    ...eventDates.map((eventDate) => Math.abs(eventDate.getTime() - now) / 3_600_000),
  );

  if (nearestHours <= highWindowHours) {
    return 'high';
  }

  if (nearestHours <= mediumWindowHours) {
    return 'medium';
  }

  return 'low';
}

function highestEventRisk(events = [], options = {}) {
  const now = options.now || new Date();
  let best = {
    eventRisk: 'low',
    eventRiskSource: null,
    event: null,
  };

  for (const event of events) {
    const eventRisk = classifyEventRisk(now, [event], options);
    if (RISK_RANK[eventRisk] > RISK_RANK[best.eventRisk]) {
      best = {
        eventRisk,
        eventRiskSource: event.source || event.eventRiskSource || 'calendar',
        event,
      };
    }
  }

  return best;
}

function unfoldIcs(raw = '') {
  return String(raw).replace(/\r?\n[ \t]/g, '');
}

function parseIcsDate(value) {
  const normalized = String(value || '').trim();
  const dateOnly = normalized.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (dateOnly) {
    return new Date(Date.UTC(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]), 12));
  }

  const dateTime = normalized.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/);
  if (dateTime) {
    return new Date(Date.UTC(
      Number(dateTime[1]),
      Number(dateTime[2]) - 1,
      Number(dateTime[3]),
      Number(dateTime[4]),
      Number(dateTime[5]),
      Number(dateTime[6] || 0),
    ));
  }

  const parsed = new Date(normalized);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function typeForSummary(summary = '') {
  if (/consumer price index|cpi\b/i.test(summary)) return 'CPI';
  if (/employment situation|nonfarm|payroll|nfp\b/i.test(summary)) return 'NFP';
  if (/gross domestic product|\bgdp\b/i.test(summary)) return 'GDP';
  if (/fomc|federal open market committee/i.test(summary)) return 'FOMC';
  return null;
}

function parseIcsEvents(raw = '', options = {}) {
  const source = options.source || 'bls-calendar';
  const events = [];
  const blocks = unfoldIcs(raw).split(/BEGIN:VEVENT/i).slice(1);

  for (const block of blocks) {
    const summary = (block.match(/^SUMMARY(?:;[^:]*)?:(.+)$/im) || [])[1];
    const dtstart = (block.match(/^DTSTART(?:;[^:]*)?:(.+)$/im) || [])[1];
    const startsAt = parseIcsDate(dtstart);
    const type = typeForSummary(summary);

    if (!type || !startsAt) {
      continue;
    }

    events.push({
      type,
      title: summary.trim(),
      startsAt: startsAt.toISOString(),
      importance: 'high',
      source,
    });
  }

  return filterCalendarEvents(events, options);
}

function stripMarkup(raw = '') {
  return String(raw)
    .replace(/<script[\s\S]*?<\/script>/gi, '\n')
    .replace(/<style[\s\S]*?<\/style>/gi, '\n')
    .replace(/<[^>]+>/g, '\n')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#8211;|&ndash;/g, '-')
    .replace(/&#8212;|&mdash;/g, '-')
    .replace(/\r/g, '\n');
}

function cleanLines(raw = '') {
  return stripMarkup(raw)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function monthIndex(value) {
  const key = String(value || '').toLowerCase().split('/')[0];
  return MONTH_INDEX[key] ?? null;
}

function parseFomcEvents(raw = '', options = {}) {
  const events = [];
  const lines = cleanLines(raw);
  let currentYear = options.year || null;
  let currentMonth = null;

  for (const line of lines) {
    const yearMatch = line.match(/\b(20\d{2})\s+FOMC Meetings\b/i);
    if (yearMatch) {
      currentYear = Number(yearMatch[1]);
      currentMonth = null;
      continue;
    }

    if (/^(January|February|March|April|May|June|July|August|September|October|November|December|Jan\/Feb|Apr\/May)$/i.test(line)) {
      currentMonth = line;
      continue;
    }

    const dayMatch = line.match(/^(\d{1,2})(?:\s*-\s*(\d{1,2}))?\*?$/);
    const month = monthIndex(currentMonth);
    if (!currentYear || month === null || !dayMatch) {
      continue;
    }

    const startDay = Number(dayMatch[1]);
    const endDay = Number(dayMatch[2] || dayMatch[1]);
    const endMonth = endDay < startDay ? month + 1 : month;
    const startsAt = new Date(Date.UTC(currentYear, month, startDay, 18));
    const endsAt = new Date(Date.UTC(currentYear, endMonth, endDay, 18));

    events.push({
      type: 'FOMC',
      title: `FOMC meeting ${currentMonth} ${line}`,
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      importance: 'high',
      source: options.source || 'fed-fomc-calendar',
    });
  }

  return filterCalendarEvents(events, options);
}

function parseTimeToUtcHour(raw = '') {
  const match = String(raw).match(/^(\d{1,2}):(\d{2})\s*([AP]M)$/i);
  if (!match) {
    return { hour: 12, minute: 0 };
  }

  let hour = Number(match[1]);
  if (/pm/i.test(match[3]) && hour < 12) hour += 12;
  if (/am/i.test(match[3]) && hour === 12) hour = 0;

  return { hour: hour + 5, minute: Number(match[2]) };
}

function parseBeaScheduleEvents(raw = '', options = {}) {
  const events = [];
  const lines = cleanLines(raw);
  let currentYear = options.year || new Date().getUTCFullYear();

  for (let index = 0; index < lines.length; index += 1) {
    const yearMatch = lines[index].match(/\bYear\s+(20\d{2})\b/i);
    if (yearMatch) {
      currentYear = Number(yearMatch[1]);
      continue;
    }

    const dateMatch = lines[index].match(/^(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})$/i);
    if (!dateMatch) {
      continue;
    }

    const time = lines[index + 1] || '';
    if (!/^\d{1,2}:\d{2}\s*[AP]M$/i.test(time)) {
      continue;
    }

    let titleIndex = index + 2;
    while (titleIndex < lines.length && /^(N\s*ews|D\s*ata|Visual Data|Article)$/i.test(lines[titleIndex])) {
      titleIndex += 1;
    }

    const title = lines[titleIndex] || '';
    if (!/\bgdp\b|gross domestic product/i.test(title)) {
      continue;
    }

    const { hour, minute } = parseTimeToUtcHour(time);
    const startsAt = new Date(Date.UTC(currentYear, monthIndex(dateMatch[1]), Number(dateMatch[2]), hour, minute));
    events.push({
      type: 'GDP',
      title,
      startsAt: startsAt.toISOString(),
      importance: 'high',
      source: options.source || 'bea-release-schedule',
    });
  }

  return filterCalendarEvents(events, options);
}

function filterCalendarEvents(events = [], options = {}) {
  const now = options.now ? new Date(options.now) : null;
  const lookaheadDays = Number(options.lookaheadDays || 0);

  return events
    .filter((event) => {
      const date = dateFromEvent(event);
      if (!date) return false;
      if (!now || !lookaheadDays) return true;
      const ageMs = date.getTime() - now.getTime();
      return ageMs >= -86_400_000 && ageMs <= lookaheadDays * 86_400_000;
    })
    .sort((left, right) => dateFromEvent(left).getTime() - dateFromEvent(right).getTime());
}

module.exports = {
  classifyEventRisk,
  dateFromEvent,
  filterCalendarEvents,
  highestEventRisk,
  parseBeaScheduleEvents,
  parseEventDates,
  parseFomcEvents,
  parseIcsEvents,
};
