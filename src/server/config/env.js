const path = require('path');
const dotenv = require('dotenv');
const { z } = require('zod');

dotenv.config({ quiet: true });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATASET_SOURCE_PATH: z.string().optional(),
  BINANCE_BASE_URL: z.string().url().default('https://api.binance.com'),
  MARKET_SYMBOL: z.string().min(3).default('BTCUSDT'),
  MARKET_INTERVAL: z.string().min(1).default('1h'),
  MARKET_LIMIT: z.coerce.number().int().min(30).max(1000).default(120),
  CACHE_TTL_SECONDS: z.coerce.number().int().min(0).default(60),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const details = parsed.error.issues
    .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
    .join('; ');
  throw new Error(`Invalid environment configuration: ${details}`);
}

const env = {
  ...parsed.data,
  ROOT_DIR: process.cwd(),
  RAW_DATA_DIR: path.resolve(process.cwd(), 'data/raw'),
  PROCESSED_DATA_DIR: path.resolve(process.cwd(), 'data/processed'),
  PROCESSED_TRADES_PATH: path.resolve(process.cwd(), 'data/processed/trades.json'),
  HISTORICAL_FEATURES_PATH: path.resolve(process.cwd(), 'data/processed/historical-features.json'),
};

module.exports = env;
