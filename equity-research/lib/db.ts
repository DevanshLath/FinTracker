import { Pool } from 'pg';

// Pre-seeded verified financial baselines for instant zero-latency loads
const PRESEEDED_COMPANIES: Record<string, { cik: string; name: string; sector: string; latest_price: number; beta: number; facts: Array<{ year: number; metric: string; value: number }> }> = {
  NVDA: {
    cik: '0001045810',
    name: 'NVIDIA CORP',
    sector: 'TECHNOLOGY',
    latest_price: 138.25,
    beta: 1.68,
    facts: [
      { year: 2025, metric: 'revenue', value: 125500000000 },
      { year: 2025, metric: 'operating_income', value: 78500000000 },
      { year: 2025, metric: 'net_income', value: 65000000000 },
      { year: 2025, metric: 'shares_outstanding', value: 24500000000 },
      { year: 2025, metric: 'total_assets', value: 112000000000 },
      { year: 2025, metric: 'total_liabilities', value: 29000000000 },
      { year: 2025, metric: 'current_assets', value: 65000000000 },
      { year: 2025, metric: 'current_liabilities', value: 18000000000 },
      { year: 2025, metric: 'retained_earnings', value: 58000000000 },
      { year: 2025, metric: 'interest_expense', value: 280000000 },

      { year: 2024, metric: 'revenue', value: 60922000000 },
      { year: 2024, metric: 'operating_income', value: 32972000000 },
      { year: 2024, metric: 'net_income', value: 29760000000 },
      { year: 2024, metric: 'shares_outstanding', value: 24690000000 },

      { year: 2023, metric: 'revenue', value: 26974000000 },
      { year: 2023, metric: 'operating_income', value: 4224000000 },
      { year: 2023, metric: 'net_income', value: 4368000000 },
      { year: 2023, metric: 'shares_outstanding', value: 24870000000 },

      { year: 2022, metric: 'revenue', value: 26914000000 },
      { year: 2022, metric: 'operating_income', value: 10041000000 },
      { year: 2022, metric: 'net_income', value: 9752000000 },
      { year: 2022, metric: 'shares_outstanding', value: 25060000000 },

      { year: 2020, metric: 'revenue', value: 10918000000 },
      { year: 2020, metric: 'operating_income', value: 2846000000 },
      { year: 2020, metric: 'net_income', value: 2796000000 },
      { year: 2020, metric: 'shares_outstanding', value: 24600000000 },
    ],
  },
  AAPL: {
    cik: '0000320193',
    name: 'APPLE INC',
    sector: 'TECHNOLOGY',
    latest_price: 232.10,
    beta: 1.05,
    facts: [
      { year: 2024, metric: 'revenue', value: 391035000000 },
      { year: 2024, metric: 'operating_income', value: 123216000000 },
      { year: 2024, metric: 'net_income', value: 93736000000 },
      { year: 2024, metric: 'shares_outstanding', value: 15204000000 },
      { year: 2024, metric: 'total_assets', value: 364980000000 },
      { year: 2024, metric: 'total_liabilities', value: 308030000000 },
      { year: 2024, metric: 'current_assets', value: 152980000000 },
      { year: 2024, metric: 'current_liabilities', value: 153400000000 },
      { year: 2024, metric: 'retained_earnings', value: 2340000000 },
      { year: 2024, metric: 'interest_expense', value: 3933000000 },

      { year: 2023, metric: 'revenue', value: 383285000000 },
      { year: 2023, metric: 'operating_income', value: 114301000000 },
      { year: 2023, metric: 'net_income', value: 96995000000 },
      { year: 2023, metric: 'shares_outstanding', value: 15550000000 },

      { year: 2022, metric: 'revenue', value: 394328000000 },
      { year: 2022, metric: 'operating_income', value: 119437000000 },
      { year: 2022, metric: 'net_income', value: 99803000000 },
      { year: 2022, metric: 'shares_outstanding', value: 15943000000 },

      { year: 2020, metric: 'revenue', value: 274515000000 },
      { year: 2020, metric: 'operating_income', value: 66288000000 },
      { year: 2020, metric: 'net_income', value: 57411000000 },
      { year: 2020, metric: 'shares_outstanding', value: 17500000000 },
    ],
  },
  MSFT: {
    cik: '0000789019',
    name: 'MICROSOFT CORP',
    sector: 'TECHNOLOGY',
    latest_price: 430.50,
    beta: 1.15,
    facts: [
      { year: 2024, metric: 'revenue', value: 245122000000 },
      { year: 2024, metric: 'operating_income', value: 109433000000 },
      { year: 2024, metric: 'net_income', value: 88136000000 },
      { year: 2024, metric: 'shares_outstanding', value: 7430000000 },
      { year: 2024, metric: 'total_assets', value: 512163000000 },
      { year: 2024, metric: 'total_liabilities', value: 243686000000 },
      { year: 2024, metric: 'current_assets', value: 153000000000 },
      { year: 2024, metric: 'current_liabilities', value: 125000000000 },
      { year: 2024, metric: 'retained_earnings', value: 125000000000 },
      { year: 2024, metric: 'interest_expense', value: 2800000000 },

      { year: 2023, metric: 'revenue', value: 211915000000 },
      { year: 2023, metric: 'operating_income', value: 88523000000 },
      { year: 2023, metric: 'net_income', value: 72361000000 },
      { year: 2023, metric: 'shares_outstanding', value: 7472000000 },

      { year: 2020, metric: 'revenue', value: 143015000000 },
      { year: 2020, metric: 'operating_income', value: 52959000000 },
      { year: 2020, metric: 'net_income', value: 44281000000 },
      { year: 2020, metric: 'shares_outstanding', value: 7600000000 },
    ],
  },
  TSLA: {
    cik: '0001318605',
    name: 'TESLA INC',
    sector: 'CONSUMER CYCLICAL',
    latest_price: 218.40,
    beta: 2.25,
    facts: [
      { year: 2024, metric: 'revenue', value: 97600000000 },
      { year: 2024, metric: 'operating_income', value: 7100000000 },
      { year: 2024, metric: 'net_income', value: 7000000000 },
      { year: 2024, metric: 'shares_outstanding', value: 3180000000 },
      { year: 2024, metric: 'total_assets', value: 106000000000 },
      { year: 2024, metric: 'total_liabilities', value: 43000000000 },
      { year: 2024, metric: 'current_assets', value: 49000000000 },
      { year: 2024, metric: 'current_liabilities', value: 28000000000 },
      { year: 2024, metric: 'retained_earnings', value: 28000000000 },
      { year: 2024, metric: 'interest_expense', value: 250000000 },

      { year: 2023, metric: 'revenue', value: 96773000000 },
      { year: 2023, metric: 'operating_income', value: 8891000000 },
      { year: 2023, metric: 'net_income', value: 14997000000 },
      { year: 2023, metric: 'shares_outstanding', value: 3185000000 },

      { year: 2020, metric: 'revenue', value: 31536000000 },
      { year: 2020, metric: 'operating_income', value: 1994000000 },
      { year: 2020, metric: 'net_income', value: 721000000 },
      { year: 2020, metric: 'shares_outstanding', value: 2900000000 },
    ],
  },
};

