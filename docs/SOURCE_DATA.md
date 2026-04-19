# Source Data Provenance

This project is based on public source material from **J.P. Morgan Asset Management**.

## Primary source
**2025 Long-Term Capital Market Assumptions**  
29th annual edition  
J.P. Morgan Asset Management

### Relevant sections for this app
- **Assumption matrix: U.S. dollar**
- **2025 estimates and correlations**
- Includes expected return, volatility, and correlation assumptions across fixed income, equities, and alternatives.

## Source timing
The report's assumptions are stated **as of September 30, 2024**.

## Repository policy
The source PDFs used to build this prototype were reviewed during development, but the report files themselves are **not committed into this public repository**.

Instead, this repository documents:
- the report title and edition
- the relevant section used for the app
- the source date / assumption vintage
- implementation caveats where the app does not yet fully reproduce the source matrix

## Current implementation status
At present, the application:
- uses hardcoded return and volatility assumptions for a subset of USD-denominated asset classes
- uses only a partial set of pairwise correlations
- does not yet ingest the complete U.S. dollar matrix from the report
- does not yet compute the true efficient frontier envelope

## Recommended next step
Convert the U.S. dollar assumption matrix into structured application data, such as:
- `data/assets.json`
- `data/correlations.json`

That would allow the app to reproduce the source assumptions more faithfully and support real portfolio analytics rather than placeholder correlations.
