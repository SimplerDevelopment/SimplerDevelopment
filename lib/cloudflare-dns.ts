const CF_API = 'https://api.cloudflare.com/client/v4';

function headers() {
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!token) throw new Error('Missing CLOUDFLARE_API_TOKEN');
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

function zoneId() {
  const id = process.env.CLOUDFLARE_ZONE_ID;
  if (!id) throw new Error('Missing CLOUDFLARE_ZONE_ID');
  return id;
}

/**
 * Create a CNAME record for <name>.simplerdevelopment.com → target.
 */
export async function createCnameRecord(
  name: string,
  target: string,
): Promise<{ id: string }> {
  const res = await fetch(`${CF_API}/zones/${zoneId()}/dns_records`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      type: 'CNAME',
      name, // e.g. "acme-main" → acme-main.simplerdevelopment.com
      content: target,
      ttl: 1, // auto
      proxied: false, // let Vercel handle SSL
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Cloudflare createCnameRecord failed (${res.status}): ${err}`);
  }

  const data = await res.json();
  return { id: data.result.id };
}

/**
 * Update an existing CNAME record's target.
 */
export async function updateCnameRecord(recordId: string, target: string): Promise<void> {
  const res = await fetch(`${CF_API}/zones/${zoneId()}/dns_records/${recordId}`, {
    method: 'PATCH',
    headers: headers(),
    body: JSON.stringify({ content: target }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Cloudflare updateCnameRecord failed (${res.status}): ${err}`);
  }
}

/**
 * Delete a DNS record by ID.
 */
export async function deleteDnsRecord(recordId: string): Promise<void> {
  const res = await fetch(`${CF_API}/zones/${zoneId()}/dns_records/${recordId}`, {
    method: 'DELETE',
    headers: headers(),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Cloudflare deleteDnsRecord failed (${res.status}): ${err}`);
  }
}

/**
 * List DNS records matching a name (to check existence).
 */
export async function listDnsRecords(
  name: string,
): Promise<Array<{ id: string; type: string; name: string; content: string }>> {
  const params = new URLSearchParams({ name: `${name}.simplerdevelopment.com`, type: 'CNAME' });
  const res = await fetch(`${CF_API}/zones/${zoneId()}/dns_records?${params}`, {
    headers: headers(),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Cloudflare listDnsRecords failed (${res.status}): ${err}`);
  }

  const data = await res.json();
  return (data.result || []).map((r: Record<string, unknown>) => ({
    id: r.id,
    type: r.type,
    name: r.name,
    content: r.content,
  }));
}
