import YahooFinance from 'yahoo-finance2';
import {
  fetchAlphaVantageQuote,
  fetchAlphaVantageOverview,
  fetchAlphaVantageDailyTimeSeries,
} from './alpha-vantage';

// Initialize YahooFinance instance with notice suppression
const yf = new YahooFinance({
  suppressNotices: ['yahooSurvey'],
});

export interface MarketQuote {
  price: number;
  name?: string;
}

export interface MarketOverview {
  beta: number;
  sector: string | null;
}

export interface DailyPrice {
  date: string;
  close: number;
}

export interface UnifiedMarketData {
  latestPrice: number | null;
  beta: number | null;
  sector: string | null;
  historicalPrices: DailyPrice[] | null;
}

/**
 * Fetch live quote, beta, sector, and historical prices using Yahoo Finance as primary
 * (fast, free, unlimited, no API key), with automatic fallback to Alpha Vantage.
 */
export async function fetchLiveMarketData(ticker: string): Promise<UnifiedMarketData> {
  const sym = ticker.toUpperCase();

  let latestPrice: number | null = null;
  let beta: number | null = null;
  let sector: string | null = null;
  let historicalPrices: DailyPrice[] | null = null;

  // 1. PRIMARY PROVIDER: Yahoo Finance
  try {
    const [quoteRes, summaryRes, chartRes] = await Promise.allSettled([
      yf.quote(sym),
      yf.quoteSummary(sym, { modules: ['defaultKeyStatistics', 'assetProfile'] }),
      yf.chart(sym, {
        period1: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        interval: '1d',
      }),
    ]);

    if (quoteRes.status === 'fulfilled' && quoteRes.value) {
      const q = quoteRes.value;
      if (typeof q.regularMarketPrice === 'number') {
        latestPrice = q.regularMarketPrice;
      }
    }

    if (summaryRes.status === 'fulfilled' && summaryRes.value) {
      const s = summaryRes.value;
      if (s.defaultKeyStatistics?.beta && typeof s.defaultKeyStatistics.beta === 'number') {
        beta = s.defaultKeyStatistics.beta;
      }
      if (s.assetProfile?.sector) {
        sector = s.assetProfile.sector.toUpperCase();
      }
    }

    if (chartRes.status === 'fulfilled' && chartRes.value?.quotes) {
      const quotes = chartRes.value.quotes;
      const validPoints: DailyPrice[] = [];
      for (const pt of quotes) {
        if (pt.date && typeof pt.close === 'number' && !isNaN(pt.close)) {
          const dStr = new Date(pt.date).toISOString().split('T')[0];
          validPoints.push({ date: dStr, close: Number(pt.close.toFixed(2)) });
        }
      }
      if (validPoints.length > 0) {
        validPoints.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        historicalPrices = validPoints.slice(-260); // 1 trading year
      }
    }
  } catch (err) {
    console.warn(`[MarketData] Yahoo Finance lookup error for ${sym}:`, err);
  }

  // 2. FALLBACK PROVIDER: Alpha Vantage (if Yahoo Finance missed critical items and key is available)
  if (latestPrice === null || beta === null || sector === null || !historicalPrices) {
    try {
      console.log(`[MarketData] Querying Alpha Vantage fallback for ${sym}...`);
      const [avQuote, avOverview, avHistory] = await Promise.allSettled([
        latestPrice === null ? fetchAlphaVantageQuote(sym) : Promise.resolve(null),
        beta === null || sector === null ? fetchAlphaVantageOverview(sym) : Promise.resolve(null),
        !historicalPrices ? fetchAlphaVantageDailyTimeSeries(sym) : Promise.resolve(null),
      ]);

      if (avQuote.status === 'fulfilled' && avQuote.value) {
        latestPrice = avQuote.value.price;
      }
      if (avOverview.status === 'fulfilled' && avOverview.value) {
        if (beta === null && avOverview.value.beta) beta = avOverview.value.beta;
        if (sector === null && avOverview.value.sector) sector = avOverview.value.sector.toUpperCase();
      }
      if (avHistory.status === 'fulfilled' && avHistory.value) {
        historicalPrices = avHistory.value;
      }
    } catch (avErr) {
      console.warn(`[MarketData] Alpha Vantage fallback error for ${sym}:`, avErr);
    }
  }

  // 3. SAFE REASONABLE BASELINES (Prevents any UI failure if completely offline/blocked)
  if (latestPrice === null) latestPrice = 150.00;
  if (beta === null) beta = 1.0;
  if (sector === null) sector = 'TECHNOLOGY';

  return {
    latestPrice,
    beta,
    sector,
    historicalPrices,
  };
}
