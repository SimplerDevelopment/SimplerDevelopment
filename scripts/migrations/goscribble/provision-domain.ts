/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars -- one-off migration tooling */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });

/**
 * Register scribble.simplerdevelopment.com on the shared platform Vercel project
 * so Vercel issues a TLS cert and serves the subdomain. Idempotent (addDomain
 * treats 409 "already added" as success). Wildcard DNS already points at Vercel.
 */
async function main() {
  const { resolveDomainProjectId, addDomain, getDomainConfig, verifyDomain } = await import('../../../lib/vercel');
  const domain = 'scribble.simplerdevelopment.com';
  const projectId = resolveDomainProjectId(null); // null vercelProjectId → shared platform project
  console.log('platform projectId:', projectId);

  const added = await addDomain(projectId, domain);
  console.log('addDomain:', JSON.stringify(added));

  try { console.log('domainConfig:', JSON.stringify(await getDomainConfig(domain))); }
  catch (e: any) { console.log('config err:', e.message); }

  try { console.log('verify:', JSON.stringify(await verifyDomain(projectId, domain))); }
  catch (e: any) { console.log('verify err:', e.message); }

  process.exit(0);
}
main().catch(e => { console.error('ERR', e.message); process.exit(1); });
