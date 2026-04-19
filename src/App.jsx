import React, { useMemo, useState } from 'react';
import {
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import assetData from '../data/2025-usd/assets.json';
import assetOrder from '../data/2025-usd/asset-order.json';
import datasetMetadata from '../data/2025-usd/metadata.json';
import correlationRowsText from '../data/2025-usd/correlation-rows.txt?raw';

const defaultSelection = ['U.S. Large Cap', 'U.S. Aggregate Bonds', 'Gold'];
const assetNames = Object.keys(assetData).sort((a, b) => a.localeCompare(b));

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
    if (!values) {
      throw new Error(`Missing correlation row for ${assetName}`);
    }

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

const EfficientFrontierApp = () => {
  const [selected, setSelected] = useState(defaultSelection);

  const getCorr = (a, b) => {
    if (a === b) return 1;
    const value = correlationMatrix[a]?.[b];
    if (typeof value !== 'number' || Number.isNaN(value)) {
      throw new Error(`Missing correlation: ${a} vs ${b}`);
    }
    return value;
  };

  const portfolios = useMemo(() => {
    const points = [];

    for (let w1 = 0; w1 <= 1; w1 += 0.05) {
      for (let w2 = 0; w2 <= 1 - w1; w2 += 0.05) {
        const weights = [w1, w2, 1 - w1 - w2];
        const returns = selected.map((assetName) => getDisplayedReturn(assetName) / 100);
        const volatilities = selected.map((assetName) => getDisplayedVolatility(assetName) / 100);

        const portfolioReturn = weights.reduce(
          (sum, weight, index) => sum + weight * returns[index],
          0
        );

        let variance = 0;
        for (let i = 0; i < 3; i += 1) {
          for (let j = 0; j < 3; j += 1) {
            variance +=
              weights[i] *
              weights[j] *
              volatilities[i] *
              volatilities[j] *
              getCorr(selected[i], selected[j]);
          }
        }

        points.push({
          return: portfolioReturn * 100,
          risk: Math.sqrt(variance) * 100,
          weights: weights.map((value) => Math.round(value * 100))
        });
      }
    }

    return points;
  }, [selected]);

  const selectedAssets = selected.map((assetName) => ({
    name: assetName,
    return: getDisplayedReturn(assetName),
    risk: getDisplayedVolatility(assetName)
  }));

  return (
    <div className="min-h-screen w-full bg-slate-50 p-4">
      <div className="mx-auto max-w-6xl rounded-lg bg-white p-6 shadow">
        <h1 className="mb-2 text-center text-2xl font-bold">Efficient Frontier Calculator</h1>
        <p className="mb-2 text-center text-sm text-slate-600">
          Dataset: {datasetMetadata.datasetName} ({datasetMetadata.currency}) · Vintage:{' '}
          {datasetMetadata.assumptionVintage}
        </p>
        <p className="mb-6 text-center text-xs text-slate-500">
          Full U.S. dollar correlation matrix loaded from versioned LTCMA source data.
        </p>

        <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
          {[0, 1, 2].map((index) => (
            <div key={index}>
              <label className="mb-1 block text-sm font-medium">Asset {index + 1}</label>
              <select
                value={selected[index]}
                onChange={(event) => {
                  const next = [...selected];
                  next[index] = event.target.value;
                  setSelected(next);
                }}
                className="w-full rounded border p-2"
              >
                {assetNames.map((assetName) => (
                  <option key={assetName} value={assetName}>
                    {assetName}
                  </option>
                ))}
              </select>
              <div className="mt-1 text-xs text-gray-600">
                Return: {getDisplayedReturn(selected[index]).toFixed(2)}% | Vol:{' '}
                {getDisplayedVolatility(selected[index]).toFixed(2)}%
              </div>
            </div>
          ))}
        </div>

        <ResponsiveContainer width="100%" height={420}>
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
            <Scatter name="Selected assets" data={selectedAssets} fill="#ef4444" shape="triangle" />
          </ScatterChart>
        </ResponsiveContainer>

        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="rounded border p-4">
            <h3 className="mb-2 font-semibold">Current correlation inputs</h3>
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

          <div className="rounded border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
            <h3 className="mb-2 font-semibold">Implementation status</h3>
            <p>
              Asset returns, volatilities, and pairwise correlations now come from the checked-in
              2025 USD LTCMA dataset. The app no longer uses the placeholder 0.30 correlation
              fallback.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EfficientFrontierApp;
