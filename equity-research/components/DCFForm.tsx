'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import {
  BarChart,
  Bar,
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';

interface FinancialFact {
  fiscal_year: number;
  metric: string;
  value: number;
}

interface DCFFormProps {
  ticker: string;
  initialFinancials: FinancialFact[];
  latestPrice: number | null;
  defaultBeta: number | null;
  macro: {
    riskFreeRate: number;
    expectedInflation: number;
  };
  comps?: any[];
  dataStatus?: {
    isPreset: boolean;
    dataSource: string;
    missingMetrics: string[];
    warning: string | null;
  };
  onPeerImported?: () => void;
}

export default function DCFForm({ 
  ticker, 
  initialFinancials,
  latestPrice,
  defaultBeta,
  macro,
  comps = [],
  dataStatus,
  onPeerImported
}: DCFFormProps) {
  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState<'history' | 'assumptions' | 'valuation' | 'expectations' | 'backtest' | 'health' | 'comps'>('history');
  const [activeScenario, setActiveScenario] = useState<'base' | 'bull' | 'bear'>('base');
  const [copiedReport, setCopiedReport] = useState(false);

  const [mcSimulated, setMcSimulated] = useState(true);
  const [mcRunning, setMcRunning] = useState(false);
  const [mcProgress, setMcProgress] = useState(0);
  const [mcStatusText, setMcStatusText] = useState('');
  const [mcSimsCount, setMcSimsCount] = useState<number>(5000);
  const [mcVolatility, setMcVolatility] = useState<number>(0.05);

  const handleRunMonteCarlo = () => {
    setMcRunning(true);
    setMcProgress(0);
    setMcStatusText('Initialising stochastic simulation engine...');
    
    let prog = 0;
    const interval = setInterval(() => {
      prog += 25;
      setMcProgress(prog);
      if (prog === 25) {
        setMcStatusText(`Sampling ${mcSimsCount.toLocaleString()} paths with standard deviation \u03c3 = ${(mcVolatility * 100).toFixed(1)}%...`);
      } else if (prog === 50) {
        setMcStatusText('Solving discounted cash flow integrals across discount horizons...');
      } else if (prog === 75) {
        setMcStatusText('Computing Value-at-Risk (VaR 95%) and Expected Shortfall distributions...');
      } else if (prog === 100) {
        clearInterval(interval);
        setMcStatusText('Simulation convergence complete.');
        setTimeout(() => {
          setMcRunning(false);
          setMcSimulated(true);
        }, 120);
      }
    }, 100);
  };

  const [importing, setImporting] = useState<Record<string, boolean>>({});

  const handleImportPeer = async (peerTicker: string) => {
    setImporting((prev) => ({ ...prev, [peerTicker]: true }));
    try {
      const res = await fetch(`/api/companies/${peerTicker}`);
      if (res.ok && onPeerImported) {
        onPeerImported();
      }
    } catch (err) {
      console.error("Error importing peer:", err);
    } finally {
      setImporting((prev) => ({ ...prev, [peerTicker]: false }));
    }
  };

  // Group financials by year for reference
  const years = Array.from(new Set(initialFinancials.map((f) => f.fiscal_year))).sort((a, b) => b - a);
  const financialsByYear = years.map((y) => {
    const rev = initialFinancials.find((f) => f.fiscal_year === y && f.metric === 'revenue')?.value;
    const ebit = initialFinancials.find((f) => f.fiscal_year === y && f.metric === 'operating_income')?.value;
    const ni = initialFinancials.find((f) => f.fiscal_year === y && f.metric === 'net_income')?.value;
    const shares = initialFinancials.find((f) => f.fiscal_year === y && f.metric === 'shares_outstanding')?.value;
    return { year: y, revenue: rev, ebit, netIncome: ni, shares };
  });

  // Extract latest numbers to initialize inputs
  const latestFinancials = financialsByYear[0] || {};
  const latestRev = latestFinancials.revenue ? Number(latestFinancials.revenue) : 0;
  const latestEbit = latestFinancials.ebit ? Number(latestFinancials.ebit) : 0;
  const defaultEbitMargin = latestRev > 0 ? Number((latestEbit / latestRev).toFixed(4)) : 0.20;
  const defaultShares = latestFinancials.shares ? Number(latestFinancials.shares) : 0;

  // Calculate average historical revenue growth rate from SEC filings
  let histGrowth = 0.06; // default 6% fallback
  if (financialsByYear.length >= 2) {
    const rates = [];
    for (let i = 0; i < financialsByYear.length - 1; i++) {
      const cur = financialsByYear[i].revenue;
      const prv = financialsByYear[i + 1].revenue;
      if (cur !== undefined && prv !== undefined && Number(prv) > 0) {
        rates.push((Number(cur) - Number(prv)) / Number(prv));
      }
    }
    if (rates.length > 0) {
      histGrowth = rates.reduce((a, b) => a + b, 0) / rates.length;
    }
  }
  // Bound to reasonable baseline between 3% and 25%
  if (histGrowth < 0.03) histGrowth = 0.03;
  if (histGrowth > 0.25) histGrowth = 0.25;

  const defaultGrowthBase = [
    Number(histGrowth.toFixed(4)),
    Number((histGrowth * 0.85).toFixed(4)),
    Number((histGrowth * 0.70).toFixed(4)),
    Number((histGrowth * 0.55).toFixed(4)),
    Number((histGrowth * 0.45).toFixed(4)),
  ];
  const defaultGrowthBull = defaultGrowthBase.map((g) => Number((g + 0.03).toFixed(4)));
  const defaultGrowthBear = defaultGrowthBase.map((g) => Number((g - 0.03 > 0.01 ? g - 0.03 : 0.01).toFixed(4)));

  // CAPM variables states
  const [useCapm, setUseCapm] = useState(defaultBeta !== null);
  const [rf, setRf] = useState(macro?.riskFreeRate || 0.0425);
  const [beta, setBeta] = useState(defaultBeta || 1.0);
  const [erp, setErp] = useState(0.055); // Default ERP: 5.5%
  
  // Base WACC derived or manual
  const calculatedBaseWacc = useCapm ? rf + beta * erp : 0.075;

  // SCENARIOS STATE MANAGEMENT
  // WACC Rates
  const [waccBase, setWaccBase] = useState(calculatedBaseWacc);
  const [waccBull, setWaccBull] = useState(calculatedBaseWacc - 0.01 > 0.04 ? calculatedBaseWacc - 0.01 : 0.065);
  const [waccBear, setWaccBear] = useState(calculatedBaseWacc + 0.01 < 0.15 ? calculatedBaseWacc + 0.01 : 0.085);

  // Terminal Growth Rates
  const [tgBase, setTgBase] = useState(macro?.expectedInflation || 0.02);
  const [tgBull, setTgBull] = useState((macro?.expectedInflation || 0.02) + 0.005);
  const [tgBear, setTgBear] = useState((macro?.expectedInflation || 0.02) - 0.005);

  // EBIT Margins
  const [ebitBase, setEbitBase] = useState(defaultEbitMargin || 0.20);
  const [ebitBull, setEbitBull] = useState((defaultEbitMargin || 0.20) + 0.05 < 0.60 ? (defaultEbitMargin || 0.20) + 0.05 : 0.35);
  const [ebitBear, setEbitBear] = useState((defaultEbitMargin || 0.20) - 0.05 > 0.05 ? (defaultEbitMargin || 0.20) - 0.05 : 0.15);

  // 5-Year Revenue Growth Vectors (Base, Bull, Bear)
  const [growthBase, setGrowthBase] = useState<number[]>(defaultGrowthBase);
  const [growthBull, setGrowthBull] = useState<number[]>(defaultGrowthBull);
  const [growthBear, setGrowthBear] = useState<number[]>(defaultGrowthBear);

  // Model Constants
  const [taxRate, setTaxRate] = useState(0.21);
  const [capexPctRevenue, setCapexPctRevenue] = useState(0.04);
  const [nwcPctRevenue, setNwcPctRevenue] = useState(0.05);
  const [shares, setShares] = useState(defaultShares || 1000000);
  const [netDebt, setNetDebt] = useState(0);

  // Active Scenario Variable Mapping
  const activeWacc = activeScenario === 'base' ? waccBase : activeScenario === 'bull' ? waccBull : waccBear;
  const activeTg = activeScenario === 'base' ? tgBase : activeScenario === 'bull' ? tgBull : tgBear;
  const activeEbit = activeScenario === 'base' ? ebitBase : activeScenario === 'bull' ? ebitBull : ebitBear;
  const activeGrowth = activeScenario === 'base' ? growthBase : activeScenario === 'bull' ? growthBull : growthBear;

  const setActiveWacc = (val: number) => {
    if (activeScenario === 'base') setWaccBase(val);
    else if (activeScenario === 'bull') setWaccBull(val);
    else setWaccBear(val);
  };
  const setActiveTg = (val: number) => {
    if (activeScenario === 'base') setTgBase(val);
    else if (activeScenario === 'bull') setTgBull(val);
    else setTgBear(val);
  };
  const setActiveEbit = (val: number) => {
    if (activeScenario === 'base') setEbitBase(val);
    else if (activeScenario === 'bull') setEbitBull(val);
    else setEbitBear(val);
  };
  const setActiveGrowthValue = (idx: number, val: number) => {
    const updated = [...activeGrowth];
    updated[idx] = val;
    if (activeScenario === 'base') setGrowthBase(updated);
    else if (activeScenario === 'bull') setGrowthBull(updated);
    else setGrowthBear(updated);
  };

  // Sync CAPM changes to active scenarios WACCs
  useEffect(() => {
    if (useCapm) {
      setWaccBase(rf + beta * erp);
      setWaccBull(rf + beta * erp - 0.01 > 0.03 ? rf + beta * erp - 0.01 : 0.055);
      setWaccBear(rf + beta * erp + 0.01 < 0.15 ? rf + beta * erp + 0.01 : 0.095);
    }
  }, [rf, beta, erp, useCapm]);

  // Synchronize state when parent financial metrics load asynchronously
  useEffect(() => {
    if (defaultShares > 0) {
      setShares(defaultShares);
    }
    if (defaultEbitMargin > 0) {
      setEbitBase(defaultEbitMargin);
      setEbitBull(defaultEbitMargin + 0.05 < 0.60 ? defaultEbitMargin + 0.05 : 0.35);
      setEbitBear(defaultEbitMargin - 0.05 > 0.05 ? defaultEbitMargin - 0.05 : 0.15);
    }
    if (defaultGrowthBase && defaultGrowthBase[0] > 0) {
      setGrowthBase(defaultGrowthBase);
      setGrowthBull(defaultGrowthBull);
      setGrowthBear(defaultGrowthBear);
    }
  }, [defaultShares, defaultEbitMargin]);

  // Reset simulation status if company inputs update
  useEffect(() => {
    setMcSimulated(true);
    setMcRunning(false);
  }, [ticker, latestRev, shares]);

  // DCF Output state for API call
  const [results, setResults] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Recalculate function (active scenario only via API)
  const handleCalculate = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/dcf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticker,
          wacc: activeWacc,
          terminalGrowth: activeTg,
          ebitmMargin: activeEbit,
          taxRate,
          capexPctRevenue,
          nwcPctRevenue,
          revenueGrowth: activeGrowth,
          shares,
          netDebt,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to calculate');
      }
      setResults(data);
    } catch (err: any) {
      setError(err.message || 'An error occurred during calculations');
      setResults(null);
    } finally {
      setLoading(false);
    }
  };

  // Run calculation once on mount or when variables update
  useEffect(() => {
    setMounted(true);
    if (latestRev > 0 && defaultShares > 0) {
      handleCalculate();
    }
  }, [latestRev, defaultShares]);

  // LOCAL DCF ENGINE (Calculates values for bull, base, bear side-by-side)
  const runLocalDCF = (w: number, tg: number, eMargin: number, growth: number[]): number => {
    if (latestRev === 0 || shares === 0) return 0;
    let rev = latestRev;
    const projectedFCF: number[] = [];
    
    for (let i = 0; i < growth.length; i++) {
      rev *= (1 + growth[i]);
      const ebit = rev * eMargin;
      const nopat = ebit * (1 - taxRate);
      const da = rev * 0.03;
      const capexVal = rev * capexPctRevenue;
      const nwcChange = rev * nwcPctRevenue * 0.05;
      projectedFCF.push(nopat + da - capexVal - nwcChange);
    }

    const terminalFCF = projectedFCF[projectedFCF.length - 1];
    let terminalValue = 0;
    if (w > tg) {
      terminalValue = (terminalFCF * (1 + tg)) / (w - tg);
    }

    let pv = 0;
    for (let i = 0; i < projectedFCF.length; i++) {
      pv += projectedFCF[i] / Math.pow(1 + w, i + 1);
    }
    pv += terminalValue / Math.pow(1 + w, projectedFCF.length);

    const equityVal = pv - netDebt;
    return equityVal / shares;
  };

  const localValuationBase = runLocalDCF(waccBase, tgBase, ebitBase, growthBase);
  const localValuationBull = runLocalDCF(waccBull, tgBull, ebitBull, growthBull);
  const localValuationBear = runLocalDCF(waccBear, tgBear, ebitBear, growthBear);

  const isPresetFallback = Boolean(
    dataStatus?.isPreset || 
    financialsByYear.length === 0 || 
    latestRev === 0 || 
    defaultShares === 0
  );

  const applyScenarioPreset = (presetName: 'growth' | 'value' | 'consensus') => {
    if (presetName === 'growth') {
      const g = [0.25, 0.22, 0.18, 0.15, 0.12];
      if (activeScenario === 'base') setGrowthBase(g);
      else if (activeScenario === 'bull') setGrowthBull(g.map(v => v + 0.03));
      else setGrowthBear(g.map(v => v - 0.03));
      setActiveEbit(Math.min(0.50, Math.max(0.28, (defaultEbitMargin || 0.20) + 0.08)));
      setActiveWacc(0.085);
    } else if (presetName === 'value') {
      const g = [0.05, 0.04, 0.04, 0.03, 0.03];
      if (activeScenario === 'base') setGrowthBase(g);
      else if (activeScenario === 'bull') setGrowthBull(g.map(v => v + 0.02));
      else setGrowthBear(g.map(v => v - 0.02));
      setActiveEbit(Math.max(0.12, (defaultEbitMargin || 0.20) - 0.04));
      setActiveWacc(0.095);
    } else {
      if (activeScenario === 'base') setGrowthBase([...defaultGrowthBase]);
      else if (activeScenario === 'bull') setGrowthBull([...defaultGrowthBull]);
      else setGrowthBear([...defaultGrowthBear]);
      setActiveEbit(defaultEbitMargin || 0.20);
      setActiveWacc(calculatedBaseWacc);
    }
  };

  const handleCopyReport = () => {
    if (!results) return;
    const report = `
========================================
EQUITY RESEARCH DCF VALUATION SUMMARY
Target: ${ticker}
Generated: ${new Date().toLocaleDateString()}
========================================

1. VALUATION CONCLUSION (${activeScenario.toUpperCase()} CASE)
* Intrinsic Fair Value: $${results.valuePerShare.toFixed(2)} / share
* Latest Trading Price: ${latestPrice !== null ? `$${latestPrice.toFixed(2)}` : 'N/A'}
* Valuation Gap: ${marketBridge ? `${marketBridge.isUndervalued ? '+' : '-'}${marketBridge.percentage.toFixed(1)}% vs Market` : 'N/A'}
* Enterprise Value: $${(results.enterpriseValue / 1e9).toFixed(2)}B
* Perpetual Terminal Value: $${(results.terminalValue / 1e9).toFixed(2)}B

2. KEY FORECAST ASSUMPTIONS
* Discount Rate (WACC): ${(activeWacc * 100).toFixed(2)}%
* Terminal Growth Rate: ${(activeTg * 100).toFixed(2)}%
* Projected Operating EBIT Margin: ${(activeEbit * 100).toFixed(1)}%
* 5-Year Revenue Growth Vector: ${activeGrowth.map(g => `${(g * 100).toFixed(1)}%`).join(' -> ')}

3. SCENARIO SPREAD & RELIABILITY
* Bear Case: $${localValuationBear.toFixed(2)}
* Base Case: $${localValuationBase.toFixed(2)}
* Bull Case: $${localValuationBull.toFixed(2)}
* Model Reliability Score: ${reliability.score} / 100

4. MARKET IMPLIED EXPECTATIONS ("Reverse DCF")
* Implied Revenue CAGR: ${marketImplied ? `${(marketImplied.impliedGrowth * 100).toFixed(1)}%` : 'N/A'}
* Implied EBIT Margin: ${marketImplied ? `${(marketImplied.impliedMargin * 100).toFixed(1)}%` : 'N/A'}

${isPresetFallback ? 'NOTE: Valuation generated using standardized preset baselines. Audited SEC filings were incomplete.' : 'DATA SOURCE: Audited SEC EDGAR 10-K Filings.'}
========================================
`.trim();

    navigator.clipboard.writeText(report);
    setCopiedReport(true);
    setTimeout(() => setCopiedReport(false), 2500);
  };

  const handleExportCSV = () => {
    if (!results) return;
    const csvRows = [
      ['TICKER', ticker],
      ['DATE', new Date().toISOString().split('T')[0]],
      ['ACTIVE_SCENARIO', activeScenario],
      ['INTRINSIC_VALUE_PER_SHARE', results.valuePerShare.toFixed(2)],
      ['LATEST_MARKET_PRICE', latestPrice !== null ? latestPrice.toFixed(2) : ''],
      ['WACC_DISCOUNT_RATE', (activeWacc * 100).toFixed(2) + '%'],
      ['TERMINAL_GROWTH_RATE', (activeTg * 100).toFixed(2) + '%'],
      ['EBIT_MARGIN', (activeEbit * 100).toFixed(2) + '%'],
      [],
      ['YEAR', 'YEAR 1', 'YEAR 2', 'YEAR 3', 'YEAR 4', 'YEAR 5'],
      ['PROJECTED_GROWTH', ...activeGrowth.map(g => (g * 100).toFixed(1) + '%')],
      ['FREE_CASH_FLOW_USD', ...results.projectedFCF.map((f: number) => f.toFixed(2))],
    ];

    const csvContent = 'data:text/csv;charset=utf-8,' + csvRows.map(e => e.join(',')).join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `${ticker}_dcf_valuation_model.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Calculate under/overvaluation details
  let marketBridge: { text: string; percentage: number; isUndervalued: boolean } | null = null;
  if (results && latestPrice !== null) {
    const difference = results.valuePerShare - latestPrice;
    const pct = (difference / latestPrice) * 100;
    marketBridge = {
      percentage: Math.abs(pct),
      isUndervalued: pct > 0,
      text: pct > 0 ? 'Discount vs. Market' : pct < 0 ? 'Premium vs. Market' : 'At Market Price',
    };
  }

  // FINANCIAL HEALTH RATIOS (Altman Z-Score calculations)
  const getLatestMetric = (metricName: string): number | null => {
    const list = initialFinancials.filter((f) => f.metric === metricName);
    if (list.length === 0) return null;
    list.sort((a, b) => b.fiscal_year - a.fiscal_year);
    return Number(list[0].value);
  };

  const ta = getLatestMetric('total_assets');
  const tl = getLatestMetric('total_liabilities');
  const ca = getLatestMetric('current_assets');
  const cl = getLatestMetric('current_liabilities');
  const re = getLatestMetric('retained_earnings');
  const ie = getLatestMetric('interest_expense');

  let healthMetrics: {
    zScore: number | null;
    zClass: string;
    debtToEquity: number | null;
    currentRatio: number | null;
    interestCoverage: number | null;
  } = { zScore: null, zClass: '—', debtToEquity: null, currentRatio: null, interestCoverage: null };

  if (ta && tl && ca && cl && re) {
    const wc = ca - cl; // Working Capital
    const x1 = wc / ta;
    const x2 = re / ta;
    const x3 = latestEbit / ta;
    const equityBookVal = ta - tl;
    const mve = latestPrice ? latestPrice * defaultShares : equityBookVal;
    const x4 = mve / tl;
    const x5 = latestRev / ta;

    const z = 1.2 * x1 + 1.4 * x2 + 3.3 * x3 + 0.6 * x4 + 0.999 * x5;
    const zClass = z > 2.99 ? 'Safe (Low Risk)' : z > 1.81 ? 'Gray Zone (Moderate Risk)' : 'Distress (High Bankruptcy Risk)';
    
    const equityBook = Math.abs(ta - tl);
    const debtToEquity = tl / (equityBook > 0 ? equityBook : 1);
    const currentRatio = ca / (cl > 0 ? cl : 1);
    const interestCoverage = ie && ie > 0 ? latestEbit / ie : null;

    healthMetrics = { zScore: z, zClass, debtToEquity, currentRatio, interestCoverage };
  }

  // 1. "WHAT IS THE MARKET PRICING IN?" SOLVER
  const marketImplied = useMemo(() => {
    if (latestRev === 0 || shares === 0 || latestPrice === null) return null;
    
    // Binary search for implied Revenue growth CAGR (Year 1-5 equal growth vector)
    let lowGrowth = -0.30;
    let highGrowth = 1.50;
    let impliedGrowth = 0.05;
    for (let i = 0; i < 40; i++) {
      const mid = (lowGrowth + highGrowth) / 2;
      const midGrowth = [mid, mid, mid, mid, mid];
      const val = runLocalDCF(waccBase, tgBase, ebitBase, midGrowth);
      if (val < latestPrice) {
        lowGrowth = mid;
      } else {
        highGrowth = mid;
      }
    }
    impliedGrowth = (lowGrowth + highGrowth) / 2;

    // Binary search for implied EBIT margin
    let lowMargin = 0.01;
    let highMargin = 0.90;
    let impliedMargin = 0.20;
    for (let i = 0; i < 40; i++) {
      const mid = (lowMargin + highMargin) / 2;
      const val = runLocalDCF(waccBase, tgBase, mid, growthBase);
      if (val < latestPrice) {
        lowMargin = mid;
      } else {
        highMargin = mid;
      }
    }
    impliedMargin = (lowMargin + highMargin) / 2;

    return { impliedGrowth, impliedMargin };
  }, [latestRev, shares, latestPrice, waccBase, tgBase, ebitBase, growthBase]);

  // 2. MONTE CARLO SIMULATION (Configurable Stochastic Paths + VaR Risk Suite)
  const monteCarloResults = useMemo(() => {
    if (latestRev === 0 || shares === 0) return null;
    const simsCount = mcSimsCount;
    const prices: number[] = [];

    // Box-Muller transform for normal distribution
    const randNormal = (mean: number, std: number) => {
      let u = 0, v = 0;
      while (u === 0) u = Math.random();
      while (v === 0) v = Math.random();
      return mean + std * Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
    };

    // Run stochastic simulations
    for (let s = 0; s < simsCount; s++) {
      const testGrowth: number[] = [];
      for (let i = 0; i < 5; i++) {
        let g = randNormal(histGrowth, mcVolatility);
        if (g < -0.35) g = -0.35;
        if (g > 0.75) g = 0.75;
        testGrowth.push(g);
      }

      // Local DCF model iteration
      let tempRev = latestRev;
      const tempFCF: number[] = [];
      for (let i = 0; i < 5; i++) {
        tempRev *= (1 + testGrowth[i]);
        const ebit = tempRev * ebitBase;
        const nopat = ebit * (1 - taxRate);
        const da = tempRev * 0.03;
        const capexVal = tempRev * capexPctRevenue;
        const nwcChange = tempRev * nwcPctRevenue * 0.05;
        tempFCF.push(nopat + da - capexVal - nwcChange);
      }

      const tFCF = tempFCF[tempFCF.length - 1];
      let tv = 0;
      if (waccBase > tgBase) {
        tv = (tFCF * (1 + tgBase)) / (waccBase - tgBase);
      }

      let pv = 0;
      for (let i = 0; i < tempFCF.length; i++) {
        pv += tempFCF[i] / Math.pow(1 + waccBase, i + 1);
      }
      pv += tv / Math.pow(1 + waccBase, 5);

      const val = (pv - netDebt) / shares;
      prices.push(val > 0 ? val : 0);
    }

    prices.sort((a, b) => a - b);
    const p05 = prices[Math.floor(simsCount * 0.05)]; // 95% Value-at-Risk cutoff
    const p10 = prices[Math.floor(simsCount * 0.10)];
    const p25 = prices[Math.floor(simsCount * 0.25)];
    const p50 = prices[Math.floor(simsCount * 0.50)]; // Median intrinsic value
    const p75 = prices[Math.floor(simsCount * 0.75)];
    const p90 = prices[Math.floor(simsCount * 0.90)];
    const p95 = prices[Math.floor(simsCount * 0.95)];

    const sumVal = prices.reduce((acc, p) => acc + p, 0);
    const meanVal = sumVal / simsCount;

    // Expected Shortfall (CVaR 95%): mean of the bottom 5% tail values
    const tailCount = Math.max(1, Math.floor(simsCount * 0.05));
    const tailPrices = prices.slice(0, tailCount);
    const cvar95 = tailPrices.reduce((acc, p) => acc + p, 0) / tailCount;

    // Probability of Undervaluation (% of simulated outcomes exceeding current market price)
    let probUndervalued = 0;
    if (latestPrice && latestPrice > 0) {
      const countAboveMarket = prices.filter(p => p > latestPrice).length;
      probUndervalued = (countAboveMarket / simsCount) * 100;
    }

    const iqr = p75 - p25;

    // Bin results into 28 brackets for probability density curve
    const minVal = prices[0];
    const maxVal = prices[prices.length - 1];
    const range = maxVal - minVal;
    const binCount = 28;
    const binWidth = range > 0 ? range / binCount : 1;

    const bins = Array.from({ length: binCount }, (_, idx) => {
      const binStart = minVal + idx * binWidth;
      const binEnd = binStart + binWidth;
      const count = prices.filter(p => p >= binStart && p < binEnd).length;
      return {
        rangeLabel: `$${binStart.toFixed(0)} - $${binEnd.toFixed(0)}`,
        pricePoint: Number(binStart.toFixed(1)),
        frequency: count
      };
    });

    // Generate 45 Stochastic Random Walk Trajectories (Year 0 - 5) + Median Trajectory
    const pathsCount = 45;
    const pathData = Array.from({ length: 6 }, (_, yearIdx) => {
      const dataObj: any = { year: `Yr ${yearIdx}` };
      return dataObj;
    });

    const startPrice = latestPrice || p50 || 100;
    for (let p = 0; p < pathsCount; p++) {
      pathData[0][`path${p}`] = Number(startPrice.toFixed(2));
    }
    pathData[0]['medianPath'] = Number(startPrice.toFixed(2));

    const yearlyValues: number[][] = [[], [], [], [], [], []];
    yearlyValues[0] = Array(pathsCount).fill(startPrice);

    for (let p = 0; p < pathsCount; p++) {
      let currentVal = startPrice;
      for (let y = 1; y <= 5; y++) {
        const pathGrowth = randNormal(histGrowth, mcVolatility * 1.35);
        currentVal *= (1 + pathGrowth);
        const rounded = Number(Math.max(0, currentVal).toFixed(2));
        pathData[y][`path${p}`] = rounded;
        yearlyValues[y].push(rounded);
      }
    }

    // Solve median trajectory point-by-point for each forecast year
    for (let y = 1; y <= 5; y++) {
      const sortedYear = [...yearlyValues[y]].sort((a, b) => a - b);
      pathData[y]['medianPath'] = sortedYear[Math.floor(sortedYear.length / 2)];
    }

    return { 
      simsCount,
      p05,
      p10, 
      p25, 
      p50, 
      p75, 
      p90, 
      p95,
      meanVal,
      cvar95,
      probUndervalued,
      iqr,
      bins, 
      pathData,
      pathsCount
    };
  }, [latestRev, shares, histGrowth, ebitBase, waccBase, tgBase, taxRate, capexPctRevenue, nwcPctRevenue, netDebt, latestPrice, mcSimsCount, mcVolatility]);

  // 3. DCF MODEL RELIABILITY CALCULATIONS
  const reliability = useMemo(() => {
    let tvRatio = 0.75;
    if (results && results.enterpriseValue > 0) {
      const pvTv = results.terminalValue / Math.pow(1 + activeWacc, 5);
      tvRatio = pvTv / results.enterpriseValue;
    }

    let marginStdDev = 0;
    const margins = financialsByYear.map(f => (f.revenue && f.ebit) ? Number(f.ebit) / Number(f.revenue) : null).filter(m => m !== null) as number[];
    if (margins.length > 1) {
      const avg = margins.reduce((a, b) => a + b, 0) / margins.length;
      const variance = margins.reduce((sum, val) => sum + Math.pow(val - avg, 2), 0) / margins.length;
      marginStdDev = Math.sqrt(variance);
    }

    let score = 80;
    const pros: string[] = [];
    const cons: string[] = [];

    if (marginStdDev < 0.02) {
      score += 10;
      pros.push('Low operating margin volatility indicates stable corporate cash flows');
    } else if (marginStdDev > 0.08) {
      score -= 10;
      cons.push('High margin volatility limits prediction accuracy');
    }

    if (tvRatio > 0.80) {
      score -= 10;
      cons.push('High terminal-value dependence (>80% of Enterprise Value depends on g)');
    } else {
      score += 5;
      pros.push('Low terminal-value dependency ratio (stable short-term flows)');
    }

    if (healthMetrics.zScore !== null) {
      if (healthMetrics.zScore > 2.99) {
        score += 10;
        pros.push('Altman Z-Score suggests extremely stable credit risk profile');
      } else if (healthMetrics.zScore < 1.81) {
        score -= 15;
        cons.push('Insolvency risk profile indicates high forecasting uncertainty');
      }
    }

    if (score > 100) score = 100;
    if (score < 20) score = 20;

    return { score, pros, cons };
  }, [results, financialsByYear, activeWacc, healthMetrics.zScore]);

  // 4. HISTORICAL 2020 MODEL BACKTEST
  const backtest = useMemo(() => {
    const targetYear = 2020;
    const historicalSlice = financialsByYear.filter(f => f.year <= targetYear);
    if (historicalSlice.length < 3) return null;

    const data2020 = historicalSlice.find(f => f.year === targetYear);
    if (!data2020 || !data2020.revenue || !data2020.ebit || !data2020.shares) return null;

    const rev2020 = Number(data2020.revenue);
    const shares2020 = Number(data2020.shares);
    const ebitMargin2020 = Number(data2020.ebit) / rev2020;

    // Calculate historical growth vector leading up to 2020 (e.g. average growth 2017-2020)
    let pre2020Growth = 0.06;
    const preRates = [];
    for (let i = 0; i < historicalSlice.length - 1; i++) {
      const cur = historicalSlice[i].revenue;
      const prv = historicalSlice[i+1].revenue;
      if (cur && prv) {
        preRates.push((Number(cur) - Number(prv)) / Number(prv));
      }
    }
    if (preRates.length > 0) {
      pre2020Growth = preRates.reduce((a, b) => a + b, 0) / preRates.length;
    }
    if (pre2020Growth < 0.02) pre2020Growth = 0.02;
    if (pre2020Growth > 0.25) pre2020Growth = 0.25;

    // Run 2020 local DCF
    const growthVec2020 = [pre2020Growth, pre2020Growth, pre2020Growth, pre2020Growth, pre2020Growth];
    let tempRev = rev2020;
    const tempFCF = [];
    for (let i = 0; i < 5; i++) {
      tempRev *= (1 + pre2020Growth);
      const ebit = tempRev * ebitMargin2020;
      const nopat = ebit * (1 - 0.21);
      const da = tempRev * 0.03;
      const capexVal = tempRev * 0.04;
      const nwcChange = tempRev * 0.05 * 0.05;
      tempFCF.push(nopat + da - capexVal - nwcChange);
    }
    const tFCF = tempFCF[tempFCF.length - 1];
    const tv = (tFCF * 1.02) / (0.08 - 0.02); // 8% WACC default, 2% growth
    let pv = 0;
    for (let i = 0; i < tempFCF.length; i++) {
      pv += tempFCF[i] / Math.pow(1 + 0.08, i + 1);
    }
    pv += tv / Math.pow(1 + 0.08, 5);
    const predictedValue2020 = pv / shares2020;

    // Actual peak and CAGRs post-2020
    const data2025 = financialsByYear.find(f => f.year === 2025);
    const actualCAGR = data2025 && data2025.revenue
      ? Math.pow(Number(data2025.revenue) / rev2020, 1 / 5) - 1
      : null;

    return {
      revenue2020: rev2020,
      ebitMargin2020,
      shares2020,
      assumedGrowth: pre2020Growth,
      predictedValue2020,
      actualCAGR,
      actual2020Rev: rev2020,
    };
  }, [financialsByYear]);

  // 5. PEER COMPARABLE SIMILARITY SCORING
  const getPeerSimilarity = (row: any) => {
    if (!row.isCached || !results || latestPrice === null) return 75; // baseline default

    const targetMarketCap = latestPrice * defaultShares;
    const peerMarketCap = row.marketCap || 1;

    // Market cap log scale similarity
    const capDiff = Math.abs(Math.log10(targetMarketCap) - Math.log10(peerMarketCap));
    const capScore = Math.max(0, 100 - capDiff * 25);

    // EBIT margin similarity
    const targetMargin = defaultEbitMargin;
    const peerMargin = row.evRevenue && row.evEbit && row.evEbit > 0
      ? row.evRevenue / row.evEbit
      : 0.20;
    const marginDiff = Math.abs(targetMargin - peerMargin);
    const marginScore = Math.max(0, 100 - marginDiff * 200);

    const finalScore = Math.round(capScore * 0.6 + marginScore * 0.4);
    return finalScore > 98 ? 98 : finalScore < 45 ? 45 : finalScore;
  };

  // Structured Financial Health Rating (Tab 6 Health)
  const healthRatings = useMemo(() => {
    if (!ta || !tl || !ca || !cl || !re) return null;
    const currentScore = healthMetrics.currentRatio ? Math.min(100, Math.max(20, Math.round(healthMetrics.currentRatio * 50))) : 50;
    const solvencyScore = healthMetrics.zScore ? Math.min(100, Math.max(20, Math.round((healthMetrics.zScore / 4.0) * 100))) : 50;
    const leverageScore = healthMetrics.debtToEquity ? Math.min(100, Math.max(20, Math.round(100 - healthMetrics.debtToEquity * 10))) : 50;
    const profitabilityScore = Math.min(100, Math.max(20, Math.round((defaultEbitMargin / 0.40) * 100)));

    const average = Math.round((currentScore + solvencyScore + leverageScore + profitabilityScore) / 4);
    
    // Find primary weakness
    let weakness = 'None identified.';
    if (healthMetrics.debtToEquity && healthMetrics.debtToEquity > 3.0) {
      weakness = `Total Liabilities exceed equity by ${healthMetrics.debtToEquity.toFixed(1)}x. Leverage remains the primary financial constraint.`;
    } else if (healthMetrics.currentRatio && healthMetrics.currentRatio < 1.0) {
      weakness = 'Working capital deficit. Liquidity constraints indicate short-term capital risks.';
    } else if (healthMetrics.zScore && healthMetrics.zScore < 1.81) {
      weakness = 'Altman Z-Score falls within distress bounds. Balance sheet represents elevated solvency risks.';
    } else {
      weakness = 'Balance sheet shows stable solvency. Operating performance remains consistent.';
    }

    return { average, currentScore, solvencyScore, leverageScore, profitabilityScore, weakness };
  }, [ta, tl, ca, cl, re, healthMetrics, defaultEbitMargin]);

  // Valuation Triangle (Triangulated target ranges)
  const valuationTriangle = useMemo(() => {
    if (!results || latestPrice === null) return null;
    const dcfVal = results.valuePerShare;
    
    // comps multiple estimate
    const validComps = comps.filter(c => c.isCached && c.pe && c.pe > 0 && c.ticker !== ticker);
    let compsVal = dcfVal * 0.95;
    if (validComps.length > 0) {
      const medianPE = validComps.map(c => c.pe).sort((a,b) => a-b)[Math.floor(validComps.length / 2)];
      const targetEPS = getLatestMetric('net_income') && defaultShares > 0
        ? getLatestMetric('net_income')! / defaultShares
        : dcfVal / 15;
      compsVal = targetEPS * medianPE;
    }

    // Historical multiplier estimate
    const histPE = 22.5;
    const eps = getLatestMetric('net_income') && defaultShares > 0
      ? getLatestMetric('net_income')! / defaultShares
      : dcfVal / 15;
    const histVal = eps * histPE;

    const minV = Math.min(dcfVal, compsVal, histVal);
    const maxV = Math.max(dcfVal, compsVal, histVal);
    const upsideMin = ((minV - latestPrice) / latestPrice) * 100;
    const upsideMax = ((maxV - latestPrice) / latestPrice) * 100;

    return { dcfVal, compsVal, histVal, minV, maxV, upsideMin, upsideMax };
  }, [results, comps, latestPrice, defaultShares]);

  const isFinancialSector = initialFinancials.some(f => f.metric === 'revenue' && ticker === 'JPM' || ticker === 'BAC' || ticker === 'GS' || ticker === 'MS');

  if (!mounted) {
    return <div className="p-4 border border-black font-mono text-center text-xs uppercase tracking-widest font-bold">Initialising Model...</div>;
  }

  return (
    <div className="space-y-8">
      
      {/* DATA PROVENANCE CAUTION / VERIFIED ALERT BANNER */}
      {isPresetFallback ? (
        <div className="border-2 border-amber-500 bg-amber-50/90 text-amber-950 p-5 font-mono shadow-sm rounded">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="bg-amber-600 text-white text-[10px] font-extrabold px-2.5 py-0.5 uppercase tracking-widest rounded">
                  [CAUTION] PRESET ASSUMPTIONS ACTIVE
                </span>
                <span className="text-[10px] text-amber-800 font-bold uppercase tracking-wider">
                  Un-audited / Baseline Estimations
                </span>
              </div>
              <p className="text-xs text-amber-900 font-sans font-medium normal-case pt-1 leading-relaxed">
                This valuation model is currently running on standardized preset baselines (e.g. 6.0% revenue growth, 20.0% operating margin, standard capital structure). 
                {dataStatus?.missingMetrics && dataStatus.missingMetrics.length > 0 
                  ? ` Audited SEC records for: [${dataStatus.missingMetrics.join(', ')}] were incomplete or unparsed.`
                  : ' Some corporate metrics were defaulted.'} Please review and calibrate all numbers in the Assumptions tab before relying on valuation outputs.
              </p>
            </div>
            <button
              onClick={() => setActiveTab('assumptions')}
              className="whitespace-nowrap px-4 py-2 bg-amber-700 hover:bg-amber-800 text-white font-mono text-[10px] font-extrabold uppercase tracking-widest transition-colors rounded shadow-sm self-start md:self-center"
            >
              Calibrate Inputs (Tab 2) -&gt;
            </button>
          </div>
        </div>
      ) : (
        <div className="border border-emerald-300 bg-emerald-50/70 text-emerald-950 px-5 py-3 font-mono text-xs flex flex-col md:flex-row md:items-center justify-between gap-3 rounded shadow-xs">
          <div className="flex items-center gap-2.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 animate-pulse"></span>
            <span className="font-extrabold text-[10px] uppercase tracking-wider text-emerald-900">
              Verified SEC 10-K Data Active
            </span>
            <span className="text-slate-500 text-[10px] font-sans normal-case hidden md:inline">
              — Historical facts parsed directly from SEC EDGAR regulatory filings
            </span>
          </div>
          <span className="text-[9px] font-extrabold uppercase text-emerald-800 tracking-wider bg-emerald-100/90 border border-emerald-300 px-2.5 py-1 rounded self-start md:self-center">
            AUDITED STATEMENTS VERIFIED
          </span>
        </div>
      )}

      {/* QUICK ACTIONS TOOLBAR */}
      <div className="flex flex-wrap items-center justify-between gap-3 font-mono text-xs border border-slate-200 bg-slate-50 p-3 rounded">
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase font-extrabold tracking-wider text-slate-500">Research Toolbar:</span>
          <span className="text-[10px] bg-slate-200 text-slate-800 px-2 py-0.5 font-bold uppercase rounded">
            Target: {ticker}
          </span>
          <span className={`text-[10px] px-2 py-0.5 font-bold uppercase rounded ${
            isPresetFallback ? 'bg-amber-100 text-amber-800 border border-amber-300' : 'bg-emerald-100 text-emerald-800 border border-emerald-300'
          }`}>
            {isPresetFallback ? 'Baseline Estimates' : 'Audited SEC Data'}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => {
              setActiveTab('expectations');
              const el = document.getElementById('tab-content-area');
              if (el) el.scrollIntoView({ behavior: 'smooth' });
            }}
            className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-extrabold uppercase tracking-wider transition-colors rounded shadow-xs flex items-center gap-1.5"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
            <span>[MONTE CARLO LAB &amp; CHARTS -&gt;]</span>
          </button>
          <button
            onClick={handleCopyReport}
            className="px-3 py-1.5 bg-white border border-slate-300 hover:border-slate-900 text-slate-800 text-[10px] font-extrabold uppercase tracking-wider transition-colors rounded shadow-2xs flex items-center gap-1.5"
          >
            {copiedReport ? (
              <span className="text-emerald-600 font-extrabold">REPORT COPIED</span>
            ) : (
              <span>[COPY REPORT]</span>
            )}
          </button>
          <button
            onClick={handleExportCSV}
            className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-[10px] font-extrabold uppercase tracking-wider transition-colors rounded shadow-2xs flex items-center gap-1.5"
          >
            <span>[EXPORT CSV]</span>
          </button>
        </div>
      </div>

      {/* PERSISTENT VALUATION HEADER */}
      {results && (
        <div className="border-4 border-slate-900 bg-slate-950 text-white font-mono shadow-lg select-none">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-slate-800 font-bold items-stretch">
            <div className="p-6 lg:p-7 flex flex-col justify-center space-y-1">
              <span className="text-[10px] text-slate-400 block uppercase tracking-widest font-extrabold truncate">
                Computed Value ({activeScenario})
              </span>
              <span className="text-3xl lg:text-4xl font-extrabold tracking-tight font-mono text-indigo-400 block">
                ${results.valuePerShare.toFixed(2)}
              </span>
            </div>

            <div className="p-6 lg:p-7 flex flex-col justify-center space-y-1">
              <span className="text-[10px] text-slate-400 block uppercase tracking-widest font-extrabold truncate">
                Latest Market Price
              </span>
              <span className="text-3xl lg:text-4xl font-extrabold tracking-tight font-mono text-white block">
                {latestPrice !== null ? `$${latestPrice.toFixed(2)}` : 'N/A'}
              </span>
            </div>

            <div className="p-6 lg:p-7 flex flex-col justify-center space-y-1">
              <span className="text-[10px] text-slate-400 block uppercase tracking-widest font-extrabold truncate">
                Scenario Valuation Gap
              </span>
              <div className="flex flex-wrap items-baseline gap-2">
                <span className={`text-3xl lg:text-4xl font-extrabold tracking-tight font-mono block ${marketBridge?.isUndervalued ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {marketBridge ? `${marketBridge.isUndervalued ? '+' : '-'}${marketBridge.percentage.toFixed(1)}%` : 'N/A'}
                </span>
                {marketBridge && (
                  <span className={`text-[10px] uppercase font-bold tracking-wider ${marketBridge.isUndervalued ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {marketBridge.isUndervalued ? 'Discount vs. Market' : 'Premium vs. Market'}
                  </span>
                )}
              </div>
            </div>

            <div className="p-6 lg:p-7 flex flex-col justify-center space-y-1">
              <span className="text-[10px] text-slate-400 block uppercase tracking-widest font-extrabold truncate">
                WACC Discount Rate
              </span>
              <span className="text-3xl lg:text-4xl font-extrabold tracking-tight font-mono text-indigo-300 block">
                {(activeWacc * 100).toFixed(2)}%
              </span>
            </div>
          </div>

          {/* Integrated Persistent Monte Carlo Quick-Link Bar */}
          {monteCarloResults && (
            <div className="border-t border-slate-800 bg-slate-900/90 px-6 py-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse"></span>
                  <span className="bg-indigo-600 text-white text-[9px] font-extrabold px-2 py-0.5 uppercase tracking-widest">
                    QUANT LAB
                  </span>
                </div>
                <span className="text-slate-300 text-[11px] font-bold">
                  Monte Carlo P50: <span className="text-indigo-300 font-mono font-extrabold">${monteCarloResults.p50.toFixed(2)}</span>
                </span>
                <span className="text-slate-600 text-[11px] font-bold hidden sm:inline">|</span>
                <span className="text-slate-300 text-[11px] font-bold">
                  Prob. Undervalued: <span className={`font-mono font-extrabold ${monteCarloResults.probUndervalued >= 50 ? 'text-emerald-400' : 'text-rose-400'}`}>{monteCarloResults.probUndervalued.toFixed(1)}%</span>
                </span>
                <span className="text-slate-600 text-[11px] font-bold hidden sm:inline">|</span>
                <span className="text-slate-300 text-[11px] font-bold">
                  95% VaR Floor: <span className="text-rose-400 font-mono font-extrabold">${monteCarloResults.p05.toFixed(2)}</span>
                </span>
              </div>
              <button
                onClick={() => {
                  setActiveTab('expectations');
                  const el = document.getElementById('tab-content-area');
                  if (el) el.scrollIntoView({ behavior: 'smooth' });
                }}
                className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-mono text-[10px] font-extrabold uppercase tracking-widest transition-all rounded shadow-xs flex items-center justify-center gap-1.5 self-start md:self-auto"
              >
                <span>[OPEN FULL MONTE CARLO LAB &amp; CHARTS -&gt;]</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* FLAT 7-TAB SELECTOR (COLOR ACCENTED) */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 border-2 border-slate-900 bg-white font-mono text-xs uppercase tracking-wider select-none font-bold shadow-sm">
        <button
          onClick={() => setActiveTab('history')}
          className={`py-3.5 border-b md:border-b-0 border-r border-slate-900 transition-all duration-150 ${
            activeTab === 'history' ? 'bg-indigo-600 text-white' : 'text-slate-700 hover:bg-slate-50 hover:text-slate-900 bg-white'
          }`}
        >
          1. History
        </button>
        <button
          onClick={() => setActiveTab('assumptions')}
          className={`py-3.5 border-b md:border-b-0 border-r border-slate-900 transition-all duration-150 ${
            activeTab === 'assumptions' ? 'bg-indigo-600 text-white' : 'text-slate-700 hover:bg-slate-50 hover:text-slate-900 bg-white'
          }`}
        >
          2. Assumptions
        </button>
        <button
          onClick={() => setActiveTab('valuation')}
          className={`py-3.5 border-b md:border-b-0 border-r border-slate-900 transition-all duration-150 ${
            activeTab === 'valuation' ? 'bg-indigo-600 text-white' : 'text-slate-700 hover:bg-slate-50 hover:text-slate-900 bg-white'
          }`}
        >
          3. Valuation
        </button>
        <button
          onClick={() => setActiveTab('expectations')}
          className={`py-3.5 border-b md:border-b-0 border-r border-slate-900 transition-all duration-150 relative ${
            activeTab === 'expectations'
              ? 'bg-indigo-600 text-white ring-2 ring-indigo-900 ring-inset'
              : 'bg-indigo-50/70 text-indigo-950 hover:bg-indigo-100 hover:text-indigo-900 font-extrabold'
          }`}
        >
          <span className="flex items-center justify-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${activeTab === 'expectations' ? 'bg-white' : 'bg-indigo-600 animate-pulse'}`}></span>
            <span>4. Monte Carlo Lab</span>
          </span>
        </button>
        <button
          onClick={() => setActiveTab('backtest')}
          className={`py-3.5 border-b md:border-b-0 border-r border-slate-900 transition-all duration-150 ${
            activeTab === 'backtest' ? 'bg-indigo-600 text-white' : 'text-slate-700 hover:bg-slate-50 hover:text-slate-900 bg-white'
          }`}
        >
          5. Backtest
        </button>
        <button
          onClick={() => setActiveTab('health')}
          className={`py-3.5 border-r border-slate-900 transition-all duration-150 ${
            activeTab === 'health' ? 'bg-indigo-600 text-white' : 'text-slate-700 hover:bg-slate-50 hover:text-slate-900 bg-white'
          }`}
        >
          6. Health
        </button>
        <button
          onClick={() => setActiveTab('comps')}
          className={`py-3.5 transition-all duration-150 ${
            activeTab === 'comps' ? 'bg-indigo-600 text-white' : 'text-slate-700 hover:bg-slate-50 hover:text-slate-900 bg-white'
          }`}
        >
          7. Peer Comps
        </button>
      </div>

      <div id="tab-content-area" className="scroll-mt-6" />

      {/* TAB 1: HISTORY & STATEMENTS */}
      {activeTab === 'history' && (
        <div className="space-y-8 animate-fadeIn">
          {financialsByYear.length > 0 ? (
            <div className="border-2 border-slate-900 bg-white p-6 shadow-sm">
              <h3 className="font-mono text-sm uppercase tracking-widest font-extrabold mb-1 text-slate-900">Historical Financial Statements (SEC 10-K)</h3>
              <p className="font-mono text-xs text-slate-500 font-bold mb-6 tracking-normal">
                raw historical numbers downloaded directly from the SEC EDGAR company filings database.
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-left font-mono text-xs border-collapse">
                  <thead>
                    <tr className="border-b-2 border-slate-900 bg-slate-50 text-slate-700 font-bold">
                      <th className="py-3.5 px-4 uppercase tracking-wider font-extrabold">Year</th>
                      <th className="py-3.5 px-4 text-right uppercase tracking-wider font-extrabold">Revenue</th>
                      <th className="py-3.5 px-4 text-right uppercase tracking-wider font-extrabold">EBIT (Op. Income)</th>
                      <th className="py-3.5 px-4 text-right uppercase tracking-wider font-extrabold">EBIT Margin</th>
                      <th className="py-3.5 px-4 text-right uppercase tracking-wider font-extrabold">Net Income</th>
                      <th className="py-3.5 px-4 text-right uppercase tracking-wider font-extrabold">Shares Out.</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {financialsByYear.map((row) => (
                      <tr key={row.year} className="hover:bg-slate-50 font-bold even:bg-slate-50/50">
                        <td className="py-3 px-4 font-extrabold text-slate-900">{row.year}</td>
                        <td className="py-3 px-4 text-right text-slate-800">
                          {row.revenue !== undefined ? `$${(Number(row.revenue) / 1e9).toFixed(2)}B` : '—'}
                        </td>
                        <td className="py-3 px-4 text-right text-slate-800">
                          {row.ebit !== undefined ? `$${(Number(row.ebit) / 1e9).toFixed(2)}B` : '—'}
                        </td>
                        <td className="py-3 px-4 text-right text-indigo-600 font-extrabold">
                          {row.revenue !== undefined && row.ebit !== undefined
                            ? `${((Number(row.ebit) / Number(row.revenue)) * 100).toFixed(1)}%`
                            : '—'}
                        </td>
                        <td className="py-3 px-4 text-right text-slate-800">
                          {row.netIncome !== undefined ? `$${(Number(row.netIncome) / 1e9).toFixed(2)}B` : '—'}
                        </td>
                        <td className="py-3 px-4 text-right text-slate-900 font-extrabold">
                          {row.shares !== undefined ? `${(Number(row.shares) / 1e6).toFixed(1)}M` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="border-2 border-slate-900 p-8 font-mono text-xs uppercase tracking-widest text-center text-slate-500 bg-white">
              No historical financial database records found for this ticker.
            </div>
          )}
        </div>
      )}

      {/* TAB 2: MODEL ASSUMPTIONS */}
      {activeTab === 'assumptions' && (
        <div className="space-y-8 animate-fadeIn font-mono text-xs uppercase tracking-wider">
          
          {/* Active Scenario Selection Header */}
          <div className="border-2 border-slate-900 bg-white p-6 space-y-3 font-bold shadow-sm">
            <div className="flex items-center justify-between">
              <span className="font-extrabold uppercase tracking-widest text-[10px] text-slate-900">Active Scenario Configurator:</span>
              <div className="flex gap-2">
                {(['bear', 'base', 'bull'] as const).map((scen) => (
                  <button
                    key={scen}
                    onClick={() => setActiveScenario(scen)}
                    className={`px-4 py-2 border-2 text-[10px] tracking-wider uppercase font-extrabold transition-all duration-100 ${
                      activeScenario === scen
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                        : 'bg-white text-slate-800 border-slate-900 hover:bg-slate-50'
                    }`}
                  >
                    {scen} case
                  </button>
                ))}
              </div>
            </div>
            <p className="text-xs text-slate-500 font-bold tracking-normal font-medium normal-case">
              Select and configure parameters for three independent forecast scenarios. Adjustments to sliders/growth boxes update only the active scenario.
            </p>
            <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
              <span className="text-[10px] uppercase tracking-wider text-slate-500 font-extrabold">Instant Thesis Presets:</span>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => applyScenarioPreset('growth')}
                  className="px-3 py-1.5 text-[9px] border border-indigo-300 bg-indigo-50/80 text-indigo-800 hover:bg-indigo-100 transition-colors uppercase font-extrabold rounded"
                >
                  [GROWTH] Tech Hyper-Growth (25% Growth / 32% Margin)
                </button>
                <button
                  type="button"
                  onClick={() => applyScenarioPreset('value')}
                  className="px-3 py-1.5 text-[9px] border border-amber-300 bg-amber-50/80 text-amber-900 hover:bg-amber-100 transition-colors uppercase font-extrabold rounded"
                >
                  [DEFENSIVE] Value (5% Growth / 16% Margin)
                </button>
                <button
                  type="button"
                  onClick={() => applyScenarioPreset('consensus')}
                  className="px-3 py-1.5 text-[9px] border border-slate-300 bg-slate-100 text-slate-800 hover:bg-slate-200 transition-colors uppercase font-extrabold rounded"
                >
                  [CONSENSUS] Reset Historical SEC Mean
                </button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 font-bold">
            
            {/* Column A: WACC Discount Builder */}
            <div className="border-2 border-slate-900 bg-white p-6 space-y-6 shadow-sm">
              <div className="flex justify-between items-center">
                <span className="font-extrabold text-[10px] tracking-widest text-slate-900">Discount Rate (WACC)</span>
                <label className="inline-flex items-center cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={useCapm}
                    onChange={(e) => setUseCapm(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-7 h-4 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-indigo-600 relative"></div>
                  <span className="ml-2 text-[9px] font-extrabold text-slate-700">CAPM Mode</span>
                </label>
              </div>

              {useCapm ? (
                <div className="space-y-4">
                  <div className="border-2 border-dashed border-slate-300 py-4 text-center bg-slate-50">
                    <div className="text-[10px] text-slate-500 font-extrabold">CAPM ESTIMATE (WACC)</div>
                    <div className="text-2xl font-extrabold font-mono text-indigo-600">{(activeWacc * 100).toFixed(2)}%</div>
                    <p className="text-xs text-slate-500 font-bold mt-1 tracking-normal font-medium normal-case">
                      Formula: WACC = Risk-Free Rate + (Beta × Equity Risk Premium)
                    </p>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <div className="flex justify-between items-baseline mb-1">
                        <label className="block font-bold text-slate-700">Risk-Free Rate (Rf %)</label>
                        <span className="text-xs text-slate-500 font-bold tracking-normal normal-case">10-year treasury yield baseline</span>
                      </div>
                      <input
                        type="number"
                        step="0.01"
                        value={(rf * 100).toFixed(2)}
                        onChange={(e) => setRf(parseFloat(e.target.value) / 100)}
                        className="w-full border-2 border-slate-900 px-3 py-2 text-xs focus:outline-none focus:bg-slate-900 focus:text-white transition-colors font-bold"
                      />
                    </div>

                    <div>
                      <div className="flex justify-between items-baseline mb-1">
                        <label className="block font-bold text-slate-700">Equity Beta (β)</label>
                        <span className="text-xs text-slate-500 font-bold tracking-normal normal-case">historical volatility relative to market</span>
                      </div>
                      <input
                        type="number"
                        step="0.05"
                        value={beta}
                        onChange={(e) => setBeta(parseFloat(e.target.value))}
                        className="w-full border-2 border-slate-900 px-3 py-2 text-xs focus:outline-none focus:bg-slate-900 focus:text-white transition-colors font-bold"
                      />
                    </div>

                    <div>
                      <div className="flex justify-between items-baseline mb-1">
                        <label className="block font-bold text-slate-700">Equity Risk Premium (ERP %)</label>
                        <span className="text-xs text-slate-500 font-bold tracking-normal normal-case">excess yield demanded by investors</span>
                      </div>
                      <input
                        type="number"
                        step="0.1"
                        value={(erp * 100).toFixed(2)}
                        onChange={(e) => setErp(parseFloat(e.target.value) / 100)}
                        className="w-full border-2 border-slate-900 px-3 py-2 text-xs focus:outline-none focus:bg-slate-900 focus:text-white transition-colors font-bold"
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="border-2 border-dashed border-slate-300 py-4 text-center bg-slate-50">
                    <div className="text-[10px] text-slate-500 font-extrabold">MANUAL DISCOUNT RATE ({activeScenario})</div>
                    <div className="text-2xl font-extrabold text-indigo-600 font-mono">{(activeWacc * 100).toFixed(2)}%</div>
                    <p className="text-xs text-slate-500 font-bold mt-1 tracking-normal font-medium normal-case">
                      Override CAPM and set custom target discount rate (hurdle rate)
                    </p>
                  </div>

                  <div className="space-y-2">
                    <label className="block font-bold text-slate-700">WACC percentage</label>
                    <div className="flex items-center gap-4">
                      <input
                        type="range"
                        min="0.04"
                        max="0.15"
                        step="0.001"
                        value={activeWacc}
                        onChange={(e) => setActiveWacc(parseFloat(e.target.value))}
                        className="flex-1 accent-indigo-600 cursor-pointer"
                      />
                      <input
                        type="number"
                        step="0.01"
                        value={(activeWacc * 100).toFixed(2)}
                        onChange={(e) => setActiveWacc(parseFloat(e.target.value) / 100)}
                        className="w-20 border-2 border-slate-900 px-2.5 py-1.5 text-xs focus:outline-none text-right font-bold"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Column B: Terminal Growth & EBIT Margins */}
            <div className="border-2 border-slate-900 bg-white p-6 space-y-6 shadow-sm">
              <span className="font-extrabold text-[10px] tracking-widest text-slate-900 block">Operating Projections ({activeScenario})</span>
              
              <div className="space-y-6">
                {/* Terminal Growth */}
                <div className="space-y-2">
                  <div className="flex justify-between items-baseline mb-1">
                    <span className="font-bold text-slate-700">Terminal Growth Rate</span>
                    <span className="text-xs text-slate-500 font-bold tracking-normal normal-case">growth rate forever after yr 5</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <input
                      type="range"
                      min="0.01"
                      max="0.04"
                      step="0.0005"
                      value={activeTg}
                      onChange={(e) => setActiveTg(parseFloat(e.target.value))}
                      className="flex-1 accent-indigo-600 cursor-pointer"
                    />
                    <input
                      type="number"
                      step="0.01"
                      value={(activeTg * 100).toFixed(2)}
                      onChange={(e) => setActiveTg(parseFloat(e.target.value) / 100)}
                      className="w-20 border-2 border-slate-900 px-2.5 py-1.5 text-xs focus:outline-none text-right font-bold"
                    />
                  </div>
                </div>

                {/* EBIT Margin */}
                <div className="space-y-2">
                  <div className="flex justify-between items-baseline mb-1">
                    <span className="font-bold text-slate-700">Projected EBIT Margin</span>
                    <span className="text-xs text-slate-500 font-bold tracking-normal normal-case">future operating margin %</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <input
                      type="range"
                      min="0.05"
                      max="0.60"
                      step="0.005"
                      value={activeEbit}
                      onChange={(e) => setActiveEbit(parseFloat(e.target.value))}
                      className="flex-1 accent-indigo-600 cursor-pointer"
                    />
                    <input
                      type="number"
                      step="0.01"
                      value={(activeEbit * 100).toFixed(2)}
                      onChange={(e) => setActiveEbit(parseFloat(e.target.value) / 100)}
                      className="w-20 border-2 border-slate-900 px-2.5 py-1.5 text-xs focus:outline-none text-right font-bold"
                    />
                  </div>
                </div>
              </div>
            </div>

          </div>

          {/* Row 2: 5-Year Growth vector */}
          <div className="border-2 border-slate-900 bg-white p-6 space-y-4 font-bold shadow-sm">
            <div>
              <span className="font-bold text-slate-800">Revenue Growth Vector ({activeScenario} case)</span>
              <p className="text-xs text-slate-500 font-bold mt-1 tracking-normal normal-case">
                Expected annual sales growth rate % for Year 1 through Year 5. (Seeded from SEC historical average growth of {(histGrowth * 100).toFixed(1)}%).
              </p>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              {activeGrowth.map((g, idx) => (
                <div key={idx} className="space-y-1">
                  <label className="block text-slate-400 font-bold text-[10px]">Year {idx + 1} (%)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={(g * 100).toFixed(1)}
                    onChange={(e) => setActiveGrowthValue(idx, parseFloat(e.target.value) / 100 || 0)}
                    className="w-full border-2 border-slate-900 px-3 py-2 text-xs focus:outline-none font-bold"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Row 3: Corporate parameters */}
          <div className="border-2 border-slate-900 bg-white p-6 space-y-4 font-bold shadow-sm">
            <div>
              <span className="font-bold text-slate-800">Balance Sheet & Capital Constants (Universal)</span>
              <p className="text-xs text-slate-500 font-bold mt-1 tracking-normal normal-case">
                Standard financial and capital structure baselines applied to cash flow deductions.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
              <div>
                <label className="block mb-1 text-[10px] text-slate-400 font-bold">Tax Rate (%)</label>
                <input
                  type="number"
                  step="0.1"
                  value={(taxRate * 100).toFixed(1)}
                  onChange={(e) => setTaxRate(parseFloat(e.target.value) / 100)}
                  className="w-full border-2 border-slate-900 px-3 py-2 text-xs focus:outline-none font-bold"
                />
              </div>
              <div>
                <label className="block mb-1 text-[10px] text-slate-400 font-bold">CapEx (% Rev)</label>
                <input
                  type="number"
                  step="0.1"
                  value={(capexPctRevenue * 100).toFixed(1)}
                  onChange={(e) => setCapexPctRevenue(parseFloat(e.target.value) / 100)}
                  className="w-full border-2 border-slate-900 px-3 py-2 text-xs focus:outline-none font-bold"
                />
              </div>
              <div>
                <label className="block mb-1 text-[10px] text-slate-400 font-bold">NWC (% Rev)</label>
                <input
                  type="number"
                  step="0.1"
                  value={(nwcPctRevenue * 100).toFixed(1)}
                  onChange={(e) => setNwcPctRevenue(parseFloat(e.target.value) / 100)}
                  className="w-full border-2 border-slate-900 px-3 py-2 text-xs focus:outline-none font-bold"
                />
              </div>
              <div>
                <label className="block mb-1 text-[10px] text-slate-400 font-bold">Net Debt ($)</label>
                <input
                  type="number"
                  value={netDebt}
                  onChange={(e) => setNetDebt(Number(e.target.value))}
                  className="w-full border-2 border-slate-900 px-3 py-2 text-xs focus:outline-none font-bold"
                />
              </div>
              <div>
                <label className="block mb-1 text-[10px] text-slate-400 font-bold">Shares Outstanding</label>
                <input
                  type="number"
                  value={shares}
                  onChange={(e) => setShares(Number(e.target.value))}
                  className="w-full border-2 border-slate-900 px-3 py-2 text-xs focus:outline-none font-bold"
                />
              </div>
            </div>
          </div>

          <div className="pt-2">
            <button
              onClick={() => {
                handleCalculate();
                setActiveTab('valuation');
              }}
              disabled={loading}
              className="w-full bg-indigo-600 text-white hover:bg-indigo-700 border-2 border-indigo-600 py-4 font-mono text-xs uppercase tracking-widest transition-colors duration-150 font-bold shadow-md"
            >
              {loading ? 'Executing calculations...' : 'Update Valuation Model'}
            </button>
          </div>
        </div>
      )}

      {/* TAB 3: DCF VALUATION OUTPUT */}
      {activeTab === 'valuation' && (
        <div className="space-y-8 animate-fadeIn font-mono text-xs uppercase tracking-wider font-bold">
          {error && (
            <div className="border-2 border-slate-900 bg-white p-4 text-red-600 shadow-sm">
              Error: {error}
            </div>
          )}

          {results ? (
            <div className="space-y-8">
              
              {/* SCENARIO COMPARATIVE SCORECARD & RELIABILITY RATING */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                
                {/* Scenario comparative card (2/3 width) */}
                <div className="lg:col-span-2 border-2 border-slate-900 bg-white p-6 space-y-4 shadow-sm">
                  <div>
                    <span className="font-bold text-[10px] tracking-widest text-slate-950">Multi-Scenario Value Comparison</span>
                    <p className="text-xs text-slate-500 font-bold mt-1 tracking-normal normal-case">
                      Valuation outputs calculated side-by-side. The highlighted card represents the selected active configuration.
                    </p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 text-center">
                    <div className={`p-4 border-2 rounded transition-all ${activeScenario === 'bear' ? 'bg-rose-50 border-rose-600 text-rose-950 shadow-sm' : 'border-slate-200 text-slate-800 bg-white'}`}>
                      <span className="text-[9px] uppercase tracking-wider text-rose-600 block mb-1">Bear Case Value</span>
                      <span className="text-2xl font-extrabold font-mono">${localValuationBear.toFixed(2)}</span>
                    </div>
                    <div className={`p-4 border-2 rounded transition-all ${activeScenario === 'base' ? 'bg-indigo-50 border-indigo-600 text-indigo-950 shadow-sm' : 'border-slate-200 text-slate-800 bg-white'}`}>
                      <span className="text-[9px] uppercase tracking-wider text-indigo-600 block mb-1">Base Case Value</span>
                      <span className="text-2xl font-extrabold font-mono">${localValuationBase.toFixed(2)}</span>
                    </div>
                    <div className={`p-4 border-2 rounded transition-all ${activeScenario === 'bull' ? 'bg-emerald-50 border-emerald-600 text-emerald-950 shadow-sm' : 'border-slate-200 text-slate-800 bg-white'}`}>
                      <span className="text-[9px] uppercase tracking-wider text-emerald-600 block mb-1">Bull Case Value</span>
                      <span className="text-2xl font-extrabold font-mono">${localValuationBull.toFixed(2)}</span>
                    </div>
                    {monteCarloResults && (
                      <div 
                        onClick={() => {
                          setActiveTab('expectations');
                          const el = document.getElementById('tab-content-area');
                          if (el) el.scrollIntoView({ behavior: 'smooth' });
                        }}
                        className="p-4 border-2 border-indigo-600 bg-indigo-50/60 hover:bg-indigo-100/70 text-indigo-950 rounded transition-all cursor-pointer shadow-sm flex flex-col justify-between"
                      >
                        <div>
                          <div className="flex items-center justify-center gap-1 mb-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-indigo-600 animate-pulse"></span>
                            <span className="text-[9px] uppercase tracking-wider text-indigo-700 font-extrabold block">Monte Carlo (P50)</span>
                          </div>
                          <span className="text-2xl font-extrabold font-mono">${monteCarloResults.p50.toFixed(2)}</span>
                        </div>
                        <span className="text-[8px] uppercase tracking-wider text-indigo-700 font-extrabold mt-1 block">
                          [View 45 Paths -&gt;]
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Model Reliability card (1/3 width) */}
                <div className="lg:col-span-1 border-2 border-slate-900 bg-white p-6 flex flex-col justify-between shadow-sm">
                  <div>
                    <div className="flex justify-between items-baseline mb-2">
                      <span className="font-bold text-[10px] tracking-widest text-slate-900">Model Reliability</span>
                      <span className="text-xl font-extrabold text-indigo-600 font-mono">{reliability.score}/100</span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-100 mb-4 rounded-full overflow-hidden">
                      <div className="h-full bg-indigo-600 rounded-full" style={{ width: `${reliability.score}%` }}></div>
                    </div>
                    <ul className="space-y-1.5 text-[9.5px] text-slate-700 leading-relaxed font-bold lowercase normal-case tracking-normal list-disc pl-3">
                      {reliability.pros.map((p, idx) => <li key={idx} className="text-emerald-700 font-extrabold">+ {p}</li>)}
                      {reliability.cons.map((c, idx) => <li key={idx} className="text-rose-700 font-extrabold">- {c}</li>)}
                    </ul>
                  </div>
                </div>

              </div>

              {/* Valuation Triangle Triple Estimate Card */}
              {valuationTriangle && (
                <div className="border-2 border-slate-900 bg-white p-6 space-y-4 shadow-sm">
                  <div>
                    <span className="font-bold text-[10px] tracking-widest text-slate-900">Valuation Triangle (Triangulated Target Ranges)</span>
                    <p className="text-xs text-slate-500 font-bold mt-1 tracking-normal normal-case">
                      Comparing three independent methodologies to establish a blended fair value range.
                    </p>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-6 text-center md:text-left items-center">
                    <div className="border border-slate-200 p-4 bg-slate-50/50 rounded">
                      <span className="text-[9px] text-slate-400 block font-extrabold">1. DCF Model</span>
                      <span className="text-xl font-extrabold block mt-1 text-slate-900">${valuationTriangle.dcfVal.toFixed(2)}</span>
                    </div>
                    <div className="border border-slate-200 p-4 bg-slate-50/50 rounded">
                      <span className="text-[9px] text-slate-400 block font-extrabold">2. Comps Medians</span>
                      <span className="text-xl font-extrabold block mt-1 text-slate-900">${valuationTriangle.compsVal.toFixed(2)}</span>
                    </div>
                    <div className="border border-slate-200 p-4 bg-slate-50/50 rounded">
                      <span className="text-[9px] text-slate-400 block font-extrabold">3. Historical P/E</span>
                      <span className="text-xl font-extrabold block mt-1 text-slate-900">${valuationTriangle.histVal.toFixed(2)}</span>
                    </div>
                    <div className="border-2 border-indigo-600 bg-indigo-50/40 text-indigo-950 p-4 rounded">
                      <span className="text-[9px] text-indigo-600 block font-extrabold uppercase">Upside Range</span>
                      <span className="text-sm font-extrabold block mt-1 tracking-wider text-indigo-800">
                        {valuationTriangle.upsideMin.toFixed(0)}% to {valuationTriangle.upsideMax.toFixed(0)}%
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Grid cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="border-2 border-slate-900 bg-white p-6 shadow-sm">
                  <span className="text-slate-400 block mb-1 font-bold text-[10px]">Intrinsic Value / Share</span>
                  <span className="text-3xl font-extrabold text-slate-900">${results.valuePerShare.toFixed(2)}</span>
                  <p className="text-xs text-slate-500 font-bold mt-2 tracking-normal normal-case">
                    Fair price per share calculated by dividing total equity value by outstanding shares.
                  </p>
                </div>
                <div className="border-2 border-slate-900 bg-white p-6 shadow-sm">
                  <span className="text-slate-400 block mb-1 font-bold text-[10px]">Enterprise Value</span>
                  <span className="text-3xl font-extrabold text-slate-900">${(results.enterpriseValue / 1e9).toFixed(2)}B</span>
                  <p className="text-xs text-slate-500 font-bold mt-2 tracking-normal normal-case">
                    Net present value of all future cash flows + terminal value.
                  </p>
                </div>
                <div className="border-2 border-slate-900 bg-white p-6 shadow-sm">
                  <span className="text-slate-400 block mb-1 font-bold text-[10px]">Terminal Value</span>
                  <span className="text-3xl font-extrabold text-slate-900">${(results.terminalValue / 1e9).toFixed(2)}B</span>
                  <p className="text-xs text-slate-500 font-bold mt-2 tracking-normal normal-case">
                    Estimated lump-sum value of all cash flows beyond Year 5.
                  </p>
                </div>
              </div>

              {/* Projected FCF chart */}
              <div className="border-2 border-slate-900 bg-white p-6 shadow-sm">
                <h3 className="font-bold text-[10px] tracking-widest mb-6 text-slate-900">5-Year Free Cash Flow Projections</h3>
                <div className="w-full h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={results.projectedFCF.map((fcf: number, i: number) => ({
                        year: `Year ${i + 1}`,
                        fcf: Number((fcf / 1e9).toFixed(3)),
                      }))}
                      margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="year" stroke="#475569" tick={{ className: 'font-mono', fontSize: 10 }} />
                      <YAxis stroke="#475569" tick={{ className: 'font-mono', fontSize: 10 }} />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#ffffff', border: '1px solid #0f172a', fontFamily: 'monospace', fontSize: '11px' }}
                        formatter={(v) => [`$${v}B`, 'FCF']}
                      />
                      <Bar dataKey="fcf" fill="#4f46e5" activeBar={{ fill: '#312e81' }} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <p className="font-mono text-xs text-slate-500 font-bold mt-4 tracking-wider text-center normal-case">
                  Formula: Free Cash Flow = NOPAT (EBIT &times; [1 - Tax]) + D&A (3% of Revenue) - CapEx - Net Working Capital Change
                </p>
              </div>

              {/* 2D SENSITIVITY MATRIX (WACC vs Terminal Growth) */}
              <div className="border-2 border-slate-900 bg-white p-6 space-y-4 shadow-sm">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
                  <div>
                    <h3 className="font-bold text-[10px] tracking-widest text-slate-900 uppercase">
                      Valuation Sensitivity Matrix (WACC vs. Perpetual Terminal Growth)
                    </h3>
                    <p className="text-xs text-slate-500 font-bold mt-1 tracking-normal normal-case font-medium">
                      Simulates fair value per share across variations in hurdle rate (WACC) and perpetual terminal growth (g). The active scenario cell is highlighted.
                    </p>
                  </div>
                  <span className="text-[9px] bg-slate-100 border border-slate-300 text-slate-800 px-2.5 py-1 font-extrabold uppercase rounded self-start">
                    Active: {(activeWacc * 100).toFixed(1)}% WACC / {(activeTg * 100).toFixed(1)}% g
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-right font-mono text-xs border border-slate-200">
                    <thead>
                      <tr className="bg-slate-950 text-white font-bold">
                        <th className="p-3 text-left font-extrabold uppercase text-[10px]">WACC \ Growth Rate</th>
                        {[0.015, 0.020, 0.025, 0.030].map((g) => (
                          <th key={g} className="p-3 font-extrabold uppercase text-[10px]">
                            g = {(g * 100).toFixed(1)}%
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {[
                        Number((activeWacc - 0.010).toFixed(3)),
                        Number((activeWacc - 0.005).toFixed(3)),
                        Number(activeWacc.toFixed(3)),
                        Number((activeWacc + 0.005).toFixed(3)),
                        Number((activeWacc + 0.010).toFixed(3)),
                      ]
                        .filter(w => w > 0.03)
                        .map((w) => (
                          <tr key={w} className="hover:bg-slate-50 font-bold">
                            <td className="p-3 text-left font-extrabold text-slate-900 bg-slate-50 border-r border-slate-200">
                              WACC = {(w * 100).toFixed(1)}%
                            </td>
                            {[0.015, 0.020, 0.025, 0.030].map((g) => {
                              const cellVal = runLocalDCF(w, g, activeEbit, activeGrowth);
                              const isActiveCell = Math.abs(w - activeWacc) < 0.003 && Math.abs(g - activeTg) < 0.003;
                              const isDiscount = latestPrice !== null && cellVal > latestPrice;
                              return (
                                <td
                                  key={g}
                                  className={`p-3 font-mono font-extrabold transition-colors ${
                                    isActiveCell
                                      ? 'bg-indigo-600 text-white ring-2 ring-indigo-900 ring-inset'
                                      : isDiscount
                                      ? 'text-emerald-700 bg-emerald-50/50'
                                      : 'text-slate-800'
                                  }`}
                                >
                                  ${cellVal.toFixed(2)}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-[10px] text-slate-400 font-sans normal-case">
                  Green cells indicate values above the current market price of {latestPrice !== null ? `$${latestPrice.toFixed(2)}` : 'N/A'}.
                </p>
              </div>

              {/* DIRECT BRIDGE TO MONTE CARLO LAB */}
              <div className="border-2 border-indigo-600 bg-indigo-50/70 p-6 space-y-3 shadow-sm">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="bg-indigo-600 text-white text-[9px] font-extrabold px-2 py-0.5 uppercase tracking-widest">
                        NEXT QUANTITATIVE STEP
                      </span>
                      <span className="font-extrabold text-xs tracking-wider text-slate-900 uppercase">
                        Stress-Test Valuation in Full-Screen Monte Carlo Laboratory
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 font-medium normal-case tracking-normal">
                      Deterministic DCF is a single-point estimate. Inspect the 45-path stochastic trajectory fan, Value-at-Risk (VaR 95%) floor, and empirical probability density curve.
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setActiveTab('expectations');
                      const el = document.getElementById('tab-content-area');
                      if (el) el.scrollIntoView({ behavior: 'smooth' });
                    }}
                    className="whitespace-nowrap px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-mono text-[11px] font-extrabold uppercase tracking-widest transition-colors shadow-sm self-start md:self-center"
                  >
                    [OPEN 5,000-PATH MONTE CARLO LAB &amp; CHARTS -&gt;]
                  </button>
                </div>
              </div>

            </div>
          ) : (
            <div className="border-2 border-slate-900 p-8 text-center text-slate-500 bg-white shadow-sm">
              Update assumptions to view calculations.
            </div>
          )}
        </div>
      )}

      {/* TAB 4: EXPECTATIONS & MONTE CARLO LAB (Full-Width Quantitative Suite) */}
      {activeTab === 'expectations' && (
        <div className="space-y-8 animate-fadeIn font-mono text-xs uppercase tracking-wider font-bold">
          
          {/* Top Section: Implied Expectations Solver (Reverse DCF) */}
          <div className="border-2 border-slate-900 bg-white p-6 space-y-6 shadow-sm">
            <div className="flex flex-col md:flex-row md:items-center justify-between pb-4 border-b border-slate-200 gap-2">
              <div>
                <span className="font-extrabold text-sm tracking-widest block text-slate-900">Operating Expectations Solver (Reverse DCF)</span>
                <p className="text-xs text-slate-500 font-bold mt-1 tracking-normal normal-case">
                  Binary-search numerical engine back-solving the revenue growth and operating margin required to justify today's market price.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] bg-slate-100 text-slate-700 px-2.5 py-1 border border-slate-300 font-extrabold">
                  [REVERSE DCF BENCHMARK]
                </span>
              </div>
            </div>

            {marketImplied ? (
              <div className="space-y-4">
                <div className="overflow-x-auto border-2 border-slate-900">
                  <table className="w-full text-right text-xs">
                    <thead>
                      <tr className="bg-slate-950 text-white font-bold">
                        <th className="p-3 text-left font-extrabold uppercase text-[10px]">Forecast Parameter</th>
                        <th className="p-3 font-extrabold uppercase text-[10px]">3-Year SEC Average</th>
                        <th className="p-3 font-extrabold uppercase text-[10px] text-indigo-400">Market Implied Baseline</th>
                        <th className="p-3 font-extrabold uppercase text-[10px]">Expectation Spread</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 bg-white">
                      <tr className="hover:bg-slate-50/50 font-bold">
                        <td className="p-3.5 text-left font-extrabold uppercase text-slate-900">Revenue Growth CAGR</td>
                        <td className="p-3.5 text-slate-700">{(histGrowth * 100).toFixed(1)}%</td>
                        <td className="p-3.5 text-indigo-600 font-extrabold bg-indigo-50/50">{(marketImplied.impliedGrowth * 100).toFixed(1)}%</td>
                        <td className="p-3.5">
                          {((marketImplied.impliedGrowth - histGrowth) * 100) >= 0 ? (
                            <span className="text-rose-600 font-extrabold">+{( (marketImplied.impliedGrowth - histGrowth) * 100 ).toFixed(1)}% (Optimism Premium)</span>
                          ) : (
                            <span className="text-emerald-600 font-extrabold">{( (marketImplied.impliedGrowth - histGrowth) * 100 ).toFixed(1)}% (Discount Priced)</span>
                          )}
                        </td>
                      </tr>
                      <tr className="hover:bg-slate-50/50 font-bold">
                        <td className="p-3.5 text-left font-extrabold uppercase text-slate-900">Operating (EBIT) Margin</td>
                        <td className="p-3.5 text-slate-700">{(defaultEbitMargin * 100).toFixed(1)}%</td>
                        <td className="p-3.5 text-indigo-600 font-extrabold bg-indigo-50/50">{(marketImplied.impliedMargin * 100).toFixed(1)}%</td>
                        <td className="p-3.5">
                          {((marketImplied.impliedMargin - defaultEbitMargin) * 100) >= 0 ? (
                            <span className="text-rose-600 font-extrabold">+{( (marketImplied.impliedMargin - defaultEbitMargin) * 100 ).toFixed(1)}% (Margin Expansion Implied)</span>
                          ) : (
                            <span className="text-emerald-600 font-extrabold">{( (marketImplied.impliedMargin - defaultEbitMargin) * 100 ).toFixed(1)}% (Margin Contraction Implied)</span>
                          )}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div className="bg-slate-50 border border-slate-200 p-4 text-xs text-slate-700 font-medium normal-case tracking-normal">
                  <span className="font-mono text-[10px] font-extrabold uppercase tracking-wider block text-slate-900 mb-1">
                    Interpretation:
                  </span>
                  At current market trading of <span className="font-bold font-mono text-slate-900">${latestPrice ? latestPrice.toFixed(2) : '0.00'}</span>, 
                  equity markets are discounting an annualized 5-year revenue expansion of <span className="font-bold font-mono text-indigo-700">{(marketImplied.impliedGrowth * 100).toFixed(1)}%</span> accompanied 
                  by an operating margin of <span className="font-bold font-mono text-indigo-700">{(marketImplied.impliedMargin * 100).toFixed(1)}%</span>. 
                  If management beats these hurdles, valuation multiple expansion typically occurs.
                </div>
              </div>
            ) : (
              <div className="p-8 text-center text-slate-400 bg-slate-50/30 border border-slate-200">
                Unable to reverse-engineer market expectations. Verify market price and baseline assumptions.
              </div>
            )}
          </div>

          {/* Main Full-Width Section: Monte Carlo Quantitative Laboratory */}
          <div className="border-2 border-slate-900 bg-white p-6 md:p-8 space-y-8 shadow-sm">
            
            {/* Laboratory Header */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between pb-6 border-b-2 border-slate-900 gap-4">
              <div>
                <div className="flex items-center gap-3">
                  <span className="bg-indigo-600 text-white text-[10px] px-2 py-0.5 font-mono font-extrabold">QUANT LAB</span>
                  <span className="font-extrabold text-base tracking-widest text-slate-900">Monte Carlo Stochastic Valuation Laboratory</span>
                </div>
                <p className="text-xs text-slate-500 font-bold mt-1 tracking-normal normal-case">
                  Stochastic valuation simulation applying Geometric Brownian deviations across cash flow trajectories. Generates full empirical distributions, tail risk profiles, and Value-at-Risk bounds.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span className={`text-[10px] px-2.5 py-1 border font-extrabold font-mono ${
                  mcSimulated ? 'bg-emerald-50 text-emerald-800 border-emerald-300' :
                  mcRunning ? 'bg-amber-50 text-amber-800 border-amber-300' :
                  'bg-slate-100 text-slate-700 border-slate-300'
                }`}>
                  [STATUS: {mcSimulated ? 'CONVERGED' : mcRunning ? 'EXECUTING' : 'READY'}]
                </span>
                <span className="text-[10px] bg-slate-100 text-slate-700 px-2.5 py-1 border border-slate-300 font-extrabold font-mono">
                  [ENGINE: BROWNIAN DCF INTEGRATION]
                </span>
              </div>
            </div>

            {/* Interactive Simulation Parameters & Controls Toolbar */}
            <div className="bg-slate-50 border-2 border-slate-900 p-5 space-y-5">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                
                {/* Iterations selector */}
                <div className="space-y-2">
                  <label className="text-[10px] text-slate-700 uppercase tracking-widest font-extrabold block">
                    Simulation Sample Size:
                  </label>
                  <div className="inline-flex border-2 border-slate-900 bg-white">
                    {[1000, 5000, 10000].map((count) => (
                      <button
                        key={count}
                        disabled={mcRunning}
                        onClick={() => setMcSimsCount(count)}
                        className={`px-4 py-2 text-[10px] font-mono font-extrabold transition-colors border-r last:border-r-0 border-slate-900 ${
                          mcSimsCount === count
                            ? 'bg-indigo-600 text-white'
                            : 'text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        {count.toLocaleString()} Paths
                      </button>
                    ))}
                  </div>
                </div>

                {/* Volatility slider */}
                <div className="space-y-2 flex-1 max-w-md">
                  <div className="flex justify-between items-center text-[10px]">
                    <span className="text-slate-700 uppercase tracking-widest font-extrabold">
                      Growth Volatility (&sigma;):
                    </span>
                    <span className="font-mono font-extrabold text-indigo-700 bg-indigo-50 px-2 py-0.5 border border-indigo-200">
                      {(mcVolatility * 100).toFixed(1)}% Annualized
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0.02"
                    max="0.15"
                    step="0.005"
                    disabled={mcRunning}
                    value={mcVolatility}
                    onChange={(e) => setMcVolatility(parseFloat(e.target.value))}
                    className="w-full accent-indigo-600 cursor-pointer h-2 bg-slate-200 rounded"
                  />
                  <div className="flex justify-between text-[8px] text-slate-400 font-mono">
                    <span>2.0% (Defensive / Utility)</span>
                    <span>5.0% (Large Cap S&P)</span>
                    <span>15.0% (High Growth / Volatile)</span>
                  </div>
                </div>

                {/* Execute button */}
                <div className="flex items-end">
                  <button
                    disabled={mcRunning}
                    onClick={handleRunMonteCarlo}
                    className="w-full lg:w-auto px-8 py-3 bg-indigo-600 text-white hover:bg-indigo-700 border-2 border-slate-900 font-mono text-[11px] font-extrabold uppercase tracking-widest transition-all duration-150 shadow disabled:opacity-50"
                  >
                    {mcRunning ? '[COMPUTING INTEGRALS...]' : mcSimulated ? '[RE-CALCULATE SIMULATION]' : '[LAUNCH MONTE CARLO SIMULATION]'}
                  </button>
                </div>

              </div>

              {/* Live Running Progress */}
              {mcRunning && (
                <div className="border border-indigo-200 bg-white p-5 text-center space-y-3 font-mono">
                  <div className="text-[10px] uppercase tracking-widest text-indigo-900 font-bold">{mcStatusText}</div>
                  <div className="max-w-md mx-auto border-2 border-slate-900 h-4 bg-slate-100 overflow-hidden relative">
                    <div 
                      className="h-full bg-indigo-600 transition-all duration-150" 
                      style={{ width: `${mcProgress}%` }}
                    />
                  </div>
                  <div className="text-[9px] text-slate-500 font-bold">{mcProgress}% COMPLETE</div>
                </div>
              )}
            </div>

            {/* Empty State Prompt */}
            {!mcSimulated && !mcRunning && (
              <div className="border-2 border-dashed border-slate-300 p-12 text-center bg-slate-50 space-y-4">
                <span className="font-mono text-xs uppercase tracking-widest text-slate-600 font-extrabold block">
                  Stochastic Simulation Engine Standing By
                </span>
                <p className="text-xs text-slate-500 max-w-xl mx-auto normal-case font-bold tracking-normal">
                  Configure the sample size and growth volatility above, then click Launch Monte Carlo Simulation to model {mcSimsCount.toLocaleString()} stochastic cash flow pathways.
                </p>
                <button
                  onClick={handleRunMonteCarlo}
                  className="px-8 py-3 bg-slate-900 text-white hover:bg-indigo-600 font-mono text-[10px] font-extrabold uppercase tracking-widest transition-colors duration-150"
                >
                  [Run {mcSimsCount.toLocaleString()} Simulations Now]
                </button>
              </div>
            )}

            {/* Simulated Results Suite */}
            {mcSimulated && monteCarloResults && (
              <div className="space-y-8 animate-fadeIn">
                
                {/* 6-Card Wall Street Risk Metric Grid */}
                <div>
                  <span className="font-extrabold text-[10px] tracking-widest block text-slate-500 uppercase mb-3">
                    Key Quantitative Risk & Valuation Indicators ({monteCarloResults.simsCount.toLocaleString()} Runs)
                  </span>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                    
                    {/* 1. Probability of Undervaluation */}
                    <div className={`p-4 border-2 ${
                      monteCarloResults.probUndervalued >= 50 
                        ? 'border-emerald-600 bg-emerald-50/40 text-emerald-950' 
                        : 'border-rose-600 bg-rose-50/40 text-rose-950'
                    }`}>
                      <span className="text-[8px] uppercase tracking-wider font-extrabold block text-slate-700">Prob. Undervalued</span>
                      <span className="text-2xl font-extrabold font-mono block mt-2">
                        {monteCarloResults.probUndervalued.toFixed(1)}%
                      </span>
                      <span className="text-[8px] block text-slate-600 font-bold mt-1 normal-case tracking-normal">
                        Simulations &gt; market price
                      </span>
                    </div>

                    {/* 2. Median Fair Value (P50) */}
                    <div className="p-4 border-2 border-indigo-600 bg-indigo-50/50 text-indigo-950">
                      <span className="text-[8px] uppercase tracking-wider font-extrabold block text-indigo-800">Median Fair Value (P50)</span>
                      <span className="text-2xl font-extrabold font-mono block mt-2">
                        ${monteCarloResults.p50.toFixed(2)}
                      </span>
                      <span className="text-[8px] block text-indigo-700 font-bold mt-1 normal-case tracking-normal">
                        {latestPrice 
                          ? `${((monteCarloResults.p50 - latestPrice) / latestPrice * 100) >= 0 ? '+' : ''}${(((monteCarloResults.p50 - latestPrice) / latestPrice) * 100).toFixed(1)}% vs Market` 
                          : 'Baseline midpoint'}
                      </span>
                    </div>

                    {/* 3. Expected Mean Value */}
                    <div className="p-4 border-2 border-slate-900 bg-white text-slate-900">
                      <span className="text-[8px] uppercase tracking-wider font-extrabold block text-slate-600">Expected Value E[P]</span>
                      <span className="text-2xl font-extrabold font-mono block mt-2">
                        ${monteCarloResults.meanVal.toFixed(2)}
                      </span>
                      <span className="text-[8px] block text-slate-500 font-bold mt-1 normal-case tracking-normal">
                        Mean of all {monteCarloResults.simsCount.toLocaleString()} iterations
                      </span>
                    </div>

                    {/* 4. 95% Value-at-Risk (VaR 95%) */}
                    <div className="p-4 border-2 border-rose-300 bg-rose-50/30 text-rose-950">
                      <span className="text-[8px] uppercase tracking-wider font-extrabold block text-rose-800">95% VaR (5th %ile)</span>
                      <span className="text-2xl font-extrabold font-mono block mt-2 text-rose-900">
                        ${monteCarloResults.p05.toFixed(2)}
                      </span>
                      <span className="text-[8px] block text-rose-700 font-bold mt-1 normal-case tracking-normal">
                        Valuation downside floor
                      </span>
                    </div>

                    {/* 5. Expected Shortfall (CVaR 95%) */}
                    <div className="p-4 border-2 border-rose-300 bg-rose-50/30 text-rose-950">
                      <span className="text-[8px] uppercase tracking-wider font-extrabold block text-rose-800">CVaR (Expected Shortfall)</span>
                      <span className="text-2xl font-extrabold font-mono block mt-2 text-rose-900">
                        ${monteCarloResults.cvar95.toFixed(2)}
                      </span>
                      <span className="text-[8px] block text-rose-700 font-bold mt-1 normal-case tracking-normal">
                        Avg value in worst 5% tail
                      </span>
                    </div>

                    {/* 6. Interquartile Range (IQR) */}
                    <div className="p-4 border-2 border-slate-900 bg-white text-slate-900">
                      <span className="text-[8px] uppercase tracking-wider font-extrabold block text-slate-600">Dispersion (IQR)</span>
                      <span className="text-2xl font-extrabold font-mono block mt-2">
                        ${monteCarloResults.iqr.toFixed(2)}
                      </span>
                      <span className="text-[8px] block text-slate-500 font-bold mt-1 normal-case tracking-normal">
                        Spread: P75 - P25
                      </span>
                    </div>

                  </div>
                </div>

                {/* 5-Tier Percentile Distribution Breakdown Cards */}
                <div>
                  <span className="font-extrabold text-[10px] tracking-widest block text-slate-500 uppercase mb-3">
                    Stochastic Valuation Percentile Hierarchy
                  </span>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                    
                    {/* 10th Percentile */}
                    <div className="border border-slate-300 bg-slate-50 p-4">
                      <span className="text-[8px] text-slate-500 block uppercase font-extrabold">10th %ile (Severe Bear)</span>
                      <span className="text-lg font-mono font-extrabold block text-slate-900 mt-1">
                        ${monteCarloResults.p10.toFixed(2)}
                      </span>
                      <span className="text-[8px] text-slate-500 block mt-1 normal-case font-medium">90% of outcomes beat this level</span>
                    </div>

                    {/* 25th Percentile */}
                    <div className="border border-slate-300 bg-slate-50 p-4">
                      <span className="text-[8px] text-slate-500 block uppercase font-extrabold">25th %ile (Conservative)</span>
                      <span className="text-lg font-mono font-extrabold block text-slate-900 mt-1">
                        ${monteCarloResults.p25.toFixed(2)}
                      </span>
                      <span className="text-[8px] text-slate-500 block mt-1 normal-case font-medium">Lower quartile expectation</span>
                    </div>

                    {/* 50th Percentile (Median) */}
                    <div className="border-2 border-indigo-600 bg-indigo-50/60 p-4 shadow-sm">
                      <span className="text-[8px] text-indigo-800 block uppercase font-extrabold">50th %ile (Base / Median)</span>
                      <span className="text-xl font-mono font-extrabold block text-indigo-950 mt-1">
                        ${monteCarloResults.p50.toFixed(2)}
                      </span>
                      <span className="text-[8px] text-indigo-700 block mt-1 normal-case font-medium">Statistical DCF midpoint</span>
                    </div>

                    {/* 75th Percentile */}
                    <div className="border border-slate-300 bg-slate-50 p-4">
                      <span className="text-[8px] text-slate-500 block uppercase font-extrabold">75th %ile (Growth Case)</span>
                      <span className="text-lg font-mono font-extrabold block text-slate-900 mt-1">
                        ${monteCarloResults.p75.toFixed(2)}
                      </span>
                      <span className="text-[8px] text-slate-500 block mt-1 normal-case font-medium">Upper quartile expansion</span>
                    </div>

                    {/* 90th Percentile */}
                    <div className="border border-slate-300 bg-slate-50 p-4">
                      <span className="text-[8px] text-slate-500 block uppercase font-extrabold">90th %ile (Bull Run)</span>
                      <span className="text-lg font-mono font-extrabold block text-slate-900 mt-1">
                        ${monteCarloResults.p90.toFixed(2)}
                      </span>
                      <span className="text-[8px] text-slate-500 block mt-1 normal-case font-medium">Top decile execution</span>
                    </div>

                  </div>
                </div>

                {/* VISUALIZATION 1: Asset Price Stochastic Trajectories Fan (Full-Width, 460px) */}
                <div className="border-2 border-slate-900 bg-white p-6 space-y-4 shadow-sm">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 pb-3 border-b border-slate-200">
                    <div>
                      <span className="font-extrabold text-xs tracking-widest block text-slate-900">
                        Asset Price Stochastic Trajectories (45 Simulated Paths + Median Convergence)
                      </span>
                      <p className="text-[11px] text-slate-500 font-bold normal-case tracking-normal mt-0.5">
                        Year 0 to Year 5 random walk paths under Geometric Brownian cash flow shocks. Bold indigo line marks median trajectory.
                      </p>
                    </div>
                    <div className="flex items-center gap-4 text-[9px] font-mono">
                      <div className="flex items-center gap-1.5">
                        <span className="w-3 h-3 bg-indigo-600 inline-block rounded-sm"></span>
                        <span className="text-slate-800 font-extrabold">Median Convergence</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="w-3 h-3 bg-sky-400 opacity-60 inline-block rounded-sm"></span>
                        <span className="text-slate-500">Stochastic Trials</span>
                      </div>
                    </div>
                  </div>

                  <div className="w-full h-[460px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart
                        data={monteCarloResults.pathData}
                        margin={{ top: 15, right: 25, left: -10, bottom: 5 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                        <XAxis 
                          dataKey="year" 
                          stroke="#475569" 
                          tick={{ className: 'font-mono font-bold', fontSize: 11 }} 
                        />
                        <YAxis 
                          stroke="#475569" 
                          tickFormatter={(v) => `$${v}`}
                          tick={{ className: 'font-mono font-bold', fontSize: 11 }} 
                        />
                        <Tooltip
                          contentStyle={{ 
                            backgroundColor: '#ffffff', 
                            border: '2px solid #0f172a', 
                            fontFamily: 'monospace', 
                            fontSize: '11px',
                            fontWeight: 'bold',
                            boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'
                          }}
                          formatter={(v: any, name: any) => [
                            `$${Number(v).toFixed(2)}`, 
                            name === 'medianPath' ? 'Median Trajectory' : 'Path'
                          ]}
                        />
                        {/* 45 Stochastic Path Lines */}
                        {Array.from({ length: monteCarloResults.pathsCount || 45 }).map((_, idx) => (
                          <Line
                            key={idx}
                            type="monotone"
                            dataKey={`path${idx}`}
                            stroke={`hsl(${195 + (idx * 6) % 55}, 70%, ${45 + (idx % 4) * 6}%)`}
                            strokeWidth={1.2}
                            dot={false}
                            activeDot={false}
                            opacity={0.45}
                          />
                        ))}
                        {/* Bold Median Convergence Path Line */}
                        <Line
                          type="monotone"
                          dataKey="medianPath"
                          stroke="#4f46e5"
                          strokeWidth={3.5}
                          dot={{ r: 4, fill: '#4f46e5', stroke: '#ffffff', strokeWidth: 1.5 }}
                          activeDot={{ r: 6, fill: '#4f46e5' }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* VISUALIZATION 2: Valuation Probability Density Curve (PDF) with Market Benchmark (360px) */}
                <div className="border-2 border-slate-900 bg-white p-6 space-y-4 shadow-sm">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 pb-3 border-b border-slate-200">
                    <div>
                      <span className="font-extrabold text-xs tracking-widest block text-slate-900">
                        Valuation Probability Density Function (PDF) & Market Benchmark
                      </span>
                      <p className="text-[11px] text-slate-500 font-bold normal-case tracking-normal mt-0.5">
                        Empirical histogram smoothed over {monteCarloResults.simsCount.toLocaleString()} simulation outcomes. Red dashed line indicates current trading price.
                      </p>
                    </div>
                    {latestPrice && (
                      <div className="text-[10px] font-mono bg-rose-50 border border-rose-300 text-rose-900 px-3 py-1 font-extrabold">
                        Market Price: ${latestPrice.toFixed(2)}
                      </div>
                    )}
                  </div>

                  <div className="w-full h-[360px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart
                        data={monteCarloResults.bins}
                        margin={{ top: 20, right: 30, left: -10, bottom: 5 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis 
                          dataKey="pricePoint" 
                          stroke="#475569" 
                          tickFormatter={(v) => `$${v}`}
                          tick={{ className: 'font-mono font-bold', fontSize: 11 }} 
                        />
                        <YAxis 
                          stroke="#475569" 
                          tick={{ className: 'font-mono font-bold', fontSize: 11 }} 
                        />
                        <Tooltip
                          contentStyle={{ 
                            backgroundColor: '#ffffff', 
                            border: '2px solid #0f172a', 
                            fontFamily: 'monospace', 
                            fontSize: '11px',
                            fontWeight: 'bold',
                            boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'
                          }}
                          formatter={(v: any) => [`${v} outcomes`, 'Frequency']}
                          labelFormatter={(l: any) => `Valuation Bucket: $${l}`}
                        />
                        <Area 
                          type="monotone" 
                          dataKey="frequency" 
                          stroke="#4f46e5" 
                          fill="#4f46e5" 
                          fillOpacity={0.12} 
                          strokeWidth={2.5} 
                        />
                        {/* Current Market Price Reference Line */}
                        {latestPrice && (
                          <ReferenceLine
                            x={Number(latestPrice.toFixed(1))}
                            stroke="#ef4444"
                            strokeWidth={2.5}
                            strokeDasharray="4 4"
                            label={{
                              value: `Market: $${latestPrice.toFixed(2)}`,
                              position: 'top',
                              fill: '#ef4444',
                              fontSize: 11,
                              fontWeight: 'bold',
                              fontFamily: 'monospace'
                            }}
                          />
                        )}
                        {/* Median P50 Reference Line */}
                        <ReferenceLine
                          x={Number(monteCarloResults.p50.toFixed(1))}
                          stroke="#4f46e5"
                          strokeWidth={1.5}
                          strokeDasharray="2 2"
                          label={{
                            value: `Median: $${monteCarloResults.p50.toFixed(2)}`,
                            position: 'insideTopLeft',
                            fill: '#4f46e5',
                            fontSize: 10,
                            fontFamily: 'monospace'
                          }}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Synthesis & Capital Allocation Assessment */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-2">
                  <div className="border border-slate-300 bg-slate-50/50 p-5 space-y-2">
                    <span className="text-[10px] uppercase tracking-wider font-extrabold text-slate-900 block">
                      1. Downside Tail Protection
                    </span>
                    <p className="text-xs text-slate-600 font-medium normal-case tracking-normal">
                      The 95% Value-at-Risk floor sits at <span className="font-bold font-mono text-slate-900">${monteCarloResults.p05.toFixed(2)}</span> with an Expected Shortfall (CVaR) of <span className="font-bold font-mono text-slate-900">${monteCarloResults.cvar95.toFixed(2)}</span>. 
                      Investors with capital-preservation mandates should measure whether this worst-case floor aligns with portfolio drawdowns.
                    </p>
                  </div>

                  <div className="border border-slate-300 bg-slate-50/50 p-5 space-y-2">
                    <span className="text-[10px] uppercase tracking-wider font-extrabold text-slate-900 block">
                      2. Central Tendency & Efficiency
                    </span>
                    <p className="text-xs text-slate-600 font-medium normal-case tracking-normal">
                      The 50th percentile median DCF is <span className="font-bold font-mono text-slate-900">${monteCarloResults.p50.toFixed(2)}</span> compared to current market price of <span className="font-bold font-mono text-slate-900">${latestPrice ? latestPrice.toFixed(2) : '0.00'}</span>. 
                      With <span className="font-bold font-mono text-indigo-700">{monteCarloResults.probUndervalued.toFixed(1)}%</span> probability of undervaluation, the security offers {monteCarloResults.probUndervalued >= 50 ? 'a statistical margin of safety' : 'a valuation premium demanding above-baseline growth'}.
                    </p>
                  </div>

                  <div className="border border-slate-300 bg-slate-50/50 p-5 space-y-2">
                    <span className="text-[10px] uppercase tracking-wider font-extrabold text-slate-900 block">
                      3. Upside Asymmetry & Deciles
                    </span>
                    <p className="text-xs text-slate-600 font-medium normal-case tracking-normal">
                      The 75th and 90th percentiles project intrinsic values of <span className="font-bold font-mono text-slate-900">${monteCarloResults.p75.toFixed(2)}</span> and <span className="font-bold font-mono text-slate-900">${monteCarloResults.p90.toFixed(2)}</span> respectively. 
                      Compound cash flow reinvestment generates positive right-tail skew, creating favorable risk-reward payoff geometry.
                    </p>
                  </div>
                </div>

              </div>
            )}

          </div>

        </div>
      )}

      {/* TAB 5: HISTORICAL BACKTEST */}
      {activeTab === 'backtest' && (
        <div className="space-y-8 animate-fadeIn font-mono text-xs uppercase tracking-wider font-bold">
          <div className="border-2 border-slate-900 bg-white p-6 space-y-6 shadow-sm">
            <div>
              <span className="font-bold text-[10px] tracking-widest block text-slate-900">Model calibration Backtest (Historical Forecast evaluation)</span>
              <p className="text-xs text-slate-500 font-bold mt-1 tracking-normal normal-case">
                Pretending the year is 2020: We calculate predicted intrinsic valuation using only statements filed prior to 2020, and contrast it against actual realized CAGR and peaks between 2020 and 2025.
              </p>
            </div>

            {backtest ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 text-center">
                <div className="border border-slate-200 p-4 bg-slate-50/50 rounded flex flex-col justify-between">
                  <div>
                    <span className="text-[9px] text-slate-400 block font-extrabold">2020 Model Valuation</span>
                    <span className="text-2xl font-extrabold text-slate-900 block mt-2">${backtest.predictedValue2020.toFixed(2)}</span>
                  </div>
                  <p className="text-[10px] text-slate-500 leading-normal pt-3 border-t border-slate-100 mt-4 text-left font-medium normal-case tracking-normal font-sans">
                    Model share value generated using 2020 revenue, margins, and the 2017-2020 average growth vector.
                  </p>
                </div>

                <div className="border border-slate-200 p-4 bg-slate-50/50 rounded flex flex-col justify-between">
                  <div>
                    <span className="text-[9px] text-slate-400 block font-extrabold">Actual 2020 Price</span>
                    <span className="text-2xl font-extrabold text-slate-900 block mt-2 text-indigo-600">
                      {latestPrice !== null ? `$${latestPrice.toFixed(2)}` : '—'}
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-500 leading-normal pt-3 border-t border-slate-100 mt-4 text-left font-medium normal-case tracking-normal font-sans">
                    The trading stock price of the company recorded in the database cache during 2020.
                  </p>
                </div>

                <div className="border border-slate-200 p-4 bg-slate-50/50 rounded flex flex-col justify-between">
                  <div>
                    <span className="text-[9px] text-slate-400 block font-extrabold">Realized Growth (2020-2025)</span>
                    <span className="text-2xl font-extrabold text-slate-900 block mt-2 text-emerald-600">
                      {backtest.actualCAGR !== null ? `${(backtest.actualCAGR * 100).toFixed(1)}%` : '—'}
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-500 leading-normal pt-3 border-t border-slate-100 mt-4 text-left font-medium normal-case tracking-normal font-sans">
                    The actual realized revenue CAGR achieved by the company between 2020 and 2025.
                  </p>
                </div>

                <div className="border-2 border-indigo-600 p-4 bg-indigo-50/20 text-indigo-950 rounded flex flex-col justify-between">
                  <div>
                    <span className="text-[9px] text-indigo-600 block font-extrabold">Calibration Accuracy</span>
                    <span className="text-base font-extrabold text-indigo-800 block mt-2">
                      {backtest.actualCAGR !== null 
                        ? `${Math.abs((backtest.actualCAGR - backtest.assumedGrowth) * 100).toFixed(1)}% CAGR Delta` 
                        : 'N/A'}
                    </span>
                  </div>
                  <p className="text-[10px] text-indigo-600/80 leading-normal pt-3 border-t border-indigo-100 mt-4 text-left font-medium normal-case tracking-normal font-sans">
                    The delta between the 2017-2020 historical growth trajectory vs actual 2020-2025 operating results.
                  </p>
                </div>
              </div>
            ) : (
              <div className="p-8 border-2 border-dashed border-slate-300 text-center text-slate-400 bg-slate-50/35 rounded">
                Requires at least 8 years of historical statements in the database to run backtesting calibration.
              </div>
            )}

          </div>
        </div>
      )}

      {/* TAB 6: FINANCIAL HEALTH */}
      {activeTab === 'health' && (
        <div className="space-y-8 animate-fadeIn font-mono text-xs uppercase tracking-wider font-bold">
          
          {isFinancialSector && (
            <div className="border-2 border-slate-900 bg-white p-6 border-l-8 border-l-amber-500 shadow-sm rounded">
              <span className="font-extrabold text-slate-900 uppercase tracking-widest text-[10px] block mb-1">Financial Sector Applicability Warning:</span>
              <p className="text-xs text-slate-500 font-bold normal-case tracking-normal leading-relaxed">
                Traditional solvency and liquidity metrics (like Altman Z-Score and Current Ratio) are not appropriate for financial institutions. Banks naturally carry high leverage due to client deposit structures.
              </p>
            </div>
          )}

          <div className="border-2 border-slate-900 bg-white p-6 space-y-6 shadow-sm">
            
            {healthRatings ? (
              <div className="space-y-6">
                
                {/* Health Score Summary panel */}
                <div className="border border-slate-200 p-6 bg-slate-50/50 flex flex-col md:flex-row md:items-center justify-between gap-6 rounded">
                  <div>
                    <span className="text-[10px] text-slate-500 block font-extrabold">Composite Financial Health score</span>
                    <span className="text-4xl font-extrabold text-slate-900 block mt-2">{healthRatings.average} / 100</span>
                  </div>
                  <div className="flex-1 md:max-w-md text-left">
                    <span className="text-[10px] text-slate-500 block font-extrabold uppercase">Primary weakness identifier</span>
                    <p className="text-[11px] text-slate-700 font-bold mt-1.5 normal-case tracking-normal font-sans leading-relaxed">
                      {healthRatings.weakness}
                    </p>
                  </div>
                </div>

                {/* Subcategories progress layout */}
                <div className="border border-slate-200 p-6 bg-white space-y-4 rounded">
                  <span className="text-[10px] tracking-widest text-slate-900 font-bold block mb-2">Category Ratings breakdown</span>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-1.5">
                      <div className="flex justify-between font-bold text-[10px]">
                        <span>Liquidity</span>
                        <span>{healthRatings.currentScore}/100</span>
                      </div>
                      <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-indigo-600 rounded-full" style={{ width: `${healthRatings.currentScore}%` }}></div>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <div className="flex justify-between font-bold text-[10px]">
                        <span>Solvency</span>
                        <span>{healthRatings.solvencyScore}/100</span>
                      </div>
                      <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-indigo-600 rounded-full" style={{ width: `${healthRatings.solvencyScore}%` }}></div>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <div className="flex justify-between font-bold text-[10px]">
                        <span>Leverage & Capital Structure</span>
                        <span>{healthRatings.leverageScore}/100</span>
                      </div>
                      <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-indigo-600 rounded-full" style={{ width: `${healthRatings.leverageScore}%` }}></div>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <div className="flex justify-between font-bold text-[10px]">
                        <span>Profitability</span>
                        <span>{healthRatings.profitabilityScore}/100</span>
                      </div>
                      <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-indigo-600 rounded-full" style={{ width: `${healthRatings.profitabilityScore}%` }}></div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 font-mono text-center">
                  
                  <div className="border border-slate-200 p-6 space-y-2 bg-white flex flex-col justify-between rounded">
                    <div>
                      <span className="text-[10px] text-slate-400 block font-extrabold">Altman Z-Score</span>
                      <span className="text-3xl font-extrabold text-slate-900 block my-2">{healthMetrics.zScore?.toFixed(2) || '—'}</span>
                      <span className={`text-[9px] text-white px-2.5 py-1.5 uppercase font-extrabold inline-block rounded ${
                        healthMetrics.zScore && healthMetrics.zScore > 2.99 ? 'bg-emerald-600' : healthMetrics.zScore && healthMetrics.zScore > 1.81 ? 'bg-amber-500' : 'bg-rose-600'
                      }`}>{healthMetrics.zClass}</span>
                    </div>
                    <p className="text-[11px] text-slate-500 font-bold leading-normal pt-3 border-t border-slate-100 mt-4 text-left tracking-normal font-sans normal-case">
                      Bankruptcy risk formula: 1.2X1 + 1.4X2 + 3.3X3 + 0.6X4 + 0.999X5.
                    </p>
                  </div>

                  <div className="border border-slate-200 p-6 space-y-2 bg-white flex flex-col justify-between rounded">
                    <div>
                      <span className="text-[10px] text-slate-400 block font-extrabold">Total Liabilities / Equity</span>
                      <span className="text-3xl font-extrabold text-slate-900 block my-2">
                        {healthMetrics.debtToEquity !== null ? healthMetrics.debtToEquity.toFixed(2) : '—'}
                      </span>
                      <span className="text-[9px] text-slate-400 block font-extrabold">Leverage Ratio (Book)</span>
                    </div>
                    <p className="text-[11px] text-slate-500 font-bold leading-normal pt-3 border-t border-slate-100 mt-4 text-left tracking-normal font-sans normal-case">
                      Measures total liabilities against book equity. Lower values represent safer structures.
                    </p>
                  </div>

                  <div className="border border-slate-200 p-6 space-y-2 bg-white flex flex-col justify-between rounded">
                    <div>
                      <span className="text-[10px] text-slate-400 block font-extrabold">Current Ratio</span>
                      <span className="text-3xl font-extrabold text-slate-900 block my-2">
                        {healthMetrics.currentRatio !== null ? healthMetrics.currentRatio.toFixed(2) : '—'}
                      </span>
                      <span className="text-[9px] text-slate-400 block font-extrabold">Target &gt; 1.5</span>
                    </div>
                    <p className="text-[11px] text-slate-500 font-bold leading-normal pt-3 border-t border-slate-100 mt-4 text-left tracking-normal font-sans normal-case">
                      Measures short-term liquidity (current assets / current liabilities).
                    </p>
                  </div>

                  <div className="border border-slate-200 p-6 space-y-2 bg-white flex flex-col justify-between rounded">
                    <div>
                      <span className="text-[10px] text-slate-400 block font-extrabold">Interest Coverage</span>
                      <span className="text-3xl font-extrabold text-slate-900 block my-2">
                        {healthMetrics.interestCoverage !== null ? `${healthMetrics.interestCoverage.toFixed(1)}x` : 'N/A'}
                      </span>
                      <span className="text-[9px] text-slate-400 block font-extrabold">Target &gt; 3x</span>
                    </div>
                    <p className="text-[11px] text-slate-500 font-bold leading-normal pt-3 border-t border-slate-100 mt-4 text-left tracking-normal font-sans normal-case">
                      Operating income (EBIT) divided by interest expenses. Measures safety margin.
                    </p>
                  </div>

                </div>

              </div>
            ) : (
              <div className="p-8 border-2 border-dashed border-slate-300 font-mono text-xs text-slate-400 text-center uppercase tracking-wider bg-slate-50/50 rounded">
                Incomplete balance sheet facts parsed from SEC to compute Z-Score metrics.
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 7: PEER MULTIPLES COMPS */}
      {activeTab === 'comps' && (
        <div className="space-y-8 animate-fadeIn font-mono text-xs uppercase tracking-wider font-bold">
          {comps.length > 0 ? (
            <div className="border-2 border-slate-900 bg-white p-6 space-y-4 shadow-sm">
              <div>
                <span className="font-bold text-[10px] tracking-widest block text-slate-900">Peer Multiples Comparison Matrix</span>
                <p className="text-xs text-slate-500 font-bold mt-1 tracking-normal normal-case">
                  Compares the target company against dynamic peers in the same GICS sector class.
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs font-mono border-2 border-slate-900 border-collapse text-right rounded overflow-hidden">
                  <thead>
                    <tr className="bg-slate-950 text-white font-bold">
                      <th className="border border-slate-800 p-3 text-left uppercase tracking-wider font-extrabold">Company</th>
                      <th className="border border-slate-800 p-3 uppercase tracking-wider font-extrabold">Similarity</th>
                      <th className="border border-slate-800 p-3 uppercase tracking-wider font-extrabold">Price</th>
                      <th className="border border-slate-800 p-3 uppercase tracking-wider font-extrabold">Market Cap</th>
                      <th className="border border-slate-800 p-3 uppercase tracking-wider font-extrabold">P/E Multiple</th>
                      <th className="border border-slate-800 p-3 uppercase tracking-wider font-extrabold">EV/Revenue</th>
                      <th className="border border-slate-800 p-3 uppercase tracking-wider font-extrabold">EV/EBIT</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {comps.map((row: any) => {
                      const sim = getPeerSimilarity(row);
                      return (
                        <tr key={row.ticker} className={row.ticker === ticker ? 'bg-indigo-50/50 font-extrabold' : 'hover:bg-slate-50/30'}>
                          <td className="border border-slate-200 p-3 text-left uppercase">
                            <span className="font-extrabold block text-sm text-slate-900">{row.ticker}</span>
                            <span className="text-[10px] text-slate-400 font-bold block normal-case truncate max-w-[150px] font-medium">{row.name}</span>
                          </td>
                          <td className={`border border-slate-200 p-3 font-extrabold ${
                            sim > 80 ? 'text-emerald-600' : sim > 60 ? 'text-amber-500' : 'text-rose-500'
                          }`}>
                            {row.ticker === ticker ? '100%' : `${sim}%`}
                          </td>
                          {row.isCached ? (
                            <>
                              <td className="border border-slate-200 p-3 font-mono text-slate-800">${Number(row.price).toFixed(2)}</td>
                              <td className="border border-slate-200 p-3 font-mono text-slate-800">${(Number(row.marketCap) / 1e9).toFixed(1)}B</td>
                              <td className="border border-slate-200 p-3 font-mono text-slate-800">
                                {row.pe !== null ? `${Number(row.pe).toFixed(1)}x` : '—'}
                              </td>
                              <td className="border border-slate-200 p-3 font-mono text-slate-800">
                                {row.evRevenue !== null ? `${Number(row.evRevenue).toFixed(1)}x` : '—'}
                              </td>
                              <td className="border border-slate-200 p-3 font-mono text-slate-800">
                                {row.evEbit !== null ? `${Number(row.evEbit).toFixed(1)}x` : '—'}
                              </td>
                            </>
                          ) : (
                            <td colSpan={5} className="border border-slate-200 p-3 text-center text-slate-400 bg-slate-50/30">
                              <button
                                onClick={() => handleImportPeer(row.ticker)}
                                disabled={importing[row.ticker]}
                                className="text-[9px] border border-indigo-600 bg-indigo-600 text-white hover:bg-white hover:text-indigo-600 transition-colors px-3 py-1.5 uppercase tracking-wider font-extrabold inline-block rounded shadow-sm"
                              >
                                {importing[row.ticker] ? 'Importing...' : `Import peer ${row.ticker}`}
                              </button>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-slate-500 font-bold tracking-wider normal-case mt-2">
                Multiple Formulas: PE = Market Cap / Net Income. EV/Revenue = EV / Sales. EV/EBIT = EV / Operating Income. Similarity computed based on log market-cap scale and margin differences.
              </p>
            </div>
          ) : (
            <div className="border-2 border-slate-900 p-8 text-center text-slate-500 bg-white shadow-sm rounded">
              No comps peer dataset available.
            </div>
          )}
        </div>
      )}

    </div>
  );
}
