export const buildCorrelationMatrix = (assetOrder, correlationRowsText) => {
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

const hashSeed = (text) => {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

const createSeededRandom = (seedText) => {
  let state = hashSeed(seedText) || 1;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 4294967296;
  };
};

const randomWeights = (count, random) => {
  const raw = Array.from({ length: count }, () => -Math.log(Math.max(random(), 1e-9)));
  const total = raw.reduce((sum, value) => sum + value, 0);
  return raw.map((value) => value / total);
};

const roundWeightsToTenths = (weights) => {
  const rawTenths = weights.map((value) => value * 1000);
  const floored = rawTenths.map((value) => Math.floor(value));
  let remaining = 1000 - floored.reduce((sum, value) => sum + value, 0);

  const remainders = rawTenths
    .map((value, index) => ({ index, remainder: value - floored[index] }))
    .sort((a, b) => b.remainder - a.remainder);

  for (let i = 0; i < remainders.length && remaining > 0; i += 1) {
    floored[remainders[i].index] += 1;
    remaining -= 1;
  }

  return floored.map((value) => value / 10);
};

const compactWeightLabel = (selectedAssets, weightPct) => {
  const entries = selectedAssets.map((assetName, index) => ({ assetName, value: weightPct[index] }));
  const sorted = [...entries].sort((a, b) => b.value - a.value);

  if (entries.length <= 5) {
    return entries.map((entry) => `${entry.assetName}: ${entry.value}%`).join(' · ');
  }

  const top = sorted.slice(0, 4).map((entry) => `${entry.assetName}: ${entry.value}%`).join(' · ');
  return `${top} · +${entries.length - 4} more`;
};

const evaluatePortfolio = (weights, selectedAssets, assetData, correlationMatrix, riskFreeRate) => {
  const returns = selectedAssets.map((assetName) => assetData[assetName].compoundReturn2024 / 100);
  const vols = selectedAssets.map((assetName) => assetData[assetName].volatility / 100);

  const portfolioReturn = weights.reduce((sum, weight, index) => sum + weight * returns[index], 0);

  let variance = 0;
  for (let i = 0; i < selectedAssets.length; i += 1) {
    for (let j = 0; j < selectedAssets.length; j += 1) {
      const corr = i === j ? 1 : correlationMatrix[selectedAssets[i]]?.[selectedAssets[j]];
      if (typeof corr !== 'number' || Number.isNaN(corr)) {
        throw new Error(`Missing correlation: ${selectedAssets[i]} vs ${selectedAssets[j]}`);
      }
      variance += weights[i] * weights[j] * vols[i] * vols[j] * corr;
    }
  }

  const risk = Math.sqrt(Math.max(variance, 0));
  const sharpe = risk > 0 ? (portfolioReturn - riskFreeRate / 100) / risk : Number.NEGATIVE_INFINITY;
  const weightPct = roundWeightsToTenths(weights);
  const fullWeightLabel = selectedAssets.map((assetName, index) => `${assetName}: ${weightPct[index]}%`).join(' · ');

  return {
    return: portfolioReturn * 100,
    risk: risk * 100,
    sharpe,
    weights,
    weightPct,
    weightLabel: compactWeightLabel(selectedAssets, weightPct),
    fullWeightLabel
  };
};

export const generatePortfolioSet = ({
  selectedAssets,
  assetData,
  correlationMatrix,
  riskFreeRate,
  sampleCount
}) => {
  const random = createSeededRandom(
    `${selectedAssets.join('|')}|${riskFreeRate}|${sampleCount}|${selectedAssets.length}`
  );
  const portfolios = [];
  const seen = new Set();

  const addPortfolio = (weights) => {
    const roundedKey = weights.map((value) => value.toFixed(4)).join('|');
    if (seen.has(roundedKey)) return;
    seen.add(roundedKey);
    portfolios.push(
      evaluatePortfolio(weights, selectedAssets, assetData, correlationMatrix, riskFreeRate)
    );
  };

  const count = selectedAssets.length;

  for (let i = 0; i < count; i += 1) {
    const weights = Array(count).fill(0);
    weights[i] = 1;
    addPortfolio(weights);
  }

  addPortfolio(Array(count).fill(1 / count));

  for (let a = 0; a < count; a += 1) {
    for (let b = a + 1; b < count; b += 1) {
      for (let step = 0; step <= 10; step += 1) {
        const weights = Array(count).fill(0);
        weights[a] = step / 10;
        weights[b] = 1 - weights[a];
        addPortfolio(weights);
      }
    }
  }

  for (let i = 0; i < sampleCount; i += 1) {
    addPortfolio(randomWeights(count, random));
  }

  return portfolios;
};

export const extractEfficientFrontier = (portfolios, bucketSize = 0.15) => {
  const sortedByRisk = [...portfolios].sort((a, b) =>
    a.risk === b.risk ? b.return - a.return : a.risk - b.risk
  );

  const bucketMap = new Map();
  for (const point of sortedByRisk) {
    const bucket = Math.round(point.risk / bucketSize);
    const current = bucketMap.get(bucket);
    if (!current || point.return > current.return) bucketMap.set(bucket, point);
  }

  const orderedBuckets = [...bucketMap.entries()].sort((a, b) => a[0] - b[0]).map(([, point]) => point);

  let bestReturn = -Infinity;
  const frontier = [];
  for (const point of orderedBuckets) {
    if (point.return > bestReturn) {
      frontier.push(point);
      bestReturn = point.return;
    }
  }

  return frontier;
};

export const chooseSampleCount = (assetCount) => {
  if (assetCount <= 3) return 2500;
  if (assetCount <= 5) return 4500;
  if (assetCount <= 7) return 6500;
  return 8500;
};

export const findPortfolioSolutions = ({ portfolios, mode, targetValue, limit = 10 }) => {
  const normalizedTarget = typeof targetValue === 'string' ? targetValue.trim() : `${targetValue ?? ''}`.trim();
  if (!normalizedTarget) return { feasible: [], fallback: [] };

  const target = Number(normalizedTarget);
  if (!Number.isFinite(target)) return { feasible: [], fallback: [] };

  if (mode === 'requiredReturn') {
    const feasible = portfolios
      .filter((point) => point.return >= target)
      .sort((a, b) => (a.risk === b.risk ? b.return - a.return : a.risk - b.risk))
      .slice(0, limit);

    const fallback = portfolios
      .filter((point) => point.return < target)
      .sort((a, b) => {
        const shortfallA = target - a.return;
        const shortfallB = target - b.return;
        if (shortfallA === shortfallB) return a.risk - b.risk;
        return shortfallA - shortfallB;
      })
      .slice(0, limit);

    return { feasible, fallback };
  }

  const feasible = portfolios
    .filter((point) => point.risk <= target)
    .sort((a, b) => (a.return === b.return ? a.risk - b.risk : b.return - a.return))
    .slice(0, limit);

  const fallback = portfolios
    .filter((point) => point.risk > target)
    .sort((a, b) => {
      const excessA = a.risk - target;
      const excessB = b.risk - target;
      if (excessA === excessB) return b.return - a.return;
      return excessA - excessB;
    })
    .slice(0, limit);

  return { feasible, fallback };
};
