const assert = require('node:assert/strict');
const {
  closeToCloseReturns,
  momentumPercent,
  relativeStrengthIndex,
  volatilityFromPrices,
} = require('../src/server/utils/indicators');

function run() {
  const prices = [100, 102, 101, 105, 110, 112, 111, 115, 118, 120, 119, 122, 125, 127, 130, 132];

  assert.equal(closeToCloseReturns(prices).length, prices.length - 1);
  assert.ok(relativeStrengthIndex(prices, 14) > 50);
  assert.ok(volatilityFromPrices(prices) > 0);
  assert.equal(Number(momentumPercent(prices, 3).toFixed(4)), Number((((132 - 125) / 125) * 100).toFixed(4)));
}

module.exports = {
  name: 'indicator utilities compute price-derived features',
  run,
};
