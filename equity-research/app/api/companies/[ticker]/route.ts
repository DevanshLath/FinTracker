import { NextRequest, NextResponse } from 'next/server';
import { getCIKFromTicker, getCompanyNameFromCIK, syncFinancialsFromSEC } from '@/lib/sec-client';
import { 
  getCompanyByTicker, 
  insertCompany, 
  getFinancials, 
  updateCompanyMarketData, 
  insertMarketData, 
  getHistoricalPrices 
} from '@/lib/db';
import { fetchLiveMarketData } from '@/lib/market-data';

const SECTOR_PEERS: Record<string, string[]> = {
  'TECHNOLOGY': ['AAPL', 'MSFT', 'NVDA', 'ORCL'],
  'COMMUNICATION SERVICES': ['GOOGL', 'META', 'NFLX', 'DIS'],
  'CONSUMER CYCLICAL': ['AMZN', 'TSLA', 'HD', 'NKE'],
  'CONSUMER DEFENSIVE': ['WMT', 'PG', 'KO', 'PEP'],
  'FINANCIAL SERVICES': ['JPM', 'BAC', 'MS', 'GS'],
  'HEALTHCARE': ['LLY', 'JNJ', 'UNH', 'PFE'],
  'ENERGY': ['XOM', 'CVX', 'SHEL', 'COP'],
  'INDUSTRIALS': ['CAT', 'GE', 'HON', 'UNP'],
};

interface CompRow {
  ticker: string;
  name: string;
  price: number | null;
  marketCap: number | null;
  pe: number | null;
  evRevenue: number | null;
  evEbit: number | null;
  isCached: boolean;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const resolvedParams = await params;
  const ticker = resolvedParams.ticker.toUpperCase();

