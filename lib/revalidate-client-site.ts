/**
 * Trigger on-demand ISR revalidation on a client website after content changes.
 * Sends a POST to the client site's /api/revalidate endpoint.
 * Non-blocking — failures are logged but don't break the save flow.
 */
export async function revalidateClientSite(
  siteUrl: string,
  paths: string[],
): Promise<void> {
  const secret = process.env.REVALIDATE_SECRET;
  if (!secret) return;

  const url = `${siteUrl.replace(/\/+$/, '')}/api/revalidate`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret, paths }),
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      console.warn(`Revalidation failed for ${siteUrl}: ${res.status}`);
    }
  } catch (err) {
    // Non-fatal — the ISR timer will catch up eventually
    console.warn(`Revalidation request to ${siteUrl} failed:`, err instanceof Error ? err.message : err);
  }
}

/** Build the public URL for a client website from its subdomain/domain. */
export function clientSiteUrl(subdomain: string | null, domain: string | null): string | null {
  if (domain) return `https://${domain}`;
  if (subdomain) return `https://${subdomain}.simplerdevelopment.com`;
  return null;
}
