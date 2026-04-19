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

const defaultSelection = ['U.S. Large Cap', 'U.S. Aggregate Bonds', 'Gold'];
const assetNames = Object.keys(assetData).sort((a, b) => a.localeCompare(b));
const riskBucketSize = 0.1;
const defaultRiskFreeRate = assetData['U.S. Cash']?.compoundReturn2024 ?? 3.1;

const slotColors = ['#34d399', '#22d3ee', '#f4c35a'];

const getDisplayedReturn = (assetName) => assetData[assetName].compoundReturn2024;
const getDisplayedVolatility = (assetName) => assetData[assetName].volatility;

const buildCorrelationMatrix = () => {
  const rows = correlationRowsText
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [assetName, valuesText] = line.split('|');
      return {
        assetName,
        values: valuesText.split(',').map((value) => Number(value))
      };
    });

  const rowLookup = new Map(rows.map((row) => [row.assetName, row.values]));
  const matrix = {};

  assetOrder.forEach((assetName, assetIndex) => {
    const values = rowLookup.get(assetName);
    if (!values) throw new Error(`Missing correlation row for ${assetName}`);
    if (values.length !== assetIndex + 1) {
      throw new Error(
        `Correlation row length mismatch for ${assetName}: expected ${assetIndex + 1}, got ${values.length}`
      );
    }
    matrix[assetName] = matrix[assetName] ?? {};
    values.forEach((value, valueIndex) => {
      const otherAsset = assetOrder[valueIndex];
      matrix[assetName][otherAsset] = value;
      matrix[otherAsset] = matrix[otherAsset] ?? {};
      matrix[otherAsset][assetName] = value;
    });
  });

  return matrix;
};

const correlationMatrix = buildCorrelationMatrix();

const fmtPct = (n, d = 2) => `${n.toFixed(d)}%`;
const fmtNum = (n, d = 3) => n.toFixed(d);

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
      {point.weightLabel ? (
        <div className="tooltip-weights">{point.weightLabel}</div>
      ) : null}
    </div>
  );
};

const SharpeShape = (props) => {
  const { cx, cy } = props;
  if (cx == null || cy == null) return null;
  return (
    <g>
      <circle cx={cx} cy={cy} r={14} fill="#f4c35a" opacity={0.18} />
      <circle cx={cx} cy={cy} r={8} fill="#f4c35a" opacity={0.35} />
      <circle cx={cx} cy={cy} r={4.5} fill="#fde8a6" stroke="#f4c35a" strokeWidth={1.5} />
    </g>
  );
};

const MinVarShape = (props) => {
  const { cx, cy } = props;
  if (cx == null || cy == null) return null;
  return (
    <g>
      <circle cx={cx} cy={cy} r={10} fill="#c084fc" opacity={0.18} />
      <rect
        x={cx - 4.5}
        y={cy - 4.5}
        width={9}
        height={9}
        transform={`rotate(45 ${cx} ${cy})`}
        fill="#f5f7ff"
        stroke="#c084fc"
        strokeWidth={1.6}
      />
    </g>
  );
};

const SelectedAssetShape = (props) => {
  const { cx, cy, payload } = props;
  if (cx == null || cy == null) return null;
  const color = payload?.color ?? '#f87171';
  return (
    <g>
      <circle cx={cx} cy={cy} r={10} fill={color} opacity={0.14} />
      <rect
        x={cx - 5}
        y={cy - 5}
        width={10}
        height={10}
        transform={`rotate(45 ${cx} ${cy})`}
        fill={color}
        stroke="#0b1020"
        strokeWidth={1.2}
      />
    </g>
  );
};

const FrontierDot = (props) => {
  const { cx, cy } = props;
  if (cx == null || cy == null) return null;
  return <circle cx={cx} cy={cy} r={3} fill="#34d399" stroke="#0b1020" strokeWidth={1} />;
};

const CloudDot = (props) => {
  const { cx, cy } = props;
  if (cx == null || cy == null) return null;
  return <circle cx={cx} cy={cy} r={2.2} fill="#3b4a7a" opacity={0.55} />;
};

