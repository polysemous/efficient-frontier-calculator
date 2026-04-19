import React, { useMemo, useState } from 'react';
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
import datasetMetadata from '../data/2025-usd/metadata.json';
import correlationRowsText from '../data/2025-usd/correlation-rows.txt?raw';
import {
  buildCorrelationMatrix,
  chooseSampleCount,
  extractEfficientFrontier,
  findPortfolioSolutions,
  generatePortfolioSet
} from './lib/portfolioMath';

const allAssetNames = Object.keys(assetData).sort((a, b) => a.localeCompare(b));
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
].filter((name) => allAssetNames.includes(name));
const defaultRiskFreeRate = assetData['U.S. Cash']?.compoundReturn2024 ?? 3.1;
const slotColors = ['#34d399', '#22d3ee', '#f4c35a', '#c084fc', '#f87171', '#60a5fa', '#f97316', '#a3e635', '#f472b6', '#93c5fd'];
const getDisplayedReturn = (assetName) => assetData[assetName].compoundReturn2024;
const getDisplayedVolatility = (assetName) => assetData[assetName].volatility;

const correlationMatrix = buildCorrelationMatrix(assetOrder, correlationRowsText);

const fmtPct = (n, d = 2) => `${n.toFixed(d)}%`;
const fmtNum = (n, d = 3) => n.toFixed(d);

const buildInitialSelection = (count) => {
  const seed = [];
  for (const candidate of [...preferredDefaults, ...allAssetNames]) {
    if (!seed.includes(candidate)) seed.push(candidate);
    if (seed.length === count) break;
  }
  return seed;
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
      {point.weightLabel ? <div className="tooltip-weights">{point.weightLabel}</div> : null}
    </div>
  );
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

const FrontierDot = ({ cx, cy }) => {
  if (cx == null || cy == null) return null;
  return <circle cx={cx} cy={cy} r={3} fill="#34d399" stroke="#0b1020" strokeWidth={1} />;
};

