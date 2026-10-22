import axios from 'axios';

const ALPHA_VANTAGE_BASE = 'https://www.alphavantage.co/query';

function getApiKey(): string | null {
  const key = process.env.ALPHA_VANTAGE_API_KEY;
  if (!key || key === 'your_free_key_here') {
    return null;
  }
  return key;
}

interface QuoteData {
  price: number;
}

interface OverviewData {
  beta: number;
  sector: string | null;
}

interface DailyPrice {
  date: string;
  close: number;
}

export async function fetchAlphaVantageQuote(ticker: string): Promise<QuoteData | null> {
  const apiKey = getApiKey();
  if (!apiKey) {
    console.warn('Alpha Vantage API key is not configured. Skipping quote fetch.');
    return null;
  }

  try {
    const url = `${ALPHA_VANTAGE_BASE}?function=GLOBAL_QUOTE&symbol=${ticker.toUpperCase()}&apikey=${apiKey}`;
    const res = await axios.get(url);
    const data = res.data;

    if (data['Note']) {
      console.warn('Alpha Vantage rate limit reached (GLOBAL_QUOTE Note):', data['Note']);
      return null;
    }
    if (data['Error Message']) {
      console.error('Alpha Vantage error (GLOBAL_QUOTE):', data['Error Message']);
      return null;
    }

    const quote = data['Global Quote'];
    if (!quote || !quote['05. price']) {
      console.warn(`No quote data returned for ${ticker}`);
      return null;
    }

    return {
      price: parseFloat(quote['05. price']),
    };
  } catch (error) {
    console.error(`Error querying Alpha Vantage Quote for ${ticker}:`, error);
    return null;
  }
}

export async function fetchAlphaVantageOverview(ticker: string): Promise<OverviewData | null> {
  const apiKey = getApiKey();
  if (!apiKey) {
    console.warn('Alpha Vantage API key is not configured. Skipping overview fetch.');
    return null;
  }

  try {
    const url = `${ALPHA_VANTAGE_BASE}?function=OVERVIEW&symbol=${ticker.toUpperCase()}&apikey=${apiKey}`;
    const res = await axios.get(url);
    const data = res.data;

    if (data['Note']) {
      console.warn('Alpha Vantage rate limit reached (OVERVIEW Note):', data['Note']);
      return null;
    }
    if (data['Error Message']) {
      console.error('Alpha Vantage error (OVERVIEW):', data['Error Message']);
      return null;
    }

    // Overview endpoint returns empty object if ticker not found
    if (!data || Object.keys(data).length === 0) {
      console.warn(`No overview data returned for ${ticker}`);
      return null;
    }

    const betaVal = parseFloat(data['Beta']);
    const sectorVal = data['Sector'] || null;
    return {
      beta: isNaN(betaVal) ? 1.0 : betaVal,
      sector: sectorVal,
    };
  } catch (error) {
    console.error(`Error querying Alpha Vantage Overview for ${ticker}:`, error);
    return null;
  }
}

export async function fetchAlphaVantageDailyTimeSeries(ticker: string): Promise<DailyPrice[] | null> {
  const apiKey = getApiKey();
  if (!apiKey) {
    console.warn('Alpha Vantage API key is not configured. Skipping historical price fetch.');
    return null;
  }

  try {
    const url = `${ALPHA_VANTAGE_BASE}?function=TIME_SERIES_DAILY&symbol=${ticker.toUpperCase()}&apikey=${apiKey}`;
    const res = await axios.get(url);
    const data = res.data;

    if (data['Note']) {
      console.warn('Alpha Vantage rate limit reached (TIME_SERIES_DAILY Note):', data['Note']);
      return null;
    }
    if (data['Error Message']) {
      console.error('Alpha Vantage error (TIME_SERIES_DAILY):', data['Error Message']);
      return null;
    }

    const timeSeries = data['Time Series (Daily)'];
    if (!timeSeries) {
      console.warn(`No historical time series returned for ${ticker}`);
      return null;
    }

    const prices: DailyPrice[] = [];
    // Convert time series dictionary to sorted array
    for (const [dateStr, values] of Object.entries(timeSeries)) {
      const val = values as any;
      prices.push({
        date: dateStr,
        close: parseFloat(val['4. close']),
      });
    }

    // Sort by date ascending
    prices.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    
    // Slice to keep only the last 260 trading days (~1 year of history)
    return prices.slice(-260);
  } catch (error) {
    console.error(`Error querying Alpha Vantage historical prices for ${ticker}:`, error);
    return null;
  }
}
