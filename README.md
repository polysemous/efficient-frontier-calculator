# Efficient Frontier Calculator

A simple React-based application for visualizing a three-asset portfolio opportunity set using Modern Portfolio Theory concepts.

## Features
- Select 3 asset classes
- Visualize risk vs. return
- Compute portfolio combinations across a 3-asset weight grid
- Interactive chart using Recharts

## Tech Stack
- React
- Vite
- Recharts

## Getting Started

```bash
npm install
npm run dev
```

## Data Source
The hardcoded asset assumptions in this prototype were derived from:

J.P. Morgan Asset Management, 2025 Long-Term Capital Market Assumptions  
Section: 2025 Estimates and correlations | U.S. dollar assumptions  
Source date: as of September 30, 2024

See docs/SOURCE_DATA.md for full provenance and implementation notes.

## Important Caveats
- The current app is a prototype and does not yet include the full correlation matrix from the J.P. Morgan report.
- Only a subset of asset classes and pairwise correlations are currently hardcoded.
- For asset pairs not explicitly defined in the app, the code falls back to a placeholder correlation assumption.
- The chart currently displays a cloud of feasible portfolio combinations for three selected assets; it does not yet isolate the mathematically efficient frontier.

## Future Improvements
- Add the full correlation matrix from the source report
- Move source assumptions into structured data files
- Implement true frontier extraction / optimization
- Add Sharpe ratio, minimum-variance, and tangent portfolio views
- Add report citation details and reproducible data-import workflow