const CloudDot = ({ cx, cy }) => {
  if (cx == null || cy == null) return null;
  return <circle cx={cx} cy={cy} r={2.1} fill="#3b4a7a" opacity={0.45} />;
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
  const [assetCount, setAssetCount] = useState(3);
  const [selected, setSelected] = useState(buildInitialSelection(3));
  const [riskFreeRate, setRiskFreeRate] = useState(defaultRiskFreeRate.toFixed(2));
  const [finderMode, setFinderMode] = useState('requiredReturn');
  const [finderTarget, setFinderTarget] = useState('8.00');

  const parsedRiskFreeRate = Number(riskFreeRate);
  const riskFreeRateValue = Number.isFinite(parsedRiskFreeRate) ? parsedRiskFreeRate : defaultRiskFreeRate;

  const handleAssetCountChange = (nextCount) => {
    const safeCount = Math.max(2, Math.min(10, nextCount));
    setAssetCount(safeCount);
    setSelected((previous) => {
      const next = previous.slice(0, safeCount);
      for (const candidate of [...preferredDefaults, ...allAssetNames]) {
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

  const analysis = useMemo(() => {
    const activeAssets = selected.slice(0, assetCount);
    const sampleCount = chooseSampleCount(activeAssets.length);
    const portfolios = generatePortfolioSet({
      selectedAssets: activeAssets,
      assetData,
      correlationMatrix,
      riskFreeRate: riskFreeRateValue,
      sampleCount
    });

    const frontier = extractEfficientFrontier(portfolios);
    const sortedByRisk = [...portfolios].sort((a, b) => (a.risk === b.risk ? b.return - a.return : a.risk - b.risk));
    const minVariance = sortedByRisk[0] ? [{ ...sortedByRisk[0], label: 'Minimum variance portfolio' }] : [];
    const maxSharpePoint = [...portfolios].sort((a, b) => b.sharpe - a.sharpe)[0];
    const maxSharpe = maxSharpePoint ? [{ ...maxSharpePoint, label: 'Maximum Sharpe portfolio' }] : [];
    const solutions = findPortfolioSolutions({
      portfolios,
      mode: finderMode,
      targetValue: finderTarget,
      limit: 10
    });
    const finderResult = solutions.feasible[0] ?? solutions.fallback[0] ?? null;

    return {
      activeAssets,
      sampleCount,
      portfolios,
      frontier,
      minVariance,
      maxSharpe,
      finderResult,
      feasibleSolutions: solutions.feasible,
      fallbackSolutions: solutions.fallback
    };
  }, [assetCount, finderMode, finderTarget, riskFreeRateValue, selected]);

  const ms = analysis.maxSharpe[0];
  const mv = analysis.minVariance[0];
  const recommendation = analysis.finderResult;
  const visibleSolutions = analysis.feasibleSolutions.length > 0 ? analysis.feasibleSolutions : analysis.fallbackSolutions;
  const frontierReturns = analysis.frontier.map((point) => point.return);
  const frontierLow = frontierReturns.length ? Math.min(...frontierReturns) : 0;
  const frontierHigh = frontierReturns.length ? Math.max(...frontierReturns) : 0;

  const selectedAssets = analysis.activeAssets.map((name, index) => ({
    name,
    return: getDisplayedReturn(name),
    risk: getDisplayedVolatility(name),
    label: name,
    color: slotColors[index % slotColors.length]
  }));

  const basePoints = [
    ...analysis.portfolios,
    ...selectedAssets.map((point) => ({ risk: point.risk, return: point.return })),
    { risk: 0, return: riskFreeRateValue },
    ...(recommendation ? [recommendation] : [])
  ];
  const xMin = 0;
  const xMax = Math.ceil(Math.max(...basePoints.map((point) => point.risk)) + 1);

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
  const yMin = Math.floor(Math.min(...allYs) - 0.5);
  const yMax = Math.ceil(Math.max(...allYs) + 0.5);

  const recommendationPoint = recommendation ? [{ ...recommendation, label: analysis.feasibleSolutions.length ? 'Suggested portfolio' : 'Nearest portfolio' }] : [];

  const donutSegments = (point) =>
    analysis.activeAssets.map((name, index) => ({
      name,
      value: point.weightPct[index],
      color: slotColors[index % slotColors.length]
    }));

  return (
    <div className="app-shell">
      <div className="container">
        <div className="brand-row">
          <div className="brand">
            <div className="brand-mark" />
            <div className="brand-text">
              <div className="brand-title">Portfolio Lab</div>
              <div className="brand-sub">Dynamic Asset Optimizer</div>
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
              Build a <span className="accent">cleaner frontier</span> with up to 10 assets.
            </h1>
            <p className="hero-sub">
              Choose how many assets to include, then let the app search sampled portfolio mixes to find the best recommendations for a required return or an accepted risk limit.
            </p>
          </div>

          <div className="kpi-grid">
            <div className="kpi" style={{ '--kpi-accent': 'var(--accent-2)' }}>
              <div className="kpi-label">Assets in play</div>
              <div className="kpi-value">{analysis.activeAssets.length}</div>
              <div className="kpi-delta">up to 10 slots</div>
            </div>
            <div className="kpi" style={{ '--kpi-accent': 'var(--accent-3)' }}>
              <div className="kpi-label">Sampled portfolios</div>
              <div className="kpi-value">{analysis.portfolios.length}</div>
              <div className="kpi-delta">Monte Carlo + anchors</div>
            </div>
            <div className="kpi" style={{ '--kpi-accent': 'var(--accent)' }}>
              <div className="kpi-label">Finder mode</div>
              <div className="kpi-value">{finderMode === 'requiredReturn' ? 'Return' : 'Risk'}</div>
              <div className="kpi-delta">{analysis.feasibleSolutions.length} feasible candidates</div>
            </div>
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">
            <h2 className="panel-title">Asset universe</h2>
            <div className="header-meta" style={{ fontSize: 10 }}>
              dynamic selectors · no duplicate assets · live optimization
            </div>
          </div>

          <div className="toolbar-row">
            <div className="count-stepper">
              <span className="asset-label">Assets to include</span>
              <div className="stepper-controls">
                <button className="stepper-button" onClick={() => handleAssetCountChange(assetCount - 1)} disabled={assetCount <= 2}>−</button>
                <span className="stepper-value">{assetCount}</span>
                <button className="stepper-button" onClick={() => handleAssetCountChange(assetCount + 1)} disabled={assetCount >= 10}>+</button>
              </div>
            </div>

            <div className="rf-card compact">
              <div className="asset-label">Risk-free rate</div>
              <div className="rf-input-row">
                <input className="rf-input" type="number" step="0.01" value={riskFreeRate} onChange={(e) => setRiskFreeRate(e.target.value)} />
                <span className="rf-suffix">%</span>
              </div>
              <div className="rf-hint">Default U.S. Cash · {defaultRiskFreeRate.toFixed(2)}%</div>
            </div>
          </div>

          <div className="dynamic-asset-grid">
            {analysis.activeAssets.map((assetName, index) => (
              <div key={`${index}-${assetName}`} className="asset-card" data-slot={index % slotColors.length}>
                <span className="slot-pill">ASSET {index + 1}</span>
                <div className="asset-label">Selection</div>
                <div className="asset-select-wrap">
                  <select
                    className="asset-select"
                    value={assetName}
                    onChange={(event) => handleAssetSelection(index, event.target.value)}
                  >
                    {allAssetNames
                      .filter((name) => name === assetName || !analysis.activeAssets.includes(name))
                      .map((name) => (
                        <option key={name} value={name}>{name}</option>
                      ))}
                  </select>
                </div>
                <div className="asset-stats">
                  <div className="stat">
                    <span className="stat-label">Return</span>
                    <span className="stat-value">{fmtPct(getDisplayedReturn(assetName))}</span>
                  </div>
                  <div className="stat">
                    <span className="stat-label">Vol</span>
                    <span className="stat-value">{fmtPct(getDisplayedVolatility(assetName))}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="finder-grid">
          <div className="panel finder-panel">
            <div className="panel-header">
              <h2 className="panel-title">Portfolio finder</h2>
              <div className={`status-pill ${analysis.feasibleSolutions.length ? 'success' : 'warning'}`}>
                {analysis.feasibleSolutions.length ? 'feasible solutions found' : 'showing nearest matches'}
              </div>
            </div>

            <div className="mode-toggle">
              <button className={`mode-button ${finderMode === 'requiredReturn' ? 'active' : ''}`} onClick={() => setFinderMode('requiredReturn')}>
                Required return
              </button>
              <button className={`mode-button ${finderMode === 'maxRisk' ? 'active' : ''}`} onClick={() => setFinderMode('maxRisk')}>
                Maximum risk
              </button>
            </div>

            <div className="finder-input-row">
              <div className="rf-card compact full-width">
                <div className="asset-label">{finderMode === 'requiredReturn' ? 'Target return' : 'Risk ceiling'}</div>
                <div className="rf-input-row">
                  <input className="rf-input" type="number" step="0.10" value={finderTarget} onChange={(event) => setFinderTarget(event.target.value)} />
                  <span className="rf-suffix">%</span>
                </div>
                <div className="rf-hint">
                  {finderMode === 'requiredReturn'
                    ? 'Find the lowest-risk mixes that meet or exceed this return.'
                    : 'Find the highest-return mixes that stay within this risk.'}
                </div>
              </div>
            </div>

            <div className="finder-summary">
              <div className="summary-chip">Frontier range {frontierReturns.length ? `${fmtPct(frontierLow, 1)} – ${fmtPct(frontierHigh, 1)}` : '—'}</div>
              <div className="summary-chip">Max Sharpe {ms ? fmtNum(ms.sharpe) : '—'}</div>
              <div className="summary-chip">Min variance {mv ? fmtPct(mv.risk, 1) : '—'}</div>
            </div>
          </div>

          <div className="panel recommendation-panel">
            <div className="panel-header">
              <h2 className="panel-title">Suggested portfolio</h2>
              <div className="header-meta" style={{ fontSize: 10 }}>
                {analysis.feasibleSolutions.length ? 'best exact fit' : 'closest available fit'}
              </div>
            </div>
            {recommendation ? (
              <>
                <div className="donut-wrap">
                  <Donut segments={donutSegments(recommendation)} centerTop={finderMode === 'requiredReturn' ? fmtPct(recommendation.risk, 1) : fmtPct(recommendation.return, 1)} centerBottom={finderMode === 'requiredReturn' ? 'RISK' : 'RETURN'} />
                  <div className="donut-legend">
                    {analysis.activeAssets.map((name, index) => (
                      <div className="donut-legend-row" key={name}>
                        <span className="legend-swatch" style={{ background: slotColors[index % slotColors.length] }} />
                        <span className="name">{name}</span>
                        <span className="pct">{recommendation.weightPct[index]}%</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="insight-metrics">
                  <div className="stat"><span className="stat-label">Return</span><span className="stat-value">{fmtPct(recommendation.return)}</span></div>
                  <div className="stat"><span className="stat-label">Risk</span><span className="stat-value">{fmtPct(recommendation.risk)}</span></div>
                  <div className="stat"><span className="stat-label">Sharpe</span><span className="stat-value">{Number.isFinite(recommendation.sharpe) ? fmtNum(recommendation.sharpe) : '—'}</span></div>
                </div>
              </>
            ) : (
              <div className="empty-state">Enter a target to evaluate candidate portfolios.</div>
            )}
          </div>
        </div>

        <div className="chart-panel">
          <div className="chart-header">
            <h2 className="panel-title">Efficient frontier + recommendation</h2>
            <div className="chart-legend">
              <span className="legend-item"><span className="legend-dot cloud" /> Sampled cloud</span>
              <span className="legend-item"><span className="legend-dot frontier" /> Frontier</span>
              <span className="legend-item"><span className="legend-dot cml" /> CML</span>
              <span className="legend-item"><span className="legend-dot sharpe" /> Max Sharpe</span>
              <span className="legend-item"><span className="legend-dot minvar" /> Min variance</span>
              <span className="legend-item"><span className="legend-dot finder" /> Finder result</span>
              <span className="legend-item"><span className="legend-dot asset" /> Selected assets</span>
            </div>
          </div>

          <ResponsiveContainer width="100%" height={520}>
            <ScatterChart margin={{ top: 20, right: 30, bottom: 50, left: 50 }}>
              <defs>
                <linearGradient id="frontierLine" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#22d3ee" />
                  <stop offset="55%" stopColor="#34d399" />
                  <stop offset="100%" stopColor="#f4c35a" />
                </linearGradient>
                <linearGradient id="cmlLine" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#f5f7ff" />
                  <stop offset="100%" stopColor="#f4c35a" />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="2 4" stroke="rgba(148,163,205,0.14)" />
              <XAxis type="number" dataKey="risk" domain={[xMin, xMax]} tickFormatter={(value) => `${value}%`} stroke="rgba(148,163,205,0.4)" tickLine={false}>
                <Label value="RISK (σ)" position="insideBottom" offset={-18} className="recharts-label" />
              </XAxis>
              <YAxis type="number" dataKey="return" domain={[yMin, yMax]} tickFormatter={(value) => `${value}%`} stroke="rgba(148,163,205,0.4)" tickLine={false}>
                <Label value="RETURN" angle={-90} position="insideLeft" offset={10} className="recharts-label" />
              </YAxis>
              <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'rgba(148,163,205,0.25)', strokeDasharray: '2 3' }} />
              <Scatter name="Sampled cloud" data={analysis.portfolios} shape={<CloudDot />} />
              <Scatter name="Efficient frontier" data={analysis.frontier.map((point) => ({ ...point, label: 'Efficient frontier' }))} shape={<FrontierDot />} line={{ stroke: 'url(#frontierLine)', strokeWidth: 2.5 }} lineType="joint" />
              <Scatter name="Capital Market Line" data={capitalMarketLine} line={{ stroke: 'url(#cmlLine)', strokeWidth: 2, strokeDasharray: '6 4' }} lineType="joint" />
              <Scatter name="Risk-free rate" data={capitalMarketLine.slice(0, 1)} shape={<RiskFreeShape />} />
              <Scatter name="Minimum variance" data={analysis.minVariance} shape={<MinVarShape />} />
              <Scatter name="Maximum Sharpe" data={analysis.maxSharpe} shape={<SharpeShape />} />
              <Scatter name="Finder result" data={recommendationPoint} shape={<FinderShape />} />
              <Scatter name="Selected assets" data={selectedAssets} shape={<SelectedAssetShape />} />
            </ScatterChart>
          </ResponsiveContainer>
        </div>

        <div className="panel">
          <div className="panel-header">
            <h2 className="panel-title">Top candidate mixes</h2>
            <div className="header-meta" style={{ fontSize: 10 }}>
              {finderMode === 'requiredReturn' ? 'sorted by lowest risk' : 'sorted by highest return'} · top 10
            </div>
          </div>
          <div className="table-wrap">
            <table className="results-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Return</th>
                  <th>Risk</th>
                  <th>Sharpe</th>
                  <th>Weights</th>
                </tr>
              </thead>
              <tbody>
                {visibleSolutions.length > 0 ? (
                  visibleSolutions.map((point, index) => (
                    <tr key={`${point.return}-${point.risk}-${index}`} className={index === 0 ? 'active-row' : ''}>
                      <td>{index + 1}</td>
                      <td>{fmtPct(point.return)}</td>
                      <td>{fmtPct(point.risk)}</td>
                      <td>{Number.isFinite(point.sharpe) ? fmtNum(point.sharpe) : '—'}</td>
                      <td className="weights-cell">{point.weightLabel}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="empty-state">No portfolios available for the current settings.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="footer">
          Source · J.P. Morgan Asset Management · 2025 Long-Term Capital Market Assumptions · U.S. dollar assumptions · as of September 30, 2024 · sampled optimization for client-side interactivity
        </div>
      </div>
    </div>
  );
};

export default EfficientFrontierApp;
