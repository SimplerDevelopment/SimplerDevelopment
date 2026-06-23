import { randomBytes } from 'crypto';
import { db } from '@/lib/db';
import { clientWebsites, websiteEnvironments } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { createRepoFromTemplate, isRepoNameAvailable } from '@/lib/github';
import { createProject, addDomain, removeDomain, getDomainConfig, createDeployment, setEnvVars } from '@/lib/vercel';
import { createCnameRecord, updateCnameRecord, deleteDnsRecord, listDnsRecords } from '@/lib/cloudflare-dns';

/**
 * Provision a website: create GitHub repo, Vercel project, and Cloudflare DNS.
 * Idempotent — checks what already exists and resumes from where it left off.
 */
export async function provisionWebsite(
  siteId: number,
  subdomain: string,
  description: string,
): Promise<void> {
  const fullDomain = `${subdomain}.simplerdevelopment.com`;

  try {
    // Step 1: Mark as provisioning
    await db.update(clientWebsites)
      .set({ deploymentStatus: 'provisioning', provisionError: null, updatedAt: new Date() })
      .where(eq(clientWebsites.id, siteId));

    // Read current state to resume from where we left off
    const [current] = await db.select().from(clientWebsites).where(eq(clientWebsites.id, siteId)).limit(1);

    // Step 2: Create GitHub repo (skip if already exists)
    let repoFullName = current.githubRepoName;
    let repoUrl = current.githubRepoUrl;

    if (!repoFullName) {
      const available = await isRepoNameAvailable(subdomain);
      if (available) {
        const repo = await createRepoFromTemplate(subdomain, description);
        repoFullName = repo.fullName;
        repoUrl = repo.htmlUrl;
      } else {
        // Repo already exists from a previous attempt — reuse it
        repoFullName = `SimplerDevelopment/${subdomain}`;
        repoUrl = `https://github.com/SimplerDevelopment/${subdomain}`;
      }

      await db.update(clientWebsites)
        .set({ githubRepoName: repoFullName, githubRepoUrl: repoUrl, updatedAt: new Date() })
        .where(eq(clientWebsites.id, siteId));
    }

    // Step 3: Create Vercel project (skip if already exists)
    let vercelId = current.vercelProjectId;
    let vercelUrl = current.vercelProjectUrl;

    if (!vercelId) {
      const vercel = await createProject(subdomain, repoFullName!);
      vercelId = vercel.id;
      vercelUrl = vercel.url;

      await db.update(clientWebsites)
        .set({ vercelProjectId: vercelId, vercelProjectUrl: vercelUrl, updatedAt: new Date() })
        .where(eq(clientWebsites.id, siteId));
    }

    // Step 3b: Generate log API key if missing
    let logApiKey = current.logApiKey;
    if (!logApiKey) {
      logApiKey = randomBytes(32).toString('hex');
      await db.update(clientWebsites)
        .set({ logApiKey, updatedAt: new Date() })
        .where(eq(clientWebsites.id, siteId));
    }

    // Step 3c: Set CMS environment variables so the starter can fetch content
    const cmsApiUrl = process.env.CMS_API_URL || 'https://simplerdevelopment.com';
    await setEnvVars(vercelId!, [
      { key: 'CMS_API_URL', value: cmsApiUrl },
      { key: 'SITE_ID', value: String(siteId) },
      { key: 'LOG_ENDPOINT', value: `${cmsApiUrl}/api/logs/ingest` },
      { key: 'LOG_API_KEY', value: logApiKey },
    ]);

    // Step 4: Add domain to Vercel project (do this before DNS so we can get the correct target)
    await addDomain(vercelId!, fullDomain);

    // Step 5: Get the project-specific DNS target from Vercel.
    // Vercel may take a moment to assign the project-specific CNAME after addDomain,
    // so retry a few times before falling back to the generic target.
    let dnsTarget = 'cname.vercel-dns.com';
    for (let attempt = 0; attempt < 3; attempt++) {
      const domainConfig = await getDomainConfig(fullDomain);
      const target = domainConfig.cnames[0];
      if (target && target !== 'cname.vercel-dns.com') {
        dnsTarget = target;
        break;
      }
      // Wait 2s before retrying
      if (attempt < 2) await new Promise(r => setTimeout(r, 2000));
    }

    const existingRecords = await listDnsRecords(subdomain);
    if (existingRecords.length === 0) {
      await createCnameRecord(subdomain, dnsTarget);
    } else if (existingRecords[0].content !== dnsTarget) {
      await updateCnameRecord(existingRecords[0].id, dnsTarget);
    }

    // Step 6: Trigger initial deployment
    try {
      await createDeployment(vercelId!, repoFullName!, 'main');
    } catch {
      // Non-fatal — Vercel may auto-deploy from the GitHub push
    }

    // Step 7: Create production + staging environments (idempotent)
    const existingEnvs = await db.select().from(websiteEnvironments)
      .where(eq(websiteEnvironments.websiteId, siteId));

    if (existingEnvs.length === 0) {
      await db.insert(websiteEnvironments).values([
        { websiteId: siteId, name: 'production', vercelTarget: 'production' },
        { websiteId: siteId, name: 'staging', vercelTarget: 'preview', previewUrl: `https://${subdomain}-git-staging-simplerdevelopment.vercel.app` },
      ]);
    }

    // Step 8: Mark as active
    await db.update(clientWebsites)
      .set({
        vercelDomain: fullDomain,
        deploymentStatus: 'active',
        lastDeployedAt: new Date(),
        provisionError: null,
        updatedAt: new Date(),
      })
      .where(eq(clientWebsites.id, siteId));

  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown provisioning error';
    await db.update(clientWebsites)
      .set({
        deploymentStatus: 'failed',
        provisionError: message,
        updatedAt: new Date(),
      })
      .where(eq(clientWebsites.id, siteId));
    throw err;
  }
}

