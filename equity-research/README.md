# Open Equity Research Platform

An institutional-grade, automated equity research and quantitative valuation terminal. Built with Next.js 16, TypeScript, Tailwind CSS, and Recharts.

---

## 1. Overview: What Is This Project?

Most equity research tools on the internet fall into one of two extremes:
1. **Overcomplicated spreadsheets**: Bloated 50-tab Excel files that break whenever a formula changes, require manual data entry, and are difficult to share or automate.
2. **Black-box websites**: Stock screeners that flash a badge saying "Undervalued by 28%" without showing you the underlying cash flow projections, discount rates, or mathematical assumptions.

The **Open Equity Research Platform** takes a transparent, institutional approach. It pulls audited regulatory financial statements directly from the US Securities and Exchange Commission (SEC EDGAR), feeds them into a live Discounted Cash Flow (DCF) model, reverse-engineers what operating performance current stock prices require, and stress-tests everything across a 5,000-run Monte Carlo probability laboratory.

Everything runs in real-time, recalculates client-side in less than 5 milliseconds, operates completely free without requiring expensive API subscriptions or active database instances, and explains every calculation in plain English.

---

## 2. Core Concepts Explained in Plain English

Finance textbooks often wrap simple economic concepts in dense jargon. Here is how the core engines in this terminal work and why they matter to an investor.

### Discounted Cash Flow (DCF)
* **The Analogy**: Imagine you are thinking about buying a rental property. You do not just look at what the property sold for yesterday; you estimate how much cash in rent it will put into your bank account each year after property taxes, maintenance, and insurance. Then you discount that future money because a dollar received five years from now is worth less than a dollar in your hand today.
* **In Corporate Finance**: A corporation is valued by its **Unlevered Free Cash Flow (FCFF)**—the actual cash generated from operations after paying taxes, reinvesting in equipment (CapEx), and funding working capital. The terminal projects these cash flows over 5 forecast years and calculates a Terminal Value for all years beyond Year 5.

### Cost of Capital (WACC) & Hurdle Rates
* **The Concept**: Why discount future cash? Because of risk and inflation. If the US government pays 4.25% on a risk-free 10-year Treasury bond, you would never risk money in a volatile stock unless you expected a higher return.
* **How It Works**: The **Weighted Average Cost of Capital (WACC)** blends the cost of equity (calculated via CAPM: Risk-Free Rate + Beta x Equity Risk Premium) and the after-tax cost of debt. This forms your hurdle rate: the discount rate applied to each future year's cash flows.

### "What Is The Market Pricing In?" (Reverse DCF)
* **The Problem with Standard DCFs**: If you build a model that says Apple is worth $280 while it trades at $180, you have not proved the market is wrong; you may simply have entered overly optimistic assumptions.
* **The Solution**: Instead of guessing the future, the terminal runs a **Reverse DCF** using a binary-search solver. It asks: *"Given today's actual stock price of $180, what revenue growth rate and profit margin must the company achieve over the next five years to justify that price?"*
* **Why It Matters**: If the stock price demands 25% annual revenue growth for five straight years, but the company has historically grown at 8%, the market is pricing in near-miraculous execution. If the price only implies 4% growth, the market may be excessively pessimistic, offering a potential margin of safety.

### Monte Carlo Stochastic Simulation & Value-at-Risk (VaR)
* **The Concept**: The real economy is uncertain. Supply chains wobble, recessions happen, and customer demand shifts. Relying on a single forecast number is risky.
* **How It Works**: The Monte Carlo laboratory applies Geometric Brownian motion shocks to annual growth rates, generating **5,000 independent parallel trajectories** around historical averages.
* **Key Metrics**:
  * **Probability of Undervaluation**: The percentage of simulated scenarios where intrinsic value exceeds today's market price.
  * **Median Value (P50)**: The statistical midpoint of the valuation distribution.
  * **95% Value-at-Risk (VaR 95%)**: The 5th percentile valuation floor. Tells an investor: only 5% of simulated economic paths resulted in a valuation below this dollar level.
  * **Expected Shortfall (CVaR 95%)**: The conditional average valuation inside the worst 5% tail scenarios.

