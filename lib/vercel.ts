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
