const path = require('path');
const { parseDate } = require('../utils/dates');
const { toFiniteNumber } = require('../utils/math');
const { normalizedTradeSchema } = require('../utils/validators');

const FIELD_CANDIDATES = {
  timestamp: [
    'timestamp',
    'time',
    'date',
    'datetime',
    'created_at',
    'closed_at',
    'open_time',
    'close_time',
    'entry_time',
    'exit_time',
  ],
  pnl: [
    'pnl',
    'profit',
    'profit_loss',
    'profit_and_loss',
    'net_pnl',
    'realized_pnl',
    'realized_profit',
    'realised_pnl',
    'realised_profit',
    'net_profit',
    'amount',
  ],
  tradeSize: [
    'trade_size',
    'size',
    'qty',
    'quantity',
    'position_size',
    'base_amount',
    'contracts',
    'volume',
    'last_qty',
    'order_qty',
    'exec_cost',
    'home_notional',
    'foreign_notional',
  ],
  equity: [
    'equity',
    'balance',
    'account_balance',
    'wallet_balance',
    'wallet_balance_xbt',
    'wallet_balance_xbt_equivalent',
    'margin_balance',
    'margin_balance_xbt',
    'margin_balance_xbt_equivalent',
    'adjusted_wealth_xbt',
    'adjusted_marked_wealth_xbt',
    'cumulative_pnl',
    'cumulative_profit',
  ],
  side: ['side', 'direction', 'type'],
  symbol: ['symbol', 'pair', 'market', 'instrument', 'reference', 'address'],
};

function normalizeKey(key) {
  const withWordBoundaries = String(key)
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2');

  return withWordBoundaries
    .replace(/^\uFEFF/, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function normalizeRowKeys(row) {
  return Object.entries(row).reduce((accumulator, [key, value]) => {
    accumulator[normalizeKey(key)] = value;
    return accumulator;
  }, {});
}

function pick(row, candidates) {
  for (const candidate of candidates) {
    const key = normalizeKey(candidate);
    if (Object.prototype.hasOwnProperty.call(row, key)) {
      const value = row[key];
      if (value !== undefined && value !== null && String(value).trim() !== '') {
        return value;
      }
    }
  }

  return null;
}

function parseNumeric(value) {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (/^\(.+\)$/.test(trimmed)) {
      return -Math.abs(toFiniteNumber(trimmed.slice(1, -1), 0));
    }
  }

  return toFiniteNumber(value);
}

function getTransactionType(row) {
  const rawType =
    pick(row, ['transact_type', 'transaction_type', 'event_type', 'type']) ||
    pick(row, ['exec_type']);

  return rawType ? String(rawType).trim().toLowerCase() : null;
}

function shouldUseRow(row) {
  const transactionType = getTransactionType(row);

  if (!transactionType) {
    return true;
  }

  if (Object.prototype.hasOwnProperty.call(row, 'exec_type')) {
    return transactionType === 'trade';
  }

  return transactionType.includes('pnl') || transactionType.includes('profit');
}

function pickPnl(row) {
  const transactionType = getTransactionType(row);

  if (transactionType && (transactionType.includes('pnl') || transactionType.includes('profit'))) {
    return pick(row, ['realised_pnl', 'realized_pnl', 'amount', 'profit', 'net_profit']);
  }

  return pick(
    row,
    FIELD_CANDIDATES.pnl.filter((candidate) => candidate !== 'amount'),
  );
}

function normalizeTrade(row, rowIndex, sourceFile = null) {
  const normalized = normalizeRowKeys(row);
  if (!shouldUseRow(normalized)) {
    return null;
  }

  const timestamp = parseDate(pick(normalized, FIELD_CANDIDATES.timestamp));
  const pnl = parseNumeric(pickPnl(normalized));

  if (!timestamp || pnl === null) {
    return null;
  }

  const tradeSize = Math.abs(parseNumeric(pick(normalized, FIELD_CANDIDATES.tradeSize)) ?? 0);
  const equity = parseNumeric(pick(normalized, FIELD_CANDIDATES.equity));
  const side = pick(normalized, FIELD_CANDIDATES.side);
  const symbol = pick(normalized, FIELD_CANDIDATES.symbol);
  const idSource = sourceFile ? path.basename(sourceFile) : 'row';

  const candidate = {
    id: `${idSource}:${rowIndex + 1}`,
    timestamp,
    pnl,
    tradeSize,
    equity,
    side: side ? String(side).toUpperCase() : null,
    symbol: symbol ? String(symbol).toUpperCase() : null,
    sourceFile: sourceFile ? path.basename(sourceFile) : null,
  };

  const result = normalizedTradeSchema.safeParse(candidate);
  return result.success ? result.data : null;
}

function normalizeRows(rows, sourceFile = null, options = {}) {
  const trades = [];
  const invalidRows = [];
  const invalidLimit = options.invalidLimit ?? 200;
  let invalidRowCount = 0;

  rows.forEach((row, rowIndex) => {
    const normalized = normalizeTrade(row, rowIndex, sourceFile);
    if (normalized) {
      trades.push(normalized);
    } else {
      invalidRowCount += 1;

      if (invalidRows.length < invalidLimit) {
        invalidRows.push({
          rowIndex: rowIndex + 1,
          sourceFile: sourceFile ? path.basename(sourceFile) : null,
        });
      }
    }
  });

  return { trades, invalidRows, invalidRowCount };
}

function serializeTrade(trade) {
  return {
    ...trade,
    timestamp: trade.timestamp instanceof Date ? trade.timestamp.toISOString() : trade.timestamp,
  };
}

function deserializeTrade(trade) {
  return {
    ...trade,
    timestamp: parseDate(trade.timestamp),
  };
}

module.exports = {
  FIELD_CANDIDATES,
  deserializeTrade,
  normalizeKey,
  normalizeRows,
  normalizeTrade,
  serializeTrade,
};