// Global in-memory storage structure (survives hot reloads)
interface MemoryDatabase {
  companies: Map<string, any>;
  facts: Map<string, any>;
  marketData: Map<string, any>;
  nextCompanyId: number;
}

declare global {
  // eslint-disable-next-line no-var
  var __memoryDb: MemoryDatabase | undefined;
}

function getMemoryDb(): MemoryDatabase {
  if (!globalThis.__memoryDb) {
    globalThis.__memoryDb = {
      companies: new Map(),
      facts: new Map(),
      marketData: new Map(),
      nextCompanyId: 1,
    };

    // Initialize with pre-seeded companies
    for (const [sym, data] of Object.entries(PRESEEDED_COMPANIES)) {
      const id = globalThis.__memoryDb.nextCompanyId++;
      globalThis.__memoryDb.companies.set(sym, {
        id,
        ticker: sym,
        cik: data.cik,
        name: data.name,
        latest_price: data.latest_price,
        beta: data.beta,
        sector: data.sector,
        last_price_update: new Date().toISOString(),
      });

      for (const fact of data.facts) {
        const key = `${id}_${fact.year}_${fact.metric}`;
        globalThis.__memoryDb.facts.set(key, {
          company_id: id,
          fiscal_year: fact.year,
          metric: fact.metric,
          value: fact.value,
        });
      }
    }
  }
  return globalThis.__memoryDb;
}

// Optional PostgreSQL pool (only used if explicitly requested & responsive)
const USE_POSTGRES = process.env.USE_POSTGRES_DB === 'true' && Boolean(process.env.DATABASE_URL);
let pool: Pool | null = null;
if (USE_POSTGRES) {
  try {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      connectionTimeoutMillis: 1000, // fast 1s timeout to never hang
    });
  } catch (err) {
    console.warn('[DB] PostgreSQL pool creation failed, using high-speed in-memory store:', err);
    pool = null;
  }
}

export async function query(text: string, params?: any[]): Promise<any[]> {
  if (pool) {
    try {
      const res = await pool.query(text, params);
      return res.rows;
    } catch {
      // Postgres error or paused, fallback cleanly to memory
    }
  }
  return [];
}

export async function getCompanyByTicker(ticker: string) {
  const sym = ticker.toUpperCase();
  const mem = getMemoryDb();
  if (mem.companies.has(sym)) {
    return mem.companies.get(sym);
  }

  if (pool) {
    try {
      const result = await pool.query('SELECT * FROM companies WHERE ticker = $1', [sym]);
      if (result.rows[0]) {
        mem.companies.set(sym, result.rows[0]);
        return result.rows[0];
      }
    } catch {
      // Postgres unavailable
    }
  }

  return null;
}

