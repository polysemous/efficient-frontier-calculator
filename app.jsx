import React, { useState, useMemo } from 'react';
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const EfficientFrontierApp = () => {
  const assetData = {
    "AC World Equity": { return: 7.10, volatility: 16.71 },
    "Commercial Mortgage Loans": { return: 6.40, volatility: 7.69 },
    "Commodities": { return: 3.80, volatility: 18.10 },
    "Direct Lending": { return: 8.20, volatility: 13.60 },
    "Diversified Hedge Funds": { return: 4.90, volatility: 5.80 },
    "Event Driven Hedge Funds": { return: 4.90, volatility: 8.50 },
    "Global Core Infrastructure": { return: 6.30, volatility: 11.01 },
    "Global Core Transport": { return: 7.80, volatility: 13.54 },
    "Global Timberland": { return: 5.30, volatility: 10.14 },
    "Gold": { return: 4.00, volatility: 16.76 },
    "Long Bias Hedge Funds": { return: 5.00, volatility: 11.20 },
    "Macro Hedge Funds": { return: 3.80, volatility: 7.00 },
    "Private Equity": { return: 9.90, volatility: 19.62 },
    "Relative Value Hedge Funds": { return: 5.00, volatility: 5.60 },
    "TIPS": { return: 4.10, volatility: 5.78 },
    "U.S. Aggregate Bonds": { return: 4.60, volatility: 4.52 },
    "U.S. Cash": { return: 3.10, volatility: 0.65 },
    "U.S. Core Real Estate": { return: 8.10, volatility: 11.32 },
    "U.S. Equity Dividend Yield Factor": { return: 7.70, volatility: 16.24 },
    "U.S. Equity Minimum Volatility Factor": { return: 7.00, volatility: 12.99 },
    "U.S. Equity Momentum Factor": { return: 7.60, volatility: 16.74 },
    "U.S. Equity Quality Factor": { return: 6.70, volatility: 14.89 },
    "U.S. Equity Value Factor": { return: 7.70, volatility: 17.52 },
    "U.S. High Yield Bonds": { return: 6.10, volatility: 8.52 },
    "U.S. Intermediate Treasuries": { return: 3.80, volatility: 3.34 },
    "U.S. Inv Grade Corporate Bonds": { return: 5.00, volatility: 7.28 },
    "U.S. Large Cap": { return: 6.70, volatility: 16.26 },
    "U.S. Leveraged Loans": { return: 6.60, volatility: 7.80 },
    "U.S. Long Corporate Bonds": { return: 4.90, volatility: 12.08 },
    "U.S. Long Duration Government/Credit": { return: 4.70, volatility: 11.19 },
    "U.S. Long Treasuries": { return: 4.30, volatility: 12.83 },
    "U.S. Mid Cap": { return: 7.00, volatility: 18.30 },
    "U.S. Muni 1-15 Yr Blend": { return: 3.60, volatility: 4.04 },
    "U.S. Muni High Yield": { return: 4.70, volatility: 8.61 },
    "U.S. REITs": { return: 8.00, volatility: 17.22 },
    "U.S. Securitized": { return: 4.90, volatility: 3.82 },
    "U.S. Short Duration Government/Credit": { return: 3.90, volatility: 1.55 },
    "U.S. Small Cap": { return: 6.90, volatility: 20.73 },
    "U.S. Value-Added Real Estate": { return: 10.10, volatility: 19.11 },
    "Venture Capital": { return: 8.80, volatility: 22.08 }
  };

  const correlationData = {
    "AC World Equity": { "U.S. Aggregate Bonds": 0.29, "U.S. Large Cap": 0.96, "Gold": 0.11 },
    "U.S. Large Cap": { "U.S. Aggregate Bonds": 0.26, "Gold": 0.04 },
    "U.S. Aggregate Bonds": { "Gold": 0.39 }
  };

  const [selected, setSelected] = useState(["U.S. Large Cap", "U.S. Aggregate Bonds", "Gold"]);

  const getCorr = (a, b) => {
    if (a === b) return 1;
    return correlationData[a]?.[b] || correlationData[b]?.[a] || 0.3;
  };

  const portfolios = useMemo(() => {
    const pts = [];
    for (let w1 = 0; w1 <= 1; w1 += 0.05) {
      for (let w2 = 0; w2 <= 1 - w1; w2 += 0.05) {
        const w = [w1, w2, 1 - w1 - w2];
        const r = selected.map(a => assetData[a].return / 100);
        const v = selected.map(a => assetData[a].volatility / 100);
        
        const ret = w.reduce((s, wi, i) => s + wi * r[i], 0);
        let var2 = 0;
        for (let i = 0; i < 3; i++) {
          for (let j = 0; j < 3; j++) {
            var2 += w[i] * w[j] * v[i] * v[j] * getCorr(selected[i], selected[j]);
          }
        }
        
        pts.push({
          return: ret * 100,
          risk: Math.sqrt(var2) * 100,
          weights: w.map(x => Math.round(x * 100))
        });
      }
    }
    return pts;
  }, [selected]);

  const assets = selected.map(n => ({
    name: n,
    return: assetData[n].return,
    risk: assetData[n].volatility
  }));

  return (
    <div className="w-full p-4 bg-slate-50 min-h-screen">
      <div className="max-w-6xl mx-auto bg-white rounded-lg shadow p-6">
        <h1 className="text-2xl font-bold text-center mb-6">Efficient Frontier</h1>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          {[0, 1, 2].map(i => (
            <div key={i}>
              <label className="block text-sm font-medium mb-1">Asset {i + 1}</label>
              <select
                value={selected[i]}
                onChange={e => {
                  const n = [...selected];
                  n[i] = e.target.value;
                  setSelected(n);
                }}
                className="w-full p-2 border rounded"
              >
                {Object.keys(assetData).map(a => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
              <div className="text-xs text-gray-600 mt-1">
                Return: {assetData[selected[i]].return}% | Vol: {assetData[selected[i]].volatility}%
              </div>
            </div>
          ))}
        </div>

        <ResponsiveContainer width="100%" height={400}>
          <ScatterChart margin={{ top: 20, right: 20, bottom: 40, left: 40 }}>
            <CartesianGrid />
            <XAxis type="number" dataKey="risk" label={{ value: 'Risk %', position: 'bottom' }} />
            <YAxis type="number" dataKey="return" label={{ value: 'Return %', angle: -90, position: 'left' }} />
            <Tooltip />
            <Legend />
            <Scatter name="Portfolios" data={portfolios} fill="#3b82f6" />
            <Scatter name="Assets" data={assets} fill="#ef4444" shape="triangle" size={80} />
          </ScatterChart>
        </ResponsiveContainer>

        <div className="mt-6 grid grid-cols-2 gap-4">
          <div className="border rounded p-4">
            <h3 className="font-semibold mb-2">Correlations</h3>
            <div className="text-sm space-y-1">
              <div>{selected[0]} vs {selected[1]}: {getCorr(selected[0], selected[1]).toFixed(2)}</div>
              <div>{selected[0]} vs {selected[2]}: {getCorr(selected[0], selected[2]).toFixed(2)}</div>
              <div>{selected[1]} vs {selected[2]}: {getCorr(selected[1], selected[2]).toFixed(2)}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EfficientFrontierApp;
