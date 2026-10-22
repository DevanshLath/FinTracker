/**
 * S&P 500 Pre-Seeder Script
 * 
 * Pre-populates your database with the most popular S&P 500 stocks so that
 * when real users visit your live site, 90%+ of queries are served instantly
 * from the database with ZERO external API calls.
 * 
 * Run with: npm run seed
 */

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

const POPULAR_TICKERS = [
  'AAPL', 'MSFT', 'NVDA', 'AMZN', 'GOOGL', 'META', 'TSLA', 'LLY', 'AVGO', 'JPM',
  'UNH', 'XOM', 'V', 'PG', 'COST', 'JNJ', 'HD', 'WMT', 'NFLX', 'ABBV',
  'BAC', 'CRM', 'ORCL', 'CVX', 'KO', 'AMD', 'PEP', 'ADBE', 'CSCO', 'QCOM'
];

async function seed() {
  console.log(`\n======================================================`);
  console.log(`Starting S&P 500 Database Pre-Seeding against ${BASE_URL}`);
  console.log(`Total target tickers: ${POPULAR_TICKERS.length}`);
  console.log(`======================================================\n`);

  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < POPULAR_TICKERS.length; i++) {
    const ticker = POPULAR_TICKERS[i];
    process.stdout.write(`[${i + 1}/${POPULAR_TICKERS.length}] Ingesting ${ticker.padEnd(5)} ... `);

    try {
      const startTime = Date.now();
      const res = await fetch(`${BASE_URL}/api/companies/${ticker}`);
      const elapsed = Date.now() - startTime;

      if (res.ok) {
        console.log(`OK (${elapsed}ms)`);
        successCount++;
      } else {
        const body = await res.text();
        console.log(`FAILED (${res.status}): ${body.slice(0, 80)}`);
        failCount++;
      }
    } catch (err) {
      console.log(`ERROR: ${err.message}`);
      failCount++;
    }

    // Safety pacing: 1.2s delay to respect SEC rules
    if (i < POPULAR_TICKERS.length - 1) {
      await new Promise((r) => setTimeout(r, 1200));
    }
  }

  console.log(`\n======================================================`);
  console.log(`Pre-seeding finished! Success: ${successCount}, Failed: ${failCount}`);
  console.log(`These companies are now permanently cached in PostgreSQL.`);
  console.log(`======================================================\n`);
}

seed();
