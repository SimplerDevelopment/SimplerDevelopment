/**
 * Cloudflare DNS management using CLIENT-provided API tokens.
 * Separate from cloudflare-dns.ts which uses our own zone for simplerdevelopment.com subdomains.
 */

const CF_API = 'https://api.cloudflare.com/client/v4';

interface CloudflareCredentials {
  apiKey: string; // API token with DNS edit permissions
}

function headers(creds: CloudflareCredentials) {
  return {
    Authorization: `Bearer ${creds.apiKey}`,
    'Content-Type': 'application/json',
  };
}

/** Extract root domain from a full domain string. */
function rootDomain(domain: string): string {
  const parts = domain.split('.');
  return parts.slice(-2).join('.');
}

/**
 * Find the Cloudflare zone ID for a domain.
 */
async function findZoneId(creds: CloudflareCredentials, domain: string): Promise<string> {
  const root = rootDomain(domain);
  const res = await fetch(`${CF_API}/zones?name=${root}`, {
    headers: headers(creds),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Cloudflare zone lookup failed (${res.status}): ${err}`);
  }

  const data = await res.json();
  if (!data.result?.length) {
    throw new Error(`No Cloudflare zone found for ${root}. Make sure the domain is added to your Cloudflare account.`);
  }

  return data.result[0].id;
}

/**
 * Add Vercel DNS records for a custom domain via client's Cloudflare account.
 */
export async function configureVercelDns(
  creds: CloudflareCredentials,
  domain: string,
): Promise<{ success: boolean; records: Array<{ type: string; name: string; value: string }> }> {
  const zoneId = await findZoneId(creds, domain);
  const parts = domain.split('.');
  const isApex = parts.length <= 2;
  const records: Array<{ type: string; name: string; value: string }> = [];

  if (isApex) {
    // Root domain: A record + www CNAME
    await createDnsRecord(creds, zoneId, { type: 'A', name: '@', content: '76.76.21.21', proxied: false });
    records.push({ type: 'A', name: '@', value: '76.76.21.21' });

    await createDnsRecord(creds, zoneId, { type: 'CNAME', name: 'www', content: 'cname.vercel-dns.com', proxied: false });
    records.push({ type: 'CNAME', name: 'www', value: 'cname.vercel-dns.com' });
  } else {
    // Subdomain: CNAME only
    const name = parts.slice(0, -2).join('.');
    await createDnsRecord(creds, zoneId, { type: 'CNAME', name, content: 'cname.vercel-dns.com', proxied: false });
    records.push({ type: 'CNAME', name, value: 'cname.vercel-dns.com' });
  }

  return { success: true, records };
}

/**
 * Create a DNS record, deleting any existing conflicting record first.
 */
async function createDnsRecord(
  creds: CloudflareCredentials,
  zoneId: string,
  record: { type: string; name: string; content: string; proxied: boolean },
): Promise<void> {
  // Check for existing records of same type+name and delete them
  const existing = await listRecords(creds, zoneId, record.type, record.name);
  for (const rec of existing) {
    await fetch(`${CF_API}/zones/${zoneId}/dns_records/${rec.id}`, {
      method: 'DELETE',
      headers: headers(creds),
    });
  }

  const res = await fetch(`${CF_API}/zones/${zoneId}/dns_records`, {
    method: 'POST',
    headers: headers(creds),
    body: JSON.stringify({
      type: record.type,
      name: record.name,
      content: record.content,
      ttl: 1, // auto
      proxied: record.proxied,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Cloudflare DNS record creation failed (${res.status}): ${err}`);
  }
}

async function listRecords(
  creds: CloudflareCredentials,
  zoneId: string,
  type: string,
  name: string,
): Promise<Array<{ id: string; type: string; name: string; content: string }>> {
  const params = new URLSearchParams({ type, name });
  const res = await fetch(`${CF_API}/zones/${zoneId}/dns_records?${params}`, {
    headers: headers(creds),
  });

  if (!res.ok) return [];

  const data = await res.json();
  return (data.result || []).map((r: Record<string, unknown>) => ({
    id: r.id as string,
    type: r.type as string,
    name: r.name as string,
    content: r.content as string,
  }));
}

/**
 * Verify Cloudflare API token is valid and has DNS edit access.
 */
export async function verifyCredentials(
  creds: CloudflareCredentials,
): Promise<{ valid: boolean; zones: Array<{ id: string; name: string }> }> {
  const res = await fetch(`${CF_API}/zones?per_page=50`, {
    headers: headers(creds),
  });

  if (!res.ok) {
    return { valid: false, zones: [] };
  }

  const data = await res.json();
  return {
    valid: true,
    zones: (data.result || []).map((z: Record<string, unknown>) => ({
      id: z.id as string,
      name: z.name as string,
    })),
  };
}
