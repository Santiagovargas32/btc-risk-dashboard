# btc-risk-dashboard

`btc-risk-dashboard` is a deterministic-first market intelligence and risk-aware trade suggestion dashboard. It started as a BTC-only "should I trade now?" tool and now layers technical, macro, geopolitical, volatility, knowledge-base, and optional LLM meta reasoning for multiple tradeable assets.

It is not an oracle. It does not predict price, guarantee accuracy, or promise profitable trades. The goal is to improve risk-adjusted decision quality versus an ad hoc retail workflow by making the assumptions, scores, conflicts, and risk controls explicit.

## Architecture

```text
Historical CSV data
-> parser / normalizer / historical feature engine

Market data
-> Binance crypto adapter
-> Yahoo Finance stock / ETF adapter
-> technical engine

Macro fallback state
OGID geopolitical service
Volatility / options proxy engine
Knowledge JSON rules
-> structured deterministic fusion engine
-> optional OpenAI LLM explanation layer
-> API + dashboard UI
```

The legacy endpoints still work:

```text
GET /api/health
GET /api/dashboard
GET /api/scoring
```

New endpoints:

```text
GET  /api/analysis?symbol=BTCUSDT&interval=1h
GET  /api/analysis/multi-timeframe?symbol=BTCUSDT
GET  /api/macro/snapshot
GET  /api/geopolitics/snapshot?symbol=BTCUSDT
GET  /api/knowledge/summary
POST /api/knowledge/import-pdf
```

Supported intervals:

```text
1m, 5m, 15m, 30m, 1h, 4h, 1d
```

Seeded assets:

```text
BTCUSDT, ETHUSDT, AAPL, SPY, GLD, TLT
```

## Requirements

- Node.js 20.16+ recommended
- npm
- Optional local OGID service running on `http://localhost:8080/api`
- Optional OpenAI API key for the meta explanation layer

`pdf-parse` requires Node 20.16+ or 22.3+. The deterministic API and tests can still run without importing PDFs, but PDF import should use Node 20+.

## Setup

```bash
npm install
```

Create `.env` from `.env.example` and set only the providers you use. Do not put secrets in source files.

Important variables:

```bash
BINANCE_BASE_URL=https://api.binance.com
YAHOO_FINANCE_BASE_URL=https://query1.finance.yahoo.com
MARKET_SYMBOL=BTCUSDT
MARKET_INTERVAL=1h
MARKET_LIMIT=120
CACHE_TTL_SECONDS=60

OGID_ENABLED=false
OGID_BASE_URL=http://localhost:8080/api
OGID_TIMEOUT_MS=8000

OPENAI_API_KEY=
OPENAI_MODEL=gpt-4.1-mini
OPENAI_BASE_URL=
OPENAI_TIMEOUT_MS=8000
```

If `OPENAI_API_KEY` is missing or OpenAI fails, `/api/analysis` still returns deterministic output with an unavailable LLM payload.

## Import Data

Historical trade data is optional for the new market intelligence endpoint but still powers the legacy dashboard equity view.

```bash
npm run import:dataset
npm run build:snapshots
```

Generated files:

- `data/processed/trades.json`
- `data/processed/historical-features.json`
- `data/processed/invalid-rows.json`

## Knowledge Pipeline

Seed knowledge lives in:

- `data/knowledge/trading_strategies.json`
- `data/knowledge/macro_rules.json`
- `data/knowledge/volatility_rules.json`
- `data/knowledge/event_rules.json`
- `data/knowledge/regime_rules.json`
- `data/knowledge/risk_rules.json`

Import a local PDF or text file into structured JSON:

```bash
npm run import:knowledge -- /absolute/path/to/file.pdf
npm run knowledge:summary
```

Import all supported files from `KNOWLEDGE_SOURCE_DIR`:

```bash
npm run import:knowledge-dir
npm run import:knowledge-dir -- --force
npm run import:knowledge-dir -- --sourceDir F:\pdfs
npm run import:knowledge-dir -- --dryRun
```

Supported batch source files:

```text
.pdf, .txt, .md, .csv
```

CSV files can provide structured columns such as `category`, `id`, `title`, `condition`, `impact`, `risk_note`, `assetTypes`, `marketRegimes`, and `themes`. CSVs without known columns are treated as text rows and normalized through the deterministic text pipeline.

The importer works deterministically by chunking text, classifying topics, normalizing rule shapes, deduplicating by id, and preserving source metadata. If `useLlm` is passed and OpenAI is configured, an optional LLM-assisted normalization pass can add concise rule candidates; deterministic extraction remains the primary path.

Batch imports write an incremental source index to `data/knowledge/sources.json`. Unchanged files are skipped unless `--force` is used. The runtime analysis path does not read raw PDFs or CSVs; `/api/analysis` uses the normalized JSON files under `data/knowledge`.

## Run

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

## Example Analysis Response

```json
{
  "asset": {
    "symbol": "BTCUSDT",
    "type": "crypto"
  },
  "timeframe": "1h",
  "signal": "LONG",
  "confidence": 72,
  "riskLevel": "medium",
  "scores": {
    "technical": 34,
    "macro": 12,
    "geopolitics": -4,
    "volatility": 9,
    "total": 51
  },
  "knowledgeMatches": [],
  "summary": "LONG setup with medium risk..."
}
```

## Tests

```bash
npm test
```

The suite covers:

- historical features and indicator utilities
- technical scoring
- macro scoring
- geopolitical scoring with OGID-style mocked payloads
- volatility scoring
- fusion thresholds and timeframe alignment
- knowledge matching
- PDF text normalization
- LLM fallback behavior

## Provider Notes

- Crypto market data uses Binance klines.
- Stocks, ETFs, and commodity proxies use Yahoo Finance chart data.
- Macro currently uses deterministic `.env` fallback state plus event-date proximity.
- OGID is optional and queried through `/api/intel/news`, `/api/intel/insights`, `/api/intel/risks`, `/api/market/impact`, and `/api/market/analytics`.
- Options-chain support is not required yet; the volatility layer uses realized volatility, ATR, percentile, compression, and expansion proxies.
