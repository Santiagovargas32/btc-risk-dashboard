function buildCandles(count = 80, options = {}) {
  const candles = [];
  let price = options.start || 100;
  const step = options.step ?? 0.6;
  const wave = options.wave ?? 0.4;

  for (let index = 0; index < count; index += 1) {
    const open = price;
    price = Math.max(1, price + step + Math.sin(index / 3) * wave);
    const close = price;
    const high = Math.max(open, close) * 1.005;
    const low = Math.min(open, close) * 0.995;
    candles.push({
      openTime: new Date(Date.UTC(2026, 0, 1, 0, index)),
      closeTime: new Date(Date.UTC(2026, 0, 1, 0, index + 1)),
      open,
      high,
      low,
      close,
      volume: 1000 + index * 8,
    });
  }

  return candles;
}

module.exports = {
  buildCandles,
};
