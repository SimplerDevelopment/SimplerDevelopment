/** SQL fixture writes must never inherit the repository's remote .env target. */
export function assertE2eSqlTarget(value: string | undefined): string {
  if (!value) throw new Error('E2E SQL requires an explicit local test DATABASE_URL');
  let url: URL;
  try { url = new URL(value); } catch { throw new Error('Invalid E2E SQL database URL'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error('E2E SQL requires PostgreSQL');
  if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error('E2E SQL refuses non-loopback database hosts');
  const database = decodeURIComponent(url.pathname.slice(1));
  if (!/^(simplerdev_test|test_e2e_[a-z0-9_]+|simplerdev_test_template_[a-z0-9_]+)$/i.test(database)) {
    throw new Error('E2E SQL refuses databases outside the explicit test namespace');
  }
  for (const [key, setting] of url.searchParams) {
    if (key !== 'sslmode' || setting !== 'disable') throw new Error('E2E SQL refuses connection overrides in URL parameters');
  }
  return value;
}
