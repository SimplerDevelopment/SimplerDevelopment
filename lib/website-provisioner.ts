import { db } from '@/lib/db';
import { clientWebsites } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { createRepoFromTemplate, isRepoNameAvailable } from '@/lib/github';
import { createProject, addDomain, getDomainConfig, createDeployment } from '@/lib/vercel';
import { createCnameRecord, updateCnameRecord, listDnsRecords } from '@/lib/cloudflare-dns';

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

    // Step 4: Add domain to Vercel project (do this before DNS so we can get the correct target)
    await addDomain(vercelId!, fullDomain);

    // Step 5: Get the project-specific DNS target from Vercel and create/update Cloudflare CNAME
    const domainConfig = await getDomainConfig(fullDomain);
    const dnsTarget = domainConfig.cnames[0] || 'cname.vercel-dns.com';

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

    // Step 7: Mark as active
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
