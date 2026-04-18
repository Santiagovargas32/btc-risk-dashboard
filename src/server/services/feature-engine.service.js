const { isWithinDays, parseDate, toIsoString } = require('../utils/dates');
const {
  average,
  linearRegressionSlope,
  maxDrawdown,
  round,
  safeDivide,
  stdDeviation,
  sum,
} = require('../utils/math');

function sortTrades(trades) {
  return [...trades]
    .map((trade) => ({ ...trade, timestamp: parseDate(trade.timestamp) }))
    .filter((trade) => trade.timestamp && Number.isFinite(Number(trade.pnl)))
    .sort((left, right) => left.timestamp.getTime() - right.timestamp.getTime());
}

function buildEquityCurve(trades) {
  let cumulativePnl = 0;

  return trades.map((trade) => {
    cumulativePnl += trade.pnl;
    const hasExplicitEquity = trade.equity !== null && trade.equity !== undefined && trade.equity !== '';
    const equity =
      hasExplicitEquity && Number.isFinite(Number(trade.equity))
        ? Number(trade.equity)
        : cumulativePnl;

    return {
      timestamp: toIsoString(trade.timestamp),
      equity,
      pnl: trade.pnl,
    };
  });
}

function sampleEquityCurve(equityCurve, maxPoints = 500) {
  if (equityCurve.length <= maxPoints) {
    return equityCurve;
  }

  const step = (equityCurve.length - 1) / (maxPoints - 1);
  const sampled = [];

  for (let index = 0; index < maxPoints; index += 1) {
    sampled.push(equityCurve[Math.round(index * step)]);
  }

  return sampled;
}

function winRate(trades) {
  if (trades.length === 0) {
    return 0;
  }

  return trades.filter((trade) => trade.pnl > 0).length / trades.length;
}

function computeHistoricalFeatures(trades, options = {}) {
  const sortedTrades = sortTrades(Array.isArray(trades) ? trades : []);

  if (sortedTrades.length === 0) {
    return {
      tradeCount: 0,
      firstTradeAt: null,
      lastTradeAt: null,
      momentum: 0,
      trend: 0,
      trendNormalized: 0,
      volatility: 0,
      comfortVolatility: 0,
      drawdown: 0,
      drawdownPct: 0,
      winRate: 0,
      winRate20: 0,
      pnl7d: 0,
      avgTradeSize: 0,
      totalPnl: 0,
      equityCurve: [],
    };
  }

  const pnlValues = sortedTrades.map((trade) => trade.pnl);
  const tradeSizes = sortedTrades
    .map((trade) => Math.abs(Number(trade.tradeSize) || 0))
    .filter((value) => value > 0);
  const last20Trades = sortedTrades.slice(-20);
  const latestTrade = sortedTrades[sortedTrades.length - 1];
  const equityCurve = buildEquityCurve(sortedTrades);
  const equityValues = equityCurve.map((point) => point.equity);
  const drawdown = maxDrawdown(equityValues);
  const rawTrend = linearRegressionSlope(equityValues);
  const avgEquityAbs = average(equityValues.map((value) => Math.abs(value)), 0);
  const pnlStdDev = stdDeviation(pnlValues, 0);
  const avgTradeSize = average(tradeSizes, 0);
  const meanAbsPnl = average(pnlValues.map((value) => Math.abs(value)), 0);
  const volatilityBase = avgTradeSize || meanAbsPnl || 1;
  const pnl7d = sum(
    sortedTrades
      .filter((trade) => isWithinDays(trade.timestamp, latestTrade.timestamp, 7))
      .map((trade) => trade.pnl),
  );

  return {
    tradeCount: sortedTrades.length,
    firstTradeAt: toIsoString(sortedTrades[0].timestamp),
    lastTradeAt: toIsoString(latestTrade.timestamp),
    momentum: round(winRate(last20Trades), 4),
    trend: round(rawTrend, 6),
    trendNormalized: round(safeDivide(rawTrend, avgEquityAbs, 0), 8),
    volatility: round(pnlStdDev, 6),
    comfortVolatility: round(safeDivide(pnlStdDev, volatilityBase, 0), 6),
    drawdown: round(drawdown.amount, 6),
    drawdownPct: round(drawdown.pct, 6),
    winRate: round(winRate(sortedTrades), 4),
    winRate20: round(winRate(last20Trades), 4),
    pnl7d: round(pnl7d, 6),
    avgTradeSize: round(avgTradeSize, 6),
    totalPnl: round(sum(pnlValues), 6),
    equityCurve: sampleEquityCurve(equityCurve, options.maxEquityPoints ?? 500),
  };
}

module.exports = {
  buildEquityCurve,
  computeHistoricalFeatures,
  sampleEquityCurve,
  sortTrades,
  winRate,
};
