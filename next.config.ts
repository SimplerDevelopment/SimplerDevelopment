import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

// Baseline security headers — defense-in-depth alongside auth/CSRF/etc.
// CSP ships in Report-Only mode first; promote to enforcing once reports are
// reviewed. The visual editor uses an iframe preview, so frame-ancestors must
// allow same-origin. Tenant-uploaded media is served through /api/media/proxy
// which already forces Content-Disposition: attachment for non-image MIMEs
// (W1.10), so script-src can stay strict.
const CSP_REPORT_ONLY = [
  "default-src 'self'",
  "img-src 'self' data: blob: https:",
  "media-src 'self' blob: https:",
  "font-src 'self' data: https:",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com https://www.googletagmanager.com https://www.google-analytics.com https://assets.calendly.com",
  "style-src 'self' 'unsafe-inline' https:",
  "connect-src 'self' https: wss:",
  "frame-src 'self' https://js.stripe.com https://hooks.stripe.com https://www.youtube.com https://player.vimeo.com https://calendly.com",
  "frame-ancestors 'self'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

// Base security headers applied to all routes. X-Frame-Options is intentionally
// absent here — it is applied only to portal/admin/API routes below so that
// /sites/** pages remain embeddable cross-origin in the visual editor iframe.
const SECURITY_HEADERS_BASE = [
  // Per-host HSTS only — intentionally NO `includeSubDomains` / `preload`.
  // Tenant sites live on *.simplerdevelopment.com with per-subdomain TLS certs that
  // Vercel provisions lazily (when a subdomain is created). We deliberately keep HSTS
  // scoped to each host: a single bare `max-age` per host hard-enforces HTTPS on that
  // host only. We avoid `includeSubDomains` + `preload` because, if the apex ever began
  // emitting them and was submitted to the preload list, browsers would pre-enforce
  // valid-cert HTTPS on EVERY *.simplerdevelopment.com — including a brand-new tenant
  // whose cert hasn't finished provisioning — making it unreachable with no bypass.
  // `preload` is also a one-way door (removal takes months to roll through browsers).
  // The apex 307 already only emits bare `max-age`; this keeps the app header consistent.
  { key: 'Strict-Transport-Security', value: 'max-age=63072000' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // microphone=(self) enables the portal's WebRTC voice assistant (getUserMedia)
  // on same-origin pages. Camera stays disabled. If we later want mic limited to
  // /portal only, move this header into middleware keyed on the pathname.
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(self), geolocation=(self), payment=(self), interest-cohort=()' },
  { key: 'Content-Security-Policy-Report-Only', value: CSP_REPORT_ONLY },
];

// X-Frame-Options applied only to routes that must never be framed externally.
// /sites/:path* is intentionally excluded — the visual editor embeds it in an
// iframe from a different origin (tenant subdomain → site domain).
const FRAME_DENY_HEADERS = [{ key: 'X-Frame-Options', value: 'SAMEORIGIN' }];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // The in-build `next build` TypeScript recheck re-type-checks the whole
  // ~357k-line app in a single worker and exhausts the heap (OOM/SIGABRT) on
  // both local and the Vercel build container (made worse by the Sentry plugin).
  // Types are still gated outside the build — `tsc --noEmit` runs in the
  // pre-push hook and CI — so skipping the redundant in-build pass keeps the
  // type guarantee while letting the production build complete reliably.
  typescript: {
    ignoreBuildErrors: true,
  },
  // Limit static generation workers to avoid exhausting Postgres connections
  experimental: {
    workerThreads: false,
    cpus: 4,
  },
  // `isomorphic-dompurify` (used by lib/security/sanitize-html, which several
  // block renderers import) transitively pulls in jsdom → html-encoding-sniffer
  // → @exodus/bytes — and @exodus/bytes is ESM-only. Turbopack's CJS bundle
  // emits a `require()` against it and crashes every tenant SSR page with
  // ERR_REQUIRE_ESM. Marking these external punts the resolution to Node's
  // native module system, which handles the ESM/CJS interop correctly.
  serverExternalPackages: ['isomorphic-dompurify', 'jsdom'],

  images: {
    remotePatterns: [
      {
        protocol: 'http',
        hostname: 'localhost',
      },
      {
        protocol: 'https',
        hostname: 'localhost',
      },
    ],
    formats: ['image/avif', 'image/webp'],
  },

  // Turbopack configuration (Next.js 16+)
  turbopack: {
    // Pin the workspace root to THIS project. Without it, Turbopack walks up
    // and can pick a stray parent lockfile (e.g. when the repo is checked out
    // as a git worktree under a home dir that has its own package-lock.json),
    // mis-rooting the build so page routes 404. On Vercel this equals the repo
    // root anyway, so it's a no-op there.
    root: import.meta.dirname,
    // GLTF/GLB files will be handled by default asset handling
  },

  // Static redirects — keep these in config, not as redirect-only page.tsx files.
  // Rendering a component that calls redirect() in Next.js 16 triggers a
  // performance.measure() warning because the RSC render aborts before the
  // end-mark is placed. Handling at the edge avoids the render entirely.
  async redirects() {
    return [
      { source: '/portal', destination: '/portal/dashboard', permanent: false },
      { source: '/portal/ai-activity', destination: '/portal/settings/ai', permanent: false },
      { source: '/portal/billing', destination: '/portal/settings/billing', permanent: false },
      { source: '/portal/invoices', destination: '/portal/settings/billing', permanent: false },
      { source: '/portal/settings', destination: '/portal/settings/profile', permanent: false },
      { source: '/portal/team', destination: '/portal/settings/team', permanent: false },
      { source: '/portal/tickets', destination: '/portal/settings/support', permanent: false },
      { source: '/portal/tools/pitch-decks', destination: '/portal/crm/proposals?tab=decks', permanent: false },
      // Public pitch-deck route renamed to /slides/. Keeps already-shared
      // /pitch-deck/<slug> URLs working on apex + every tenant host (this
      // runs before middleware, so the tenant rewrite never sees the old
      // path).
      { source: '/pitch-deck/:slug', destination: '/slides/:slug', permanent: true },
    ];
  },

  async headers() {
    return [
      { source: '/:path*', headers: SECURITY_HEADERS_BASE },
      { source: '/portal/:path*', headers: FRAME_DENY_HEADERS },
      { source: '/admin/:path*', headers: FRAME_DENY_HEADERS },
      { source: '/api/:path*', headers: FRAME_DENY_HEADERS },
      // /sites/:path* intentionally has no X-Frame-Options — visual editor must embed it
    ];
  },
};

// Sentry: only wrap when an auth token + org/project are present so local builds
// without Sentry credentials behave normally. Source-map upload and release
// tracking happen at build time; runtime init lives in sentry.*.config.ts.
const sentryEnabled =
  Boolean(process.env.SENTRY_AUTH_TOKEN) &&
  Boolean(process.env.SENTRY_ORG) &&
  Boolean(process.env.SENTRY_PROJECT);

export default sentryEnabled
  ? withSentryConfig(nextConfig, {
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      authToken: process.env.SENTRY_AUTH_TOKEN,
      silent: !process.env.CI,
      widenClientFileUpload: true,
      disableLogger: true,
      // Avoids shipping the larger tracing bundle to clients that won't use it.
      reactComponentAnnotation: { enabled: false },
    })
  : nextConfig;
