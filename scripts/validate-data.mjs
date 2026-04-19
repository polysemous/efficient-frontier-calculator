import fs from 'fs';
import path from 'path';

const datasetDir = path.join('data', '2025-usd');
const metadataPath = path.join(datasetDir, 'metadata.json');
const assetsPath = path.join(datasetDir, 'assets.json');
const assetOrderPath = path.join(datasetDir, 'asset-order.json');
const correlationRowsPath = path.join(datasetDir, 'correlation-rows.txt');

const requiredFiles = [metadataPath, assetsPath, assetOrderPath, correlationRowsPath];
for (const filePath of requiredFiles) {
  if (!fs.existsSync(filePath)) {
    console.error(`Missing required file: ${filePath}`);
    process.exit(1);
  }
}

const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
const assets = JSON.parse(fs.readFileSync(assetsPath, 'utf8'));
const assetOrder = JSON.parse(fs.readFileSync(assetOrderPath, 'utf8'));
const correlationRows = fs
  .readFileSync(correlationRowsPath, 'utf8')
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

if (!metadata.datasetId || !metadata.assumptionVintage || !metadata.currency) {
  console.error('Invalid metadata.json: required fields missing');
  process.exit(1);
}

const assetNames = Object.keys(assets);
if (assetNames.length === 0) {
  console.error('assets.json does not contain any assets');
  process.exit(1);
}

if (!Array.isArray(assetOrder) || assetOrder.length !== assetNames.length) {
  console.error('asset-order.json must be an array matching the asset count');
  process.exit(1);
}

if (correlationRows.length !== assetOrder.length) {
  console.error(
    `correlation-rows.txt row count mismatch: expected ${assetOrder.length}, got ${correlationRows.length}`
  );
  process.exit(1);
}

for (let index = 0; index < correlationRows.length; index += 1) {
  const expectedAsset = assetOrder[index];
  const row = correlationRows[index];

  if (row.assetName !== expectedAsset) {
    console.error(
      `Correlation row order mismatch at ${index}: expected ${expectedAsset}, got ${row.assetName}`
    );
    process.exit(1);
  }

  if (row.values.length !== index + 1) {
    console.error(
      `Correlation row length mismatch for ${row.assetName}: expected ${index + 1}, got ${row.values.length}`
    );
    process.exit(1);
  }

  const diagonal = row.values[row.values.length - 1];
  if (Math.abs(diagonal - 1) > 1e-9) {
    console.error(`Correlation diagonal must be 1.00 for ${row.assetName}`);
    process.exit(1);
  }
}

console.log(`Data validation passed for ${assetNames.length} assets with full correlation coverage`);
