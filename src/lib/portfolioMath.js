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

// (unchanged helpers omitted for brevity in this patch)

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

  let maxReturnPoint = portfolios[0];
  let minRiskPoint = portfolios[0];
  let bestFeasible = null;

  for (const p of portfolios) {
    if (p.return > maxReturnPoint.return) maxReturnPoint = p;
    if (p.risk < minRiskPoint.risk) minRiskPoint = p;

    if (mode === 'requiredReturn') {
      if (p.return >= target) {
        if (!bestFeasible || p.risk < bestFeasible.risk || (p.risk === bestFeasible.risk && p.return > bestFeasible.return)) {
          bestFeasible = p;
        }
      }
    } else {
      if (p.risk <= target) {
        if (!bestFeasible || p.return > bestFeasible.return || (p.return === bestFeasible.return && p.risk < bestFeasible.risk)) {
          bestFeasible = p;
        }
      }
    }
  }

  if (mode === 'requiredReturn') {
    if (!bestFeasible) {
      return {
        primary: maxReturnPoint,
        status: 'above-max-return',
        target,
        frontierMax: maxReturnPoint.return,
        frontierMinRisk: minRiskPoint.risk
      };
    }

    return {
      primary: bestFeasible,
      status: 'on-frontier',
      target,
      frontierMax: maxReturnPoint.return,
      frontierMinRisk: minRiskPoint.risk
    };
  }

  if (!bestFeasible) {
    return {
      primary: minRiskPoint,
      status: 'below-min-variance',
      target,
      frontierMax: maxReturnPoint.return,
      frontierMinRisk: minRiskPoint.risk
    };
  }

  return {
    primary: bestFeasible,
    status: 'on-frontier',
    target,
    frontierMax: maxReturnPoint.return,
    frontierMinRisk: minRiskPoint.risk
  };
};