import React, { useEffect, useMemo, useState } from 'react';
import {
  CartesianGrid,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  Label
} from 'recharts';
import assetData from '../data/2025-usd/assets.json';
import assetOrder from '../data/2025-usd/asset-order.json';
import assetTaxonomy from '../data/2025-usd/asset-taxonomy.json';
import datasetMetadata from '../data/2025-usd/metadata.json';
import correlationRowsText from '../data/2025-usd/correlation-rows.txt?raw';
import {
  buildCorrelationMatrix,
  chooseAdvisorSampleCount,
  chooseSampleCount,
  extractEfficientFrontier,
  findPortfolioSolutions,
  generatePortfolioSet,
  generateSparsePortfolioSet
} from './lib/portfolioMath';

const allAssetNames = Object.keys(assetData).sort((a, b) => a.localeCompare(b));
const isReferenceAsset = (assetName) => assetTaxonomy[assetName]?.class === 'reference';
const investableAssetNames = allAssetNames.filter((assetName) => !isReferenceAsset(assetName));
const preferredDefaults = [
  'U.S. Large Cap',
  'U.S. Aggregate Bonds',
  'Gold',
  'AC World Equity',
  'U.S. REITs',
  'Private Equity',
  'Commercial Mortgage Loans',
  'U.S. Cash',
  'U.S. Mid Cap',
  'U.S. High Yield Bonds'
].filter((name) => investableAssetNames.includes(name));
const defaultRiskFreeRate = assetData['U.S. Cash']?.compoundReturn2024 ?? 3.1;
const slotColors = ['#34d399', '#22d3ee', '#f4c35a', '#c084fc', '#f87171', '#60a5fa', '#f97316', '#a3e635', '#f472b6', '#93c5fd'];
const getDisplayedReturn = (assetName) => assetData[assetName].compoundReturn2024;
const getDisplayedVolatility = (assetName) => assetData[assetName].volatility;

const correlationMatrix = buildCorrelationMatrix(assetOrder, correlationRowsText);

const fmtPct = (n, d = 2) => `${n.toFixed(d)}%`;
const fmtNum = (n, d = 3) => n.toFixed(d);

const isBondAsset = (assetName) => assetTaxonomy[assetName]?.class === 'bond';
const isPrivateAlternativeAsset = (assetName) => assetTaxonomy[assetName]?.class === 'alt_private';
const isAlternativeAsset = (assetName) => ['alt_public', 'alt_private'].includes(assetTaxonomy[assetName]?.class);

const buildInitialSelection = (count) => {
  const seed = [];
  for (const candidate of [...preferredDefaults, ...investableAssetNames]) {
    if (!seed.includes(candidate)) seed.push(candidate);
    if (seed.length === count) break;
  }
  return seed;
};

const parseTickerInput = (value) => {
  return [...new Set(
    value
      .split(/[\s,]+/)
      .map((symbol) => symbol.trim().toUpperCase())
      .filter(Boolean)
      .filter((symbol) => /^[A-Z.-]+$/.test(symbol))
  )].slice(0, 10);
};

const average = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;
const stdDev = (values) => {
  if (values.length <= 1) return 0;
  const mean = average(values);
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(Math.max(variance, 0));
};

const pearsonCorrelation = (a, b) => {
  if (a.length !== b.length || a.length <= 1) return 0;
  const meanA = average(a);
  const meanB = average(b);
  let numerator = 0;
  let denomA = 0;
  let denomB = 0;
  for (let i = 0; i < a.length; i += 1) {
    const da = a[i] - meanA;
    const db = b[i] - meanB;
    numerator += da * db;
    denomA += da * da;
    denomB += db * db;
  }
  const denominator = Math.sqrt(denomA * denomB);
  return denominator > 0 ? numerator / denominator : 0;
};

const summarizePortfolios = (portfolios) => {
  const frontier = extractEfficientFrontier(portfolios);
  const sortedByRisk = [...portfolios].sort((a, b) => (a.risk === b.risk ? b.return - a.return : a.risk - b.risk));
  const minVariance = sortedByRisk[0] ? [{ ...sortedByRisk[0], label: 'Minimum variance portfolio' }] : [];
  const maxSharpePoint = [...portfolios].sort((a, b) => b.sharpe - a.sharpe)[0];
  const maxSharpe = maxSharpePoint ? [{ ...maxSharpePoint, label: 'Maximum Sharpe portfolio' }] : [];
  return { frontier, minVariance, maxSharpe };
};

const emptyPortfolioSet = (modeLabel, extra = {}) => ({
  modeLabel,
  sampleCount: 0,
  portfolios: [],
  frontier: [],
  minVariance: [],
  maxSharpe: [],
  ...extra
});

const normalizeTickerResponse = (symbol, payload) => {
  const infoMessage = payload?.data?.Information || payload?.data?.Note || payload?.data?.Error || payload?.error;
  const series = payload?.data?.['Time Series (Daily)'];
  if (infoMessage || !series) {
    return {
      symbol,
      source: payload?.source ?? 'api',
      lastUpdated: payload?.lastUpdated ?? null,
      nextRefresh: payload?.nextRefresh ?? null,
      rows: [],
      error: infoMessage || 'Ticker data unavailable'
    };
  }

  const rows = Object.entries(series)
    .map(([date, row]) => ({
      date,
      close: Number(row['4. close'])
    }))
    .filter((row) => Number.isFinite(row.close))
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    symbol,
    source: payload.source,
    lastUpdated: payload.lastUpdated,
    nextRefresh: payload.nextRefresh,
    rows,
    error: null
  };
};

