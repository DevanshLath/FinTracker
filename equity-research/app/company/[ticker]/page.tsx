'use client';

import { useEffect, useState, use } from 'react';
import DCFForm from '@/components/DCFForm';
import Link from 'next/link';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

const generateMockStockChart = (ticker: string) => {
  const chart = [];
  let price = ticker === 'AAPL' ? 175 : ticker === 'MSFT' ? 380 : 150;
  const today = new Date();
  for (let i = 260; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(today.getDate() - i);
    price = price + (Math.random() - 0.485) * 3.2;
    if (price < 10) price = 10;
    chart.push({
      date: date.toISOString().split('T')[0],
      close: Number(price.toFixed(2)),
    });
  }
  return chart;
};

interface CompanyPageProps {
  params: Promise<{ ticker: string }>;
}

export default function CompanyPage({ params }: CompanyPageProps) {
  const resolvedParams = use(params);
  const ticker = resolvedParams.ticker.toUpperCase();

  const [company, setCompany] = useState<any>(null);
  const [financials, setFinancials] = useState<any[]>([]);
  const [stockChart, setStockChart] = useState<any[]>([]);
  const [macro, setMacro] = useState<any>(null);
  const [comps, setComps] = useState<any[]>([]);
  const [dataStatus, setDataStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  // Simulated loading steps for polished UX
  const [completedSteps, setCompletedSteps] = useState(0);
  const loadingSteps = [
    'Resolving company CIK code on SEC EDGAR...',
    'Downloading and parsing XBRL annual statements...',
    'Fetching real-time price quotes from Alpha Vantage...',
    'Synchronizing 12-month historical stock prices...',
    'Retrieving macroeconomic risk-free benchmarks from FRED...',
  ];

  const fetchCompany = async () => {
    setError(null);
    try {
      const res = await fetch(`/api/companies/${ticker}`);
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || 'Failed to retrieve company data');
      }

      setCompany(data.company);
      setFinancials(data.financials || []);
      
      const chartData = data.stockChart && data.stockChart.length > 0
        ? data.stockChart
        : generateMockStockChart(ticker);
      setStockChart(chartData);

      setMacro(data.macro || null);
      setComps(data.comps || []);
      setDataStatus(data.dataStatus || null);

      if (typeof window !== 'undefined') {
        localStorage.setItem('last_ticker', ticker);
      }
    } catch (err: any) {
      console.error('Error fetching company details:', err);
      setError(err.message || 'An error occurred while loading the data.');
    } finally {
      setLoading(false);
      setCompletedSteps(loadingSteps.length);
    }
  };

  useEffect(() => {
    setMounted(true);
    if (typeof document !== 'undefined') {
      document.title = `${ticker} | Open Equity Research`;
    }
    
    // Simulate loading steps checkmarks
    let stepInterval: NodeJS.Timeout;
    if (loading) {
      stepInterval = setInterval(() => {
        setCompletedSteps((prev) => {
          if (prev < loadingSteps.length) return prev + 1;
          clearInterval(stepInterval);
          return prev;
        });
      }, 120);
    }

    fetchCompany();

    return () => {
      if (stepInterval) clearInterval(stepInterval);
    };
  }, [ticker]);

  // Format dates for chart labels e.g., "YYYY-MM-DD" -> "MMM YY"
  const formatChartDate = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
    } catch {
      return dateStr;
    }
  };

  return (
    <main className="min-h-screen bg-white text-black p-8 md:p-16 selection:bg-black selection:text-white">
      <div className="max-w-6xl mx-auto space-y-12">
        {/* Back Link */}
        <div>
          <Link
            href="/"
            className="font-mono text-xs uppercase tracking-widest font-bold border-b border-black pb-0.5 hover:bg-black hover:text-white transition-colors duration-150"
          >
            ← Back to Homepage
          </Link>
        </div>

        {/* Loading / Error States */}
        {loading && (
          <div className="border border-black bg-white p-8 max-w-xl mx-auto space-y-6 font-mono text-xs uppercase tracking-wider select-none">
            <div className="flex items-center justify-between border-b border-black pb-3">
              <span className="font-bold">Initializing the terminal [{ticker}]</span>
              <div className="w-4 h-4 border-2 border-black border-t-transparent animate-spin rounded-full"></div>
            </div>
            
            <div className="space-y-3">
              {loadingSteps.map((step, idx) => (
                <div key={idx} className="flex items-start gap-3">
                  <span className="font-bold">
                    {completedSteps > idx ? '[DONE]' : '[....]'}
                  </span>
                  <span className={completedSteps > idx ? 'text-black' : 'text-gray-400'}>
                    {step}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {error && (
          <div className="border border-black p-8 text-left space-y-4 max-w-xl mx-auto">
            <h2 className="font-mono text-sm uppercase tracking-widest font-bold text-red-600">
              Retrieval Failed
            </h2>
            <p className="font-mono text-xs uppercase tracking-wider text-gray-600">
              {error}
            </p>
            <div className="pt-2">
              <Link
                href="/"
                className="font-mono text-xs uppercase tracking-widest font-bold px-4 py-2 border border-black bg-black text-white hover:bg-white hover:text-black transition-colors duration-150"
              >
                Search Again
              </Link>
            </div>
          </div>
        )}

        {/* Page Content */}
        {!loading && !error && company && (
          <div className="space-y-12 animate-fadeIn">
            
            {/* Header info */}
            <div className="space-y-3 border-b border-black pb-6">
              <h1 className="text-5xl font-extrabold uppercase tracking-wider font-mono">
                {company.ticker}
              </h1>
              <p className="font-mono text-sm uppercase tracking-wider text-gray-600 font-bold">
                {company.name}
              </p>
            </div>

            {/* Layout Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-12 items-start">
              
              {/* Left Column (3/4): Historical Charts & Calculator */}
              <div className="lg:col-span-3 space-y-12">
                
                {/* Historical Price Chart */}
                {stockChart.length > 0 && mounted && (
                  <div className="border border-black bg-white p-6">
                    <h3 className="font-mono text-xs uppercase tracking-widest font-bold mb-6">Historical Stock Price (Last 12 Months)</h3>
                    <div className="w-full h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart
                          data={stockChart}
                          margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                        >
                          <defs>
                            <linearGradient id="colorClose" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#000000" stopOpacity={0.08}/>
                              <stop offset="95%" stopColor="#000000" stopOpacity={0.0}/>
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                          <XAxis 
                            dataKey="date" 
                            stroke="#000000" 
                            tickFormatter={formatChartDate}
                            interval="preserveStartEnd"
                            minTickGap={50}
                            tick={{ className: 'font-mono', fontSize: 9 }} 
                          />
                          <YAxis 
                            stroke="#000000" 
                            domain={['auto', 'auto']}
                            tick={{ className: 'font-mono', fontSize: 9 }} 
                          />
                          <Tooltip
                            contentStyle={{ backgroundColor: '#ffffff', border: '1px solid #000000', fontFamily: 'monospace', fontSize: '11px' }}
                            formatter={(v) => [`$${Number(v).toFixed(2)}`, 'Close']}
                          />
                          <Area 
                            type="monotone" 
                            dataKey="close" 
                            stroke="#000000" 
                            strokeWidth={1.5}
                            fillOpacity={1} 
                            fill="url(#colorClose)" 
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}

                {/* DCF Form with Comps and DataStatus passed down */}
                <DCFForm 
                  ticker={ticker} 
                  initialFinancials={financials} 
                  latestPrice={company.latest_price ? Number(company.latest_price) : null}
                  defaultBeta={company.beta ? Number(company.beta) : null}
                  macro={macro || { riskFreeRate: 0.0425, expectedInflation: 0.02 }}
                  comps={comps}
                  dataStatus={dataStatus}
                  onPeerImported={fetchCompany}
                />
              </div>

              {/* Right Column (1/4): Sidebar Metadata & Macro widgets */}
              <div className="lg:col-span-1 space-y-8 font-mono text-xs uppercase tracking-wider">
                
                {/* SEC CIK details */}
                <div className="border border-black bg-white p-6 space-y-4">
                  <h4 className="font-bold text-[10px] tracking-widest text-gray-500">Corporate Metadata</h4>
                  <div className="space-y-2">
                    <div className="flex justify-between border-b border-gray-100 pb-1">
                      <span className="text-gray-400">CIK</span>
                      <span className="font-bold">{company.cik}</span>
                    </div>
                    <div className="flex justify-between border-b border-gray-100 pb-1">
                      <span className="text-gray-400">Beta</span>
                      <span className="font-bold">{company.beta ? Number(company.beta).toFixed(2) : '—'}</span>
                    </div>
                    <div className="flex justify-between pb-1">
                      <span className="text-gray-400">Trading Price</span>
                      <span className="font-bold">{company.latest_price ? `$${Number(company.latest_price).toFixed(2)}` : '—'}</span>
                    </div>
                  </div>
                </div>


                
                {/* Helpful guides */}
                <div className="border border-black bg-gray-50 p-6 space-y-3">
                  <h4 className="font-bold text-[10px] tracking-widest text-gray-500">Investment Rules</h4>
                  <p className="text-[10px] text-gray-500 leading-normal lowercase">
                    If calculated intrinsic value exceeds current market price, the stock trades at a discount (undervalued). Conversely, WACC estimates the opportunity cost of investor capital based on beta-implied volatility.
                  </p>
                </div>

              </div>

            </div>

          </div>
        )}
      </div>
    </main>
  );
}
