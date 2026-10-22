# Open Equity Research Platform: Complete Financial & Technical Architecture

---

## 1. Executive Summary

The **Open Equity Research Platform** is an institutional-grade, automated equity research and quantitative valuation terminal. It bridges two distinct domains:

1. **Corporate Finance & Quantitative Mechanics**: Automating fundamental Discounted Cash Flow (DCF) modeling, market-implied expectations analysis (Reverse DCF), 5,000-run Monte Carlo probability simulations, historical model backtesting, financial health scoring, and quantitative peer comparability.
2. **Modern Systems Engineering**: Operating a high-performance Next.js 16 full-stack architecture that extracts and standardizes unstructured XBRL data from the SEC EDGAR system, dynamically streams market quotes, enforces SEC-compliant request pacing, runs entirely decoupled from external database downtime, and executes client-side numerical solvers.

---

## 2. The Financial Engine (Corporate Finance & Quantitative Modeling)

### 2.1 Fundamental Discounted Cash Flow (DCF) Mechanics
A Discounted Cash Flow model determines the intrinsic value of a firm based on the present value of its future cash distributions. The engine models three discrete forecast scenarios: **Base Case**, **Bull Case**, and **Bear Case**.

* **Revenue Trajectory**: Projects 5-year revenues based on historical CAGR vectors:
  $$\text{Revenue}_t = \text{Revenue}_{t-1} \times (1 + g_t)$$
* **Net Operating Profit After Tax (NOPAT)**:
  $$\text{EBIT}_t = \text{Revenue}_t \times \text{Operating Margin}$$
  $$\text{NOPAT}_t = \text{EBIT}_t \times (1 - t_{\text{corporate}})$$
* **Unlevered Free Cash Flow (FCFF)**:
  $$\text{FCFF}_t = \text{NOPAT}_t + \text{D\&A}_t - \text{CapEx}_t - \Delta\text{NWC}_t$$
  *Where D&A is baseline-modeled at 3.0% of revenue, CapEx at 4.0% of revenue, and Net Working Capital changes at 5.0% of NWC baseline.*

### 2.2 Cost of Capital (WACC) & Perpetual Terminal Value
* **Capital Asset Pricing Model (CAPM)**: Derives the required return on equity ($K_e$):
  $$K_e = R_f + \beta \times \text{ERP}$$
  *Default Risk-Free Rate ($R_f$) = 4.25% (US 10-Year Treasury benchmark); Equity Risk Premium ($\text{ERP}$) = 5.50%; Beta ($\beta$) is pulled from empirical historical covariance.*
* **Perpetual Terminal Value (Gordon Growth Model)**: Accounts for corporate cash generation in perpetuity beyond Year 5:
  $$TV_5 = \frac{\text{FCFF}_5 \times (1 + g_{\text{terminal}})}{\text{WACC} - g_{\text{terminal}}}$$
* **Enterprise Value (EV) to Equity Bridge**:
  $$\text{EV} = \sum_{t=1}^{5} \frac{\text{FCFF}_t}{(1 + \text{WACC})^t} + \frac{TV_5}{(1 + \text{WACC})^5}$$
  $$\text{Intrinsic Fair Value Per Share} = \frac{\text{EV} - \text{Net Debt}}{\text{Diluted Shares Outstanding}}$$

---

### 2.3 "What Is The Market Pricing In?" Engine (Reverse DCF)
Traditional DCFs output a single subjective price and label a stock "undervalued" or "overvalued." This platform implements an institutional Reverse DCF solver:
* **The Question**: Given today's market price of $\$P_{\text{market}}$, what operational assumptions must the company achieve to justify that valuation?
* **The Math**: The engine uses a client-side binary search numerical solver across two independent variables:
  1. **Market-Implied Revenue CAGR**: Holds margins and discount rates constant and searches for the exact 5-year sales growth rate that equates intrinsic value to $\$P_{\text{market}}$.
  2. **Market-Implied Operating (EBIT) Margin**: Holds growth and WACC constant and reverse-engineers the operating margin required to justify $\$P_{\text{market}}$.
* **Research Value**: Shows whether current market prices reflect reasonable fundamentals or require historic, unprecedented operational performance.

---

### 2.4 Probabilistic Monte Carlo & Random Walk Price Simulator
Instead of relying on deterministic point estimates, the platform models uncertainty using statistical mechanics:
* **Box-Muller Normal Distribution Transform**: Samples 5,000 growth permutations around historical mean revenue growth ($\mu$) with empirical standard deviation ($\sigma = 5.0\%$):
  $$Z = \sqrt{-2 \ln U_1} \cos(2\pi U_2), \quad g_{\text{sim}} = \mu + \sigma Z$$
