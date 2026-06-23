/**
 * Request logging middleware for SimplerDevelopment client websites.
 *
 * Drop this into any Next.js client site's middleware.ts to send HTTP request
 * logs back to the SimplerDevelopment portal.
 *
 * Required environment variables (set automatically during provisioning):
 *   LOG_ENDPOINT  — e.g. "https://simplerdevelopment.com/api/logs/ingest"
 *   LOG_API_KEY   — per-site secret key
 *
 * Usage in client site's middleware.ts:
 *
 *   import { NextResponse } from 'next/server';
 *   import type { NextRequest } from 'next/server';
 *
 *   const LOG_ENDPOINT = process.env.LOG_ENDPOINT;
 *   const LOG_API_KEY = process.env.LOG_API_KEY;
 *
 *   // Buffer logs and flush in batches
 *   let logBuffer: any[] = [];
 *
 *   function flushLogs() {
 *     if (!LOG_ENDPOINT || !LOG_API_KEY || logBuffer.length === 0) return;
 *     const batch = logBuffer.splice(0, logBuffer.length);
 *     fetch(LOG_ENDPOINT, {
 *       method: 'POST',
 *       headers: { 'Content-Type': 'application/json', 'x-log-api-key': LOG_API_KEY },
 *       body: JSON.stringify(batch),
 *     }).catch(() => {}); // fire and forget
 *   }
 *
 *   // Flush every 10 seconds
 *   setInterval(flushLogs, 10000);
 *
 *   export function middleware(request: NextRequest) {
 *     const start = Date.now();
 *     const response = NextResponse.next();
 *
 *     // Skip static assets and internal Next.js routes
 *     const path = request.nextUrl.pathname;
 *     if (path.startsWith('/_next') || path.startsWith('/favicon') || path.match(/\.\w+$/)) {
 *       return response;
 *     }
 *
 *     logBuffer.push({
 *       method: request.method,
 *       path,
 *       statusCode: response.status,
 *       duration: Date.now() - start,
 *       userAgent: request.headers.get('user-agent')?.substring(0, 500) || null,
 *       referer: request.headers.get('referer')?.substring(0, 500) || null,
 *       ip: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
 *       country: request.geo?.country || null,
 *     });
 *
 *     // Flush immediately if buffer is large
 *     if (logBuffer.length >= 20) flushLogs();
 *
 *     return response;
 *   }
 *
 *   export const config = {
 *     matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
 *   };
 */

// This file is documentation only — the actual middleware goes into client websites.
// The code above should be added to the website-starter template's middleware.ts.
export {};
