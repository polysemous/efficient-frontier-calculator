import fs from 'fs';

const metadata = JSON.parse(fs.readFileSync('data/2025-usd/metadata.json'));

if (!metadata.datasetId || !metadata.assumptionVintage) {
  console.error('Invalid metadata.json');
  process.exit(1);
}

console.log('Data validation passed');