/**
 * Change a website's subdomain: update Vercel domain (if dedicated), Cloudflare DNS, and DB.
 * For shared-hosted sites (no vercelProjectId), only updates DNS and DB.
 */
export async function changeSubdomain(
  siteId: number,
  oldSubdomain: string,
  newSubdomain: string,
  vercelProjectId: string | null,
): Promise<void> {
  const oldDomain = `${oldSubdomain}.simplerdevelopment.com`;
  const newDomain = `${newSubdomain}.simplerdevelopment.com`;

  if (vercelProjectId) {
    // Dedicated Vercel project — update domain on Vercel
    // 1. Add new domain to Vercel
    await addDomain(vercelProjectId, newDomain);

    // 2. Get the project-specific DNS target for the new domain
    const domainConfig = await getDomainConfig(newDomain);
    const dnsTarget = domainConfig.cnames[0] || 'cname.vercel-dns.com';

    // 3. Create new Cloudflare CNAME
    await createCnameRecord(newSubdomain, dnsTarget);

    // 4. Remove old domain from Vercel (non-fatal if it fails)
    try {
      await removeDomain(vercelProjectId, oldDomain);
    } catch {
      // Old domain may not exist
    }
  } else {
    // Shared hosting — CNAME points to the platform's Railway domain
    const platformDomain = process.env.RAILWAY_PUBLIC_DOMAIN || 'simplerdevelopment.com';
    await createCnameRecord(newSubdomain, platformDomain);
  }

  // Delete old Cloudflare CNAME (non-fatal)
  try {
    const oldRecords = await listDnsRecords(oldSubdomain);
    for (const r of oldRecords) {
      await deleteDnsRecord(r.id);
    }
  } catch {
    // Old record may not exist
  }

  // Update DB
  await db.update(clientWebsites)
    .set({
      subdomain: newSubdomain,
      vercelDomain: newDomain,
      updatedAt: new Date(),
    })
    .where(eq(clientWebsites.id, siteId));
}
