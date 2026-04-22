import React, { useEffect, useMemo, useRef, useState } from 'react';
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
import assetData from '../data/2026-usd/assets.json';
import assetOrder from '../data/2026-usd/asset-order.json';
import assetTaxonomy from '../data/2026-usd/asset-taxonomy.json';
import datasetMetadata from '../data/2026-usd/metadata.json';
import correlationRowsText from '../data/2026-usd/correlation-rows.txt?raw';
import {
  buildCorrelationMatrix,
  chooseAdvisorSampleCount,
  chooseSampleCount,
  extractEfficientFrontier,
  findAlternatives,
  findPrimaryPortfolio,
  generatePortfolioSet,
  generateSparsePortfolioSet
} from './lib/portfolioMath';

const SAMPLING_TOLERANCE = 0.25; // percentage points on return & risk axes
const CHART_LAYOUT = {
  left: 92,
  right: 42
};

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
const getStrategicReturn = (asset) => asset.arithmeticReturn2026 ?? asset.compoundReturn2026 ?? asset.compoundReturn2025 ?? asset.compoundReturn2024;
const defaultRiskFreeRate = (() => {
  const cashReturn = getStrategicReturn(assetData['U.S. Cash'] ?? {});
  if (typeof cashReturn !== 'number' || Number.isNaN(cashReturn)) {
    throw new Error('Missing U.S. Cash return assumption in the active LTCMA dataset');
  }
  return cashReturn;
})();
const slotColors = ['#34d399', '#22d3ee', '#f4c35a', '#c084fc', '#f87171', '#60a5fa', '#f97316', '#a3e635', '#f472b6', '#93c5fd'];
const correlationMatrix = buildCorrelationMatrix(assetOrder, correlationRowsText);
const diversificationThresholds = {
  relaxed: 0.75,
  balanced: 0.6,
  strict: 0.45
};

const fmtPct = (n, d = 2) => `${n.toFixed(d)}%`;
const fmtNum = (n, d = 3) => n.toFixed(d);
const isBondAsset = (assetName) => assetTaxonomy[assetName]?.class === 'bond';
const isPrivateAlternativeAsset = (assetName) => assetTaxonomy[assetName]?.class === 'alt_private';
const isAlternativeAsset = (assetName) => ['alt_public', 'alt_private'].includes(assetTaxonomy[assetName]?.class);

const getDisplayedReturn = (assetName) => getStrategicReturn(assetData[assetName]);
const getDisplayedVolatility = (assetName) => assetData[assetName].volatility;

const buildInitialSelection = (count) => {
  const seed = [];
  for (const candidate of [...preferredDefaults, ...investableAssetNames]) {
    if (!seed.includes(candidate)) seed.push(candidate);
    if (seed.length === count) break;
  }
  return seed;
};

