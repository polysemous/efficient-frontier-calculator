import express from 'express';
import fs from 'fs';
import path from 'path';
import 'dotenv/config';

const app = express();
const PORT = 3001;
const CACHE_DIR = path.resolve('.cache');
const TTL_DAYS = 30;

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

  try {
    const url = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=${symbol}&outputsize=full&apikey=${API_KEY}`;
    const response = await fetch(url);
    const data = await response.json();

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
