import React, { useState, useMemo } from 'react';
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const EfficientFrontierApp = () => {
  const assetData = {
    'AC World Equity': { return: 7.1, volatility: 16.71 },
    'Commercial Mortgage Loans': { return: 6.4, volatility: 7.69 },
    Commodities: { return: 3.8, volatility: 18.1 },
    'Direct Lending': { return: 8.2, volatility: 13.6 },
    'Diversified Hedge Funds': { return: 4.9, volatility: 5.8 },
    'Event Driven Hedge Funds': { return: 4.9, volatility: 8.5 },
    'Global Core Infrastructure': { return: 6.3, volatility: 11.01 },
    'Global Core Transport': { return: 7.8, volatility: 13.54 },
    'Global Timberland': { return: 5.3, volatility: 10.14 },
    Gold: { return: 4.0, volatility: 16.76 },
    'Long Bias Hedge Funds': { return: 5.0, volatility: 11.2 },
    'Macro Hedge Funds': { return: 3.8, volatility: 7.0 },
    'Private Equity': { return: 9.9, volatility: 19.62 },
    'Relative Value Hedge Funds': { return: 5.0, volatility: 5.6 },
    TIPS: { return: 4.1, volatility: 5.78 },
    'U.S. Aggregate Bonds': { return: 4.6, volatility: 4.52 },
    'U.S. Cash': { return: 3.1, volatility: 0.65 },
    'U.S. Core Real Estate': { return: 8.1, volatility: 11.32 },
    'U.S. Equity Dividend Yield Factor': { return: 7.7, volatility: 16.24 },
    'U.S. Equity Minimum Volatility Factor': { return: 7.0, volatility: 12.99 },
    'U.S. Equity Momentum Factor': { return: 7.6, volatility: 16.74 },
    'U.S. Equity Quality Factor': { return: 6.7, volatility: 14.89 },
    'U.S. Equity Value Factor': { return: 7.7, volatility: 17.52 },
    'U.S. High Yield Bonds': { return: 6.1, volatility: 8.52 },
    'U.S. Intermediate Treasuries': { return: 3.8, volatility: 3.34 },
    'U.S. Inv Grade Corporate Bonds': { return: 5.0, volatility: 7.28 },
    'U.S. Large Cap': { return: 6.7, volatility: 16.26 },
    'U.S. Leveraged Loans': { return: 6.6, volatility: 7.8 },
    'U.S. Long Corporate Bonds': { return: 4.9, volatility: 12.08 },
    'U.S. Long Duration Government/Credit': { return: 4.7, volatility: 11.19 },
    'U.S. Long Treasuries': { return: 4.3, volatility: 12.83 },
    'U.S. Mid Cap': { return: 7.0, volatility: 18.3 },
    'U.S. Muni 1-15 Yr Blend': { return: 3.6, volatility: 4.04 },
    'U.S. Muni High Yield': { return: 4.7, volatility: 8.61 },
    'U.S. REITs': { return: 8.0, volatility: 17.22 },
    'U.S. Securitized': { return: 4.9, volatility: 3.82 },
    'U.S. Short Duration Government/Credit': { return: 3.9, volatility: 1.55 },
    'U.S. Small Cap': { return: 6.9, volatility: 20.73 },
    'U.S. Value-Added Real Estate': { return: 10.1, volatility: 19.11 },
    'Venture Capital': { return: 8.8, volatility: 22.08 }
  };

  const correlationData = {
    'AC World Equity': { 'U.S. Aggregate Bonds': 0.29, 'U.S. Large Cap': 0.96, Gold: 0.11 },
    'U.S. Large Cap': { 'U.S. Aggregate Bonds': 0.26, Gold: 0.04 },
    'U.S. Aggregate Bonds': { Gold: 0.39 }
  };

  const [selected, setSelected] = useState(['U.S. Large Cap', 'U.S. Aggregate Bonds', 'Gold']);

  const getCorr = (a, b) => {
    if (a === b) return 1;
    return correlationData[a]?.[b] || correlationData[b]?.[a] || 0.3;
  };

  const portfolios = useMemo(() => {
    const pts = [];
    for (let w1 = 0; w1 <= 1; w1 += 0.05) {
      for (let w2 = 0; w2 <= 1 - w1; w2 += 0.05) {
        const w = [w1, w2, 1 - w1 - w2];
        const r = selected.map((a) => assetData[a].return / 100);
        const v = selected.map((a) => assetData[a].volatility / 100);

        const ret = w.reduce((s, wi, i) => s + wi * r[i], 0);
        let var2 = 0;
        for (let i = 0; i < 3; i += 1) {
          for (let j = 0; j < 3; j += 1) {
            var2 += w[i] * w[j] * v[i] * v[j] * getCorr(selected[i], selected[j]);
          }
        }

        pts.push({
          return: ret * 100,
          risk: Math.sqrt(var2) * 100,
          weights: w.map((x) => Math.round(x * 100))
        });
      }
    }
    return pts;
  }, [selected]);

  const assets = selected.map((n) => ({
    name: n,
    return: assetData[n].return,
    risk: assetData[n].volatility
  }));

  return (
    <div className="min-h-screen w-full bg-slate-50 p-4">
      <div className="mx-auto max-w-6xl rounded-lg bg-white p-6 shadow">
        <h1 className="mb-6 text-center text-2xl font-bold">Efficient Frontier</h1>

        <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i}>
              <label className="mb-1 block text-sm font-medium">Asset {i + 1}</label>
              <select
                value={selected[i]}
                onChange={(e) => {
                  const next = [...selected];
                  next[i] = e.target.value;
                  setSelected(next);
                }}
                className="w-full rounded border p-2"
              >
                {Object.keys(assetData).map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
              <div className="mt-1 text-xs text-gray-600">
                Return: {assetData[selected[i]].return}% | Vol: {assetData[selected[i]].volatility}%
              </div>
            </div>
          ))}
        </div>

        <ResponsiveContainer width="100%" height={400}>
          <ScatterChart margin={{ top: 20, right: 20, bottom: 40, left: 40 }}>
            <CartesianGrid />
            <XAxis type="number" dataKey="risk" label={{ value: 'Risk %', position: 'bottom' }} />
            <YAxis
              type="number"
              dataKey="return"
              label={{ value: 'Return %', angle: -90, position: 'left' }}
            />
            <Tooltip />
            <Legend />
            <Scatter name="Portfolios" data={portfolios} fill="#3b82f6" />
            <Scatter name="Assets" data={assets} fill="#ef4444" shape="triangle" size={80} />
          </ScatterChart>
        </ResponsiveContainer>

        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="rounded border p-4">
            <h3 className="mb-2 font-semibold">Correlations</h3>
            <div className="space-y-1 text-sm">
              <div>
                {selected[0]} vs {selected[1]}: {getCorr(selected[0], selected[1]).toFixed(2)}
              </div>
              <div>
                {selected[0]} vs {selected[2]}: {getCorr(selected[0], selected[2]).toFixed(2)}
              </div>
              <div>
                {selected[1]} vs {selected[2]}: {getCorr(selected[1], selected[2]).toFixed(2)}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EfficientFrontierApp;
