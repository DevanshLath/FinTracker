import axios from 'axios';
import { insertFinancialFact } from './db';

const secHeaders = {
  'User-Agent': process.env.SEC_USER_AGENT || 'FinTracker research@fintracker.dev',
  'Accept-Encoding': 'gzip, deflate',
};

// In-memory cache for company_tickers.json mapping (ticker -> 10-digit CIK)
let tickerCikCache: { map: Map<string, string>; expiresAt: number } | null = null;

// Pacing queue for SEC requests: ensures we never exceed ~6 requests/sec (SEC limit is 10/sec)
let lastSecCallTime = 0;
const MIN_SEC_INTERVAL_MS = 160; // 160ms interval = ~6.25 requests/sec maximum

async function fetchFromSecWithRateLimit(url: string, headers = secHeaders, retries = 2): Promise<any> {
  const now = Date.now();
  const timeSinceLast = now - lastSecCallTime;
  if (timeSinceLast < MIN_SEC_INTERVAL_MS) {
    await new Promise((r) => setTimeout(r, MIN_SEC_INTERVAL_MS - timeSinceLast));
  }
  lastSecCallTime = Date.now();

  try {
    const res = await axios.get(url, { headers, timeout: 15000 });
    return res;
  } catch (error: any) {
    if (error.response?.status === 429 && retries > 0) {
      console.warn(`[SEC Rate Limit 429] Throttled by SEC. Backing off 2000ms before retry for ${url}...`);
      await new Promise((r) => setTimeout(r, 2000));
      return fetchFromSecWithRateLimit(url, headers, retries - 1);
    }
    throw error;
  }
}

export async function getCIKFromTicker(ticker: string): Promise<string | null> {
  const sym = ticker.toUpperCase();
  const variations = [
    sym,
    sym.replace('.', '-'),
    sym.replace('-', '.'),
    sym.replace('.', ''),
    sym.replace('-', ''),
  ];

  // 1. Serve from in-memory cache if available and not expired (24h TTL)
  if (tickerCikCache && Date.now() < tickerCikCache.expiresAt) {
    for (const v of variations) {
      const match = tickerCikCache.map.get(v);
      if (match) return match;
    }
  }

  const url = 'https://www.sec.gov/files/company_tickers.json';
  try {
    const res = await fetchFromSecWithRateLimit(url);
    const data = res.data;

    const newMap = new Map<string, string>();
    for (const key in data) {
      const item = data[key];
      if (item.ticker && item.cik_str !== undefined) {
        newMap.set(item.ticker.toUpperCase(), item.cik_str.toString().padStart(10, '0'));
      }
    }

    tickerCikCache = {
      map: newMap,
      expiresAt: Date.now() + 24 * 60 * 60 * 1000, // 24-hour cache
    };

    for (const v of variations) {
      const match = newMap.get(v);
      if (match) return match;
    }
    return null;
  } catch (error) {
    console.error(`Error fetching CIK for ticker ${ticker}:`, error);
    if (tickerCikCache) {
      for (const v of variations) {
        const match = tickerCikCache.map.get(v);
        if (match) return match;
      }
    }
    return null;
  }
}

export async function getCompanyNameFromCIK(cik: string): Promise<string | null> {
  const url = `https://data.sec.gov/submissions/CIK${cik}.json`;
  try {
    const res = await fetchFromSecWithRateLimit(url);
    return res.data?.name || null;
  } catch (error) {
    console.error(`Error fetching company submissions name for CIK ${cik}:`, error);
    return null;
  }
}

interface FactEntry {
  fy: number;
  fp: string;
  form: string;
  val: number;
  filed: string;
  frame?: string;
}

function extractAnnualFacts(conceptData: any, unitType = 'USD'): Record<number, { val: number; filed: string }> {
  if (!conceptData || !conceptData.units) {
    return {};
  }

  // Determine the currency key to use (handles EUR or alternative currencies for FPIs)
  let keyToUse = unitType;
  if (unitType === 'USD') {
    if (!conceptData.units[unitType]) {
      if (conceptData.units['EUR']) {
        keyToUse = 'EUR';
      } else {
        const availableKeys = Object.keys(conceptData.units);
        const altKey = availableKeys.find(k => k !== 'shares' && k !== 'pure');
        if (altKey) {
          keyToUse = altKey;
        }
      }
    }
  }

  if (!conceptData.units[keyToUse]) {
    return {};
  }

  const entries: FactEntry[] = conceptData.units[keyToUse];
  const yearMap: Record<number, { val: number; filed: string }> = {};

  for (const entry of entries) {
    // Foreign private issuers use Form 20-F for their annual reports
    if ((entry.form === '10-K' || entry.form === '20-F') && entry.fp === 'FY' && entry.fy) {
      const year = entry.fy;
      if (!yearMap[year] || new Date(entry.filed) > new Date(yearMap[year].filed)) {
        yearMap[year] = {
          val: entry.val,
          filed: entry.filed,
        };
      }
    }
  }
  return yearMap;
}

