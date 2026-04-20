# Source Data Provenance

This project is based on public source material from **J.P. Morgan Asset Management**.

## Primary source
**2026 Long-Term Capital Market Assumptions**  
30th annual edition  
J.P. Morgan Asset Management

### Relevant sections for this app
- **Assumption matrix: U.S. dollar**
- **2026 estimates and correlations**
- Includes expected return, volatility, and correlation assumptions across fixed income, equities, and alternatives.

## Source timing
The report's assumptions are stated **as of September 30, 2025**.

## Repository policy
The source PDFs used to build this prototype were reviewed during development, but the report files themselves are **not committed into this public repository**.

Instead, this repository documents:
- the report title and edition
- the relevant section used for the app
- the source date / assumption vintage
- implementation caveats where the app does not yet fully reproduce the source matrix

## Current implementation status
At present, the application:
- uses the structured `data/2026-usd` dataset derived from the report's U.S. dollar matrix
- uses the report's full triangular correlation matrix
- optimizes portfolios with arithmetic 2026 return assumptions when available
- still estimates the frontier from sampled portfolios rather than solving the exact frontier envelope