const buildTickerDataset = (tickerResults) => {
  const valid = tickerResults.filter((result) => !result.error && result.rows.length >= 40);
  if (valid.length < 2) {
    return { error: 'Load at least two valid tickers with enough daily history to compute portfolio statistics.' };
  }

  const commonDates = valid
    .map((result) => new Set(result.rows.map((row) => row.date)))
    .reduce((acc, currentSet) => new Set([...acc].filter((date) => currentSet.has(date))));

  const alignedDates = [...commonDates].sort().slice(-90);
  if (alignedDates.length < 40) {
    return { error: 'The loaded tickers do not share enough overlapping daily observations yet.' };
  }

  const returnsBySymbol = {};
  const customAssetData = {};
  const symbols = valid.map((result) => result.symbol);

  valid.forEach((result) => {
    const byDate = new Map(result.rows.map((row) => [row.date, row.close]));
    const prices = alignedDates.map((date) => byDate.get(date)).filter((value) => Number.isFinite(value));
    if (prices.length !== alignedDates.length) {
      return;
    }
    const dailyReturns = prices.slice(1).map((price, index) => price / prices[index] - 1);
    returnsBySymbol[result.symbol] = dailyReturns;
    const annualizedReturn = (prices[prices.length - 1] / prices[0]) ** (252 / (prices.length - 1)) - 1;
    const annualizedVol = stdDev(dailyReturns) * Math.sqrt(252);
    customAssetData[result.symbol] = {
      compoundReturn2024: annualizedReturn * 100,
      volatility: annualizedVol * 100
    };
  });

  const correlationMatrixForTickers = {};
  symbols.forEach((leftSymbol) => {
    correlationMatrixForTickers[leftSymbol] = {};
    symbols.forEach((rightSymbol) => {
      correlationMatrixForTickers[leftSymbol][rightSymbol] = leftSymbol === rightSymbol
        ? 1
        : pearsonCorrelation(returnsBySymbol[leftSymbol], returnsBySymbol[rightSymbol]);
    });
  });

  return {
    symbols,
    assetData: customAssetData,
    correlationMatrix: correlationMatrixForTickers,
    observationCount: alignedDates.length,
    windowStart: alignedDates[0],
    windowEnd: alignedDates[alignedDates.length - 1]
  };
};

const CloudDot = ({ cx, cy }) => {
  if (cx == null || cy == null) return null;
  return <circle cx={cx} cy={cy} r={2.1} fill="#3b4a7a" opacity={0.45} />;
};

const FrontierDot = ({ cx, cy }) => {
  if (cx == null || cy == null) return null;
  return <circle cx={cx} cy={cy} r={3} fill="#34d399" stroke="#0b1020" strokeWidth={1} />;
};

const SharpeShape = ({ cx, cy }) => {
  if (cx == null || cy == null) return null;
  return (
    <g>
      <circle cx={cx} cy={cy} r={14} fill="#f4c35a" opacity={0.18} />
      <circle cx={cx} cy={cy} r={8} fill="#f4c35a" opacity={0.35} />
      <circle cx={cx} cy={cy} r={4.5} fill="#fde8a6" stroke="#f4c35a" strokeWidth={1.5} />
    </g>
  );
};

const FinderShape = ({ cx, cy }) => {
  if (cx == null || cy == null) return null;
  return (
    <g>
      <circle cx={cx} cy={cy} r={14} fill="#22d3ee" opacity={0.15} />
      <circle cx={cx} cy={cy} r={9} fill="#22d3ee" opacity={0.28} />
      <circle cx={cx} cy={cy} r={4.5} fill="#ecfeff" stroke="#22d3ee" strokeWidth={1.4} />
    </g>
  );
};

const MinVarShape = ({ cx, cy }) => {
  if (cx == null || cy == null) return null;
  return (
    <g>
      <circle cx={cx} cy={cy} r={10} fill="#c084fc" opacity={0.18} />
      <rect x={cx - 4.5} y={cy - 4.5} width={9} height={9} transform={`rotate(45 ${cx} ${cy})`} fill="#f5f7ff" stroke="#c084fc" strokeWidth={1.6} />
    </g>
  );
};

const SelectedAssetShape = ({ cx, cy, payload }) => {
  if (cx == null || cy == null) return null;
  const color = payload?.color ?? '#f87171';
  return (
    <g>
      <circle cx={cx} cy={cy} r={9} fill={color} opacity={0.14} />
      <rect x={cx - 4.5} y={cy - 4.5} width={9} height={9} transform={`rotate(45 ${cx} ${cy})`} fill={color} stroke="#0b1020" strokeWidth={1.2} />
    </g>
  );
};

const RiskFreeShape = ({ cx, cy }) => {
  if (cx == null || cy == null) return null;
  return (
    <g>
      <circle cx={cx} cy={cy} r={8} fill="#0b1020" stroke="#f5f7ff" strokeWidth={1.6} />
      <circle cx={cx} cy={cy} r={3} fill="#f5f7ff" />
    </g>
  );
};

const CustomTooltip = ({ active, payload }) => {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0]?.payload;
  if (!point) return null;

  return (
    <div className="tooltip-card">
      <div className="tooltip-label">{point.label ?? 'Portfolio'}</div>
      <div className="tooltip-row"><span>Return</span><span>{fmtPct(point.return)}</span></div>
      <div className="tooltip-row"><span>Risk</span><span>{fmtPct(point.risk)}</span></div>
      {typeof point.sharpe === 'number' && Number.isFinite(point.sharpe) ? (
        <div className="tooltip-row"><span>Sharpe</span><span>{fmtNum(point.sharpe)}</span></div>
      ) : null}
      {point.fullWeightLabel ? <div className="tooltip-weights">{point.fullWeightLabel}</div> : null}
    </div>
  );
};

const Donut = ({ segments, centerTop, centerBottom }) => {
  const size = 120;
  const r = 48;
  const stroke = 14;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * r;
  let offset = 0;

  return (
    <svg className="donut" viewBox={`0 0 ${size} ${size}`}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(148,163,205,0.1)" strokeWidth={stroke} />
      {segments.map((segment, index) => {
        const len = (segment.value / 100) * circumference;
        const dashArray = `${len} ${circumference - len}`;
        const element = (
          <circle
            key={index}
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke={segment.color}
            strokeWidth={stroke}
            strokeDasharray={dashArray}
            strokeDashoffset={-offset}
            strokeLinecap="butt"
            transform={`rotate(-90 ${cx} ${cy})`}
          />
        );
        offset += len;
        return element;
      })}
      <text x={cx} y={cy - 2} textAnchor="middle" className="donut-center">{centerTop}</text>
      <text x={cx} y={cy + 14} textAnchor="middle" className="donut-center-small">{centerBottom}</text>
    </svg>
  );
};

