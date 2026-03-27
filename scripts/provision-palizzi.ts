import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });

import { randomBytes } from 'crypto';

/**
 * Standalone provisioning script for Palizzi.
 * Skips GitHub (repo already exists) — does Vercel + Cloudflare + DB only.
 */
async function main() {
  const { db } = await import('../lib/db');
  const { clientWebsites, websiteEnvironments } = await import('../lib/db/schema');
  const { eq } = await import('drizzle-orm');
  const { createProject, addDomain, getDomainConfig, createDeployment, setEnvVars } = await import('../lib/vercel');
  const { createCnameRecord, updateCnameRecord, listDnsRecords } = await import('../lib/cloudflare-dns');

  const siteId = 89;
  const subdomain = 'palizzi';
  const repoFullName = 'SimplerDevelopment/palizzi';
  const fullDomain = `${subdomain}.simplerdevelopment.com`;

  console.log('=== Provisioning Palizzi Social Club ===\n');

  // Step 1: Mark as provisioning
  await db.update(clientWebsites)
    .set({ deploymentStatus: 'provisioning', provisionError: null, updatedAt: new Date() })
    .where(eq(clientWebsites.id, siteId));

  const [current] = await db.select().from(clientWebsites).where(eq(clientWebsites.id, siteId)).limit(1);

  try {
    // Step 2: Skip GitHub — repo already exists
    console.log('1/7 GitHub repo: SimplerDevelopment/palizzi (already exists, skipping)');

    // Step 3: Create Vercel project (skip if already exists)
    let vercelId = current.vercelProjectId;
    let vercelUrl = current.vercelProjectUrl;

    if (!vercelId) {
      console.log('2/7 Creating Vercel project...');
      const vercel = await createProject(subdomain, repoFullName);
      vercelId = vercel.id;
      vercelUrl = vercel.url;
      await db.update(clientWebsites)
        .set({ vercelProjectId: vercelId, vercelProjectUrl: vercelUrl, updatedAt: new Date() })
        .where(eq(clientWebsites.id, siteId));
      console.log(`    Project created: ${vercelId}`);
    } else {
      console.log(`2/7 Vercel project already exists: ${vercelId}`);
    }

    // Step 3b: Generate log API key if missing
    let logApiKey = current.logApiKey;
    if (!logApiKey) {
      logApiKey = randomBytes(32).toString('hex');
      await db.update(clientWebsites)
        .set({ logApiKey, updatedAt: new Date() })
        .where(eq(clientWebsites.id, siteId));
      console.log('3/7 Generated log API key');
    } else {
      console.log('3/7 Log API key already exists');
    }

    // Step 4: Set environment variables
    console.log('4/7 Setting Vercel environment variables...');
    const cmsApiUrl = process.env.CMS_API_URL || 'https://simplerdevelopment.com';
    await setEnvVars(vercelId!, [
      { key: 'CMS_API_URL', value: cmsApiUrl },
      { key: 'SITE_ID', value: String(siteId) },
      { key: 'LOG_ENDPOINT', value: `${cmsApiUrl}/api/logs/ingest` },
      { key: 'LOG_API_KEY', value: logApiKey },
    ]);
    console.log('    Env vars set: CMS_API_URL, SITE_ID, LOG_ENDPOINT, LOG_API_KEY');

    // Step 5: Add domain to Vercel
    console.log(`5/7 Adding domain ${fullDomain} to Vercel...`);
    await addDomain(vercelId!, fullDomain);

    // Step 5b: Get DNS target and create/update Cloudflare CNAME
    console.log('6/7 Configuring Cloudflare DNS...');
    const domainConfig = await getDomainConfig(fullDomain);
    const dnsTarget = domainConfig.cnames[0] || 'cname.vercel-dns.com';
    console.log(`    DNS target: ${dnsTarget}`);

    const existingRecords = await listDnsRecords(subdomain);
    if (existingRecords.length === 0) {
      await createCnameRecord(subdomain, dnsTarget);
      console.log(`    Created CNAME: ${subdomain}.simplerdevelopment.com → ${dnsTarget}`);
    } else if (existingRecords[0].content !== dnsTarget) {
      await updateCnameRecord(existingRecords[0].id, dnsTarget);
      console.log(`    Updated CNAME: ${subdomain}.simplerdevelopment.com → ${dnsTarget}`);
    } else {
      console.log('    CNAME already correct');
    }

    // Step 6: Trigger deployment
    console.log('7/7 Triggering deployment...');
    try {
      const deployment = await createDeployment(vercelId!, repoFullName, 'main');
      console.log(`    Deployment triggered: ${deployment.id}`);
    } catch (err) {
      console.log('    Deployment trigger skipped (Vercel may auto-deploy from GitHub push)');
    }

    // Step 7: Create environments (idempotent)
    const existingEnvs = await db.select().from(websiteEnvironments)
      .where(eq(websiteEnvironments.websiteId, siteId));
    if (existingEnvs.length === 0) {
      await db.insert(websiteEnvironments).values([
        { websiteId: siteId, name: 'production', vercelTarget: 'production' },
        { websiteId: siteId, name: 'staging', vercelTarget: 'preview', previewUrl: `https://${subdomain}-git-staging-simplerdevelopment.vercel.app` },
      ]);
      console.log('    Created production + staging environments');
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

    console.log('\n=== Provisioning complete! ===');
    console.log(`Site: https://${fullDomain}`);
    console.log(`Vercel: ${vercelUrl}`);
    console.log(`GitHub: https://github.com/${repoFullName}`);

  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    await db.update(clientWebsites)
      .set({ deploymentStatus: 'failed', provisionError: message, updatedAt: new Date() })
      .where(eq(clientWebsites.id, siteId));
    console.error('\nProvisioning FAILED:', message);
    if (err instanceof Error) console.error(err.stack);
  }

  process.exit(0);
}

main();
