const { z } = require('zod');

const normalizedTradeSchema = z.object({
  id: z.string().min(1),
  timestamp: z.coerce.date(),
  pnl: z.number().finite(),
  tradeSize: z.number().finite().nonnegative().default(0),
  equity: z.number().finite().nullable().default(null),
  side: z.string().nullable().default(null),
  symbol: z.string().nullable().default(null),
  sourceFile: z.string().nullable().default(null),
});

const candleSchema = z.object({
  openTime: z.coerce.date(),
  closeTime: z.coerce.date(),
  open: z.number().finite().positive(),
  high: z.number().finite().positive(),
  low: z.number().finite().positive(),
  close: z.number().finite().positive(),
  volume: z.number().finite().nonnegative(),
});

const marketFeaturesSchema = z.object({
  price: z.number().finite().positive(),
  rsi: z.number().finite().min(0).max(100).nullable(),
  volatility: z.number().finite().nonnegative(),
  trend: z.number().finite(),
  momentum: z.number().finite(),
});

function validateOrThrow(schema, payload, message) {
  const result = schema.safeParse(payload);
  if (!result.success) {
    const details = result.error.issues.map((issue) => issue.message).join('; ');
    throw new Error(`${message}: ${details}`);
  }

  return result.data;
}

module.exports = {
  candleSchema,
  marketFeaturesSchema,
  normalizedTradeSchema,
  validateOrThrow,
};
