const VERCEL_API = 'https://api.vercel.com';

function headers() {
  const token = process.env.VERCEL_API_TOKEN;
  if (!token) throw new Error('Missing VERCEL_API_TOKEN');
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

function teamParam() {
  const teamId = process.env.VERCEL_TEAM_ID;
  return teamId ? `?teamId=${teamId}` : '';
}

/**
 * Create a Vercel project linked to a GitHub repo.
 */
export async function createProject(
  name: string,
  repoFullName: string,
): Promise<{ id: string; url: string }> {
  const res = await fetch(`${VERCEL_API}/v10/projects${teamParam()}`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      name,
      framework: 'nextjs',
      gitRepository: {
        type: 'github',
        repo: repoFullName,
      },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Vercel createProject failed (${res.status}): ${err}`);
  }

  const data = await res.json();
  return {
    id: data.id,
    url: `https://vercel.com/${process.env.VERCEL_TEAM_ID ? 'team' : 'dashboard'}/${name}`,
  };
}

/**
 * Add a custom domain to a Vercel project. Returns the domain config including DNS target.
 */
export async function addDomain(
  projectId: string,
  domain: string,
): Promise<{ apexName: string; verified: boolean }> {
  const res = await fetch(`${VERCEL_API}/v10/projects/${projectId}/domains${teamParam()}`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ name: domain }),
  });

  if (!res.ok) {
    const body = await res.text();
    // Domain already added — not an error
    if (res.status === 409) return { apexName: domain, verified: false };
    throw new Error(`Vercel addDomain failed (${res.status}): ${body}`);
  }

  const data = await res.json();
  return { apexName: data.apexName || domain, verified: data.verified ?? false };
}

/**
 * Get the recommended DNS config for a domain on a Vercel project.
 */
export async function getDomainConfig(
  domain: string,
): Promise<{ cnames: string[] }> {
  const res = await fetch(`${VERCEL_API}/v6/domains/${domain}/config${teamParam()}`, {
    headers: headers(),
  });

  if (!res.ok) return { cnames: ['cname.vercel-dns.com'] };

  const data = await res.json();
  // Vercel returns cnames array with the project-specific target
  const cnames = data.cnames || [];
  return { cnames: cnames.length > 0 ? cnames : ['cname.vercel-dns.com'] };
}

/**
 * Remove a domain from a Vercel project.
 */
export async function removeDomain(
  projectId: string,
  domain: string,
): Promise<void> {
  const res = await fetch(`${VERCEL_API}/v10/projects/${projectId}/domains/${domain}${teamParam()}`, {
    method: 'DELETE',
    headers: headers(),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Vercel removeDomain failed (${res.status}): ${err}`);
  }
}

/**
 * Trigger a deployment for a Vercel project from its linked Git repo.
 */
export async function createDeployment(
  projectId: string,
  repoFullName: string,
  ref = 'main',
): Promise<{ id: string }> {
  const res = await fetch(`${VERCEL_API}/v13/deployments${teamParam()}`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      name: projectId,
      project: projectId,
      gitSource: {
        type: 'github',
        repo: repoFullName,
        ref,
      },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Vercel createDeployment failed (${res.status}): ${err}`);
  }

  const data = await res.json();
  return { id: data.id };
}

/**
 * Set environment variables on a Vercel project.
 */
export async function setEnvVars(
  projectId: string,
  vars: Array<{ key: string; value: string; target?: string[] }>,
): Promise<void> {
  for (const v of vars) {
    const res = await fetch(`${VERCEL_API}/v10/projects/${projectId}/env${teamParam()}`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        key: v.key,
        value: v.value,
        type: 'plain',
        target: v.target || ['production', 'preview', 'development'],
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      // 409 = already exists, skip
      if (res.status !== 409) {
        throw new Error(`Vercel setEnvVar ${v.key} failed (${res.status}): ${body}`);
      }
    }
  }
}

/**
 * Get build logs for a specific deployment.
 */
export async function getDeploymentEvents(
  deploymentId: string,
): Promise<Array<{
  type: string;
  text: string;
  created: number;
}>> {
  const params = new URLSearchParams({
    ...(process.env.VERCEL_TEAM_ID && { teamId: process.env.VERCEL_TEAM_ID }),
  });

  const res = await fetch(`${VERCEL_API}/v3/deployments/${deploymentId}/events?${params}`, {
    headers: headers(),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Vercel getDeploymentEvents failed (${res.status}): ${err}`);
  }

  const events = await res.json();
  return (events || []).map((e: Record<string, unknown>) => ({
    type: e.type || 'stdout',
    text: typeof e.text === 'string' ? e.text : (e.payload as Record<string, string>)?.text || '',
    created: (e.created as number) || Date.now(),
  }));
}

/**
 * Check if a domain's DNS is correctly configured for Vercel.
 * Uses Vercel's domain config + project domain verification endpoints.
 */
export async function verifyDomain(
  projectId: string,
  domain: string,
): Promise<{
  verified: boolean;
  misconfigured: boolean;
  dnsRecords: Array<{ type: string; host: string; value: string; expected?: string }>;
  error?: string;
}> {
  // 1. Check domain config (DNS resolution)
  const configRes = await fetch(`${VERCEL_API}/v6/domains/${domain}/config${teamParam()}`, {
    headers: headers(),
  });

  let misconfigured = true;
  const dnsRecords: Array<{ type: string; host: string; value: string; expected?: string }> = [];

  if (configRes.ok) {
    const config = await configRes.json();
    misconfigured = config.misconfigured ?? true;

    // Collect what Vercel sees
    if (config.cnames?.length) {
      for (const c of config.cnames) {
        dnsRecords.push({ type: 'CNAME', host: domain, value: c });
      }
    }
    if (config.aValues?.length) {
      for (const a of config.aValues) {
        dnsRecords.push({ type: 'A', host: domain, value: a });
      }
    }
  }

  // 2. Trigger Vercel domain verification on the project
  const verifyRes = await fetch(
    `${VERCEL_API}/v10/projects/${projectId}/domains/${domain}/verify${teamParam()}`,
    { method: 'POST', headers: headers() },
  );

  let verified = false;
  if (verifyRes.ok) {
    const data = await verifyRes.json();
    verified = data.verified ?? false;

    // If Vercel provides a verification TXT record needed
    if (data.verification?.length) {
      for (const v of data.verification) {
        dnsRecords.push({
          type: v.type,
          host: v.domain,
          value: v.value,
          expected: v.value,
        });
      }
    }
  } else if (verifyRes.status === 404) {
    return { verified: false, misconfigured: true, dnsRecords, error: 'Domain not found on this project' };
  }

  return { verified, misconfigured, dnsRecords };
}

/**
 * Get recent deployments for a Vercel project.
 */
export async function getDeployments(
  projectId: string,
  limit = 5,
): Promise<Array<{
  id: string;
  url: string;
  state: string;
  createdAt: number;
  meta?: { githubCommitMessage?: string; githubCommitRef?: string };
}>> {
  const params = new URLSearchParams({
    projectId,
    limit: String(limit),
    ...(process.env.VERCEL_TEAM_ID && { teamId: process.env.VERCEL_TEAM_ID }),
  });

  const res = await fetch(`${VERCEL_API}/v6/deployments?${params}`, {
    headers: headers(),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Vercel getDeployments failed (${res.status}): ${err}`);
  }

  const data = await res.json();
  return (data.deployments || []).map((d: Record<string, unknown>) => ({
    id: d.uid,
    url: `https://${d.url}`,
    state: d.state || d.readyState,
    createdAt: d.createdAt || d.created,
    meta: d.meta,
  }));
}