### DCF Model Reliability Index
* **The Concept**: Not every company is suited for a DCF model. A mature consumer staples company with steady margins is ideal; an early-stage biotech with zero revenue or an oil exploration company with wild commodity swings is not.
* **How It Works**: The engine scores each company from 0 to 100 based on three factors:
  1. **Historical Margin Volatility**: High variance in operating margins reduces confidence.
  2. **Terminal Value Dependency Ratio**: If more than 80% of enterprise value comes from the perpetual terminal period rather than near-term cash flows, the score is penalized for extreme sensitivity.
  3. **Filing Depth**: Checks for at least 3 to 5 continuous years of clean SEC 10-K filings.

### Altman Z-Score & Solvency Check
* **The Concept**: Developed by NYU Professor Edward Altman, this formula acts as a balance sheet blood test to measure bankruptcy risk over a 2-year horizon.
* **How It Works**: It weights working capital, retained earnings, operating profitability (EBIT), market capitalization, and asset turnover relative to total liabilities.
  * **Safe Zone (Z > 2.99)**: Financially sound with minimal solvency risk.
  * **Gray Zone (1.81 <= Z <= 2.99)**: Moderate risk; warrants attention to debt maturities.
  * **Distress Zone (Z < 1.81)**: Elevated balance sheet stress.

---

## 3. How to Use the Terminal (Step-by-Step)

### Step 1: Search for Any Ticker
* Navigate to the home page (`http://localhost:3000`).
* Enter any public US stock ticker (e.g., `AAPL`, `NVDA`, `MSFT`, `TSLA`, `GOOGL`, `BRK-B`).
* The system resolves the ticker to its SEC Central Index Key (CIK) in 0ms using an in-memory directory cache, pulls live market quotes, and standardizes multi-year financial statements.

### Step 2: Read the Persistent Valuation Header
At the top of every company page, a dark persistent header displays five critical indicators:
1. **Computed Value**: The intrinsic fair value per share under your active scenario.
2. **Latest Market Price**: The live real-time trading price from market data feeds.
3. **Scenario Valuation Gap**: The percentage discount (green) or premium (rose) between fair value and market price.
4. **WACC Discount Rate**: The effective hurdle rate applied to the cash flows.
5. **Quant Lab Insight Bar**: A summary showing the Monte Carlo P50 median value, probability of undervaluation, and 95% VaR floor, accompanied by a direct button `[OPEN FULL MONTE CARLO LAB & CHARTS ->]`.

### Step 3: Tab 1 - Financials & Historical Statements
* Review audited numbers downloaded directly from SEC EDGAR annual 10-K filings.
* Inspect multi-year revenue, operating income (EBIT), net income, diluted shares, and operating margins.
* Verify whether the company has an `AUDITED STATEMENTS VERIFIED` badge or an amber `[CAUTION] PRESET ASSUMPTIONS ACTIVE` alert.

### Step 4: Tab 2 - Calibrate Assumptions
* Choose between **Base Case**, **Bull Case**, and **Bear Case** presets.
* Adjust interactive sliders for:
  * 5-Year Revenue Growth vector (year-by-year)
  * Target Operating (EBIT) Margin
  * Corporate Tax Rate
  * CapEx and Working Capital reinvestment percentages
  * Risk-Free Rate, Beta, and Equity Risk Premium
* Every adjustment recalculates the model instantly in the browser without server lag.

### Step 5: Tab 3 - Valuation & Sensitivity Matrix
* View the full 5-year Free Cash Flow waterfall table, Terminal Value calculation, and Enterprise-to-Equity reconciliation.
* Compare deterministic scenarios side-by-side: **Bear Case**, **Base Case**, **Bull Case**, and the stochastic **Monte Carlo Median (P50)**.
* Check the **5x4 2D Sensitivity Matrix** cross-referencing WACC rates against perpetual growth rates ($g$).
* At the bottom, click the **Next Quantitative Step** banner to transition directly into the Monte Carlo simulation.

