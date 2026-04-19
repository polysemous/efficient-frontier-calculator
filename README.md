# Efficient Frontier Calculator

A React-based application for visualizing portfolio optimization using Modern Portfolio Theory.

## New: Ticker Mode (Backend Required)

This project now includes a **secure backend proxy** for market data.

### Why?
- API keys are **never exposed in the browser**
- Data is **cached locally (30 days)** to reduce API usage

---

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Add your API key

Create:

```bash
.env.local
```

Add:

```bash
ALPHA_VANTAGE_API_KEY=your_key_here
```

### 3. Run backend

```bash
npm run server
```

### 4. Run frontend

```bash
npm run dev
```

---

## API Endpoints

### Health check
```
GET /api/health
```

### Fetch ticker data
```
GET /api/ticker/:symbol
```

Response includes:
- data source (cache or api)
- last updated timestamp
- next refresh timestamp (30-day TTL)

---

## Caching Strategy (Ticker Update)

- Data cached locally in `.cache/`
- Cache TTL: **30 days**
- Re-fetch only when stale

---

## Existing Features
- Efficient frontier visualization
- Build-your-own portfolio mode
- Advisor-driven portfolio mode

---

## Data Source
J.P. Morgan Asset Management, 2025 Long-Term Capital Market Assumptions

---

## Next Step
Integrate ticker data into frontend and compute return/vol/covariance dynamically.
