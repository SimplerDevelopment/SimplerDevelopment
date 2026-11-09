// Which Host headers belong to the app itself (portal, admin, marketing) rather
// than to a tenant site. Moved out of middleware.ts so server components can ask
// the same question middleware does — notably SiteBlockRenderer and the
// [domain] layout, which must not emit tenant-authored script when a tenant page
// is rendered on an app host (PUX-255: on an app host it runs with the portal's
// origin). Keep this the single list: two copies would drift, and the drift
// would be a security bug.

const APP_HOSTNAMES = new Set([
  'localhost',
  'localhost:3000',
  'localhost:3001',
  'localhost:3005',
  'localhost:3100',
  '127.0.0.1',
  '127.0.0.1:3000',
  '127.0.0.1:3100',
  'simplerdevelopment.com',
  'www.simplerdevelopment.com',
  'staging.simplerdevelopment.com',
  'dev.simplerdevelopment.com',
]);

function getAppHostname(): string | null {
  const url = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL;
  if (!url) return null;
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

export function isAppHostname(host: string): boolean {
  if (APP_HOSTNAMES.has(host)) return true;
  const appHost = getAppHostname();
  if (appHost && host === appHost) return true;
  // Vercel preview/prod defaults (e.g. simplerdevelopment.vercel.app,
  // simplerdevelopment-git-<branch>-<team>.vercel.app)
  if (host.endsWith('.vercel.app')) return true;
  // Legacy Railway default domains — kept for any lingering deployments
  if (host.endsWith('.up.railway.app')) return true;
  return false;
}
