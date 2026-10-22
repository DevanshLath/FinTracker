import axios from 'axios';

const FRED_BASE = 'https://api.stlouisfed.org/fred/series/observations';

function getApiKey(): string | null {
  const key = process.env.FRED_API_KEY;
  if (!key || key === 'your_free_key_here') {
    return null;
  }
  return key;
}

export async function fetchFredSeriesLatest(seriesId: string): Promise<number | null> {
  const apiKey = getApiKey();
  if (!apiKey) {
    console.warn(`FRED API key is not configured. Skipping fetch for series ${seriesId}.`);
    return null;
  }

  try {
    const url = `${FRED_BASE}?series_id=${seriesId}&api_key=${apiKey}&file_type=json&sort_order=desc&limit=5`;
    const res = await axios.get(url);
    const data = res.data;

    const observations = data?.observations;
    if (!observations || observations.length === 0) {
      console.warn(`No observations returned from FRED for series ${seriesId}`);
      return null;
    }

    // Iterate to find the latest valid numeric value (FRED occasionally has '.' for missing days)
    for (const obs of observations) {
      const valStr = obs.value;
      if (valStr && valStr !== '.') {
        const val = parseFloat(valStr);
        if (!isNaN(val)) {
          return val;
        }
      }
    }

    return null;
  } catch (error) {
    console.error(`Error querying FRED series ${seriesId}:`, error);
    return null;
  }
}

export async function fetchRiskFreeRate(): Promise<number | null> {
  // DGS10: 10-Year Treasury Constant Maturity Rate
  const yieldPct = await fetchFredSeriesLatest('DGS10');
  if (yieldPct === null) return null;
  return yieldPct / 100; // Convert e.g. 4.25% to 0.0425
}

export async function fetchExpectedInflation(): Promise<number | null> {
  // T10YIE: 10-Year Breakeven Inflation Rate
  const inflationPct = await fetchFredSeriesLatest('T10YIE');
  if (inflationPct === null) return null;
  return inflationPct / 100; // Convert e.g. 2.2% to 0.022
}
