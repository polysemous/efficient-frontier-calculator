# Efficient Frontier Calculator

A React-based application for visualizing portfolio optimization using Modern Portfolio Theory.

## Live App

Use the hosted version here:

- [https://frontier.madsen7.com](https://frontier.madsen7.com)

## New: Ticker Mode (Backend Required)

This project includes a **secure backend proxy** for market data.

### Why?
- API keys are **never exposed in the browser**
- Ticker data is cached locally to reduce API usage
- The frontend only talks to `/api/...`, not directly to Alpha Vantage

---

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Add your API key

Create either:

```bash
.env.local
```

or:

```bash
.env
```

Add:

```bash
ALPHA_VANTAGE_API_KEY=your_key_here
```

Optional backend tuning:

```bash
TICKER_CACHE_TTL_DAYS=1
ALPHA_VANTAGE_MIN_INTERVAL_MS=13000
```

### 3. Run backend

```bash
npm run server
```

### 4. Run frontend

```bash
npm run dev
```

### 5. Or run both together

```bash
npm run dev:all
```

---

## API Endpoints

### Health check
```text
GET /api/health
```

### Fetch ticker data
```text
GET /api/ticker/:symbol
```

### Force refresh a ticker
```text
POST /api/ticker/:symbol/refresh
```

Responses include:
- data source (`cache` or `api`)
- last updated timestamp
- next refresh timestamp
- age in days
- cache TTL in days

---

## Caching Strategy (Ticker Update)

- Data cached locally in `.cache/`
- Default cache TTL: **1 day**
- Re-fetch only when stale, or when a manual refresh is requested
- Backend serializes Alpha Vantage requests to better respect the free-tier limit

---

## Important Ticker Lab Caveats

Ticker Lab uses **historical realized** market data, not forward-looking J.P. Morgan LTCMA assumptions.

Current implementation details:
- Uses the free-tier `TIME_SERIES_DAILY` endpoint
- Works from a compact history window (~100 trading days)
- Computes realized annualized return from **mean daily log returns × 252**
- Computes annualized volatility from the same realized history
- Uses **raw close prices** on the free tier, which are **not split/dividend adjusted**

The UI will warn if it detects unusually large raw price moves that may indicate a stock split or other distortion.

---

## Existing Features
- Efficient frontier visualization
- Build-your-own LTCMA portfolio mode
- Advisor-driven LTCMA portfolio mode
- Ticker Lab for backend-fetched market data

---

## Data Source
J.P. Morgan Asset Management, 2026 Long-Term Capital Market Assumptions (U.S. dollar assumptions, as of September 30, 2025)

Ticker Lab additionally uses backend-fetched Alpha Vantage market data.
