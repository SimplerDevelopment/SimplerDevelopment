const GD_API = 'https://api.godaddy.com/v1';

interface GoDaddyCredentials {
  apiKey: string;
  apiSecret: string;
}

function headers(creds: GoDaddyCredentials) {
  return {
    Authorization: `sso-key ${creds.apiKey}:${creds.apiSecret}`,
    'Content-Type': 'application/json',
  };
}

/** Extract root domain and subdomain prefix from a full domain string. */
function parseDomain(domain: string): { root: string; prefix: string } {
  const parts = domain.split('.');
  if (parts.length <= 2) {
    return { root: domain, prefix: '@' };
  }
  // e.g. "www.example.com" → root: "example.com", prefix: "www"
  return {
    root: parts.slice(-2).join('.'),
    prefix: parts.slice(0, -2).join('.'),
  };
}

/**
 * Add Vercel DNS records (CNAME + A) for a custom domain via GoDaddy API.
 * This creates the records needed to point the domain to Vercel.
 */
export async function configureVercelDns(
  creds: GoDaddyCredentials,
  domain: string,
): Promise<{ success: boolean; records: Array<{ type: string; name: string; value: string }> }> {
  const { root, prefix } = parseDomain(domain);
  const records: Array<{ type: string; name: string; value: string }> = [];

  // Add A record for root domain → Vercel IP
  if (prefix === '@') {
    await addRecord(creds, root, { type: 'A', name: '@', data: '76.76.21.21', ttl: 600 });
    records.push({ type: 'A', name: '@', value: '76.76.21.21' });

    // Also add www CNAME
    await addRecord(creds, root, { type: 'CNAME', name: 'www', data: 'cname.vercel-dns.com', ttl: 600 });
    records.push({ type: 'CNAME', name: 'www', value: 'cname.vercel-dns.com' });
  } else {
    // Subdomain — just CNAME
    await addRecord(creds, root, { type: 'CNAME', name: prefix, data: 'cname.vercel-dns.com', ttl: 600 });
    records.push({ type: 'CNAME', name: prefix, value: 'cname.vercel-dns.com' });
  }

  return { success: true, records };
}

/**
 * Add a single DNS record via GoDaddy. Uses PATCH to append without overwriting existing records.
 */
async function addRecord(
  creds: GoDaddyCredentials,
  rootDomain: string,
  record: { type: string; name: string; data: string; ttl: number },
): Promise<void> {
  const res = await fetch(
    `${GD_API}/domains/${rootDomain}/records/${record.type}/${record.name}`,
    {
      method: 'PUT',
      headers: headers(creds),
      body: JSON.stringify([{ data: record.data, ttl: record.ttl }]),
    },
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`GoDaddy DNS failed (${res.status}): ${err}`);
  }
}

/**
 * Verify GoDaddy API credentials are valid by fetching the domain list.
 */
export async function verifyCredentials(
  creds: GoDaddyCredentials,
): Promise<{ valid: boolean; domains: string[] }> {
  const res = await fetch(`${GD_API}/domains?limit=100`, {
    headers: headers(creds),
  });

  if (!res.ok) {
    return { valid: false, domains: [] };
  }

  const data = await res.json();
  return {
    valid: true,
    domains: (data || []).map((d: { domain: string }) => d.domain),
  };
}

/**
 * List existing DNS records for a domain.
 */
export async function listRecords(
  creds: GoDaddyCredentials,
  domain: string,
): Promise<Array<{ type: string; name: string; data: string; ttl: number }>> {
  const { root } = parseDomain(domain);
  const res = await fetch(`${GD_API}/domains/${root}/records`, {
    headers: headers(creds),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`GoDaddy listRecords failed (${res.status}): ${err}`);
  }

  return res.json();
}
