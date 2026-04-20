import express from 'express';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

const app = express();
const PORT = 3001;
const CACHE_DIR = path.resolve('.cache');
const TTL_DAYS = Number(process.env.TICKER_CACHE_TTL_DAYS ?? 1);
const PROVIDER_MIN_INTERVAL_MS = Number(process.env.ALPHA_VANTAGE_MIN_INTERVAL_MS ?? 13000);
const SYMBOL_PATTERN = /^[A-Z][A-Z.-]{0,9}$/;

if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR);
}

const API_KEY = process.env.ALPHA_VANTAGE_API_KEY;

if (!API_KEY) {
  console.warn('⚠️  Missing ALPHA_VANTAGE_API_KEY in environment');
}

const getCachePath = (symbol) => path.join(CACHE_DIR, `${symbol}.json`);

const isFresh = (timestamp) => {
  const ageMs = Date.now() - timestamp;
  return ageMs < TTL_DAYS * 24 * 60 * 60 * 1000;
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let providerQueue = Promise.resolve();
let lastProviderCallAt = 0;

const enqueueProviderCall = (task) => {
  const run = providerQueue.then(async () => {
    const now = Date.now();
    const waitMs = Math.max(0, lastProviderCallAt + PROVIDER_MIN_INTERVAL_MS - now);
    if (waitMs > 0) {
      await sleep(waitMs);
    }
    const result = await task();
    lastProviderCallAt = Date.now();
    return result;
  });

  providerQueue = run.catch(() => undefined);
  return run;
};

const getProviderMessage = (data) => data?.Note || data?.Information || data?.Error || null;
const hasValidTimeSeries = (data) => Boolean(data?.['Time Series (Daily)']);

const fetchTickerFromProvider = async (symbol, attempt = 0) => {
  const url = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=${encodeURIComponent(symbol)}&outputsize=compact&apikey=${API_KEY}`;
  const response = await fetch(url);
  const data = await response.json();

  const message = getProviderMessage(data);
  if (message && /rate limit|Please consider spreading out your free API requests|1 request per second/i.test(message) && attempt < 2) {
    await sleep(PROVIDER_MIN_INTERVAL_MS);
    return fetchTickerFromProvider(symbol, attempt + 1);
  }

  return data;
};

const sendTickerPayload = (res, source, timestamp, data) => {
  const nextRefreshAt = timestamp + TTL_DAYS * 86400000;
  const ageDays = (Date.now() - timestamp) / 86400000;
  return res.json({
    source,
    lastUpdated: new Date(timestamp).toISOString(),
    nextRefresh: new Date(nextRefreshAt).toISOString(),
    ageDays,
    cacheTtlDays: TTL_DAYS,
    data
  });
};

const validateSymbol = (rawSymbol) => {
  const symbol = rawSymbol.toUpperCase();
  if (!SYMBOL_PATTERN.test(symbol)) {
    return { valid: false, symbol };
  }
  return { valid: true, symbol };
};

const readFreshCache = (symbol) => {
  const cacheFile = getCachePath(symbol);
  if (!fs.existsSync(cacheFile)) return null;

  const cached = JSON.parse(fs.readFileSync(cacheFile));
  if (!isFresh(cached.timestamp)) return null;
  if (!hasValidTimeSeries(cached.data)) return null;

  return { cacheFile, cached };
};

const fetchAndMaybeCache = async (symbol, { force = false } = {}) => {
  if (!force) {
    const cached = readFreshCache(symbol);
    if (cached) {
      return { source: 'cache', timestamp: cached.cached.timestamp, data: cached.cached.data };
    }
  }

  const data = await enqueueProviderCall(() => fetchTickerFromProvider(symbol));
  if (!hasValidTimeSeries(data)) {
    const message = getProviderMessage(data) || 'Provider returned an unusable payload.';
    const error = new Error(message);
    error.statusCode = 502;
    error.payload = { error: message, data };
    throw error;
  }

  const timestamp = Date.now();
  fs.writeFileSync(getCachePath(symbol), JSON.stringify({ timestamp, data }));
  return { source: 'api', timestamp, data };
};

app.use(express.json());

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', cacheTtlDays: TTL_DAYS, providerMinIntervalMs: PROVIDER_MIN_INTERVAL_MS });
});

app.get('/api/ticker/:symbol', async (req, res) => {
  const validation = validateSymbol(req.params.symbol);
  if (!validation.valid) {
    return res.status(400).json({ error: 'Invalid symbol' });
  }

  if (!API_KEY) {
    return res.status(500).json({ error: 'Missing ALPHA_VANTAGE_API_KEY in environment' });
  }

  try {
    const result = await fetchAndMaybeCache(validation.symbol);
    return sendTickerPayload(res, result.source, result.timestamp, result.data);
  } catch (error) {
    return res.status(error.statusCode || 500).json(error.payload || { error: 'Failed to fetch data' });
  }
});

app.post('/api/ticker/:symbol/refresh', async (req, res) => {
  const validation = validateSymbol(req.params.symbol);
  if (!validation.valid) {
    return res.status(400).json({ error: 'Invalid symbol' });
  }

  if (!API_KEY) {
    return res.status(500).json({ error: 'Missing ALPHA_VANTAGE_API_KEY in environment' });
  }

  try {
    const cacheFile = getCachePath(validation.symbol);
    if (fs.existsSync(cacheFile)) {
      fs.unlinkSync(cacheFile);
    }
    const result = await fetchAndMaybeCache(validation.symbol, { force: true });
    return sendTickerPayload(res, result.source, result.timestamp, result.data);
  } catch (error) {
    return res.status(error.statusCode || 500).json(error.payload || { error: 'Failed to refresh data' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
