import { db } from '@/lib/db';
import { clientWebsites } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { createRepoFromTemplate } from '@/lib/github';
import { createProject, addDomain } from '@/lib/vercel';
import { createCnameRecord } from '@/lib/cloudflare-dns';

/**
 * Provision a website: create GitHub repo, Vercel project, and Cloudflare DNS.
 * Runs asynchronously — updates DB status at each step.
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

    // Step 2: Create GitHub repo from template
    const repo = await createRepoFromTemplate(subdomain, description);

    await db.update(clientWebsites)
      .set({
        githubRepoName: repo.fullName,
        githubRepoUrl: repo.htmlUrl,
        updatedAt: new Date(),
      })
      .where(eq(clientWebsites.id, siteId));

    // Step 3: Create Vercel project linked to the repo
    const vercel = await createProject(subdomain, repo.fullName);

    await db.update(clientWebsites)
      .set({
        vercelProjectId: vercel.id,
        vercelProjectUrl: vercel.url,
        updatedAt: new Date(),
      })
      .where(eq(clientWebsites.id, siteId));

    // Step 4: Create Cloudflare CNAME record
    await createCnameRecord(subdomain, 'cname.vercel-dns.com');

    // Step 5: Add domain to Vercel project
    await addDomain(vercel.id, fullDomain);

    // Step 6: Mark as active
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
