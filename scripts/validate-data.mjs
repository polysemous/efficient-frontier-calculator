import fs from 'fs';
import path from 'path';

const datasetDir = path.join('data', '2025-usd');
const metadataPath = path.join(datasetDir, 'metadata.json');
const assetsPath = path.join(datasetDir, 'assets.json');
const correlationsPath = path.join(datasetDir, 'correlations.json');

const requiredFiles = [metadataPath, assetsPath];
for (const filePath of requiredFiles) {
  if (!fs.existsSync(filePath)) {
    console.error(`Missing required file: ${filePath}`);
    process.exit(1);
  }
}

const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
const assets = JSON.parse(fs.readFileSync(assetsPath, 'utf8'));

if (!metadata.datasetId || !metadata.assumptionVintage || !metadata.currency) {
  console.error('Invalid metadata.json: required fields missing');
  process.exit(1);
}

const assetNames = Object.keys(assets);
if (assetNames.length === 0) {
  console.error('assets.json does not contain any assets');
  process.exit(1);
}

for (const [assetName, values] of Object.entries(assets)) {
  const requiredNumericFields = [
    'arithmeticReturn2025',
    'compoundReturn2024',
    'compoundReturn2025',
    'volatility'
  ];

  for (const field of requiredNumericFields) {
    if (typeof values[field] !== 'number' || Number.isNaN(values[field])) {
      console.error(`Invalid asset entry for ${assetName}: ${field} must be a number`);
      process.exit(1);
    }
  }
}

if (fs.existsSync(correlationsPath)) {
  const correlations = JSON.parse(fs.readFileSync(correlationsPath, 'utf8'));
  if (typeof correlations !== 'object' || correlations === null) {
    console.error('correlations.json must be a JSON object when present');
    process.exit(1);
  }
}

console.log(`Data validation passed for ${assetNames.length} assets`);