  try {
    let company = await getCompanyByTicker(ticker);

    if (!company) {
      let cik = await getCIKFromTicker(ticker);
      let name: string | null = null;

      if (cik) {
        name = await getCompanyNameFromCIK(cik);
      } else {
        // Fallback: If not found in SEC (e.g. ADRs, ETFs, dot-symbols), check live market data
        const marketCheck = await fetchLiveMarketData(ticker);
        if (marketCheck.latestPrice !== null) {
          cik = '0000000000';
          name = ticker;
        } else {
          return NextResponse.json({ error: `Symbol ${ticker} not found in SEC or market databases.` }, { status: 404 });
        }
      }

      const companyId = await insertCompany(ticker, cik, name || ticker);

      company = { 
        id: companyId, 
        ticker, 
        cik, 
        name: name || ticker, 
        latest_price: null, 
        beta: null, 
        sector: null,
        last_price_update: null 
      };

      // Sync financial data from SEC immediately on initial creation if valid CIK
      if (cik !== '0000000000') {
        try {
          await syncFinancialsFromSEC(companyId, cik);
        } catch (syncError: any) {
          console.warn('Warning: Financials sync failed on initial import:', syncError);
          // Do not crash the import. Let the company load with empty financial tables so the user can use manual assumptions inputs.
        }
      }
    } else {
      // If company exists, but has no financial facts, pull them
      const financials = await getFinancials(company.id, 5);
      if (!financials || financials.length === 0) {
        try {
          await syncFinancialsFromSEC(company.id, company.cik);
        } catch (syncError: any) {
          console.warn('Warning: Financials sync failed for existing company:', syncError);
          // Do not crash.
        }
      }
    }

    // Handle Market Data Caching - Cache expires after 12 hours
    const cacheExpiration = 12 * 60 * 60 * 1000;
    const shouldUpdateMarketData = !company.last_price_update || 
      (Date.now() - new Date(company.last_price_update).getTime() > cacheExpiration);

    if (shouldUpdateMarketData) {
      console.log(`Refreshing market data for ${ticker}...`);
      try {
        const marketData = await fetchLiveMarketData(ticker);
        const { latestPrice, beta, sector, historicalPrices } = marketData;

        if (latestPrice !== null || beta !== null || sector !== null) {
          await updateCompanyMarketData(company.id, latestPrice, beta, sector);
          if (latestPrice !== null) company.latest_price = latestPrice;
          if (beta !== null) company.beta = beta;
          if (sector !== null) company.sector = sector;
          company.last_price_update = new Date().toISOString();
        }

        if (historicalPrices && historicalPrices.length > 0) {
          for (const p of historicalPrices) {
            await insertMarketData(company.id, p.date, p.close);
          }
        }
      } catch (mErr) {
        console.error(`Error updating market data for ${ticker}:`, mErr);
      }
    }

    if (company.latest_price === null) {
      company.latest_price = 150.00;
    }
    if (company.beta === null) {
      company.beta = 1.0;
    }

    // Retrieve daily stock price timeline
    const stockChart = await getHistoricalPrices(company.id);

    // Standard macro rates (FRED completely removed)
    const riskFreeRate = 0.0425;
    const expectedInflation = 0.02;

    const financials = await getFinancials(company.id, 15); // Fetch 15 years to cover detailed ratios

    // Resolve sector-based peers dynamically
    const activeSector = (company.sector || '').toUpperCase();
    const peerTickers = SECTOR_PEERS[activeSector] || ['AAPL', 'MSFT', 'GOOGL'];
    const comps: CompRow[] = [];

    // Add target company to comps as reference
    const targetCompData = await calculateCompRow(company, financials);
    if (targetCompData) comps.push(targetCompData);

    for (const pTicker of peerTickers) {
      if (pTicker === ticker) continue;
      
      const pCompany = await getCompanyByTicker(pTicker);
      if (pCompany) {
        const pFinancials = await getFinancials(pCompany.id, 2);
        const compRow = await calculateCompRow(pCompany, pFinancials);
        if (compRow) {
          comps.push(compRow);
        } else {
          comps.push({ ticker: pTicker, name: pTicker, price: null, marketCap: null, pe: null, evRevenue: null, evEbit: null, isCached: false });
        }
      } else {
        comps.push({ ticker: pTicker, name: pTicker, price: null, marketCap: null, pe: null, evRevenue: null, evEbit: null, isCached: false });
      }
    }

    const hasAuditedRevenue = financials.some(f => f.metric === 'revenue' && Number(f.value) > 0);
    const hasAuditedEbit = financials.some(f => f.metric === 'operating_income' && Number(f.value) > 0);
    const hasAuditedShares = financials.some(f => f.metric === 'shares_outstanding' && Number(f.value) > 0);

    const isPreset = !hasAuditedRevenue || !hasAuditedEbit || !hasAuditedShares || financials.length === 0;
    const missingMetrics: string[] = [];
    if (!hasAuditedRevenue) missingMetrics.push('Revenue History');
    if (!hasAuditedEbit) missingMetrics.push('Operating Income (EBIT)');
    if (!hasAuditedShares) missingMetrics.push('Shares Outstanding');

    const dataStatus = {
      isPreset,
      dataSource: isPreset ? 'PRESET_BASELINE' : 'SEC_AUDITED',
      missingMetrics,
      warning: isPreset 
        ? `Preset baseline assumptions active. Full audited SEC filings for ${missingMetrics.join(', ')} were unavailable or using non-standard taxonomy.`
        : null
    };

    return NextResponse.json({ 
      company, 
      financials,
      stockChart,
      macro: {
        riskFreeRate,
        expectedInflation
      },
      comps,
      dataStatus
    }, {
      status: 200,
      headers: {
        'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
      },
    });
  } catch (error: any) {
    console.error('Error in company lookup API:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}

// Comps Helper to resolve values and calculate multiples
async function calculateCompRow(company: any, financials: any[]): Promise<CompRow | null> {
  try {
    const revs = financials.filter((f) => f.metric === 'revenue').sort((a, b) => b.fiscal_year - a.fiscal_year);
    const ebits = financials.filter((f) => f.metric === 'operating_income').sort((a, b) => b.fiscal_year - a.fiscal_year);
    const nis = financials.filter((f) => f.metric === 'net_income').sort((a, b) => b.fiscal_year - a.fiscal_year);
    const sharesOut = financials.filter((f) => f.metric === 'shares_outstanding').sort((a, b) => b.fiscal_year - a.fiscal_year);

    if (revs.length === 0 || sharesOut.length === 0) {
      return null;
    }

    const price = company.latest_price !== null ? Number(company.latest_price) : 150.00;
    const shares = Number(sharesOut[0].value);
    const revenue = Number(revs[0].value);
    const ebit = ebits.length > 0 ? Number(ebits[0].value) : 0;
    const netIncome = nis.length > 0 ? Number(nis[0].value) : 0;

    const marketCap = price * shares;
    const pe = netIncome > 0 ? marketCap / netIncome : null;
    const evRevenue = revenue > 0 ? marketCap / revenue : null;
    const evEbit = ebit > 0 ? marketCap / ebit : null;

    return {
      ticker: company.ticker,
      name: company.name,
      price,
      marketCap,
      pe,
      evRevenue,
      evEbit,
      isCached: true
    };
  } catch {
    return null;
  }
}