const EfficientFrontierApp = () => {
  const [activeTab, setActiveTab] = useState('build');
  const [assetCount, setAssetCount] = useState(3);
  const [selected, setSelected] = useState(buildInitialSelection(3));
  const [riskFreeRate, setRiskFreeRate] = useState(defaultRiskFreeRate.toFixed(2));
  const [buildFinderMode, setBuildFinderMode] = useState('requiredReturn');
  const [buildFinderTarget, setBuildFinderTarget] = useState('8.00');

  const [advisorMode, setAdvisorMode] = useState('requiredReturn');
  const [advisorTarget, setAdvisorTarget] = useState('8.00');
  const [advisorMaxAssets, setAdvisorMaxAssets] = useState(5);
  const [includeOnlyPublicMarkets, setIncludeOnlyPublicMarkets] = useState(false);
  const [excludeAlternatives, setExcludeAlternatives] = useState(false);
  const [requireBond, setRequireBond] = useState(false);

  const [tickerInput, setTickerInput] = useState('AAPL, MSFT, JNJ');
  const [loadedTickerSymbols, setLoadedTickerSymbols] = useState(['AAPL', 'MSFT', 'JNJ']);
  const [tickerMode, setTickerMode] = useState('requiredReturn');
  const [tickerTarget, setTickerTarget] = useState('12.00');
  const [tickerFetchState, setTickerFetchState] = useState({ status: 'idle', results: [], error: '' });

  const parsedRiskFreeRate = Number(riskFreeRate);
  const riskFreeRateValue = Number.isFinite(parsedRiskFreeRate) ? parsedRiskFreeRate : defaultRiskFreeRate;
  const parsedTickerInput = useMemo(() => parseTickerInput(tickerInput), [tickerInput]);

  useEffect(() => {
    if (activeTab !== 'ticker' || loadedTickerSymbols.length === 0) return;
    let cancelled = false;

    const load = async () => {
      setTickerFetchState((current) => ({ ...current, status: 'loading', error: '' }));
      try {
        const results = await Promise.all(
          loadedTickerSymbols.map(async (symbol) => {
            const response = await fetch(`/api/ticker/${symbol}`);
            const payload = await response.json();
            return normalizeTickerResponse(symbol, payload);
          })
        );
        if (cancelled) return;
        setTickerFetchState({ status: 'success', results, error: '' });
      } catch (error) {
        if (cancelled) return;
        setTickerFetchState({ status: 'error', results: [], error: 'Failed to load ticker data from the local backend.' });
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [activeTab, loadedTickerSymbols]);

  const handleAssetCountChange = (nextCount) => {
    const safeCount = Math.max(2, Math.min(10, nextCount));
    setAssetCount(safeCount);
    setSelected((previous) => {
      const next = previous.slice(0, safeCount);
      for (const candidate of [...preferredDefaults, ...investableAssetNames]) {
        if (!next.includes(candidate)) next.push(candidate);
        if (next.length === safeCount) break;
      }
      return next;
    });
  };

  const handleAssetSelection = (index, nextAsset) => {
    setSelected((previous) => {
      const next = [...previous];
      const duplicateIndex = next.indexOf(nextAsset);
      if (duplicateIndex !== -1 && duplicateIndex !== index) {
        [next[index], next[duplicateIndex]] = [next[duplicateIndex], next[index]];
      } else {
        next[index] = nextAsset;
      }
      return next;
    });
  };

  const buildOptimizedSet = useMemo(() => {
    const activeAssets = selected.slice(0, assetCount);
    if (activeTab !== 'build') {
      return emptyPortfolioSet('Build My Own', { activeAssets });
    }

    const sampleCount = chooseSampleCount(activeAssets.length);
    const portfolios = generatePortfolioSet({
      selectedAssets: activeAssets,
      assetData,
      correlationMatrix,
      riskFreeRate: riskFreeRateValue,
      sampleCount
    });

    return {
      modeLabel: 'Build My Own',
      activeAssets,
      sampleCount,
      portfolios,
      ...summarizePortfolios(portfolios)
    };
  }, [activeTab, assetCount, riskFreeRateValue, selected]);

  const buildFinderResults = useMemo(() => {
    return findPortfolioSolutions({
      portfolios: buildOptimizedSet.portfolios,
      mode: buildFinderMode,
      targetValue: buildFinderTarget,
      limit: 10
    });
  }, [buildFinderMode, buildFinderTarget, buildOptimizedSet.portfolios]);

  const advisorUniverse = useMemo(() => {
    return investableAssetNames.filter((assetName) => {
      if (includeOnlyPublicMarkets && isPrivateAlternativeAsset(assetName)) return false;
      if (excludeAlternatives && isAlternativeAsset(assetName)) return false;
      return true;
    });
  }, [excludeAlternatives, includeOnlyPublicMarkets]);

  const advisorBondUniverse = useMemo(() => advisorUniverse.filter(isBondAsset), [advisorUniverse]);

  const rawAdvisorPortfolios = useMemo(() => {
    if (activeTab !== 'advisor') return [];
    const sampleCount = chooseAdvisorSampleCount(advisorUniverse.length, advisorMaxAssets);
    return generateSparsePortfolioSet({
      candidateAssets: advisorUniverse,
      maxAssetsInPortfolio: advisorMaxAssets,
      assetData,
      correlationMatrix,
      riskFreeRate: riskFreeRateValue,
      sampleCount,
      requiredAssetsPool: requireBond ? advisorBondUniverse : []
    });
  }, [activeTab, advisorBondUniverse, advisorMaxAssets, advisorUniverse, requireBond, riskFreeRateValue]);

  const advisorOptimizedSet = useMemo(() => {
    if (activeTab !== 'advisor') {
      return emptyPortfolioSet('Choose for Me', { candidateUniverse: advisorUniverse });
    }

    const portfolios = requireBond
      ? rawAdvisorPortfolios.filter((portfolio) => portfolio.selectedAssets.some(isBondAsset))
      : rawAdvisorPortfolios;

    return {
      modeLabel: 'Choose for Me',
      candidateUniverse: advisorUniverse,
      sampleCount: rawAdvisorPortfolios.length,
      portfolios,
      ...summarizePortfolios(portfolios)
    };
  }, [activeTab, advisorUniverse, rawAdvisorPortfolios, requireBond]);

  const advisorFinderResults = useMemo(() => {
    return findPortfolioSolutions({
      portfolios: advisorOptimizedSet.portfolios,
      mode: advisorMode,
      targetValue: advisorTarget,
      limit: 10
    });
  }, [advisorMode, advisorOptimizedSet.portfolios, advisorTarget]);

  const tickerDataset = useMemo(() => {
    if (tickerFetchState.status !== 'success') return { error: null };
    return buildTickerDataset(tickerFetchState.results);
  }, [tickerFetchState]);

  const tickerOptimizedSet = useMemo(() => {
    if (activeTab !== 'ticker') {
      return emptyPortfolioSet('Ticker Lab', { activeAssets: loadedTickerSymbols });
    }
    if (tickerFetchState.status !== 'success' || tickerDataset.error || !tickerDataset.symbols) {
      return emptyPortfolioSet('Ticker Lab', { activeAssets: loadedTickerSymbols, datasetError: tickerDataset.error ?? null });
    }

    const sampleCount = chooseSampleCount(tickerDataset.symbols.length);
    const portfolios = generatePortfolioSet({
      selectedAssets: tickerDataset.symbols,
      assetData: tickerDataset.assetData,
      correlationMatrix: tickerDataset.correlationMatrix,
      riskFreeRate: riskFreeRateValue,
      sampleCount
    });

    return {
      modeLabel: 'Ticker Lab',
      activeAssets: tickerDataset.symbols,
      sampleCount,
      portfolios,
      observationCount: tickerDataset.observationCount,
      windowStart: tickerDataset.windowStart,
      windowEnd: tickerDataset.windowEnd,
      tickerAssetData: tickerDataset.assetData,
      ...summarizePortfolios(portfolios)
    };
  }, [activeTab, loadedTickerSymbols, riskFreeRateValue, tickerDataset, tickerFetchState.status]);

  const tickerFinderResults = useMemo(() => {
    return findPortfolioSolutions({
      portfolios: tickerOptimizedSet.portfolios,
      mode: tickerMode,
      targetValue: tickerTarget,
      limit: 10
    });
  }, [tickerMode, tickerOptimizedSet.portfolios, tickerTarget]);

  const currentSet = activeTab === 'build'
    ? buildOptimizedSet
    : activeTab === 'advisor'
      ? advisorOptimizedSet
      : tickerOptimizedSet;

  const currentFinderResults = activeTab === 'build'
    ? buildFinderResults
    : activeTab === 'advisor'
      ? advisorFinderResults
      : tickerFinderResults;

  const currentFinderMode = activeTab === 'build' ? buildFinderMode : activeTab === 'advisor' ? advisorMode : tickerMode;
  const recommendation = currentFinderResults.feasible[0] ?? currentFinderResults.fallback[0] ?? null;
  const visibleSolutions = currentFinderResults.feasible.length > 0 ? currentFinderResults.feasible : currentFinderResults.fallback;
  const ms = currentSet.maxSharpe[0];
  const frontierReturns = currentSet.frontier.map((point) => point.return);
  const frontierLow = frontierReturns.length ? Math.min(...frontierReturns) : 0;
  const frontierHigh = frontierReturns.length ? Math.max(...frontierReturns) : 0;

  const highlightedAssetNames = activeTab === 'build'
    ? currentSet.activeAssets
    : recommendation?.selectedAssets ?? ms?.selectedAssets ?? currentSet.activeAssets ?? [];

  const highlightedAssets = highlightedAssetNames
    .map((name, index) => {
      if (activeTab === 'ticker') {
        const tickerMetrics = currentSet.tickerAssetData?.[name] ?? tickerDataset.assetData?.[name];
        if (!tickerMetrics) return null;
        return {
          name,
          return: tickerMetrics.compoundReturn2024,
          risk: tickerMetrics.volatility,
          label: name,
          color: slotColors[index % slotColors.length]
        };
      }

      return {
        name,
        return: getDisplayedReturn(name),
        risk: getDisplayedVolatility(name),
        label: name,
        color: slotColors[index % slotColors.length]
      };
    })
    .filter(Boolean);

  const basePoints = [
    ...currentSet.portfolios,
    ...highlightedAssets.map((point) => ({ risk: point.risk, return: point.return })),
    { risk: 0, return: riskFreeRateValue },
    ...(recommendation ? [recommendation] : [])
  ];
  const xMax = Math.ceil((basePoints.length ? Math.max(...basePoints.map((point) => point.risk)) : 0) + 1);
  const capitalMarketLine = ms && ms.risk > 0
    ? [
        { risk: 0, return: riskFreeRateValue, label: 'Risk-free rate' },
        {
          risk: xMax,
          return: riskFreeRateValue + ((ms.return - riskFreeRateValue) / ms.risk) * xMax,
          label: 'Capital Market Line',
          sharpe: ms.sharpe
        }
      ]
    : [];
  const allYs = [...basePoints.map((point) => point.return), ...capitalMarketLine.map((point) => point.return)];
  const yMin = Math.floor((allYs.length ? Math.min(...allYs) : 0) - 0.5);
  const yMax = Math.ceil((allYs.length ? Math.max(...allYs) : 0) + 0.5);
  const recommendationPoint = recommendation
    ? [{ ...recommendation, label: currentFinderResults.feasible.length ? (activeTab === 'build' ? 'Finder result' : activeTab === 'advisor' ? 'Advisor recommendation' : 'Ticker recommendation') : 'Nearest portfolio' }]
    : [];

  const displayCloud = useMemo(() => {
    const step = currentSet.portfolios.length > 7000 ? 3 : currentSet.portfolios.length > 4500 ? 2 : 1;
    return currentSet.portfolios.filter((_, index) => index % step === 0);
  }, [currentSet.portfolios]);

  const donutSegments = (point) =>
    point.selectedAssets.map((name, index) => ({
      name,
      value: point.weightPct[index],
      color: slotColors[index % slotColors.length]
    }));

  const advisorFilterSummary = [
    includeOnlyPublicMarkets ? 'public markets only' : null,
    excludeAlternatives ? 'alternatives excluded' : null,
    requireBond ? 'at least one bond asset' : null
  ].filter(Boolean);

  const advisorEmptyMessage = advisorUniverse.length === 0
    ? 'Your current filters remove the entire advisor universe. Try loosening one or more filters.'
    : advisorOptimizedSet.portfolios.length === 0
      ? 'Your current advisor constraints produced no candidate portfolios. Try lowering the target or relaxing the filters.'
      : 'No portfolios available for the current settings.';

  const tickerStatusMessage = tickerFetchState.status === 'loading'
    ? 'Loading ticker data from your local backend…'
    : tickerFetchState.status === 'error'
      ? tickerFetchState.error
      : tickerDataset.error || '';

  return (
    <div className="app-shell">
      <div className="container">
        <div className="brand-row">
          <div className="brand">
            <div className="brand-mark" />
            <div className="brand-text">
              <div className="brand-title">Portfolio Lab</div>
              <div className="brand-sub">Dual-Mode Portfolio Advisor + Ticker Lab</div>
            </div>
          </div>
          <div className="header-meta">
            <span className="header-dot" />
            <span>{datasetMetadata.datasetName} · {datasetMetadata.currency} · Vintage {datasetMetadata.assumptionVintage}</span>
          </div>
        </div>

        <div className="hero">
          <div>
            <h1 className="hero-title">
              Explore a <span className="accent">portfolio lab</span> three different ways.
            </h1>
            <p className="hero-sub">
              Build your own asset basket, let the app choose from the LTCMA universe, or pull live ticker history from your local backend and optimize custom stock portfolios from cached market data.
            </p>
          </div>

          <div className="kpi-grid">
            <div className="kpi" style={{ '--kpi-accent': 'var(--accent-2)' }}>
              <div className="kpi-label">Current mode</div>
              <div className="kpi-value">{currentSet.modeLabel}</div>
              <div className="kpi-delta">
                {activeTab === 'build'
                  ? `${(currentSet.activeAssets ?? []).length} selected assets`
                  : activeTab === 'advisor'
                    ? `${advisorUniverse.length} assets in candidate universe`
                    : `${(currentSet.activeAssets ?? loadedTickerSymbols).length} ticker slots`}
              </div>
            </div>
            <div className="kpi" style={{ '--kpi-accent': 'var(--accent-3)' }}>
              <div className="kpi-label">Sampled portfolios</div>
              <div className="kpi-value">{currentSet.portfolios.length}</div>
              <div className="kpi-delta">Monte Carlo + anchors</div>
            </div>
            <div className="kpi" style={{ '--kpi-accent': 'var(--accent)' }}>
              <div className="kpi-label">Estimated frontier range</div>
              <div className="kpi-value">{frontierReturns.length ? `${fmtPct(frontierLow, 1)} – ${fmtPct(frontierHigh, 1)}` : '—'}</div>
              <div className="kpi-delta">sampled upper envelope · not exact QP</div>
            </div>
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">
            <h2 className="panel-title">Choose your workflow</h2>
            <div className="header-meta" style={{ fontSize: 10 }}>
              manual universe control, advisor-led selection, or backend-powered ticker analytics
            </div>
          </div>
          <div className="toolbar-row">
            <div className="tab-switch">
              <button className={`tab-button ${activeTab === 'build' ? 'active' : ''}`} onClick={() => setActiveTab('build')}>Build My Own</button>
              <button className={`tab-button ${activeTab === 'advisor' ? 'active' : ''}`} onClick={() => setActiveTab('advisor')}>Choose for Me</button>
              <button className={`tab-button ${activeTab === 'ticker' ? 'active' : ''}`} onClick={() => setActiveTab('ticker')}>Ticker Lab</button>
            </div>
            <div className="rf-card compact">
              <div className="asset-label">Risk-free rate</div>
              <div className="rf-input-row">
                <input className="rf-input" type="number" step="0.01" min="0" max="15" value={riskFreeRate} onChange={(e) => setRiskFreeRate(e.target.value)} />
                <span className="rf-suffix">%</span>
              </div>
              <div className="rf-hint">Global across all tabs · default U.S. Cash {defaultRiskFreeRate.toFixed(2)}%</div>
            </div>
          </div>
        </div>

        {activeTab === 'build' ? (
          <>
            <div className="panel">
              <div className="panel-header">
                <h2 className="panel-title">Asset universe</h2>
                <div className="header-meta" style={{ fontSize: 10 }}>
                  dynamic selectors · swap duplicates by re-selecting · reference assets excluded
                </div>
              </div>
              <div className="toolbar-row">
                <div className="count-stepper">
                  <span className="asset-label">Assets to include</span>
                  <div className="stepper-controls">
                    <button className="stepper-button" aria-label="Decrease asset count" onClick={() => handleAssetCountChange(assetCount - 1)} disabled={assetCount <= 2}>−</button>
                    <span className="stepper-value">{assetCount}</span>
                    <button className="stepper-button" aria-label="Increase asset count" onClick={() => handleAssetCountChange(assetCount + 1)} disabled={assetCount >= 10}>+</button>
                  </div>
                </div>
              </div>
              <div className="dynamic-asset-grid">
                {(currentSet.activeAssets ?? []).map((assetName, index) => (
                  <div key={index} className="asset-card" data-slot={index % slotColors.length}>
                    <span className="slot-pill">ASSET {index + 1}</span>
                    <div className="asset-label">Selection</div>
                    <div className="asset-select-wrap">
                      <select className="asset-select" value={assetName} onChange={(event) => handleAssetSelection(index, event.target.value)}>
                        {investableAssetNames.map((name) => (
                          <option key={name} value={name}>{name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="asset-stats">
                      <div className="stat"><span className="stat-label">Return</span><span className="stat-value">{fmtPct(getDisplayedReturn(assetName))}</span></div>
                      <div className="stat"><span className="stat-label">Vol</span><span className="stat-value">{fmtPct(getDisplayedVolatility(assetName))}</span></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="finder-grid">
              <div className="panel finder-panel">
                <div className="panel-header">
                  <h2 className="panel-title">Portfolio finder</h2>
                  <div className={`status-pill ${buildFinderResults.feasible.length ? 'success' : 'warning'}`}>{buildFinderResults.feasible.length ? 'feasible solutions found' : 'showing nearest matches'}</div>
                </div>
                <div className="mode-toggle">
                  <button className={`mode-button ${buildFinderMode === 'requiredReturn' ? 'active' : ''}`} onClick={() => setBuildFinderMode('requiredReturn')}>Required return</button>
                  <button className={`mode-button ${buildFinderMode === 'maxRisk' ? 'active' : ''}`} onClick={() => setBuildFinderMode('maxRisk')}>Maximum risk</button>
                </div>
                <div className="finder-input-row">
                  <div className="rf-card compact full-width">
                    <div className="asset-label">{buildFinderMode === 'requiredReturn' ? 'Target return' : 'Risk ceiling'}</div>
                    <div className="rf-input-row">
                      <input className="rf-input" type="number" step="0.10" value={buildFinderTarget} onChange={(event) => setBuildFinderTarget(event.target.value)} />
                      <span className="rf-suffix">%</span>
                    </div>
                    <div className="rf-hint">Optimize weights within your selected asset set.</div>
                  </div>
                </div>
              </div>
              <div className="panel recommendation-panel">
                <div className="panel-header"><h2 className="panel-title">Suggested portfolio</h2><div className="header-meta" style={{ fontSize: 10 }}>{buildFinderResults.feasible.length ? 'best exact fit' : 'closest available fit'}</div></div>
                {recommendation ? (
                  <>
                    <div className="donut-wrap">
                      <Donut segments={donutSegments(recommendation)} centerTop={buildFinderMode === 'requiredReturn' ? fmtPct(recommendation.risk, 1) : fmtPct(recommendation.return, 1)} centerBottom={buildFinderMode === 'requiredReturn' ? 'RISK' : 'RETURN'} />
                      <div className="donut-legend">
                        {recommendation.selectedAssets.map((name, index) => (
                          <div className="donut-legend-row" key={name}><span className="legend-swatch" style={{ background: slotColors[index % slotColors.length] }} /><span className="name">{name}</span><span className="pct">{recommendation.weightPct[index]}%</span></div>
                        ))}
                      </div>
                    </div>
                    <div className="insight-metrics">
                      <div className="stat"><span className="stat-label">Return</span><span className="stat-value">{fmtPct(recommendation.return)}</span></div>
                      <div className="stat"><span className="stat-label">Risk</span><span className="stat-value">{fmtPct(recommendation.risk)}</span></div>
                      <div className="stat"><span className="stat-label">Sharpe</span><span className="stat-value">{Number.isFinite(recommendation.sharpe) ? fmtNum(recommendation.sharpe) : '—'}</span></div>
                    </div>
                  </>
                ) : <div className="empty-state">Enter a target to evaluate candidate portfolios.</div>}
              </div>
            </div>
          </>
        ) : activeTab === 'advisor' ? (
          <div className="finder-grid">
            <div className="panel finder-panel">
              <div className="panel-header"><h2 className="panel-title">Advisor constraints</h2><div className={`status-pill ${advisorFinderResults.feasible.length ? 'success' : 'warning'}`}>{advisorFinderResults.feasible.length ? 'recommendations found' : 'showing nearest matches'}</div></div>
              <div className="mode-toggle">
                <button className={`mode-button ${advisorMode === 'requiredReturn' ? 'active' : ''}`} onClick={() => setAdvisorMode('requiredReturn')}>Required return</button>
                <button className={`mode-button ${advisorMode === 'maxRisk' ? 'active' : ''}`} onClick={() => setAdvisorMode('maxRisk')}>Maximum risk</button>
              </div>
              <div className="finder-input-row advisor-grid">
                <div className="rf-card compact">
                  <div className="asset-label">{advisorMode === 'requiredReturn' ? 'Target return' : 'Risk ceiling'}</div>
                  <div className="rf-input-row"><input className="rf-input" type="number" step="0.10" value={advisorTarget} onChange={(event) => setAdvisorTarget(event.target.value)} /><span className="rf-suffix">%</span></div>
                  <div className="rf-hint">Let the app choose assets and weights.</div>
                </div>
                <div className="count-stepper compact-stepper">
                  <span className="asset-label">Max assets in portfolio</span>
                  <div className="stepper-controls">
                    <button className="stepper-button" aria-label="Decrease advisor max assets" onClick={() => setAdvisorMaxAssets((value) => Math.max(2, value - 1))} disabled={advisorMaxAssets <= 2}>−</button>
                    <span className="stepper-value">{advisorMaxAssets}</span>
                    <button className="stepper-button" aria-label="Increase advisor max assets" onClick={() => setAdvisorMaxAssets((value) => Math.min(10, value + 1))} disabled={advisorMaxAssets >= 10}>+</button>
                  </div>
                </div>
              </div>
              <div className="filter-grid">
                <label className="filter-card"><input type="checkbox" checked={includeOnlyPublicMarkets} onChange={(event) => setIncludeOnlyPublicMarkets(event.target.checked)} /> <span>Include only public markets</span></label>
                <label className="filter-card"><input type="checkbox" checked={excludeAlternatives} onChange={(event) => setExcludeAlternatives(event.target.checked)} /> <span>Exclude alternatives</span></label>
                <label className="filter-card"><input type="checkbox" checked={requireBond} onChange={(event) => setRequireBond(event.target.checked)} /> <span>Require at least one bond asset</span></label>
              </div>
              <div className="finder-summary"><div className="summary-chip">Universe {advisorUniverse.length} assets</div><div className="summary-chip">Bond assets {advisorBondUniverse.length}</div><div className="summary-chip">{advisorFilterSummary.length ? advisorFilterSummary.join(' · ') : 'no extra filters'}</div></div>
            </div>
            <div className="panel recommendation-panel">
              <div className="panel-header"><h2 className="panel-title">Advisor recommendation</h2><div className="header-meta" style={{ fontSize: 10 }}>{advisorFinderResults.feasible.length ? 'best fit from broad universe' : 'closest available fit'}</div></div>
              {recommendation ? (
                <>
                  <div className="donut-wrap">
                    <Donut segments={donutSegments(recommendation)} centerTop={advisorMode === 'requiredReturn' ? fmtPct(recommendation.risk, 1) : fmtPct(recommendation.return, 1)} centerBottom={advisorMode === 'requiredReturn' ? 'RISK' : 'RETURN'} />
                    <div className="donut-legend">
                      {recommendation.selectedAssets.map((name, index) => (
                        <div className="donut-legend-row" key={name}><span className="legend-swatch" style={{ background: slotColors[index % slotColors.length] }} /><span className="name">{name}</span><span className="pct">{recommendation.weightPct[index]}%</span></div>
                      ))}
                    </div>
                  </div>
                  <div className="insight-metrics">
                    <div className="stat"><span className="stat-label">Return</span><span className="stat-value">{fmtPct(recommendation.return)}</span></div>
                    <div className="stat"><span className="stat-label">Risk</span><span className="stat-value">{fmtPct(recommendation.risk)}</span></div>
                    <div className="stat"><span className="stat-label">Sharpe</span><span className="stat-value">{Number.isFinite(recommendation.sharpe) ? fmtNum(recommendation.sharpe) : '—'}</span></div>
                  </div>
                </>
              ) : <div className="empty-state">{advisorEmptyMessage}</div>}
            </div>
          </div>
        ) : (
          <>
            <div className="panel">
              <div className="panel-header">
                <h2 className="panel-title">Ticker input</h2>
                <div className="header-meta" style={{ fontSize: 10 }}>up to 10 comma-separated symbols · backend cache freshness surfaced per ticker</div>
              </div>
              <div className="finder-input-row advisor-grid">
                <div className="rf-card compact full-width">
                  <div className="asset-label">Tickers</div>
                  <div className="rf-input-row">
                    <input className="rf-input" style={{ width: '100%' }} type="text" value={tickerInput} onChange={(event) => setTickerInput(event.target.value)} />
                  </div>
                  <div className="rf-hint">Examples: AAPL, MSFT, JNJ. Parsed symbols: {parsedTickerInput.join(', ') || '—'}.</div>
                </div>
                <div className="count-stepper compact-stepper">
                  <span className="asset-label">Load tickers</span>
                  <button className="mode-button active" onClick={() => setLoadedTickerSymbols(parsedTickerInput)} disabled={parsedTickerInput.length < 2}>Fetch backend data</button>
                  <div className="rf-hint">Loads from <code>/api/ticker/:symbol</code> and respects the 30-day backend cache.</div>
                </div>
              </div>
              <div className="finder-summary">
                <div className="summary-chip">Loaded set {loadedTickerSymbols.join(', ')}</div>
                <div className="summary-chip">Status {tickerFetchState.status}</div>
                {tickerDataset.observationCount ? <div className="summary-chip">{tickerDataset.observationCount} overlapping daily observations</div> : null}
              </div>
            </div>
            <div className="panel">
              <div className="panel-header">
                <h2 className="panel-title">Ticker data</h2>
                <div className="header-meta" style={{ fontSize: 10 }}>{tickerDataset.windowStart && tickerDataset.windowEnd ? `${tickerDataset.windowStart} → ${tickerDataset.windowEnd}` : 'waiting for backend data'}</div>
              </div>
              {tickerStatusMessage ? <div className="empty-state">{tickerStatusMessage}</div> : null}
              <div className="dynamic-asset-grid">
                {tickerFetchState.results.map((result, index) => (
                  <div key={result.symbol} className="asset-card" data-slot={index % slotColors.length} title={result.nextRefresh ? `Last updated ${result.lastUpdated}. Next refresh ${result.nextRefresh}.` : undefined}>
                    <span className="slot-pill">{result.symbol}</span>
                    <div className="asset-label">{result.error ? 'Load issue' : result.source === 'cache' ? 'Cached market data' : 'Fresh market data'}</div>
                    <div className="asset-stats">
                      <div className="stat"><span className="stat-label">Return</span><span className="stat-value">{tickerDataset.assetData?.[result.symbol] ? fmtPct(tickerDataset.assetData[result.symbol].compoundReturn2024) : '—'}</span></div>
                      <div className="stat"><span className="stat-label">Vol</span><span className="stat-value">{tickerDataset.assetData?.[result.symbol] ? fmtPct(tickerDataset.assetData[result.symbol].volatility) : '—'}</span></div>
                    </div>
                    <div className="rf-hint">{result.error ? result.error : `Last updated ${result.lastUpdated}. Refresh due ${result.nextRefresh}.`}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="finder-grid">
              <div className="panel finder-panel">
                <div className="panel-header"><h2 className="panel-title">Ticker optimizer</h2><div className={`status-pill ${tickerFinderResults.feasible.length ? 'success' : 'warning'}`}>{tickerFinderResults.feasible.length ? 'feasible solutions found' : 'showing nearest matches'}</div></div>
                <div className="mode-toggle">
                  <button className={`mode-button ${tickerMode === 'requiredReturn' ? 'active' : ''}`} onClick={() => setTickerMode('requiredReturn')}>Required return</button>
                  <button className={`mode-button ${tickerMode === 'maxRisk' ? 'active' : ''}`} onClick={() => setTickerMode('maxRisk')}>Maximum risk</button>
                </div>
                <div className="finder-input-row">
                  <div className="rf-card compact full-width">
                    <div className="asset-label">{tickerMode === 'requiredReturn' ? 'Target return' : 'Risk ceiling'}</div>
                    <div className="rf-input-row"><input className="rf-input" type="number" step="0.10" value={tickerTarget} onChange={(event) => setTickerTarget(event.target.value)} /><span className="rf-suffix">%</span></div>
                    <div className="rf-hint">Optimizes weights across the loaded ticker set using historical daily returns from the backend.</div>
                  </div>
                </div>
              </div>
              <div className="panel recommendation-panel">
                <div className="panel-header"><h2 className="panel-title">Ticker recommendation</h2><div className="header-meta" style={{ fontSize: 10 }}>{tickerFinderResults.feasible.length ? 'best fit from loaded tickers' : 'closest available fit'}</div></div>
                {recommendation ? (
                  <>
                    <div className="donut-wrap">
                      <Donut segments={donutSegments(recommendation)} centerTop={tickerMode === 'requiredReturn' ? fmtPct(recommendation.risk, 1) : fmtPct(recommendation.return, 1)} centerBottom={tickerMode === 'requiredReturn' ? 'RISK' : 'RETURN'} />
                      <div className="donut-legend">
                        {recommendation.selectedAssets.map((name, index) => (
                          <div className="donut-legend-row" key={name}><span className="legend-swatch" style={{ background: slotColors[index % slotColors.length] }} /><span className="name">{name}</span><span className="pct">{recommendation.weightPct[index]}%</span></div>
                        ))}
                      </div>
                    </div>
                    <div className="insight-metrics">
                      <div className="stat"><span className="stat-label">Return</span><span className="stat-value">{fmtPct(recommendation.return)}</span></div>
                      <div className="stat"><span className="stat-label">Risk</span><span className="stat-value">{fmtPct(recommendation.risk)}</span></div>
                      <div className="stat"><span className="stat-label">Sharpe</span><span className="stat-value">{Number.isFinite(recommendation.sharpe) ? fmtNum(recommendation.sharpe) : '—'}</span></div>
                    </div>
                  </>
                ) : <div className="empty-state">{tickerStatusMessage || 'Load at least two valid tickers to compute a custom frontier.'}</div>}
              </div>
            </div>
          </>
        )}

        <div className="chart-panel">
          <div className="chart-header">
            <div>
              <h2 className="panel-title">{activeTab === 'build' ? 'Estimated frontier + finder result' : activeTab === 'advisor' ? 'Advisor search + recommendation' : 'Ticker frontier + recommendation'}</h2>
              <div className="header-meta" style={{ fontSize: 10, marginTop: 8 }}>
                {activeTab === 'ticker' ? 'frontier estimated from historical daily ticker returns via the local backend cache' : 'sampled Monte Carlo upper envelope for client-side interactivity'}
              </div>
            </div>
            <div className="chart-legend">
              <span className="legend-item"><span className="legend-dot cloud" /> Sampled cloud</span>
              <span className="legend-item"><span className="legend-dot frontier" /> Estimated frontier</span>
              <span className="legend-item"><span className="legend-dot cml" /> CML</span>
              <span className="legend-item"><span className="legend-dot sharpe" /> Max Sharpe</span>
              <span className="legend-item"><span className="legend-dot minvar" /> Min variance</span>
              <span className="legend-item"><span className="legend-dot finder" /> {activeTab === 'build' ? 'Finder result' : activeTab === 'advisor' ? 'Advisor recommendation' : 'Ticker recommendation'}</span>
              <span className="legend-item"><span className="legend-dot asset" /> Active assets</span>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={520}>
            <ScatterChart margin={{ top: 20, right: 30, bottom: 50, left: 50 }}>
              <defs>
                <linearGradient id="frontierLine" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor="#22d3ee" /><stop offset="55%" stopColor="#34d399" /><stop offset="100%" stopColor="#f4c35a" /></linearGradient>
                <linearGradient id="cmlLine" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor="#f5f7ff" /><stop offset="100%" stopColor="#f4c35a" /></linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="2 4" stroke="rgba(148,163,205,0.14)" />
              <XAxis type="number" dataKey="risk" domain={[0, xMax]} tickFormatter={(value) => `${value}%`} stroke="rgba(148,163,205,0.4)" tickLine={false}><Label value="RISK (σ)" position="insideBottom" offset={-18} className="recharts-label" /></XAxis>
              <YAxis type="number" dataKey="return" domain={[yMin, yMax]} tickFormatter={(value) => `${value}%`} stroke="rgba(148,163,205,0.4)" tickLine={false}><Label value="RETURN" angle={-90} position="insideLeft" offset={10} className="recharts-label" /></YAxis>
              <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'rgba(148,163,205,0.25)', strokeDasharray: '2 3' }} />
              <Scatter name="Sampled cloud" data={displayCloud} shape={<CloudDot />} />
              <Scatter name="Estimated frontier" data={currentSet.frontier.map((point) => ({ ...point, label: 'Estimated frontier' }))} shape={<FrontierDot />} line={{ stroke: 'url(#frontierLine)', strokeWidth: 2.5 }} lineType="joint" />
              <Scatter name="Capital Market Line" data={capitalMarketLine} shape={() => null} line={{ stroke: 'url(#cmlLine)', strokeWidth: 2, strokeDasharray: '6 4' }} lineType="joint" />
              <Scatter name="Risk-free rate" data={capitalMarketLine.slice(0, 1)} shape={<RiskFreeShape />} />
              <Scatter name="Minimum variance" data={currentSet.minVariance} shape={<MinVarShape />} />
              <Scatter name="Maximum Sharpe" data={currentSet.maxSharpe} shape={<SharpeShape />} />
              <Scatter name={activeTab === 'build' ? 'Finder result' : activeTab === 'advisor' ? 'Advisor recommendation' : 'Ticker recommendation'} data={recommendationPoint} shape={<FinderShape />} />
              <Scatter name="Active assets" data={highlightedAssets} shape={<SelectedAssetShape />} />
            </ScatterChart>
          </ResponsiveContainer>
        </div>

        <div className="panel">
          <div className="panel-header">
            <h2 className="panel-title">{activeTab === 'build' ? 'Top candidate mixes' : activeTab === 'advisor' ? 'Top advisor recommendations' : 'Top ticker portfolios'}</h2>
            <div className="header-meta" style={{ fontSize: 10 }}>{currentFinderMode === 'requiredReturn' ? 'sorted by lowest risk' : 'sorted by highest return'} · top 10</div>
          </div>
          <div className="table-wrap">
            <table className="results-table">
              <thead><tr><th>#</th><th>Return</th><th>Risk</th><th>Sharpe</th><th>Assets / weights</th></tr></thead>
              <tbody>
                {visibleSolutions.length > 0 ? (
                  visibleSolutions.map((point, index) => (
                    <tr key={`${point.return}-${point.risk}-${index}`} className={index === 0 ? 'active-row' : ''}>
                      <td>{index + 1}</td>
                      <td>{fmtPct(point.return)}</td>
                      <td>{fmtPct(point.risk)}</td>
                      <td>{Number.isFinite(point.sharpe) ? fmtNum(point.sharpe) : '—'}</td>
                      <td className="weights-cell" title={point.fullWeightLabel}>{point.weightLabel}</td>
                    </tr>
                  ))
                ) : (
                  <tr><td colSpan={5} className="empty-state">{activeTab === 'advisor' ? advisorEmptyMessage : activeTab === 'ticker' ? tickerStatusMessage || 'Load at least two valid tickers to compute portfolios.' : 'No portfolios available for the current settings.'}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="footer">
          Source · J.P. Morgan Asset Management · 2025 Long-Term Capital Market Assumptions · plus backend-fetched ticker history for Ticker Lab · sampled optimization for client-side interactivity
        </div>
      </div>
    </div>
  );
};

export default EfficientFrontierApp;