* **Asset Price Random Walk Paths (Geometric Brownian Motion)**:
  * Generates 30 independent price trajectories starting from Year 0 (Market Price) across 5 years.
  * Visualizes the dispersion fan on a multi-path line chart using HSL gradient mapping to display confidence cones.
* **Percentile Distribution Bounds**: Extracts empirical risk percentiles:
  * **10th Percentile**: Severe Bear Case
  * **25th Percentile**: Conservative Case
  * **50th Percentile**: Median Probable Value
  * **75th Percentile**: Upside Growth Case
  * **90th Percentile**: Extreme Bull Case

---

### 2.5 Historical Model Calibration & Backtester
A valuation model is only as credible as its historical predictive power.
* **The Simulation**: The engine travels back to **2020**, restricting its dataset strictly to financial statements filed on or before 2020.
* **The Evaluation**:
  * Runs the DCF using 2017–2020 historical growth vectors and margins to compute a simulated 2020 Intrinsic Value.
  * Compares that projection against the stock's actual 2020 trading price.
  * Calculates the **Forecast Delta** by contrasting the model's assumed growth against the company's actual realized revenue CAGR from 2020 to 2025.

---

### 2.6 DCF Model Reliability Index
Calculates an objective confidence score from 0 to 100 assessing whether a firm's business model is suited for DCF analysis:
* **Operating Margin Volatility**: Computes the historical variance of EBIT margins. High variance penalizes the score.
* **Terminal Value Dependency Ratio**: Calculates $\frac{\text{PV of } TV}{\text{Enterprise Value}}$. If more than 80% of value comes from the terminal period, the model is penalized for extreme sensitivity to $g$ and WACC.
* **Filing Depth**: Evaluates the number of continuous SEC 10-K filings available.

---

### 2.7 2D Valuation Sensitivity Matrix
Institutional analysts require multidimensional sensitivity tables. The platform renders a 5x4 matrix cross-analyzing:
* **Rows**: WACC discount rates from $(WACC - 1.0\%)$ to $(WACC + 1.0\%)$ in 0.5% steps.
* **Columns**: Perpetual terminal growth rates ($1.5\%$, $2.0\%$, $2.5\%$, $3.0\%$).
* **Cells**: Live fair-value-per-share recalculation, highlighting the active cell and color-coding cells that trade at a discount to the current market price.

---

### 2.8 Comprehensive Financial Health & Solvency Scoring
* **Altman Z-Score (Manufacturing & Service Calibration)**:
  $$Z = 1.2X_1 + 1.4X_2 + 3.3X_3 + 0.6X_4 + 0.999X_5$$
  *Where $X_1 = \text{Working Capital} / \text{Total Assets}$, $X_2 = \text{Retained Earnings} / \text{Total Assets}$, $X_3 = \text{EBIT} / \text{Total Assets}$, $X_4 = \text{Market Cap} / \text{Total Liabilities}$, $X_5 = \text{Sales} / \text{Total Assets}$.*
  * Classifies balance sheets into **Safe Zone** ($Z > 2.99$), **Gray Zone** ($1.81 \le Z \le 2.99$), or **Distress Zone** ($Z < 1.81$).
* **Sub-Category Breakdown**: Evaluates Liquidity (Current Ratio), Solvency (Z-Score), Leverage (Liabilities/Equity), and Profitability (Operating Margin).
* **Financial Sector Warning**: Automatically detects banks and financial firms (e.g., JPM, GS) and issues an applicability warning, as deposit liabilities distort traditional working capital and debt ratios.

---

### 2.9 Peer Comparables & Quantitative Similarity Score
Eliminates arbitrary competitor selection by scoring comparability:
* **Log-Scale Market Cap Distance**:
  $$\text{Cap Score} = \max(0, 100 - |\log_{10}(\text{Target Cap}) - \log_{10}(\text{Peer Cap})| \times 25)$$
* **EBIT Margin Distance**:
  $$\text{Margin Score} = \max(0, 100 - |\text{Target Margin} - \text{Peer Margin}| \times 200)$$
* **Blended Similarity**:
  $$\text{Similarity Coefficient} = 0.60 \times \text{Cap Score} + 0.40 \times \text{Margin Score}$$

---

### 2.10 Blended Valuation Triangle
Triangulates three independent valuation methodologies into a unified valuation corridor:
1. **DCF Model Intrinsic Fair Value**
2. **Comparable Peer Multiples Valuation** ($\text{EPS} \times \text{Median Peer P/E}$)
3. **Historical Multiples Valuation** ($\text{EPS} \times \text{10-Year Historical Median P/E}$)