const RiskFreeShape = (props) => {
  const { cx, cy } = props;
  if (cx == null || cy == null) return null;
  return (
    <g>
      <circle cx={cx} cy={cy} r={8} fill="#0b1020" stroke="#f5f7ff" strokeWidth={1.6} />
      <circle cx={cx} cy={cy} r={3} fill="#f5f7ff" />
    </g>
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
      {segments.map((seg, i) => {
        const len = (seg.value / 100) * circumference;
        const dashArray = `${len} ${circumference - len}`;
        const el = (
          <circle
            key={i}
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke={seg.color}
            strokeWidth={stroke}
            strokeDasharray={dashArray}
            strokeDashoffset={-offset}
            strokeLinecap="butt"
            transform={`rotate(-90 ${cx} ${cy})`}
          />
        );
        offset += len;
        return el;
      })}
      <text x={cx} y={cy - 2} textAnchor="middle" className="donut-center">
        {centerTop}
      </text>
      <text x={cx} y={cy + 14} textAnchor="middle" className="donut-center-small">
        {centerBottom}
      </text>
    </svg>
  );
};

const EfficientFrontierApp = () => {
  const [selected, setSelected] = useState(defaultSelection);
  const [riskFreeRate, setRiskFreeRate] = useState(defaultRiskFreeRate.toFixed(2));

  const parsedRiskFreeRate = Number(riskFreeRate);
  const riskFreeRateValue = Number.isFinite(parsedRiskFreeRate) ? parsedRiskFreeRate : defaultRiskFreeRate;

  const getCorr = (a, b) => {
    if (a === b) return 1;
    const value = correlationMatrix[a]?.[b];
    if (typeof value !== 'number' || Number.isNaN(value)) {
      throw new Error(`Missing correlation: ${a} vs ${b}`);
    }
    return value;
  };

  const portfolioAnalysis = useMemo(() => {
    const cloud = [];
    const riskFreeDecimal = riskFreeRateValue / 100;

    for (let w1 = 0; w1 <= 1; w1 += 0.05) {
      for (let w2 = 0; w2 <= 1 - w1; w2 += 0.05) {
        const weights = [w1, w2, 1 - w1 - w2];
        const returns = selected.map((n) => getDisplayedReturn(n) / 100);
        const vols = selected.map((n) => getDisplayedVolatility(n) / 100);

        const portfolioReturn = weights.reduce((s, w, i) => s + w * returns[i], 0);
        let variance = 0;
        for (let i = 0; i < 3; i += 1) {
          for (let j = 0; j < 3; j += 1) {
            variance += weights[i] * weights[j] * vols[i] * vols[j] * getCorr(selected[i], selected[j]);
          }
        }
        const risk = Math.sqrt(variance);
        const sharpe = risk > 0 ? (portfolioReturn - riskFreeDecimal) / risk : Number.NEGATIVE_INFINITY;

        const weightPct = weights.map((v) => Math.round(v * 100));
        cloud.push({
          return: portfolioReturn * 100,
          risk: risk * 100,
          sharpe,
          weights: weightPct,
          label: 'Portfolio',
          weightLabel: selected.map((name, i) => `${name}: ${weightPct[i]}%`).join(' · ')
        });
      }
    }

    const sortedByRisk = [...cloud].sort((a, b) =>
      a.risk === b.risk ? b.return - a.return : a.risk - b.risk
    );

    const bucketMap = new Map();
    for (const p of sortedByRisk) {
      const bucket = Math.round(p.risk / riskBucketSize);
      const current = bucketMap.get(bucket);
      if (!current || p.return > current.return) bucketMap.set(bucket, p);
    }
    const orderedBuckets = [...bucketMap.entries()].sort((a, b) => a[0] - b[0]).map(([, p]) => p);

    let best = -Infinity;
    const frontier = [];
    for (const p of orderedBuckets) {
      if (p.return > best) {
        frontier.push({ ...p, label: 'Efficient frontier' });
        best = p.return;
      }
    }

    const minVariance = sortedByRisk[0] ? [{ ...sortedByRisk[0], label: 'Minimum variance portfolio' }] : [];
    const maxSharpePoint = [...cloud].sort((a, b) => b.sharpe - a.sharpe)[0];
    const maxSharpe = maxSharpePoint ? [{ ...maxSharpePoint, label: 'Maximum Sharpe portfolio' }] : [];

    return { cloud, frontier, minVariance, maxSharpe };
  }, [riskFreeRateValue, selected]);

  const selectedAssets = selected.map((name, i) => ({
    name,
    return: getDisplayedReturn(name),
    risk: getDisplayedVolatility(name),
    label: name,
    color: slotColors[i]
  }));

  const ms = portfolioAnalysis.maxSharpe[0];
  const mv = portfolioAnalysis.minVariance[0];
  const frontierReturns = portfolioAnalysis.frontier.map((p) => p.return);
  const frontierLow = frontierReturns.length ? Math.min(...frontierReturns) : 0;
  const frontierHigh = frontierReturns.length ? Math.max(...frontierReturns) : 0;

  const basePoints = [
    ...portfolioAnalysis.cloud,
    ...selectedAssets.map((s) => ({ risk: s.risk, return: s.return })),
    { risk: 0, return: riskFreeRateValue }
  ];
  const baseXs = basePoints.map((p) => p.risk);
  const baseYs = basePoints.map((p) => p.return);
  const xMin = 0;
  const xMax = Math.ceil(Math.max(...baseXs) + 1);

  const capitalMarketLine = ms && ms.risk > 0
    ? [
        {
          risk: 0,
          return: riskFreeRateValue,
          label: 'Risk-free rate',
          sharpe: null
        },
        {
          risk: xMax,
          return: riskFreeRateValue + ((ms.return - riskFreeRateValue) / ms.risk) * xMax,
          label: 'Capital Market Line',
          sharpe: ms.sharpe
        }
      ]
    : [];

  const allYs = [
    ...baseYs,
    ...capitalMarketLine.map((p) => p.return)
  ];
  const yMin = Math.floor(Math.min(...allYs) - 0.5);
  const yMax = Math.ceil(Math.max(...allYs) + 0.5);

  const pairs = [
    [0, 1],
    [0, 2],
    [1, 2]
  ];

  const donutSegments = (point) =>
    selected.map((name, i) => ({
      name,
      value: point.weights[i],
      color: slotColors[i]
    }));

  return (
    <div className="app-shell">
      <div className="container">
        <div className="brand-row">
          <div className="brand">
            <div className="brand-mark" />
            <div className="brand-text">
              <div className="brand-title">Portfolio Lab</div>
              <div className="brand-sub">Efficient Frontier · MPT</div>
            </div>
          </div>
          <div className="header-meta">
            <span className="header-dot" />
            <span>
              {datasetMetadata.datasetName} · {datasetMetadata.currency} · Vintage {datasetMetadata.assumptionVintage}
            </span>
          </div>
        </div>

        <div className="hero">
          <div>
            <h1 className="hero-title">
              Explore the <span className="accent">efficient frontier</span>.
            </h1>
            <p className="hero-sub">
              A visual lab for three-asset portfolio construction. Pick your asset classes,
              calibrate the risk-free rate, and see the mathematically optimal risk/return
              trade-offs unfold in real time — grounded in J.P. Morgan&apos;s long-term capital
              market assumptions.
            </p>
          </div>

          <div className="kpi-grid">
            <div className="kpi" style={{ '--kpi-accent': 'var(--accent-3)' }}>
              <div className="kpi-label">Max Sharpe</div>
              <div className="kpi-value">{ms ? fmtNum(ms.sharpe) : '—'}</div>
              <div className="kpi-delta">{ms ? `${fmtPct(ms.return)} @ ${fmtPct(ms.risk)} risk` : ''}</div>
            </div>
            <div className="kpi" style={{ '--kpi-accent': 'var(--accent-4)' }}>
              <div className="kpi-label">Min Variance</div>
              <div className="kpi-value">{mv ? fmtPct(mv.risk) : '—'}</div>
              <div className="kpi-delta">{mv ? `${fmtPct(mv.return)} expected return` : ''}</div>
            </div>
            <div className="kpi" style={{ '--kpi-accent': 'var(--accent)' }}>
              <div className="kpi-label">Frontier Range</div>
              <div className="kpi-value">
                {frontierReturns.length ? `${fmtPct(frontierLow, 1)} – ${fmtPct(frontierHigh, 1)}` : '—'}
              </div>
              <div className="kpi-delta">across {portfolioAnalysis.frontier.length} optimal points</div>
            </div>
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">
            <h2 className="panel-title">Asset selection</h2>
            <div className="header-meta" style={{ fontSize: 10 }}>
              3-asset weight grid · 5% increments · {portfolioAnalysis.cloud.length} portfolios
            </div>
          </div>
          <div className="controls-grid">
            {[0, 1, 2].map((index) => (
              <div key={index} className="asset-card" data-slot={index}>
                <span className="slot-pill">SLOT {index + 1}</span>
                <div className="asset-label">Asset</div>
                <div className="asset-select-wrap">
                  <select
                    className="asset-select"
                    value={selected[index]}
                    onChange={(e) => {
                      const next = [...selected];
                      next[index] = e.target.value;
                      setSelected(next);
                    }}
                  >
                    {assetNames.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="asset-stats">
                  <div className="stat">
                    <span className="stat-label">Return</span>
                    <span className="stat-value">{fmtPct(getDisplayedReturn(selected[index]))}</span>
                  </div>
                  <div className="stat">
                    <span className="stat-label">Vol</span>
                    <span className="stat-value">{fmtPct(getDisplayedVolatility(selected[index]))}</span>
                  </div>
                </div>
              </div>
            ))}

            <div className="rf-card">
              <div className="asset-label">Risk-free rate</div>
              <div className="rf-input-row">
                <input
                  className="rf-input"
                  type="number"
                  step="0.01"
                  value={riskFreeRate}
                  onChange={(e) => setRiskFreeRate(e.target.value)}
                />
                <span className="rf-suffix">%</span>
              </div>
              <div className="rf-hint">
                Default U.S. Cash · {defaultRiskFreeRate.toFixed(2)}%
              </div>
            </div>
          </div>
        </div>

        <div className="chart-panel">
          <div className="chart-header">
            <h2 className="panel-title">Risk / return surface</h2>
            <div className="chart-legend">
              <span className="legend-item"><span className="legend-dot cloud" /> Feasible cloud</span>
              <span className="legend-item"><span className="legend-dot frontier" /> Efficient frontier</span>
              <span className="legend-item"><span className="legend-dot cml" /> Capital Market Line</span>
              <span className="legend-item"><span className="legend-dot sharpe" /> Max Sharpe</span>
              <span className="legend-item"><span className="legend-dot minvar" /> Min variance</span>
              <span className="legend-item"><span className="legend-dot asset" /> Selected assets</span>
            </div>
          </div>

          <ResponsiveContainer width="100%" height={480}>
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
              <XAxis
                type="number"
                dataKey="risk"
                domain={[xMin, xMax]}
                tickFormatter={(v) => `${v}%`}
                stroke="rgba(148,163,205,0.4)"
                tickLine={false}
              >
                <Label value="RISK (σ)" position="insideBottom" offset={-18} className="recharts-label" />
              </XAxis>
              <YAxis
                type="number"
                dataKey="return"
                domain={[yMin, yMax]}
                tickFormatter={(v) => `${v}%`}
                stroke="rgba(148,163,205,0.4)"
                tickLine={false}
              >
                <Label value="RETURN" angle={-90} position="insideLeft" offset={10} className="recharts-label" />
              </YAxis>
              <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'rgba(148,163,205,0.25)', strokeDasharray: '2 3' }} />
              <Scatter name="Portfolio cloud" data={portfolioAnalysis.cloud} shape={<CloudDot />} />
              <Scatter
                name="Efficient frontier"
                data={portfolioAnalysis.frontier}
                shape={<FrontierDot />}
                line={{ stroke: 'url(#frontierLine)', strokeWidth: 2.5 }}
                lineType="joint"
              />
              <Scatter
                name="Capital Market Line"
                data={capitalMarketLine}
                line={{ stroke: 'url(#cmlLine)', strokeWidth: 2, strokeDasharray: '6 4' }}
                lineType="joint"
              />
              <Scatter name="Risk-free rate" data={capitalMarketLine.slice(0, 1)} shape={<RiskFreeShape />} />
              <Scatter name="Minimum variance" data={portfolioAnalysis.minVariance} shape={<MinVarShape />} />
              <Scatter name="Maximum Sharpe" data={portfolioAnalysis.maxSharpe} shape={<SharpeShape />} />
              <Scatter name="Selected assets" data={selectedAssets} shape={<SelectedAssetShape />} />
            </ScatterChart>
          </ResponsiveContainer>
        </div>

        <div className="insight-grid">
          <div className="insight-card">
            <h3 className="insight-title">Pairwise correlations</h3>
            {pairs.map(([a, b]) => {
              const rho = getCorr(selected[a], selected[b]);
              const pct = Math.abs(rho) * 100;
              const neg = rho < 0;
              return (
                <div className="corr-row" key={`${a}-${b}`}>
                  <div className="corr-pair">
                    <span style={{ color: slotColors[a] }}>■</span> {selected[a]}
                    <br />
                    <span style={{ color: slotColors[b] }}>■</span> {selected[b]}
                  </div>
                  <div className="corr-bar">
                    <div
                      className={`corr-bar-fill ${neg ? 'neg' : ''}`}
                      style={{
                        width: `${pct / 2}%`,
                        left: neg ? `${50 - pct / 2}%` : '50%'
                      }}
                    />
                  </div>
                  <div className="corr-value">{rho.toFixed(2)}</div>
                </div>
              );
            })}
          </div>

          <div className="insight-card">
            <h3 className="insight-title">Max Sharpe allocation</h3>
            {ms ? (
              <>
                <div className="donut-wrap">
                  <Donut segments={donutSegments(ms)} centerTop={fmtNum(ms.sharpe)} centerBottom="SHARPE" />
                  <div className="donut-legend">
                    {selected.map((name, i) => (
                      <div className="donut-legend-row" key={name}>
                        <span className="legend-swatch" style={{ background: slotColors[i] }} />
                        <span className="name">{name}</span>
                        <span className="pct">{ms.weights[i]}%</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="insight-metrics">
                  <div className="stat">
                    <span className="stat-label">Return</span>
                    <span className="stat-value">{fmtPct(ms.return)}</span>
                  </div>
                  <div className="stat">
                    <span className="stat-label">Risk</span>
                    <span className="stat-value">{fmtPct(ms.risk)}</span>
                  </div>
                  <div className="stat">
                    <span className="stat-label">RF</span>
                    <span className="stat-value">{fmtPct(riskFreeRateValue)}</span>
                  </div>
                </div>
              </>
            ) : null}
          </div>

          <div className="insight-card">
            <h3 className="insight-title">Capital Market Line</h3>
            {ms ? (
              <>
                <div className="donut-wrap">
                  <Donut
                    segments={donutSegments(ms)}
                    centerTop={fmtPct(riskFreeRateValue, 1)}
                    centerBottom="RF"
                  />
                  <div className="donut-legend">
                    <div className="donut-legend-row">
                      <span className="legend-swatch" style={{ background: '#f5f7ff' }} />
                      <span className="name">Intercept</span>
                      <span className="pct">{fmtPct(riskFreeRateValue)}</span>
                    </div>
                    <div className="donut-legend-row">
                      <span className="legend-swatch" style={{ background: '#f4c35a' }} />
                      <span className="name">Tangency point</span>
                      <span className="pct">{fmtPct(ms.return)} @ {fmtPct(ms.risk)}</span>
                    </div>
                    <div className="donut-legend-row">
                      <span className="legend-swatch" style={{ background: '#22d3ee' }} />
                      <span className="name">Slope</span>
                      <span className="pct">{fmtNum(ms.sharpe)}</span>
                    </div>
                  </div>
                </div>
                <div className="insight-metrics">
                  <div className="stat">
                    <span className="stat-label">Interpretation</span>
                    <span className="stat-value">Best risk-adjusted line</span>
                  </div>
                  <div className="stat">
                    <span className="stat-label">Tangency</span>
                    <span className="stat-value">Max Sharpe</span>
                  </div>
                </div>
              </>
            ) : null}
          </div>
        </div>

        <div className="footer">
          Source · J.P. Morgan Asset Management · 2025 Long-Term Capital Market Assumptions · U.S. dollar assumptions · as of September 30, 2024
        </div>
      </div>
    </div>
  );
};

export default EfficientFrontierApp;
