import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Sliding-window in-memory rate limiter (per client IP)
// Works 100% out-of-the-box with zero paid services or external dependencies.
interface RateLimitRecord {
  count: number;
  resetAt: number;
}

const ipRequestMap = new Map<string, RateLimitRecord>();

// Max requests allowed per window per IP
const MAX_REQUESTS_PER_WINDOW = 35;
const WINDOW_DURATION_MS = 60 * 1000; // 1 minute

// Periodic garbage collection to keep memory lean
let lastCleanup = Date.now();
function cleanupExpiredRecords() {
  const now = Date.now();
  if (now - lastCleanup > 5 * 60 * 1000) {
    lastCleanup = now;
    for (const [ip, record] of ipRequestMap.entries()) {
      if (now > record.resetAt) {
        ipRequestMap.delete(ip);
      }
    }
  }
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Protect company data fetching and DCF compute APIs from bot scraping or spam
  if (pathname.startsWith('/api/companies') || pathname.startsWith('/api/dcf')) {
    cleanupExpiredRecords();

    // Resolve client IP address
    const forwardedFor = request.headers.get('x-forwarded-for');
    const realIp = request.headers.get('x-real-ip');
    const clientIp = (forwardedFor ? forwardedFor.split(',')[0].trim() : null) || realIp || '127.0.0.1';

    const now = Date.now();
    const existing = ipRequestMap.get(clientIp);

    if (!existing || now > existing.resetAt) {
      // First request in this window
      ipRequestMap.set(clientIp, {
        count: 1,
        resetAt: now + WINDOW_DURATION_MS,
      });
    } else {
      // Existing window
      existing.count += 1;
      if (existing.count > MAX_REQUESTS_PER_WINDOW) {
        const retryAfterSeconds = Math.ceil((existing.resetAt - now) / 1000);
        return new NextResponse(
          JSON.stringify({
            error: 'Too Many Requests. Rate limit exceeded. Please wait a moment before trying again.',
            retryAfter: retryAfterSeconds,
          }),
          {
            status: 429,
            headers: {
              'Content-Type': 'application/json',
              'Retry-After': String(retryAfterSeconds),
            },
          }
        );
      }
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/api/companies/:path*', '/api/dcf/:path*'],
};