export async function syncFinancialsFromSEC(companyId: number, cik: string): Promise<void> {
  const url = `https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`;
  
  try {
    const res = await fetchFromSecWithRateLimit(url);
    const facts = res.data?.facts;
    if (!facts) {
      throw new Error(`No financial facts found in SEC data for CIK ${cik}`);
    }

    const usGaap = facts['us-gaap'] || {};
    const ifrs = facts['ifrs-full'] || {};
    const dei = facts['dei'] || {};

    // Standard metric tags mapped to both US GAAP and IFRS standards
    const revenueKeys = [
      'Revenues',
      'RevenueFromContractWithCustomerExcludingAssessedTax',
      'SalesRevenueNet',
      'SalesRevenueGoodsNet',
      'RevenueFromContractWithCustomerIncludingAssessedTax',
      'Revenue',
      'RevenueFromContractsWithCustomers'
    ];

    const ebitKeys = [
      'OperatingIncomeLoss', 
      'OperatingIncomeLossFromContinuingOperations',
      'OperatingProfitLoss'
    ];

    const netIncomeKeys = [
      'NetIncomeLoss', 
      'NetIncomeLossAvailableToCommonStockholdersBasic',
      'ProfitLoss'
    ];

    const sharesKeys = [
      'EntityCommonStockSharesOutstanding',
      'CommonStockSharesOutstanding',
      'WeightedAverageNumberOfSharesOutstandingBasic',
      'WeightedAverageNumberOfDilutedSharesOutstanding',
      'NumberOfSharesOutstanding'
    ];

    const assetsKeys = ['Assets'];
    const liabilitiesKeys = ['Liabilities'];
    const currentAssetsKeys = ['AssetsCurrent', 'CurrentAssets'];
    const currentLiabilitiesKeys = ['LiabilitiesCurrent', 'CurrentLiabilities'];
    const retainedEarningsKeys = ['RetainedEarningsAccumulatedDeficit', 'RetainedEarnings'];

    const interestExpenseKeys = [
      'InterestExpense', 
      'InterestAndDebtExpense', 
      'InterestExpenseDebt',
      'FinanceCosts'
    ];

    // Helper to resolve metric records
    const resolveMetric = (keys: string[], unit = 'USD') => {
      let data: Record<number, { val: number; filed: string }> = {};
      for (const key of [...keys].reverse()) {
        const source = usGaap[key] || ifrs[key] || dei[key];
        if (source) {
          const keyData = extractAnnualFacts(source, unit);
          data = { ...data, ...keyData };
        }
      }
      return data;
    };

    const revenueData = resolveMetric(revenueKeys, 'USD');
    const ebitData = resolveMetric(ebitKeys, 'USD');
    const netIncomeData = resolveMetric(netIncomeKeys, 'USD');
    const sharesData = resolveMetric(sharesKeys, 'shares');
    const assetsData = resolveMetric(assetsKeys, 'USD');
    const liabilitiesData = resolveMetric(liabilitiesKeys, 'USD');
    const currentAssetsData = resolveMetric(currentAssetsKeys, 'USD');
    const currentLiabilitiesData = resolveMetric(currentLiabilitiesKeys, 'USD');
    const retainedEarningsData = resolveMetric(retainedEarningsKeys, 'USD');
    const interestExpenseData = resolveMetric(interestExpenseKeys, 'USD');

    const allYears = new Set<number>([
      ...Object.keys(revenueData).map(Number),
      ...Object.keys(ebitData).map(Number),
      ...Object.keys(netIncomeData).map(Number),
      ...Object.keys(sharesData).map(Number),
      ...Object.keys(assetsData).map(Number),
      ...Object.keys(liabilitiesData).map(Number),
      ...Object.keys(currentAssetsData).map(Number),
      ...Object.keys(currentLiabilitiesData).map(Number),
      ...Object.keys(retainedEarningsData).map(Number),
      ...Object.keys(interestExpenseData).map(Number),
    ]);

    if (allYears.size === 0) {
      throw new Error(`Failed to parse any historical financial metrics for CIK ${cik}`);
    }

    for (const year of allYears) {
      if (revenueData[year]) {
        await insertFinancialFact(companyId, year, 'revenue', revenueData[year].val, url, revenueData[year].filed);
      }
      if (ebitData[year]) {
        await insertFinancialFact(companyId, year, 'operating_income', ebitData[year].val, url, ebitData[year].filed);
      }
      if (netIncomeData[year]) {
        await insertFinancialFact(companyId, year, 'net_income', netIncomeData[year].val, url, netIncomeData[year].filed);
      }
      if (sharesData[year]) {
        await insertFinancialFact(companyId, year, 'shares_outstanding', sharesData[year].val, url, sharesData[year].filed);
      }
      if (assetsData[year]) {
        await insertFinancialFact(companyId, year, 'total_assets', assetsData[year].val, url, assetsData[year].filed);
      }
      if (liabilitiesData[year]) {
        await insertFinancialFact(companyId, year, 'total_liabilities', liabilitiesData[year].val, url, liabilitiesData[year].filed);
      }
      if (currentAssetsData[year]) {
        await insertFinancialFact(companyId, year, 'current_assets', currentAssetsData[year].val, url, currentAssetsData[year].filed);
      }
      if (currentLiabilitiesData[year]) {
        await insertFinancialFact(companyId, year, 'current_liabilities', currentLiabilitiesData[year].val, url, currentLiabilitiesData[year].filed);
      }
      if (retainedEarningsData[year]) {
        await insertFinancialFact(companyId, year, 'retained_earnings', retainedEarningsData[year].val, url, retainedEarningsData[year].filed);
      }
      if (interestExpenseData[year]) {
        await insertFinancialFact(companyId, year, 'interest_expense', interestExpenseData[year].val, url, interestExpenseData[year].filed);
      }
    }
  } catch (error: any) {
    console.error(`Error syncing SEC facts for CIK ${cik}:`, error.message);
    throw new Error(`Failed to retrieve or parse SEC financial data for CIK ${cik}. Make sure the company exists, is active, or try again later.`);
  }
}
