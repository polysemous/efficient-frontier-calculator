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

const sampleSubset = (items, subsetSize, random, requiredPool = []) => {
  const uniqueRequired = [...new Set(requiredPool)].filter((item) => items.includes(item));
  const subset = [];
  const pool = [...items];

  if (uniqueRequired.length > 0) {
    const forced = uniqueRequired[Math.floor(random() * uniqueRequired.length)];
    subset.push(forced);
    pool.splice(pool.indexOf(forced), 1);
  }

  while (subset.length < subsetSize && pool.length > 0) {
    const index = Math.floor(random() * pool.length);
    subset.push(pool[index]);
    pool.splice(index, 1);
  }

  return subset;
};

const canonicalPortfolioKey = (selectedAssets, weights) => {
  return selectedAssets
    .map((assetName, index) => ({ assetName, weight: weights[index] }))
    .sort((a, b) => a.assetName.localeCompare(b.assetName))
    .map(({ assetName, weight }) => `${assetName}:${weight.toFixed(4)}`)
    .join('|');
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

const getReturnField = (asset) => {
  if (typeof asset.expectedReturn === 'number') return asset.expectedReturn;
  if (typeof asset.annualizedReturn === 'number') return asset.annualizedReturn;
  return asset.compoundReturn2024;
};

const averagePairwiseCorrelation = (selectedAssets, correlationMatrix) => {
  if (selectedAssets.length <= 1) return 0;
  let total = 0;
  let pairs = 0;
  for (let i = 0; i < selectedAssets.length; i += 1) {
    for (let j = i + 1; j < selectedAssets.length; j += 1) {
      const corr = correlationMatrix[selectedAssets[i]]?.[selectedAssets[j]];
      if (typeof corr !== 'number' || Number.isNaN(corr)) {
        throw new Error(`Missing correlation: ${selectedAssets[i]} vs ${selectedAssets[j]}`);
      }
      total += corr;
      pairs += 1;
    }
  }
  return pairs > 0 ? total / pairs : 0;
};

const diversificationRatio = (weights, vols, portfolioVolatility) => {
  if (portfolioVolatility <= 0) return 0;
  const weightedAverageVol = weights.reduce((sum, weight, index) => sum + weight * vols[index], 0);
  return weightedAverageVol / portfolioVolatility;
};

const evaluatePortfolio = (weights, selectedAssets, assetData, correlationMatrix, riskFreeRate) => {
  const returns = selectedAssets.map((assetName) => getReturnField(assetData[assetName]) / 100);
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
  const avgCorrelation = averagePairwiseCorrelation(selectedAssets, correlationMatrix);
  const divRatio = diversificationRatio(weights, vols, risk);

  return {
    return: portfolioReturn * 100,
    risk: risk * 100,
    sharpe,
    avgCorrelation,
    diversificationRatio: divRatio,
    weights,
    weightPct,
    selectedAssets,
    weightLabel: compactWeightLabel(selectedAssets, weightPct),
    fullWeightLabel
  };
};

const portfolioMeetsConstraints = ({
  selectedAssets,
  weights,
  correlationMatrix,
  minAssetsInPortfolio = 1,
  maxWeightPerAsset = 1,
  maxAverageCorrelation = 1
}) => {
  if (selectedAssets.length < minAssetsInPortfolio) return false;
  if (weights.some((weight) => weight > maxWeightPerAsset + 1e-9)) return false;
  if (selectedAssets.length > 1 && averagePairwiseCorrelation(selectedAssets, correlationMatrix) > maxAverageCorrelation + 1e-9) {
    return false;
  }
  return true;
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

export const generateSparsePortfolioSet = ({
  candidateAssets,
  maxAssetsInPortfolio,
  minAssetsInPortfolio = 1,
  maxWeightPerAsset = 1,
  maxAverageCorrelation = 1,
  assetData,
  correlationMatrix,
  riskFreeRate,
  sampleCount,
  requiredAssetsPool = []
}) => {
  if (candidateAssets.length === 0) return [];

  const normalizedMaxAssets = Number.isFinite(maxAssetsInPortfolio)
    ? Math.max(1, Math.floor(maxAssetsInPortfolio))
    : candidateAssets.length;
  const normalizedMinAssets = Number.isFinite(minAssetsInPortfolio)
    ? Math.max(1, Math.floor(minAssetsInPortfolio))
    : 1;
  const normalizedMaxWeight = Number.isFinite(maxWeightPerAsset)
    ? Math.max(0.1, Math.min(maxWeightPerAsset, 1))
    : 1;
  const normalizedMaxAverageCorrelation = Number.isFinite(maxAverageCorrelation)
    ? Math.max(-1, Math.min(maxAverageCorrelation, 1))
    : 1;

  const minSize = Math.max(1, Math.min(normalizedMinAssets, candidateAssets.length, normalizedMaxAssets));
  const maxSize = Math.max(minSize, Math.min(normalizedMaxAssets, candidateAssets.length));
  const random = createSeededRandom(
    `${candidateAssets.join('|')}|${riskFreeRate}|${sampleCount}|${minSize}|${maxSize}|${requiredAssetsPool.join('|')}|${normalizedMaxWeight}|${normalizedMaxAverageCorrelation}|sparse`
  );
  const portfolios = [];
  const seen = new Set();

  const addPortfolio = (selectedAssets, weights) => {
    if (!portfolioMeetsConstraints({
      selectedAssets,
      weights,
      correlationMatrix,
      minAssetsInPortfolio: minSize,
      maxWeightPerAsset: normalizedMaxWeight,
      maxAverageCorrelation: normalizedMaxAverageCorrelation
    })) {
      return;
    }

    const key = canonicalPortfolioKey(selectedAssets, weights);
    if (seen.has(key)) return;
    seen.add(key);
    portfolios.push(
      evaluatePortfolio(weights, selectedAssets, assetData, correlationMatrix, riskFreeRate)
    );
  };

  for (let i = minSize; i <= Math.min(candidateAssets.length, maxSize); i += 1) {
    addPortfolio(candidateAssets.slice(0, i), Array(i).fill(1 / i));
  }

  if (minSize <= 2 && candidateAssets.length >= 2) {
    for (let a = 0; a < candidateAssets.length; a += 1) {
      for (let b = a + 1; b < candidateAssets.length; b += 1) {
        for (let step = 0; step <= 10; step += 1) {
          addPortfolio([candidateAssets[a], candidateAssets[b]], [step / 10, 1 - step / 10]);
        }
      }
    }
  }

  for (let i = 0; i < sampleCount; i += 1) {
    const subsetSize = minSize === maxSize
      ? minSize
      : minSize + Math.floor(random() * (maxSize - minSize + 1));
    const subsetAssets = sampleSubset(candidateAssets, subsetSize, random, requiredAssetsPool);
    addPortfolio(subsetAssets, randomWeights(subsetAssets.length, random));
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

export const chooseAdvisorSampleCount = (assetCount, maxAssetsInPortfolio) => {
  if (assetCount <= 12 && maxAssetsInPortfolio <= 4) return 2800;
  if (assetCount <= 18 && maxAssetsInPortfolio <= 6) return 3600;
  return 4200;
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

/**
 * Resolve the single efficient portfolio for a target. MPT gives us one answer
 * per target, not a ranked list. Returns both the primary pick and a status code
 * that callers can use to render honest feasibility copy.
 *
 * Status values:
 *   - 'no-target'           : target is empty / not a number. Nothing to show.
 *   - 'empty'               : portfolio set is empty (e.g. constraints eliminate everything).
 *   - 'on-frontier'         : a feasible portfolio exists; returning the min-risk / max-return point.
 *   - 'above-max-return'    : (required-return mode) target exceeds the frontier max. Returning max-return portfolio.
 *   - 'below-min-variance'  : (max-risk mode) risk budget is below the min-variance floor. Returning min-var portfolio.
 */
export const findPrimaryPortfolio = ({ portfolios, mode, targetValue }) => {
  const normalizedTarget = typeof targetValue === 'string' ? targetValue.trim() : `${targetValue ?? ''}`.trim();
  if (!normalizedTarget) {
    return { primary: null, status: 'no-target', target: null, frontierMax: null, frontierMinRisk: null };
  }
  const target = Number(normalizedTarget);
  if (!Number.isFinite(target)) {
    return { primary: null, status: 'no-target', target: null, frontierMax: null, frontierMinRisk: null };
  }
  if (!portfolios || portfolios.length === 0) {
    return { primary: null, status: 'empty', target, frontierMax: null, frontierMinRisk: null };
  }

  // Frontier max/min-risk are used for feasibility badges regardless of mode.
  const maxReturnPoint = [...portfolios].sort((a, b) => b.return - a.return)[0];
  const minRiskPoint = [...portfolios].sort((a, b) => a.risk - b.risk)[0];

  if (mode === 'requiredReturn') {
    const feasible = portfolios
      .filter((point) => point.return >= target)
      .sort((a, b) => (a.risk === b.risk ? b.return - a.return : a.risk - b.risk));

    if (feasible.length === 0) {
      return {
        primary: maxReturnPoint,
        status: 'above-max-return',
        target,
        frontierMax: maxReturnPoint?.return ?? null,
        frontierMinRisk: minRiskPoint?.risk ?? null
      };
    }

    return {
      primary: feasible[0],
      status: 'on-frontier',
      target,
      frontierMax: maxReturnPoint?.return ?? null,
      frontierMinRisk: minRiskPoint?.risk ?? null
    };
  }

  // Max-risk mode.
  const feasible = portfolios
    .filter((point) => point.risk <= target)
    .sort((a, b) => (a.return === b.return ? a.risk - b.risk : b.return - a.return));

  if (feasible.length === 0) {
    return {
      primary: minRiskPoint,
      status: 'below-min-variance',
      target,
      frontierMax: maxReturnPoint?.return ?? null,
      frontierMinRisk: minRiskPoint?.risk ?? null
    };
  }

  return {
    primary: feasible[0],
    status: 'on-frontier',
    target,
    frontierMax: maxReturnPoint?.return ?? null,
    frontierMinRisk: minRiskPoint?.risk ?? null
  };
};

/**
 * Portfolios that are within `tolerance` percentage points of the primary on
 * both the return and risk axes. Useful for implementation flexibility
 * (rounder weights, avoiding extreme corner solutions) without pretending the
 * frontier has multiple "correct" answers.
 *
 * Excludes the primary itself (by canonical key) and dedupes near-identical
 * weight mixes so the list shows genuinely distinct alternatives.
 */
export const findAlternatives = ({ primary, portfolios, tolerance = 0.25, limit = 5 }) => {
  if (!primary || !portfolios || portfolios.length === 0) return [];
  const primaryKey = canonicalPortfolioKey(primary.selectedAssets, primary.weights);

  const seenWeightSignatures = new Set([primary.weightPct.join('|')]);
  const withinTolerance = portfolios
    .filter((point) => {
      if (canonicalPortfolioKey(point.selectedAssets, point.weights) === primaryKey) return false;
      if (Math.abs(point.return - primary.return) > tolerance) return false;
      if (Math.abs(point.risk - primary.risk) > tolerance) return false;
      return true;
    })
    // Prefer higher Sharpe, then closer to primary on both axes.
    .sort((a, b) => {
      if (b.sharpe !== a.sharpe) return b.sharpe - a.sharpe;
      const distA = Math.hypot(a.return - primary.return, a.risk - primary.risk);
      const distB = Math.hypot(b.return - primary.return, b.risk - primary.risk);
      return distA - distB;
    });

  const alternatives = [];
  for (const candidate of withinTolerance) {
    const sig = candidate.weightPct.join('|');
    if (seenWeightSignatures.has(sig)) continue;
    seenWeightSignatures.add(sig);
    alternatives.push(candidate);
    if (alternatives.length >= limit) break;
  }
  return alternatives;
};