const portfolioKey = (point) => {
  if (Array.isArray(point?.weights) && point.weights.length > 0) {
    return point.weights.map((weight) => weight.toFixed(4)).join('|');
  }
  return `${point?.risk ?? 0}:${point?.return ?? 0}`;
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

const CloudDot = ({ cx, cy }) => (cx == null || cy == null ? null : <circle cx={cx} cy={cy} r={2.1} fill="#3b4a7a" opacity={0.45} />);
const FrontierDot = ({ cx, cy }) => (cx == null || cy == null ? null : <circle cx={cx} cy={cy} r={3} fill="#34d399" stroke="#0b1020" strokeWidth={1} />);
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
const SelectedPortfolioShape = ({ cx, cy, ...rest }) => {
  if (cx == null || cy == null) return null;
  return (
    <g {...rest}>
      <circle cx={cx} cy={cy} r={16} fill="#22d3ee" opacity={0.12} />
      <circle cx={cx} cy={cy} r={10} fill="#22d3ee" opacity={0.22} />
      <circle cx={cx} cy={cy} r={5.5} fill="#ecfeff" stroke="#22d3ee" strokeWidth={1.8} />
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

const legendDefinitions = {
  cloud: {
    dotClass: 'cloud',
    label: 'Sampled cloud',
    financial: 'The sampled cloud is the full set of trial portfolios the app generated. Each dot is one possible mix of the selected assets, showing its expected return and risk based on the current assumptions.',
    eli5: 'Imagine tossing a bunch of recipe ideas onto the counter. Each dot is one recipe the app tried, from cautious mixes to spicy ones, so you can see the whole menu before picking favorites.'
  },
  frontier: {
    dotClass: 'frontier',
    label: 'Estimated frontier',
    financial: 'The estimated frontier is the upper edge of the sampled cloud. It represents the best return the app found at each risk level, using the current Monte Carlo sample rather than an exact optimizer.',
    eli5: 'If the cloud is a pile of test scores, the frontier is the top edge where the best scores live. It shows the smartest trade-offs the app found between playing safe and chasing more reward.'
  },
  cml: {
    dotClass: 'cml',
    label: 'CML',
    financial: 'The Capital Market Line links the risk-free rate to the maximum Sharpe portfolio. It shows the best return per unit of risk available when you can combine cash with the portfolio that has the strongest risk-adjusted payoff.',
    eli5: 'Think of this as the straightest, most efficient ramp up the hill. Starting from safe cash, it shows the cleanest path to taking on more risk without wasting effort.'
  },
  sharpe: {
    dotClass: 'sharpe',
    label: 'Max Sharpe',
    financial: 'The maximum Sharpe portfolio is the mix with the highest excess return relative to its volatility. In plain finance terms, it is the portfolio that gives the most reward for each unit of risk in this opportunity set.',
    eli5: "This is the app's best bang-for-your-buck pick — the mix that gets you the most reward per unit of risk you take on."
  },
  minvar: {
    dotClass: 'minvar',
    label: 'Min variance',
    financial: 'The minimum variance portfolio is the lowest-volatility mix the app found. It focuses on smoothing the ride as much as possible, even if that means accepting a lower expected return.',
    eli5: "This is the smoothest ride the app could find. It may not reach the biggest prize, but it works hardest to avoid the bumps."
  },
  finder: {
    dotClass: 'finder',
    label: 'Finder result',
    financial: 'The finder result is the portfolio the app selected because it best matches your target, such as a required return or a maximum risk limit. In advisor mode, it is the recommended portfolio under those rules.',
    eli5: "This is the app saying, \"Based on what you asked for, pick this one.\" It is the closest match to the goal you typed in."
  },
  asset: {
    dotClass: 'asset',
    label: 'Active assets',
    financial: 'The active assets are the currently selected building blocks plotted individually on the chart. They help you compare each standalone asset with the portfolios built from combining them.',
    eli5: 'These are the individual pieces plotted on their own, before any blending. You can see how each one behaves by itself and compare that with the combined portfolios around it.'
  },
  selected: {
    dotClass: 'finder',
    label: 'Selected portfolio',
    financial: 'The selected portfolio is the specific point you are inspecting on the efficient frontier. In Build My Own mode, this marker can be dragged across the frontier to compare the exact risk, return, and weight mix at each sampled portfolio point.',
    eli5: 'This is your finger on the curve. Slide it up or down to see what mix the app would use at that exact spot and how much extra reward comes with the extra bumpiness.'
  }
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
      {typeof point.sharpe === 'number' && Number.isFinite(point.sharpe) ? <div className="tooltip-row"><span>Sharpe</span><span>{fmtNum(point.sharpe)}</span></div> : null}
      {typeof point.avgCorrelation === 'number' && Number.isFinite(point.avgCorrelation) ? <div className="tooltip-row"><span>Avg corr</span><span>{fmtNum(point.avgCorrelation, 2)}</span></div> : null}
      {typeof point.diversificationRatio === 'number' && Number.isFinite(point.diversificationRatio) ? <div className="tooltip-row"><span>Div ratio</span><span>{fmtNum(point.diversificationRatio, 2)}</span></div> : null}
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
  const chartPanelRef = useRef(null);
  const dragFrameRef = useRef(null);
  const [activeTab, setActiveTab] = useState('build');
  const [assetCount, setAssetCount] = useState(3);
  const [selected, setSelected] = useState(buildInitialSelection(3));
  const [riskFreeRate, setRiskFreeRate] = useState(defaultRiskFreeRate.toFixed(2));
  const [advisorMode, setAdvisorMode] = useState('requiredReturn');
  const [advisorTarget, setAdvisorTarget] = useState('8.00');
  const [advisorMaxAssets, setAdvisorMaxAssets] = useState(5);
  const [minAssets, setMinAssets] = useState(4);
  const [maxWeight, setMaxWeight] = useState(0.3);
  const [diversificationLevel, setDiversificationLevel] = useState('balanced');
  const [includeOnlyPublicMarkets, setIncludeOnlyPublicMarkets] = useState(false);
  const [excludeAlternatives, setExcludeAlternatives] = useState(false);
  const [requireBond, setRequireBond] = useState(false);
  const [activeLegendKey, setActiveLegendKey] = useState('cloud');
  const [buildSelectedPointKey, setBuildSelectedPointKey] = useState(null);
  const [buildSelectorDragging, setBuildSelectorDragging] = useState(false);

  const parsedRiskFreeRate = Number(riskFreeRate);
  const riskFreeRateValue = Number.isFinite(parsedRiskFreeRate) ? parsedRiskFreeRate : defaultRiskFreeRate;
  const advisorMinAssets = Number.isFinite(minAssets) ? Math.max(2, Math.min(Math.floor(minAssets), advisorMaxAssets)) : 2;
  const advisorMaxWeight = Number.isFinite(maxWeight) ? Math.max(0.1, Math.min(maxWeight, 1)) : 0.3;
  const advisorMaxAverageCorrelation = diversificationThresholds[diversificationLevel] ?? diversificationThresholds.balanced;

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
    if (activeTab !== 'build') return emptyPortfolioSet('Build My Own', { activeAssets });
    const sampleCount = chooseSampleCount(activeAssets.length);
    const portfolios = generatePortfolioSet({ selectedAssets: activeAssets, assetData, correlationMatrix, riskFreeRate: riskFreeRateValue, sampleCount });
    return { modeLabel: 'Build My Own', activeAssets, sampleCount, portfolios, ...summarizePortfolios(portfolios) };
  }, [activeTab, assetCount, riskFreeRateValue, selected]);

  const advisorUniverse = useMemo(() => investableAssetNames.filter((assetName) => {
    if (includeOnlyPublicMarkets && isPrivateAlternativeAsset(assetName)) return false;
    if (excludeAlternatives && isAlternativeAsset(assetName)) return false;
    return true;
  }), [excludeAlternatives, includeOnlyPublicMarkets]);

  const advisorBondUniverse = useMemo(() => advisorUniverse.filter(isBondAsset), [advisorUniverse]);

  const rawAdvisorPortfolios = useMemo(() => {
    if (activeTab !== 'advisor') return [];
    const sampleCount = chooseAdvisorSampleCount(advisorUniverse.length, advisorMaxAssets);
    return generateSparsePortfolioSet({
      candidateAssets: advisorUniverse,
      maxAssetsInPortfolio: advisorMaxAssets,
      minAssetsInPortfolio: advisorMinAssets,
      maxWeightPerAsset: advisorMaxWeight,
      maxAverageCorrelation: advisorMaxAverageCorrelation,
      assetData,
      correlationMatrix,
      riskFreeRate: riskFreeRateValue,
      sampleCount,
      requiredAssetsPool: requireBond ? advisorBondUniverse : []
    });
  }, [activeTab, advisorBondUniverse, advisorMaxAssets, advisorUniverse, advisorMinAssets, advisorMaxWeight, advisorMaxAverageCorrelation, requireBond, riskFreeRateValue]);

  const advisorOptimizedSet = useMemo(() => {
    if (activeTab !== 'advisor') return emptyPortfolioSet('Choose for Me', { candidateUniverse: advisorUniverse });
    const portfolios = requireBond ? rawAdvisorPortfolios.filter((portfolio) => portfolio.selectedAssets.some(isBondAsset)) : rawAdvisorPortfolios;
    return { modeLabel: 'Choose for Me', candidateUniverse: advisorUniverse, sampleCount: rawAdvisorPortfolios.length, portfolios, ...summarizePortfolios(portfolios) };
  }, [activeTab, advisorUniverse, rawAdvisorPortfolios, requireBond]);

  const advisorFinderResults = useMemo(() => findPrimaryPortfolio({ portfolios: advisorOptimizedSet.portfolios, mode: advisorMode, targetValue: advisorTarget }), [advisorMode, advisorOptimizedSet.portfolios, advisorTarget]);
  const advisorAlternatives = useMemo(() => findAlternatives({ primary: advisorFinderResults.primary, portfolios: advisorOptimizedSet.portfolios, tolerance: SAMPLING_TOLERANCE }), [advisorFinderResults.primary, advisorOptimizedSet.portfolios]);
  const buildFrontierPoints = useMemo(
    () => buildOptimizedSet.frontier.map((point) => ({ ...point, label: 'Estimated frontier', frontierKey: portfolioKey(point) })),
    [buildOptimizedSet.frontier]
  );
  const buildDefaultPoint = useMemo(() => {
    if (buildFrontierPoints.length === 0) return null;
    const maxSharpeKey = buildOptimizedSet.maxSharpe[0] ? portfolioKey(buildOptimizedSet.maxSharpe[0]) : null;
    return buildFrontierPoints.find((point) => point.frontierKey === maxSharpeKey) ?? buildFrontierPoints[Math.floor(buildFrontierPoints.length / 2)];
  }, [buildFrontierPoints, buildOptimizedSet.maxSharpe]);
  const buildSelectedPortfolio = useMemo(() => {
    if (buildFrontierPoints.length === 0) return null;
    return buildFrontierPoints.find((point) => point.frontierKey === buildSelectedPointKey) ?? buildDefaultPoint;
  }, [buildDefaultPoint, buildFrontierPoints, buildSelectedPointKey]);
  useEffect(() => {
    if (!buildSelectedPortfolio) return;
    const nextKey = buildSelectedPortfolio.frontierKey ?? portfolioKey(buildSelectedPortfolio);
    if (nextKey !== buildSelectedPointKey) setBuildSelectedPointKey(nextKey);
  }, [buildSelectedPointKey, buildSelectedPortfolio]);

  const currentSet = activeTab === 'build' ? buildOptimizedSet : advisorOptimizedSet;
  const currentAlternatives = activeTab === 'build' ? [] : advisorAlternatives;
  const recommendation = activeTab === 'build' ? buildSelectedPortfolio : advisorFinderResults.primary;
  const primaryStatus = activeTab === 'build' ? 'selected' : advisorFinderResults.status;
  const isFeasible = activeTab === 'build' ? Boolean(buildSelectedPortfolio) : primaryStatus === 'on-frontier';
  const ms = currentSet.maxSharpe[0];
  const buildReferencePortfolio = ms ?? buildSelectedPortfolio;
  const frontierReturns = currentSet.frontier.map((point) => point.return);
  const frontierLow = frontierReturns.length ? Math.min(...frontierReturns) : 0;
  const frontierHigh = frontierReturns.length ? Math.max(...frontierReturns) : 0;

  const highlightedAssetNames = activeTab === 'build' ? currentSet.activeAssets : recommendation?.selectedAssets ?? ms?.selectedAssets ?? currentSet.activeAssets ?? [];
  const highlightedAssets = highlightedAssetNames.map((name, index) => ({
    name,
    return: getDisplayedReturn(name),
    risk: getDisplayedVolatility(name),
    label: name,
    color: slotColors[index % slotColors.length]
  }));

  const basePoints = [...currentSet.portfolios, ...highlightedAssets.map((point) => ({ risk: point.risk, return: point.return })), { risk: 0, return: riskFreeRateValue }, ...(recommendation ? [recommendation] : [])];
  const xMax = Math.ceil((basePoints.length ? Math.max(...basePoints.map((point) => point.risk)) : 0) + 1);
  const capitalMarketLine = ms && ms.risk > 0 ? [{ risk: 0, return: riskFreeRateValue, label: 'Risk-free rate' }, { risk: xMax, return: riskFreeRateValue + ((ms.return - riskFreeRateValue) / ms.risk) * xMax, label: 'Capital Market Line', sharpe: ms.sharpe }] : [];
  const allYs = [...basePoints.map((point) => point.return), ...capitalMarketLine.map((point) => point.return)];
  const yMin = Math.floor((allYs.length ? Math.min(...allYs) : 0) - 0.5);
  const yMax = Math.ceil((allYs.length ? Math.max(...allYs) : 0) + 0.5);
  const recommendationPoint = activeTab === 'advisor' && recommendation ? [{ ...recommendation, label: isFeasible ? 'Advisor recommendation' : 'Closest achievable' }] : [];
  const selectedBuildPoint = activeTab === 'build' && buildSelectedPortfolio ? [{ ...buildSelectedPortfolio, label: 'Selected portfolio' }] : [];

  const feasibilityBadge = (() => {
    if (activeTab === 'build') {
      return {
        kind: 'success',
        short: 'drag the frontier marker',
        detail: 'Click and drag the selected marker along the curve to inspect different mixes from your chosen basket.'
      };
    }
    if (primaryStatus === 'no-target') {
      return { kind: 'neutral', short: 'awaiting target', detail: 'Enter a target to evaluate the frontier.' };
    }
    if (primaryStatus === 'empty') {
      return { kind: 'warning', short: 'no portfolios', detail: 'The current constraints produced no candidate portfolios.' };
    }
    if (primaryStatus === 'above-max-return') {
      return {
        kind: 'warning',
        short: 'above frontier max',
        detail: `Target ${fmtPct(advisorFinderResults.target, 2)} exceeds the highest achievable return on this asset set (${fmtPct(advisorFinderResults.frontierMax ?? 0, 2)}). Showing the maximum-return portfolio.`
      };
    }
    if (primaryStatus === 'below-min-variance') {
      return {
        kind: 'warning',
        short: 'below min-variance floor',
        detail: `Risk budget ${fmtPct(advisorFinderResults.target, 2)} is below the minimum-variance floor (${fmtPct(advisorFinderResults.frontierMinRisk ?? 0, 2)}). Showing the minimum-variance portfolio.`
      };
    }
    return {
      kind: 'success',
      short: 'on the estimated frontier',
      detail: `Minimum-${advisorMode === 'requiredReturn' ? 'risk' : 'variance'} point meeting your target (±${SAMPLING_TOLERANCE}% sampling tolerance).`
    };
  })();
  const displayCloud = useMemo(() => {
    const sampleEvery = buildSelectorDragging && activeTab === 'build'
      ? currentSet.portfolios.length > 9000 ? 12 : currentSet.portfolios.length > 6000 ? 8 : currentSet.portfolios.length > 3500 ? 5 : 3
      : currentSet.portfolios.length > 7000 ? 3 : currentSet.portfolios.length > 4500 ? 2 : 1;
    return currentSet.portfolios.filter((_, index) => index % sampleEvery === 0);
  }, [activeTab, buildSelectorDragging, currentSet.portfolios]);
  const donutSegments = (point) => point.selectedAssets.map((name, index) => ({ name, value: point.weightPct[index], color: slotColors[index % slotColors.length] }));
  const handleBuildPointSelection = (point) => {
    if (!point) return;
    setBuildSelectedPointKey(point.frontierKey ?? portfolioKey(point));
  };
  const updateBuildSelectionFromPointer = (clientX) => {
    if (activeTab !== 'build' || !buildFrontierPoints.length || !chartPanelRef.current) return;
    const bounds = chartPanelRef.current.getBoundingClientRect();
    const plotLeft = bounds.left + CHART_LAYOUT.left;
    const plotRight = bounds.right - CHART_LAYOUT.right;
    const usableWidth = Math.max(plotRight - plotLeft, 1);
    const clampedX = Math.max(plotLeft, Math.min(clientX, plotRight));
    const normalized = (clampedX - plotLeft) / usableWidth;
    const targetRisk = normalized * xMax;
    let closest = buildFrontierPoints[0];
    let smallestDistance = Math.abs((closest?.risk ?? 0) - targetRisk);
    for (const point of buildFrontierPoints) {
      const distance = Math.abs(point.risk - targetRisk);
      if (distance < smallestDistance) {
        closest = point;
        smallestDistance = distance;
      }
    }
    handleBuildPointSelection(closest);
  };

  const advisorFilterSummary = [
    includeOnlyPublicMarkets ? 'public markets only' : null,
    excludeAlternatives ? 'alternatives excluded' : null,
    requireBond ? 'at least one bond asset' : null,
    `min ${advisorMinAssets} assets`,
    `max ${Math.round(advisorMaxWeight * 100)}% per asset`,
    `${diversificationLevel} corr limit ${fmtNum(advisorMaxAverageCorrelation, 2)}`
  ].filter(Boolean);
  const advisorEmptyMessage = advisorUniverse.length === 0
    ? 'Your current filters remove the entire advisor universe. Try loosening one or more filters.'
    : advisorOptimizedSet.portfolios.length === 0
      ? 'Your current advisor constraints produced no candidate portfolios. Try loosening the diversification rules, lowering the minimum asset count, or raising the weight cap.'
      : 'No portfolios available for the current settings.';
  const finderLegendLabel = activeTab === 'build' ? 'Selected portfolio' : 'Advisor recommendation';
  const activeLegendDefinition = useMemo(() => (
    activeLegendKey === 'finder'
      ? activeTab === 'build'
        ? legendDefinitions.selected
        : { ...legendDefinitions.finder, label: finderLegendLabel }
      : legendDefinitions[activeLegendKey]
  ), [activeLegendKey, activeTab, finderLegendLabel]);
  const chartLegendItems = useMemo(() => {
    const items = [
      legendDefinitions.cloud,
      legendDefinitions.frontier,
      legendDefinitions.cml,
      legendDefinitions.sharpe,
      legendDefinitions.minvar,
      activeTab === 'build' ? legendDefinitions.selected : { ...legendDefinitions.finder, label: finderLegendLabel },
      legendDefinitions.asset
    ];
    return items;
  }, [activeTab, finderLegendLabel]);
  const renderFrontierDot = (props) => {
    const point = props?.payload;
    const selectedKey = buildSelectedPortfolio?.frontierKey ?? portfolioKey(buildSelectedPortfolio);
    const pointKey = point?.frontierKey ?? portfolioKey(point);
    const isSelectedPoint = activeTab === 'build' && selectedKey && pointKey === selectedKey;
    return (
      <circle
        cx={props.cx}
        cy={props.cy}
        r={isSelectedPoint ? 4.2 : 3}
        fill={isSelectedPoint ? '#ecfeff' : '#34d399'}
        stroke={isSelectedPoint ? '#22d3ee' : '#0b1020'}
        strokeWidth={isSelectedPoint ? 1.6 : 1}
        style={{ cursor: activeTab === 'build' ? 'grab' : 'default' }}
        onMouseDown={() => {
          if (activeTab !== 'build') return;
          setBuildSelectorDragging(true);
          handleBuildPointSelection(point);
        }}
        onMouseEnter={() => {
          if (activeTab !== 'build' || !buildSelectorDragging) return;
          handleBuildPointSelection(point);
        }}
        onTouchStart={() => {
          if (activeTab !== 'build') return;
          handleBuildPointSelection(point);
        }}
      />
    );
  };

  useEffect(() => {
    if (!buildSelectorDragging) return undefined;
    const scheduleMove = (clientX) => {
      if (dragFrameRef.current != null) cancelAnimationFrame(dragFrameRef.current);
      dragFrameRef.current = requestAnimationFrame(() => {
        updateBuildSelectionFromPointer(clientX);
        dragFrameRef.current = null;
      });
    };
    const handleMove = (event) => scheduleMove(event.clientX);
    const handleTouchMove = (event) => {
      if (event.touches[0]) scheduleMove(event.touches[0].clientX);
    };
    const stopDragging = () => {
      setBuildSelectorDragging(false);
      if (dragFrameRef.current != null) {
        cancelAnimationFrame(dragFrameRef.current);
        dragFrameRef.current = null;
      }
    };
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('touchmove', handleTouchMove, { passive: true });
    window.addEventListener('mouseup', stopDragging);
    window.addEventListener('touchend', stopDragging);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('mouseup', stopDragging);
      window.removeEventListener('touchend', stopDragging);
      if (dragFrameRef.current != null) {
        cancelAnimationFrame(dragFrameRef.current);
        dragFrameRef.current = null;
      }
    };
  }, [buildFrontierPoints, buildSelectorDragging, xMax, activeTab]);

  return (
    <div className="app-shell">
      <div className="container">
        <div className="brand-row">
          <div className="brand"><div className="brand-mark" /><div className="brand-text"><div className="brand-title">Portfolio Lab</div><div className="brand-sub">Build-your-own optimizer + advisor workflow</div></div></div>
          <div className="header-meta"><span className="header-dot" /><span>{datasetMetadata.datasetName} · {datasetMetadata.currency} · Vintage {datasetMetadata.assumptionVintage}</span></div>
        </div>

        <div className="hero">
          <div>
            <h1 className="hero-title">Explore a <span className="accent">portfolio lab</span> two different ways.</h1>
            <p className="hero-sub">Build your own asset basket from the LTCMA assumptions, or let the app recommend portfolios from the broader investable universe under advisor-style constraints.</p>
          </div>
          <div className="hero-toggle-row">
            <div className="tab-switch">
              <button className={`tab-button ${activeTab === 'build' ? 'active' : ''}`} onClick={() => setActiveTab('build')}>Build My Own</button>
              <button className={`tab-button ${activeTab === 'advisor' ? 'active' : ''}`} onClick={() => setActiveTab('advisor')}>Choose for Me</button>
            </div>
          </div>
        </div>

        {activeTab === 'build' ? (
          <>
            <div className="panel">
              <div className="panel-header"><h2 className="panel-title">Asset universe</h2><div className="header-meta" style={{ fontSize: 10 }}>dynamic selectors · swap duplicates by re-selecting · reference assets excluded</div></div>
              <div className="toolbar-row">
                <div className="count-stepper"><span className="asset-label">Assets to include</span><div className="stepper-controls"><button className="stepper-button" aria-label="Decrease asset count" onClick={() => handleAssetCountChange(assetCount - 1)} disabled={assetCount <= 2}>−</button><span className="stepper-value">{assetCount}</span><button className="stepper-button" aria-label="Increase asset count" onClick={() => handleAssetCountChange(assetCount + 1)} disabled={assetCount >= 10}>+</button></div></div>
                <div className="rf-card compact"><div className="asset-label">Risk-free rate</div><div className="rf-input-row"><input className="rf-input" type="number" step="0.01" min="0" max="15" value={riskFreeRate} onChange={(e) => setRiskFreeRate(e.target.value)} /><span className="rf-suffix">%</span></div><div className="rf-hint">U.S. Cash {defaultRiskFreeRate.toFixed(2)}%</div></div>
                <div className="kpi" style={{ '--kpi-accent': 'var(--accent)' }}><div className="kpi-label">Frontier range</div><div className="kpi-value">{frontierReturns.length ? `${fmtPct(frontierLow, 1)} – ${fmtPct(frontierHigh, 1)}` : '—'}</div><div className="kpi-delta">sampled upper envelope · not exact QP</div></div>
                <div className="kpi" style={{ '--kpi-accent': 'var(--accent-3)' }}><div className="kpi-label">Sampled portfolios</div><div className="kpi-value">{currentSet.portfolios.length}</div><div className="kpi-delta">Monte Carlo + anchors</div></div>
              </div>
              <div className="dynamic-asset-grid">
                {(currentSet.activeAssets ?? []).map((assetName, index) => (
                  <div key={index} className="asset-card" data-slot={index % slotColors.length}>
                    <span className="slot-pill">ASSET {index + 1}</span><div className="asset-label">Selection</div>
                    <div className="asset-select-wrap"><select className="asset-select" value={assetName} onChange={(event) => handleAssetSelection(index, event.target.value)}>{investableAssetNames.map((name) => <option key={name} value={name}>{name}</option>)}</select></div>
                    <div className="asset-stats"><div className="stat"><span className="stat-label">Return</span><span className="stat-value">{fmtPct(getDisplayedReturn(assetName))}</span></div><div className="stat"><span className="stat-label">Vol</span><span className="stat-value">{fmtPct(getDisplayedVolatility(assetName))}</span></div></div>
                  </div>
                ))}
              </div>
            </div>
            <div className="finder-grid">
              <div className="panel finder-panel">
                <div className="panel-header"><h2 className="panel-title">Selected portfolio</h2><div className={`feasibility-badge feasibility-${feasibilityBadge.kind}`}>{feasibilityBadge.short}</div></div>
                {buildSelectedPortfolio ? (
                  <>
                    <div className="feasibility-detail">Drag the chart marker along the frontier to inspect different return, risk, and allocation mixes from your chosen basket.</div>
                    <div className="donut-wrap">
                      <Donut segments={donutSegments(buildSelectedPortfolio)} centerTop={fmtPct(buildSelectedPortfolio.return, 1)} centerBottom="RETURN" />
                      <div className="donut-legend">{buildSelectedPortfolio.selectedAssets.map((name, index) => <div className="donut-legend-row" key={name}><span className="legend-swatch" style={{ background: slotColors[index % slotColors.length] }} /><span className="name">{name}</span><span className="pct">{buildSelectedPortfolio.weightPct[index]}%</span></div>)}</div>
                    </div>
                    <div className="insight-metrics">
                      <div className="stat"><span className="stat-label">Selected return</span><span className="stat-value">{fmtPct(buildSelectedPortfolio.return, 1)}</span></div>
                      <div className="stat"><span className="stat-label">Selected risk</span><span className="stat-value">{fmtPct(buildSelectedPortfolio.risk, 1)}</span></div>
                      <div className="stat"><span className="stat-label">Sharpe</span><span className="stat-value">{Number.isFinite(buildSelectedPortfolio.sharpe) ? fmtNum(buildSelectedPortfolio.sharpe) : '—'}</span></div>
                    </div>
                  </>
                ) : <div className="empty-state">Select at least two assets to generate an efficient frontier.</div>}
              </div>
              <div className="panel recommendation-panel">
                <div className="panel-header"><h2 className="panel-title">Maximum Sharpe portfolio</h2><div className="feasibility-badge feasibility-success">reference mix</div></div>
                {buildReferencePortfolio ? (
                  <>
                    <div className="feasibility-detail">This is the highest risk-adjusted portfolio the app found for your chosen asset basket. Use the chart marker to compare it with other points on the frontier.</div>
                    <div className="donut-wrap">
                      <Donut segments={donutSegments(buildReferencePortfolio)} centerTop={fmtPct(buildReferencePortfolio.return, 1)} centerBottom="RETURN" />
                      <div className="donut-legend">{buildReferencePortfolio.selectedAssets.map((name, index) => <div className="donut-legend-row" key={name}><span className="legend-swatch" style={{ background: slotColors[index % slotColors.length] }} /><span className="name">{name}</span><span className="pct">{buildReferencePortfolio.weightPct[index]}%</span></div>)}</div>
                    </div>
                    <div className="insight-metrics">
                      <div className="stat"><span className="stat-label">Return</span><span className="stat-value">{fmtPct(buildReferencePortfolio.return)}</span></div>
                      <div className="stat"><span className="stat-label">Risk</span><span className="stat-value">{fmtPct(buildReferencePortfolio.risk)}</span></div>
                      <div className="stat"><span className="stat-label">Sharpe</span><span className="stat-value">{Number.isFinite(buildReferencePortfolio.sharpe) ? fmtNum(buildReferencePortfolio.sharpe) : '—'}</span></div>
                      <div className="stat"><span className="stat-label">Avg corr</span><span className="stat-value">{Number.isFinite(buildReferencePortfolio.avgCorrelation) ? fmtNum(buildReferencePortfolio.avgCorrelation, 2) : '—'}</span></div>
                      <div className="stat"><span className="stat-label">Div ratio</span><span className="stat-value">{Number.isFinite(buildReferencePortfolio.diversificationRatio) ? fmtNum(buildReferencePortfolio.diversificationRatio, 2) : '—'}</span></div>
                    </div>
                  </>
                ) : <div className="empty-state">Select at least two assets to generate an efficient frontier.</div>}
              </div>
            </div>
          </>
        ) : (
          <div className="finder-grid">
            <div className="panel finder-panel">
              <div className="panel-header"><h2 className="panel-title">Advisor constraints</h2><div className={`feasibility-badge feasibility-${feasibilityBadge.kind}`}>{feasibilityBadge.short}</div></div>
              <div className="mode-toggle"><button className={`mode-button ${advisorMode === 'requiredReturn' ? 'active' : ''}`} onClick={() => setAdvisorMode('requiredReturn')}>Required return</button><button className={`mode-button ${advisorMode === 'maxRisk' ? 'active' : ''}`} onClick={() => setAdvisorMode('maxRisk')}>Maximum risk</button></div>
              <div className="finder-input-row advisor-grid">
                <div className="rf-card compact"><div className="asset-label">{advisorMode === 'requiredReturn' ? 'Target return' : 'Risk ceiling'}</div><div className="rf-input-row"><input className="rf-input" type="number" step="0.10" value={advisorTarget} onChange={(event) => setAdvisorTarget(event.target.value)} /><span className="rf-suffix">%</span></div><div className="rf-hint">Let the app choose assets and weights.</div></div>
                <div className="count-stepper compact-stepper"><span className="asset-label">Max assets in portfolio</span><div className="stepper-controls"><button className="stepper-button" aria-label="Decrease advisor max assets" onClick={() => setAdvisorMaxAssets((value) => Math.max(2, value - 1))} disabled={advisorMaxAssets <= 2}>−</button><span className="stepper-value">{advisorMaxAssets}</span><button className="stepper-button" aria-label="Increase advisor max assets" onClick={() => setAdvisorMaxAssets((value) => Math.min(10, value + 1))} disabled={advisorMaxAssets >= 10}>+</button></div></div>
              </div>
              <div className="filter-grid">
                <label className="filter-card"><input type="checkbox" checked={includeOnlyPublicMarkets} onChange={(event) => setIncludeOnlyPublicMarkets(event.target.checked)} /> <span>Include only public markets</span></label>
                <label className="filter-card"><input type="checkbox" checked={excludeAlternatives} onChange={(event) => setExcludeAlternatives(event.target.checked)} /> <span>Exclude alternatives</span></label>
                <label className="filter-card"><input type="checkbox" checked={requireBond} onChange={(event) => setRequireBond(event.target.checked)} /> <span>Require at least one bond asset</span></label>
                <label className="filter-card"><span>Minimum assets</span><input className="rf-input" type="number" min="2" max={advisorMaxAssets} value={advisorMinAssets} onChange={(event) => {
                  const parsed = Number(event.target.value);
                  if (!Number.isFinite(parsed)) return;
                  setMinAssets(Math.max(2, Math.min(Math.floor(parsed), advisorMaxAssets)));
                }} /></label>
                <label className="filter-card"><span>Max weight per asset</span><input className="rf-input" type="number" step="0.05" min="0.1" max="1" value={advisorMaxWeight} onChange={(event) => {
                  const parsed = Number(event.target.value);
                  if (!Number.isFinite(parsed)) return;
                  setMaxWeight(Math.max(0.1, Math.min(parsed, 1)));
                }} /></label>
                <label className="filter-card"><span>Diversification strength</span><select className="asset-select" value={diversificationLevel} onChange={(event) => setDiversificationLevel(event.target.value)}><option value="relaxed">Relaxed (≤0.75)</option><option value="balanced">Balanced (≤0.60)</option><option value="strict">Strict (≤0.45)</option></select></label>
              </div>
              <div className="finder-summary"><div className="summary-chip">Universe {advisorUniverse.length} assets</div><div className="summary-chip">Bond assets {advisorBondUniverse.length}</div><div className="summary-chip">{advisorFilterSummary.join(' · ')}</div></div>
            </div>
            <div className="panel recommendation-panel"><div className="panel-header"><h2 className="panel-title">Advisor recommendation</h2><div className={`feasibility-badge feasibility-${feasibilityBadge.kind}`}>{feasibilityBadge.short}</div></div>{recommendation ? <><div className="feasibility-detail">{feasibilityBadge.detail}</div><div className="donut-wrap"><Donut segments={donutSegments(recommendation)} centerTop={advisorMode === 'requiredReturn' ? fmtPct(recommendation.risk, 1) : fmtPct(recommendation.return, 1)} centerBottom={advisorMode === 'requiredReturn' ? 'RISK' : 'RETURN'} /><div className="donut-legend">{recommendation.selectedAssets.map((name, index) => <div className="donut-legend-row" key={name}><span className="legend-swatch" style={{ background: slotColors[index % slotColors.length] }} /><span className="name">{name}</span><span className="pct">{recommendation.weightPct[index]}%</span></div>)}</div></div><div className="insight-metrics"><div className="stat"><span className="stat-label">Return</span><span className="stat-value">{fmtPct(recommendation.return)}</span></div><div className="stat"><span className="stat-label">Risk</span><span className="stat-value">{fmtPct(recommendation.risk)}</span></div><div className="stat"><span className="stat-label">Sharpe</span><span className="stat-value">{Number.isFinite(recommendation.sharpe) ? fmtNum(recommendation.sharpe) : '—'}</span></div><div className="stat"><span className="stat-label">Avg corr</span><span className="stat-value">{Number.isFinite(recommendation.avgCorrelation) ? fmtNum(recommendation.avgCorrelation, 2) : '—'}</span></div><div className="stat"><span className="stat-label">Div ratio</span><span className="stat-value">{Number.isFinite(recommendation.diversificationRatio) ? fmtNum(recommendation.diversificationRatio, 2) : '—'}</span></div></div></> : <div className="empty-state">{advisorEmptyMessage}</div>}</div>
          </div>
        )}

        <div className="chart-panel" ref={chartPanelRef}>
          <div className="chart-header">
            <div><h2 className="panel-title">{activeTab === 'build' ? 'Estimated frontier + selected portfolio' : 'Advisor search + recommendation'}</h2><div className="header-meta" style={{ fontSize: 10, marginTop: 8 }}>{activeTab === 'advisor' ? 'sampled portfolios with diversification constraints for more realistic recommendations' : 'sampled Monte Carlo upper envelope for client-side interactivity · drag the highlighted point along the frontier'}</div></div>
          </div>
          <ResponsiveContainer width="100%" height={520}>
            <ScatterChart margin={{ top: 20, right: 30, bottom: 50, left: 50 }}>
              <defs><linearGradient id="frontierLine" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor="#22d3ee" /><stop offset="55%" stopColor="#34d399" /><stop offset="100%" stopColor="#f4c35a" /></linearGradient><linearGradient id="cmlLine" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor="#f5f7ff" /><stop offset="100%" stopColor="#f4c35a" /></linearGradient></defs>
              <CartesianGrid strokeDasharray="2 4" stroke="rgba(148,163,205,0.14)" />
              <XAxis type="number" dataKey="risk" domain={[0, xMax]} tickFormatter={(value) => `${value}%`} stroke="rgba(148,163,205,0.4)" tickLine={false}><Label value="RISK (σ)" position="insideBottom" offset={-18} className="recharts-label" /></XAxis>
              <YAxis type="number" dataKey="return" domain={[yMin, yMax]} tickFormatter={(value) => `${value}%`} stroke="rgba(148,163,205,0.4)" tickLine={false}><Label value="RETURN" angle={-90} position="insideLeft" offset={10} className="recharts-label" /></YAxis>
              <Tooltip content={buildSelectorDragging ? <></> : <CustomTooltip />} cursor={buildSelectorDragging ? false : { stroke: 'rgba(148,163,205,0.25)', strokeDasharray: '2 3' }} />
              <Scatter name="Sampled cloud" data={displayCloud} shape={<CloudDot />} />
              <Scatter name="Estimated frontier" data={activeTab === 'build' ? buildFrontierPoints : currentSet.frontier.map((point) => ({ ...point, label: 'Estimated frontier' }))} shape={renderFrontierDot} line={{ stroke: 'url(#frontierLine)', strokeWidth: 2.5 }} lineType="joint" />
              <Scatter name="Capital Market Line" data={capitalMarketLine} shape={() => null} line={{ stroke: 'url(#cmlLine)', strokeWidth: 2, strokeDasharray: '6 4' }} lineType="joint" />
              <Scatter name="Risk-free rate" data={capitalMarketLine.slice(0, 1)} shape={<RiskFreeShape />} />
              <Scatter name="Minimum variance" data={currentSet.minVariance} shape={<MinVarShape />} />
              <Scatter name="Maximum Sharpe" data={currentSet.maxSharpe} shape={<SharpeShape />} />
              <Scatter
                name="Selected portfolio"
                data={selectedBuildPoint}
                shape={(props) => (
                  <SelectedPortfolioShape
                    {...props}
                    style={{ cursor: 'grab' }}
                    onMouseDown={() => {
                      if (activeTab !== 'build') return;
                      setBuildSelectorDragging(true);
                      handleBuildPointSelection(props.payload);
                    }}
                    onTouchStart={() => {
                      if (activeTab !== 'build') return;
                      handleBuildPointSelection(props.payload);
                    }}
                  />
                )}
              />
              <Scatter name="Advisor recommendation" data={recommendationPoint} shape={<FinderShape />} />
              <Scatter name="Active assets" data={highlightedAssets} shape={<SelectedAssetShape />} />
            </ScatterChart>
          </ResponsiveContainer>
          <div className="chart-legend">
            {chartLegendItems.map((item) => (
              <button
                key={item.dotClass}
                type="button"
                className="legend-item legend-button"
                onClick={() => setActiveLegendKey(item.dotClass)}
                aria-pressed={activeLegendKey === item.dotClass}
              >
                <span className={`legend-dot ${item.dotClass}`} />
                <span>{item.label}</span>
              </button>
            ))}
          </div>
          <div className="legend-explainer" role="status" aria-live="polite">
            <div className="legend-explainer-header">
              <span className={`legend-dot ${activeLegendDefinition.dotClass}`} />
              <div>
                <div className="legend-explainer-label">{activeLegendDefinition.label}</div>
                <div className="legend-explainer-hint">Tap any legend item to switch explanations. Hover a chart point for its numeric detail.</div>
              </div>
            </div>
            <div className="legend-explainer-grid">
              <div className="legend-explainer-card">
                <div className="legend-explainer-title">Technical</div>
                <p>{activeLegendDefinition.financial}</p>
              </div>
              <div className="legend-explainer-card">
                <div className="legend-explainer-title">ELI5</div>
                <p>{activeLegendDefinition.eli5}</p>
              </div>
            </div>
          </div>
        </div>

        {activeTab === 'advisor' && isFeasible && recommendation && currentAlternatives.length > 0 ? (
          <details className="panel alternatives-panel">
            <summary>
              <span className="alternatives-summary-title">Show nearby alternatives</span>
              <span className="alternatives-summary-meta">{currentAlternatives.length} within ±{SAMPLING_TOLERANCE}% of your target on both axes · ranked by Sharpe</span>
            </summary>
            <div className="table-wrap">
              {activeTab === 'advisor' ? (
                <table className="results-table"><thead><tr><th>#</th><th>Return</th><th>Risk</th><th>Sharpe</th><th>Avg corr</th><th>Assets / weights</th></tr></thead><tbody>{currentAlternatives.map((point, index) => <tr key={`${point.return}-${point.risk}-${index}`}><td>{index + 1}</td><td>{fmtPct(point.return)}</td><td>{fmtPct(point.risk)}</td><td>{Number.isFinite(point.sharpe) ? fmtNum(point.sharpe) : '—'}</td><td>{Number.isFinite(point.avgCorrelation) ? fmtNum(point.avgCorrelation, 2) : '—'}</td><td className="weights-cell" title={point.fullWeightLabel}>{point.weightLabel}</td></tr>)}</tbody></table>
              ) : (
                <table className="results-table"><thead><tr><th>#</th><th>Return</th><th>Risk</th><th>Sharpe</th><th>Assets / weights</th></tr></thead><tbody>{currentAlternatives.map((point, index) => <tr key={`${point.return}-${point.risk}-${index}`}><td>{index + 1}</td><td>{fmtPct(point.return)}</td><td>{fmtPct(point.risk)}</td><td>{Number.isFinite(point.sharpe) ? fmtNum(point.sharpe) : '—'}</td><td className="weights-cell" title={point.fullWeightLabel}>{point.weightLabel}</td></tr>)}</tbody></table>
              )}
            </div>
          </details>
        ) : null}

        <div className="footer">Source · {datasetMetadata.datasetName} · sampled optimization for client-side interactivity</div>
      </div>
    </div>
  );
};

export default EfficientFrontierApp;