### Step 6: Tab 4 - Monte Carlo Quantitative Lab
* **Stochastic Controls**: Select simulation sample size (1,000, 5,000, or 10,000 paths) and adjust the Annualized Growth Volatility slider ($\sigma$ from 2.0% to 15.0%).
* **Risk Metrics Matrix**: Review the 6 core quantitative indicators:
  * Probability of Undervaluation
  * Median Intrinsic Value ($P_{50}$)
  * Expected Mean Value ($E[P]$)
  * 95% Value-at-Risk ($P_{05}$ downside floor)
  * Expected Shortfall (CVaR tail risk)
  * Interquartile Spread ($P_{75} - P_{25}$)
* **Percentile Distribution**: Review exact price boundaries for the 10th, 25th, 50th, 75th, and 90th percentiles.
* **45-Path Stochastic Trajectory Fan (`460px`)**: Inspect 45 random-walk price trajectories over 5 years with an overlaid, bold median convergence path.
* **Probability Density Curve (`360px`)**: Analyze the valuation distribution area chart with a red dashed reference line marking today's current market price.

### Step 7: Tab 5 - Historical Model Backtest
* Evaluates model calibration by transporting the engine back to **2020**.
* Runs the DCF using only pre-2020 financial filings and contrasts the simulated 2020 valuation against the actual historical stock price and subsequent 5-year realized revenue growth.

### Step 8: Tab 6 - Financial Health & Altman Z-Score
* Review balance sheet solvency, working capital adequacy, and debt leverage.
* Check the Altman Z-score classification (Safe Zone, Gray Zone, or Distress Zone).
* Automatic sector detection provides specific context for banking and financial institutions where debt represents customer deposits.

### Step 9: Tab 7 - Peer Comps & Similarity Engine
* Compare the target company against industry peers.
* Each peer receives a mathematical **Similarity Score (0 to 100)** based on logarithmic market-cap distance and operating margin proximity.
* Use the one-click `[Import Peer]` button to ingest and analyze any peer's financial data on demand.

### Step 10: Export Research Reports
* Use the `[COPY REPORT]` button in the top toolbar to generate a standardized markdown investment memo suitable for documentation or team reviews.
* Click `[EXPORT CSV]` to download the complete multi-year cash flow model into spreadsheet format.

---

## 4. Software Architecture & Design Principles

```
+-----------------------------------------------------------------------------------+
| CLIENT BROWSER (React 19 / Tailwind CSS / Recharts)                               |
| Instant client-side recalculation (< 1ms) | Multi-Tab Institutional Interface     |
+-----------------------------------------------------------------------------------+
                                        |
                                        v
+-----------------------------------------------------------------------------------+
| NEXT.JS 16 APP ROUTER (Turbopack Engine)                                          |
| Edge Caching: s-maxage=3600 | IP Rate Limiter: 35 req/min sliding-window          |
+-----------------------------------------------------------------------------------+
         |                                                  |
         v                                                  v
+-------------------------------+         +-----------------------------------------+
| IN-MEMORY DATABASE            |         | EXTERNAL DATA PROVIDERS                 |
| (globalThis.__memoryDb)       |         |                                         |
| * Pre-seeded S&P 500 stocks   |         | 1. SEC EDGAR API                        |
| * 0ms response time           |         |    - 24h Ticker-to-CIK Directory Cache  |
| * Complete PostgreSQL         |         |    - 160ms Pacing Queue (< 10 req/sec)  |
|   decoupling (no hang on pause)         |    - Dual US-GAAP & IFRS-Full Parsers   |
+-------------------------------+         |                                         |
                                          | 2. MARKET DATA                          |
                                          |    - Primary: yahoo-finance2 (live quote)|
                                          |    - Fallback: Alpha Vantage API        |
                                          |    - Safety defaults ($150 / 1.0 beta)  |
                                          +-----------------------------------------+
```