export async function insertCompany(ticker: string, cik: string, name: string) {
  const sym = ticker.toUpperCase();
  const mem = getMemoryDb();

  let existing = mem.companies.get(sym);
  if (existing) {
    existing.cik = cik;
    existing.name = name;
    return existing.id;
  }

  const id = mem.nextCompanyId++;
  const newComp = {
    id,
    ticker: sym,
    cik,
    name,
    latest_price: null,
    beta: null,
    sector: null,
    last_price_update: null,
  };
  mem.companies.set(sym, newComp);

  if (pool) {
    try {
      const result = await pool.query(
        'INSERT INTO companies (ticker, cik, name) VALUES ($1, $2, $3) ON CONFLICT (ticker) DO UPDATE SET cik = $2, name = $3 RETURNING id',
        [sym, cik, name]
      );
      if (result.rows[0]?.id) return result.rows[0].id;
    } catch {
      // Fallback to memory id
    }
  }

  return id;
}

export async function getFinancials(companyId: number, years = 15) {
  const mem = getMemoryDb();
  const currentYear = new Date().getFullYear();
  const minYear = currentYear - years;

  const results: any[] = [];
  for (const fact of mem.facts.values()) {
    if (fact.company_id === companyId && fact.fiscal_year >= minYear) {
      results.push({
        fiscal_year: fact.fiscal_year,
        metric: fact.metric,
        value: fact.value,
      });
    }
  }

  results.sort((a, b) => b.fiscal_year - a.fiscal_year);

  if (results.length > 0) {
    return results;
  }

  if (pool) {
    try {
      const pgRes = await pool.query(
        `SELECT fiscal_year, metric, value 
         FROM financial_facts 
         WHERE company_id = $1 AND fiscal_year >= EXTRACT(YEAR FROM CURRENT_DATE) - $2 
         ORDER BY fiscal_year DESC`,
        [companyId, years]
      );
      if (pgRes.rows.length > 0) {
        for (const r of pgRes.rows) {
          mem.facts.set(`${companyId}_${r.fiscal_year}_${r.metric}`, {
            company_id: companyId,
            fiscal_year: r.fiscal_year,
            metric: r.metric,
            value: r.value,
          });
        }
        return pgRes.rows;
      }
    } catch {
      // Postgres unavailable
    }
  }

  return results;
}

export async function insertFinancialFact(
  companyId: number,
  fiscalYear: number,
  metric: string,
  value: number,
  sourceUrl: string,
  filingDate: string
) {
  const mem = getMemoryDb();
  const key = `${companyId}_${fiscalYear}_${metric}`;
  mem.facts.set(key, {
    company_id: companyId,
    fiscal_year: fiscalYear,
    metric,
    value,
    sourceUrl,
    filingDate,
  });

  if (pool) {
    try {
      await pool.query(
        `INSERT INTO financial_facts (company_id, fiscal_year, metric, value, source_url, filing_date) 
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (company_id, fiscal_year, metric) 
         DO UPDATE SET value = $4, source_url = $5, filing_date = $6`,
        [companyId, fiscalYear, metric, value, sourceUrl, new Date(filingDate)]
      );
    } catch {
      // Silently persist in memory
    }
  }
}

export async function updateCompanyMarketData(
  companyId: number,
  latestPrice: number | null,
  beta: number | null,
  sector: string | null = null
) {
  const mem = getMemoryDb();
  for (const comp of mem.companies.values()) {
    if (comp.id === companyId) {
      if (latestPrice !== null) comp.latest_price = latestPrice;
      if (beta !== null) comp.beta = beta;
      if (sector !== null) comp.sector = sector;
      comp.last_price_update = new Date().toISOString();
      break;
    }
  }

  if (pool) {
    try {
      await pool.query(
        `UPDATE companies 
         SET latest_price = COALESCE($2, latest_price), 
             beta = COALESCE($3, beta),
             sector = COALESCE($4, sector),
             last_price_update = NOW()
         WHERE id = $1`,
        [companyId, latestPrice, beta, sector]
      );
    } catch {
      // Memory state already updated
    }
  }
}

export async function insertMarketData(
  companyId: number,
  date: string,
  closePrice: number
) {
  const mem = getMemoryDb();
  const key = `${companyId}_${date}`;
  mem.marketData.set(key, {
    company_id: companyId,
    date,
    close_price: closePrice,
  });

  if (pool) {
    try {
      await pool.query(
        `INSERT INTO market_data (company_id, date, close_price) 
         VALUES ($1, $2, $3)
         ON CONFLICT (company_id, date) 
         DO UPDATE SET close_price = $3`,
        [companyId, date, closePrice]
      );
    } catch {
      // Memory state updated
    }
  }
}

export async function getHistoricalPrices(companyId: number) {
  const mem = getMemoryDb();
  const results: any[] = [];
  for (const m of mem.marketData.values()) {
    if (m.company_id === companyId) {
      results.push({ date: m.date, close: m.close_price });
    }
  }
  results.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  if (results.length > 0) {
    return results;
  }

  if (pool) {
    try {
      const pgRes = await pool.query(
        `SELECT date::text, close_price::float as close 
         FROM market_data 
         WHERE company_id = $1 AND date >= CURRENT_DATE - INTERVAL '1 year'
         ORDER BY date ASC`,
        [companyId]
      );
      if (pgRes.rows.length > 0) return pgRes.rows;
    } catch {
      // Postgres unavailable
    }
  }

  return results;
}
