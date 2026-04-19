const { clamp, round } = require('../../utils/math');

function proxyImpliedVolatility(volState = {}) {
  const realized = Number(volState.realizedVolatility || 0);
  const atrPct = Number(volState.atrPct || 0);
  const expansion = Number(volState.expansionProbability || 0);
  const proxy = realized * 0.65 + atrPct * 0.25 + expansion * 0.1;

  return {
    proxyIv: round(clamp(proxy, 0, 100), 2),
    source: 'realized-vol-atr-proxy',
    note: 'Proxy uses realized volatility, ATR percent, and expansion risk because no options chain is configured.',
  };
}

module.exports = {
  proxyImpliedVolatility,
};