### Key Technical Pillars
1. **Zero Database Dependency**: External managed databases can pause or time out. The platform utilizes a memory-first architecture (`globalThis.__memoryDb`) with pre-seeded S&P 500 financials. Lookups resolve in under 5 milliseconds with zero connection latency.
2. **SEC Request Pacing Queue**: SEC EDGAR strictly enforces a limit of 10 requests per second per IP. The engine routes all outbound SEC requests through a 160ms queue throttler (~6.25 req/sec max) with automatic 2,000ms exponential backoff.
3. **Free & Resilient Market Data**: Direct market quotes are fetched via `yahoo-finance2` (price, beta, sector, and daily history) with seamless fallback to Alpha Vantage.
4. **Abuse Protection & Edge Caching**: Next.js middleware implements a sliding-window rate limiter (35 requests/minute per client IP) with edge caching headers (`s-maxage=3600, stale-while-revalidate=86400`) to protect infrastructure under high traffic.
5. **Strict Typography & Zero Emojis**: Clean, monospace financial terminal design (`font-mono`) with high-contrast borders and institutional status tags (`[QUANT LAB]`, `[AUDITED]`, `[CAUTION]`).

---

## 5. Local Setup & Quickstart Guide

### Prerequisites
* **Node.js**: Version 18.18.0 or newer (Node.js 20+ recommended).
* **Package Manager**: `npm` (comes with Node.js) or `pnpm` / `yarn`.

### Installation Steps

1. **Clone the repository**:
   ```bash
   git clone https://github.com/your-username/finmodel.git
   cd finmodel/equity-research
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Configure Environment Variables** (Optional):
   Create a `.env.local` file inside the `equity-research` directory:
   ```env
   # SEC EDGAR requires a custom User-Agent identifying your application
   SEC_USER_AGENT=YourNameOrFirm yourname@example.com

   # Optional fallback market data API key (free at alphavantage.co)
   ALPHA_VANTAGE_API_KEY=demo

   # Optional database connection (defaults cleanly to in-memory store if omitted)
   DATABASE_URL=
   ```

4. **Start the development server**:
   ```bash
   npm run dev
   ```

5. **Open the platform**:
   Navigate to [http://localhost:3000](http://localhost:3000) in your web browser.

### Building for Production
To generate an optimized production build using Next.js Turbopack:
```bash
npm run build
npm run start
```

---

## 6. Project Structure

```
equity-research/
├── app/
│   ├── api/
│   │   ├── companies/[ticker]/route.ts  # Company facts, SEC ingest, market quotes
│   │   ├── dcf/route.ts                # Server-side DCF execution endpoint
│   │   └── home/route.ts               # Pre-seeded directory & market snapshot
│   ├── company/[ticker]/page.tsx       # Dynamic company valuation workspace
│   ├── globals.css                     # Monospace styling & Tailwind configuration
│   ├── layout.tsx                      # Root layout & terminal metadata titles
│   └── page.tsx                        # Home page & ticker search engine
├── components/
│   └── DCFForm.tsx                     # Primary valuation UI (all 7 tabs, Monte Carlo lab)
├── lib/
│   ├── db.ts                           # High-speed in-memory store & fallback database
│   ├── market-data.ts                  # Market quote client (yahoo-finance2 + fallback)
│   ├── sec-client.ts                   # SEC EDGAR parser, 160ms throttler, CIK cache
│   └── valuation.ts                    # Core corporate finance & DCF math routines
├── middleware.ts                       # Sliding-window IP rate limiter & edge routing
└── package.json                        # Dependencies and scripts
```

---

## 7. License & Disclaimer

**License**: Distributed under the MIT License.

**Financial Disclaimer**: This platform is built for educational, quantitative research, and financial modeling purposes only. Calculations and intrinsic values generated by this software do not constitute financial advice, investment recommendations, or an endorsement to buy or sell securities. Always conduct independent fundamental research and consult a licensed financial advisor before making investment decisions.