---

## 3. The Technical Architecture (Software Engineering & Systems Design)

```
[ Client Browser ]
       |
       v
[ Next.js 16 Edge / App Router (Turbopack) ]
       |
       +---> [ Middleware (IP Sliding-Window Rate Limiter) ]
       |
       +---> [ /api/companies/[ticker] Route ]
                   |
                   +---> [ High-Speed In-Memory Store (globalThis.__memoryDb) ]
                   |            (0ms response, pre-seeded S&P 500 financials)
                   |
                   +---> [ SEC EDGAR Pipeline (lib/sec-client.ts) ]
                   |            * 24h Ticker-to-CIK In-Memory Cache
                   |            * 160ms Pacing Queue (< 10 req/s compliance)
                   |            * Dual US-GAAP & IFRS-Full XBRL Parser
                   |
                   +---> [ Market Data Layer (lib/market-data.ts) ]
                                * Primary: yahoo-finance2 (live quote, beta, sector, charts)
                                * Fallback: Alpha Vantage API
                                * Safety Fallbacks ($150 / 1.0 beta)
```

### 3.1 Full-Stack Web Framework
* **Next.js 16 (App Router & Turbopack)**: Utilizes React Server Components (RSC) alongside Client Components (`'use client'`) for computational reactivity.
* **React 19 & Hooks Architecture**: Uses strictly ordered, unconditional hooks (`useMemo`, `useState`, `useEffect`) to ensure zero hydration mismatches between server-rendered HTML and client interactivity.
* **Tailwind CSS v4**: Strict monospace typography (`font-mono`), high-contrast dark persistent headers, border-grid alignment, and responsive viewports.

---

### 3.2 SEC EDGAR Ingestion & Dynamic XBRL Normalization
* **Host Header Resolution**: Standard Axios clients sending `'Host': 'data.sec.gov'` to `www.sec.gov` are blocked by the SEC's Akamai CDN with HTTP 403. The engine uses dynamic host headers.
* **Dual Accounting Standards Support**:
  * **US-GAAP**: Parses tags such as `RevenueFromContractWithCustomerExcludingAssessedTax`, `OperatingIncomeLoss`, and `CommonStockSharesOutstanding`.
  * **IFRS-Full**: Automatically handles international issuers (e.g., ASML, TSMC) by mapping tags such as `Revenue`, `OperatingProfitLoss`, and non-USD currencies (`EUR`, `GBP`).
* **Multi-Period Extraction**: Gathers up to 15 years of continuous annual filings (`Form 10-K` and `Form 20-F`) directly from the SEC's company facts JSON endpoints.

---

### 3.3 SEC EDGAR Pacing Queue & In-Memory Ticker Caching
* **In-Memory Ticker Cache**: SEC's 2MB `company_tickers.json` directory is cached in memory with a 24-hour TTL. After initial startup, ticker-to-CIK resolution takes **0ms and 0 network requests**.
* **160ms Request Pacing Throttler**: The SEC strictly enforces a maximum rate of 10 requests per second per IP. The engine routes all SEC traffic through a pacing queue that enforces a minimum 160ms interval (~6.25 requests/sec maximum), preventing HTTP 429 rate-limiting.
* **Exponential Backoff**: If an HTTP 429 response is encountered, the client automatically pauses for 2,000ms before retrying.

---

