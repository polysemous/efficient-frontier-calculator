# Efficient Frontier Calculator

A React-based application for exploring portfolio optimization using Modern Portfolio Theory and the 2026 J.P. Morgan Long-Term Capital Market Assumptions.

## Live App

Use the hosted version here:

- [https://frontier.madsen7.com](https://frontier.madsen7.com)

## What It Does

The app now focuses on two workflows:

- **Build My Own**: choose your own asset basket and optimize within that set
- **Choose for Me**: let the app recommend portfolios from the LTCMA universe using advisor-style constraints

Both workflows work entirely in the frontend using the built-in LTCMA dataset.

## About This App

This app is a hands-on way to explore Modern Portfolio Theory (MPT), which focuses on building portfolios that balance expected return and risk through diversification rather than evaluating assets one by one.

It also reflects ideas associated with William F. Sharpe, including risk-adjusted return. Sharpe is known for the Sharpe ratio and shared the 1990 Sveriges Riksbank Prize in Economic Sciences in Memory of Alfred Nobel for pioneering work in financial economics.

The efficient frontier is the set of portfolios that offers the best expected return for each level of risk. This app helps users visualize that frontier, compare portfolio mixes, and see how changing assets or assumptions affects portfolio outcomes.

Useful references:

- William F. Sharpe Nobel biography: https://www.nobelprize.org/prizes/economic-sciences/1990/sharpe/facts/
- 1990 Nobel economics prize summary: https://www.nobelprize.org/prizes/economic-sciences/1990/summary/

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Run the app locally

```bash
npm run dev
```

### 3. Build for production

```bash
npm run build
```

### 4. Preview the production build

```bash
npm run preview
```

## Existing Features

- Efficient frontier visualization
- Build-your-own LTCMA portfolio mode
- Advisor-driven LTCMA portfolio mode
- Target-return and max-risk portfolio finder
- Visual chart legend with technical and plain-language explanations

## Data Source

J.P. Morgan Asset Management, 2026 Long-Term Capital Market Assumptions (U.S. dollar assumptions, as of September 30, 2025)
