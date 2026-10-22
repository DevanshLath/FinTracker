'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface FeaturedStock {
  ticker: string;
  isCached: boolean;
  price: number | null;
}

export default function Home() {
  const [ticker, setTicker] = useState('');
  const [lastTicker, setLastTicker] = useState<string | null>(null);
  const [featuredStocks, setFeaturedStocks] = useState<FeaturedStock[]>([]);
  const [loadingStocks, setLoadingStocks] = useState(true);
  const router = useRouter();

  useEffect(() => {
    // Read last viewed search ticker
    if (typeof window !== 'undefined') {
      const cached = localStorage.getItem('last_ticker');
      if (cached) {
        setLastTicker(cached);
      }
    }

    // Fetch featured stocks cache status from backend
    const fetchHomeData = async () => {
      try {
        const res = await fetch('/api/home');
        const data = await res.json();
        if (data.featured) {
          setFeaturedStocks(data.featured);
        }
      } catch (err) {
        console.error('Error fetching home status:', err);
      } finally {
        setLoadingStocks(false);
      }
    };

    fetchHomeData();
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (ticker.trim()) {
      router.push(`/company/${ticker.trim().toUpperCase()}`);
    }
  };

  return (
    <main className="min-h-screen bg-white text-black p-8 md:p-16 selection:bg-black selection:text-white">
      <div className="max-w-5xl mx-auto space-y-12">
        
        {/* Header */}
        <div className="border-b-2 border-black pb-6 space-y-2">
          <h1 className="text-4xl font-extrabold uppercase tracking-wider font-mono">
            Open Equity Research
          </h1>
          <p className="text-xs font-mono tracking-widest text-gray-500 uppercase font-bold">
            Investment Terminal & DCF Valuation Engine
          </p>
        </div>

        {/* Dashboard Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-12 items-start">
          
          {/* Left Column (3/5): Search, Resume & Specs */}
          <div className="lg:col-span-3 space-y-8 font-mono text-xs uppercase tracking-wider font-bold">
            
            {/* Quick Resume Card */}
            {lastTicker && (
              <div className="border-2 border-black bg-black text-white p-6 flex items-center justify-between shadow-md">
                <div>
                  <span className="text-[10px] text-gray-400 block mb-1 font-extrabold">Resume Last Valuation</span>
                  <span className="font-extrabold text-sm tracking-widest">{lastTicker}</span>
                </div>
                <Link
                  href={`/company/${lastTicker}`}
                  className="px-4 py-2 border border-white bg-white text-black hover:bg-black hover:text-white hover:border-white transition-colors duration-150 font-extrabold text-[10px] tracking-wider"
                >
                  Resume →
                </Link>
              </div>
            )}

            {/* Search Input Box */}
            <form onSubmit={handleSearch} className="space-y-3">
              <label htmlFor="ticker" className="block text-[10px] uppercase tracking-widest font-extrabold">
                Search Company Ticker
              </label>
              <div className="flex gap-2">
                <input
                  id="ticker"
                  type="text"
                  placeholder="e.g. AAPL, MSFT, GOOGL"
                  value={ticker}
                  onChange={(e) => setTicker(e.target.value)}
                  className="flex-1 px-4 py-3 rounded-none bg-white text-black border-2 border-black font-mono text-sm placeholder-gray-400 focus:outline-none focus:bg-black focus:text-white transition-colors duration-150 uppercase font-bold"
                  required
                />
                <button
                  type="submit"
                  className="px-6 py-3 rounded-none bg-black text-white hover:bg-white hover:text-black border-2 border-black font-mono text-sm uppercase tracking-widest transition-colors duration-150 font-bold"
                >
                  Analyze
                </button>
              </div>
            </form>

            {/* System Specifications */}
            <div className="border-2 border-black p-6 space-y-4">
              <h2 className="font-extrabold text-[10px] tracking-widest text-gray-500">System Specifications</h2>
              <ul className="space-y-2.5 text-gray-700 font-bold">
                <li className="flex items-start">
                  <span className="mr-2">■</span>
                  <span>Direct ingestion from SEC EDGAR API</span>
                </li>
                <li className="flex items-start">
                  <span className="mr-2">■</span>
                  <span>Automated CIK resolution & GICS Sector classification</span>
                </li>
                <li className="flex items-start">
                  <span className="mr-2">■</span>
                  <span>Multi-year XBRL balance sheet parser (10+ corporate metrics)</span>
                </li>
                <li className="flex items-start">
                  <span className="mr-2">■</span>
                  <span>Base, Bull, Bear multi-scenario DCF forecasting</span>
                </li>
                <li className="flex items-start">
                  <span className="mr-2">■</span>
                  <span>Altman Z-Score financial health evaluation</span>
                </li>
              </ul>
            </div>

          </div>

          {/* Right Column (2/5): Database Cache Monitor Widget */}
          <div className="lg:col-span-2 space-y-6 font-mono text-xs uppercase tracking-wider font-bold">
            
            <div className="border-2 border-black bg-white p-6 space-y-4">
              <div>
                <h3 className="font-extrabold text-[10px] tracking-widest block">Database Cache Monitor</h3>
                <p className="text-[9px] text-gray-400 lowercase mt-1 tracking-normal font-medium normal-case">
                  Current database status of featured stock tickers. Cached companies load instantly.
                </p>
              </div>

              {loadingStocks ? (
                <div className="py-8 text-center text-gray-400 font-bold text-[10px] uppercase tracking-widest">
                  Loading database state...
                </div>
              ) : (
                <div className="overflow-hidden border border-gray-200">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200">
                        <th className="py-2.5 px-3 font-extrabold text-[9px]">Ticker</th>
                        <th className="py-2.5 px-3 font-extrabold text-[9px] text-right">Price</th>
                        <th className="py-2.5 px-3 font-extrabold text-[9px] text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {featuredStocks.map((stock) => (
                        <tr key={stock.ticker} className="hover:bg-gray-50">
                          <td className="py-3 px-3">
                            <Link href={`/company/${stock.ticker}`} className="hover:underline font-extrabold block">
                              {stock.ticker}
                            </Link>
                          </td>
                          <td className="py-3 px-3 text-right">
                            {stock.price !== null ? `$${stock.price.toFixed(2)}` : '—'}
                          </td>
                          <td className="py-3 px-3 text-right">
                            {stock.isCached ? (
                              <span className="px-2 py-0.5 text-[8px] bg-black text-white font-extrabold tracking-widest uppercase">
                                Cached
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 text-[8px] border border-gray-400 text-gray-500 font-extrabold tracking-widest uppercase">
                                Online
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

          </div>

        </div>

        {/* Footer */}
        <footer className="border-t border-gray-200 pt-8 w-full text-center font-mono text-[9px] text-gray-400 uppercase tracking-widest">
          Financial Modeling & Valuation Engine | Powered by Next.js, React, TailwindCSS
        </footer>
      </div>
    </main>
  );
}
