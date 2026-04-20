import express from 'express';
import fs from 'fs';
import path from 'path';
import 'dotenv/config';

const app = express();
const PORT = 3001;
const CACHE_DIR = path.resolve('.cache');
const TTL_DAYS = 30;
const PROVIDER_MIN_INTERVAL_MS = 1250;

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

const isBurstLimitMessage = (data) => {
  const text = data?.Note || data?.Information || '';
  return /1 request per second|rate limit|Please consider spreading out your free API requests/i.test(text);
};

const fetchTickerFromProvider = async (symbol, attempt = 0) => {
  const url = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=${symbol}&outputsize=compact&apikey=${API_KEY}`;
  const response = await fetch(url);
  const data = await response.json();

  if (isBurstLimitMessage(data) && attempt < 2) {
    await sleep(PROVIDER_MIN_INTERVAL_MS);
    return fetchTickerFromProvider(symbol, attempt + 1);
  }

  return data;
};

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.get('/api/ticker/:symbol', async (req, res) => {
  const symbol = req.params.symbol.toUpperCase();
  const cacheFile = getCachePath(symbol);

  if (fs.existsSync(cacheFile)) {
    const cached = JSON.parse(fs.readFileSync(cacheFile));
    if (isFresh(cached.timestamp)) {
      return res.json({
        source: 'cache',
        lastUpdated: new Date(cached.timestamp).toISOString(),
        nextRefresh: new Date(cached.timestamp + TTL_DAYS * 86400000).toISOString(),
        data: cached.data
      });
    }
  }

  if (!API_KEY) {
    return res.status(500).json({ error: 'Missing ALPHA_VANTAGE_API_KEY in environment' });
  }

  try {
    const data = await enqueueProviderCall(() => fetchTickerFromProvider(symbol));
    fs.writeFileSync(cacheFile, JSON.stringify({ timestamp: Date.now(), data }));

    res.json({
      source: 'api',
      lastUpdated: new Date().toISOString(),
      nextRefresh: new Date(Date.now() + TTL_DAYS * 86400000).toISOString(),
      data
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch data' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
