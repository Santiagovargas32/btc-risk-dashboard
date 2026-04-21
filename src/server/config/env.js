const path = require('path');
const dotenv = require('dotenv');
const { z } = require('zod');

dotenv.config({ quiet: true });

const optionalUrl = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.string().url().optional(),
);

const boolish = z
  .enum(['true', 'false', '1', '0'])
  .default('false')
  .transform((value) => value === 'true' || value === '1');

const optionalSecret = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.string().optional(),
);

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATASET_SOURCE_PATH: z.string().optional(),
  KNOWLEDGE_SOURCE_DIR: z.string().optional(),
  BINANCE_BASE_URL: z.string().url().default('https://api.binance.com'),
  YAHOO_FINANCE_BASE_URL: z.string().url().default('https://query1.finance.yahoo.com'),
  ASSET_CONFIG_PATH: z.string().min(1).default('data/config/watchlist.json'),
  MARKET_SYMBOL: z.string().min(3).default('BTCUSDT'),
  MARKET_INTERVAL: z.string().min(1).default('1h'),
  MARKET_LIMIT: z.coerce.number().int().min(30).max(1000).default(120),
  CACHE_TTL_SECONDS: z.coerce.number().int().min(0).default(60),
  OGID_BASE_URL: z.string().url().default('http://localhost:8080/api'),
  OGID_ENABLED: boolish,
  OGID_COUNTRIES: z.string().min(2).default('US,IL,IR'),
  OGID_TIMEOUT_MS: z.coerce.number().int().positive().default(8000),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().min(1).default('gpt-4.1-mini'),
  OPENAI_BASE_URL: optionalUrl,
  OPENAI_TIMEOUT_MS: z.coerce.number().int().positive().default(8000),
  MACRO_REGIME: z.enum(['risk_on', 'risk_off', 'mixed']).default('mixed'),
  MACRO_INFLATION_TREND: z.enum(['up', 'down', 'stable']).default('stable'),
  MACRO_RATES_TREND: z.enum(['rising', 'falling', 'stable']).default('stable'),
  MACRO_VOLATILITY_REGIME: z.enum(['calm', 'stressed', 'panic']).default('calm'),
  MACRO_EVENT_RISK: z.enum(['low', 'medium', 'high']).default('low'),
  MACRO_LIQUIDITY: z.enum(['expanding', 'tightening', 'neutral']).default('neutral'),
  MACRO_CACHE_TTL_SECONDS: z.coerce.number().int().min(0).default(900),
  MACRO_PROVIDER: z.enum(['fallback', 'public']).default('fallback'),
  FRED_API_KEY: optionalSecret,
  FRED_BASE_URL: z.string().url().default('https://api.stlouisfed.org'),
  MACRO_PROVIDER_TIMEOUT_MS: z.coerce.number().int().positive().default(8000),
  MACRO_CALENDAR_CACHE_TTL_SECONDS: z.coerce.number().int().min(0).default(21600),
  MACRO_EVENT_LOOKAHEAD_DAYS: z.coerce.number().int().positive().default(30),
  MACRO_EVENT_HIGH_WINDOW_HOURS: z.coerce.number().int().positive().default(24),
  MACRO_EVENT_MEDIUM_WINDOW_HOURS: z.coerce.number().int().positive().default(72),
  BLS_CALENDAR_URL: z.string().url().default('https://www.bls.gov/schedule/news_release/bls.ics'),
  FED_FOMC_CALENDAR_URL: z.string().url().default('https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm'),
  BEA_RELEASE_SCHEDULE_URL: z.string().url().default('https://www.bea.gov/news/schedule'),
  GDELT_ENABLED: boolish,
  GDELT_BASE_URL: z.string().url().default('https://api.gdeltproject.org/api/v2'),
  GDELT_TIMESPAN: z.string().min(1).default('24h'),
  GDELT_MAX_RECORDS: z.coerce.number().int().positive().max(250).default(75),
  TRADING_ECONOMICS_API_KEY: optionalSecret,
  BEA_USER_ID: optionalSecret,
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
  KNOWLEDGE_DATA_DIR: path.resolve(process.cwd(), 'data/knowledge'),
  KNOWLEDGE_SOURCE_DIR: parsed.data.KNOWLEDGE_SOURCE_DIR
    ? path.resolve(parsed.data.KNOWLEDGE_SOURCE_DIR)
    : null,
  ASSET_CONFIG_PATH: path.resolve(process.cwd(), parsed.data.ASSET_CONFIG_PATH),
  PROCESSED_TRADES_PATH: path.resolve(process.cwd(), 'data/processed/trades.json'),
  HISTORICAL_FEATURES_PATH: path.resolve(process.cwd(), 'data/processed/historical-features.json'),
};

module.exports = env;
