import { NextResponse } from 'next/server';
import { getCompanyByTicker } from '@/lib/db';

export async function GET() {
  const featured = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'TSLA'];
  const results = [];
  
  for (const t of featured) {
    try {
      const company = await getCompanyByTicker(t);
      results.push({
        ticker: t,
        isCached: !!company,
        price: company?.latest_price ? Number(company.latest_price) : null
      });
    } catch {
      results.push({
        ticker: t,
        isCached: false,
        price: null
      });
    }
  }

  return NextResponse.json({ featured: results });
}
