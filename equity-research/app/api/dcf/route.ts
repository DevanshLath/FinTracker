import { NextRequest, NextResponse } from 'next/server';
import { calculateDCF, DCFAssumptions } from '@/lib/calculations';
import { getCompanyByTicker, getFinancials } from '@/lib/db';

export async function POST(req: NextRequest) {
  try {
    const { 
      ticker, 
      wacc, 
      terminalGrowth, 
      ebitmMargin,
      taxRate = 0.21,
      capexPctRevenue = 0.04,
      nwcPctRevenue = 0.05,
      revenueGrowth = [0.05, 0.04, 0.03, 0.02, 0.015],
      shares,
      netDebt = 0
    } = await req.json();

    if (!ticker) {
      return NextResponse.json({ error: 'Ticker is required' }, { status: 400 });
    }
    if (wacc === undefined || terminalGrowth === undefined || ebitmMargin === undefined) {
      return NextResponse.json({ error: 'WACC, Terminal Growth, and EBIT Margin are required' }, { status: 400 });
    }

    const company = await getCompanyByTicker(ticker);
    if (!company) {
      return NextResponse.json({ error: 'Company not found in database. Search for the company first to import it.' }, { status: 404 });
    }

    const financials = await getFinancials(company.id, 5);
    if (!financials || !financials.length) {
      return NextResponse.json({ error: 'No historical financial data available in database.' }, { status: 400 });
    }

    const revenueData = financials.filter((f: any) => f.metric === 'revenue');
    if (!revenueData || !revenueData.length) {
      return NextResponse.json({ error: 'No historical revenue data available in database.' }, { status: 400 });
    }

    revenueData.sort((a: any, b: any) => b.fiscal_year - a.fiscal_year);
    const latestRevenue = Number(revenueData[0].value);

    // Resolve shares outstanding from DB if not provided manually
    let solvedShares = Number(shares);
    if (!solvedShares || isNaN(solvedShares) || solvedShares <= 0) {
      const sharesData = financials.filter((f: any) => f.metric === 'shares_outstanding');
      if (sharesData.length > 0) {
        sharesData.sort((a: any, b: any) => b.fiscal_year - a.fiscal_year);
        solvedShares = Number(sharesData[0].value);
      } else {
        return NextResponse.json({ 
          error: 'Shares outstanding could not be resolved from SEC filings. Please enter the share count manually.' 
        }, { status: 400 });
      }
    }

    const assumptions: DCFAssumptions = {
      wacc: Number(wacc),
      terminalGrowth: Number(terminalGrowth),
      revenueGrowth: revenueGrowth.map(Number),
      ebitmMargin: Number(ebitmMargin),
      taxRate: Number(taxRate),
      capexPctRevenue: Number(capexPctRevenue),
      nwcPctRevenue: Number(nwcPctRevenue),
      shares: solvedShares,
      netDebt: Number(netDebt),
    };

    const dcf = calculateDCF(latestRevenue, assumptions);

    return NextResponse.json({
      ...dcf,
      baseRevenue: latestRevenue,
      shares: solvedShares,
      assumptions
    });
  } catch (error: any) {
    console.error('Error in DCF calculation route:', error);
    return NextResponse.json({ error: error.message || 'Calculation failed' }, { status: 500 });
  }
}