### 3.4 Zero-Cost, Unlimited Market Data Architecture
* **Primary Engine (`yahoo-finance2`)**:
  * Replaced restrictive free API keys (such as Alpha Vantage's 25 requests/day limit) with direct market quotes.
  * Queries real-time trading prices (`regularMarketPrice`), beta coefficients, GICS sector classifications, and 1-year historical daily closing prices in a single parallel call.
* **Secondary Fallback (Alpha Vantage)**: If Yahoo Finance is unreachable, the system automatically falls back to Alpha Vantage.
* **Resilient Baselines**: If external APIs are blocked or offline, the platform falls back to baseline defaults ($150.00 / 1.0 beta) so page loads never fail.

---

### 3.5 Database Decoupling & High-Speed In-Memory Store
* **The Problem**: When external managed databases (like Supabase free tier) pause, standard connection pools (`pg.Pool`) hang for 10–30 seconds waiting for a connection, causing gateway timeouts and 500 errors.
* **The Solution ([lib/db.ts](lib/db.ts))**:
  * Implemented a zero-latency in-memory store in `globalThis.__memoryDb` that persists across Next.js hot reloads.
  * Lookups for companies, balance sheet facts, and market history execute in **< 5 milliseconds**.
  * Pre-seeded verified 10-K financial records for market leaders (`NVDA`, `AAPL`, `MSFT`, `TSLA`) directly into memory for instant initialization.
  * Optional PostgreSQL connectivity: If configured and responsive, writes replicate to Postgres with a 1-second connection timeout, falling back silently to memory if unreachable.

---

### 3.6 Edge Caching & Abuse Prevention Middleware
* **Edge CDN Headers**:
  ```http
  Cache-Control: public, s-maxage=3600, stale-while-revalidate=86400
  ```
  Company API responses are cached at the edge (e.g., Vercel Edge Network or Cloudflare). Repeat requests for any stock are served in under 30ms with zero server compute or database load.
* **Sliding-Window IP Rate Limiter ([middleware.ts](middleware.ts))**:
  * Intercepts all requests targeting `/api/companies/*` and `/api/dcf/*`.
  * Enforces an in-memory limit of **35 requests per minute per client IP**.
  * Spammed requests receive an immediate HTTP 429 (`Too Many Requests`) with a `Retry-After` header.
  * Includes automatic garbage collection every 5 minutes to prevent memory leaks.

---

### 3.7 Client-Side Computational Performance
* **Zero-Latency Recalculation**: Adjusting growth sliders, EBIT margins, or WACC rates in the Assumptions tab triggers local client-side DCF execution in **< 1ms**, providing immediate visual feedback without round-trip network latency.
* **Recharts Visualization**: Renders SVG/Canvas charts for 12-month historical stock prices, 5-year projected Free Cash Flow bar graphs, 30-path Monte Carlo distribution fans, and valuation frequency density curves.

---

### 3.8 Data Provenance & Caution Alert System
* **Automated Data Quality Audit**: On every lookup, the API audits whether statements contain audited SEC revenue, EBIT, and share counts.
* **Preset Assumption Alerts**: If SEC tags were missing or non-standard, an amber caution banner is displayed:
  ```
  [CAUTION] PRESET ASSUMPTIONS ACTIVE — Un-audited / Baseline Estimations
  ```
  It lists missing audited fields (e.g., `[Revenue History]`, `[Shares Outstanding]`) and includes a direct link to calibrate assumptions.
* **Audited Provenance Verification**: When 100% audited data is loaded, a green indicator is displayed:
  ```
  AUDITED STATEMENTS VERIFIED — Historical facts parsed directly from SEC EDGAR regulatory filings
  ```

---

## 4. Technical vs. Financial Capabilities Matrix

| Feature | Financial Function | Technical Implementation |
| :--- | :--- | :--- |
| **DCF Engine** | 5-Year Unlevered Free Cash Flow & Gordon Growth Terminal Value | React `useMemo` local financial math with real-time slider reactivity |
| **Reverse DCF** | Determines market-implied revenue CAGR and EBIT margin | Client-side binary search numerical solver (converges in < 40 iterations) |
| **Monte Carlo** | Probability distribution of fair value & percentile risk bounds | Box-Muller normal transform generating 5,000 permutations + 30-path Recharts line chart |
| **Model Backtest** | 2020 out-of-sample forecast calibration against realized 2025 CAGR | Historical statement isolation slicing SEC filings on or before 2020 |
| **Sensitivity Matrix** | 2D hurdle rate (WACC) vs. perpetual growth ($g$) cross-analysis | Dynamic 5x4 matrix recalculating fair value across variable steps |
| **Health Scoring** | Credit solvency risk analysis & Altman Z-Score rating | Balance sheet ratio parser with sector-specific bank warnings |
| **Comps Similarity** | Quantitative peer comparability coefficient | Logarithmic market-cap distance + operating margin distance formula |
| **Data Ingestion** | Raw GAAP & IFRS 10-K regulatory financial statement parsing | Automated SEC EDGAR XBRL parser with dynamic host routing |
| **Market Quotes** | Real-time price quotes, beta, sector, and 1-year historical time series | `yahoo-finance2` parallel queries with Alpha Vantage fallback |
| **Resilience & Speed**| Zero-hang execution during database maintenance or downtime | Decoupled in-memory database (`globalThis.__memoryDb`) with pre-seeded S&P 500 data |
| **Abuse Protection** | Prevents API scraping and stays within SEC 10 req/s rules | Next.js sliding-window IP middleware + 160ms request pacing queue |
| **Data Provenance** | Distinguishes verified SEC filings from baseline assumptions | Automated `dataStatus` audit engine with dynamic caution banners |
