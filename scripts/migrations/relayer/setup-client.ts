/**
 * Setup Relayer (userelayer.com) client, website, and branding in SimplerDevelopment.
 *
 * Relayer is the "AI Customer Care Layer for OEMs" — a product of AutoAssist, Inc.
 * (West Chester, PA). Brand system captured from the live Framer site.
 *
 * Idempotent — checks by email/name before inserting. Safe to re-run.
 * Writes scripts/migrations/relayer/_ids.json so _shared.ts + worker import scripts
 * pick up the resolved clientId / websiteId without env coordination.
 *
 * Run:  npx tsx scripts/migrations/relayer/setup-client.ts
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local', override: true });
if (process.env.RL_DATABASE_URL) process.env.DATABASE_URL = process.env.RL_DATABASE_URL;

const DATABASE_URL = process.env.DATABASE_URL ?? '';
if (!DATABASE_URL) {
  console.error('ERROR: DATABASE_URL is not set.');
  process.exit(1);
}
const PROD_INDICATORS = ['tramway.proxy.rlwy.net:43167', 'metro.proxy.rlwy.net:25565'];
const isProd = PROD_INDICATORS.some((p) => DATABASE_URL.includes(p)) || process.env.RAILWAY_ENVIRONMENT_NAME === 'production';
const redactedUrl = DATABASE_URL.replace(/:\/\/[^@]*@/, '://[REDACTED]@');
if (isProd && process.env.ALLOW_PROD !== '1') {
  console.error(`\n  REFUSING: DATABASE_URL points at a production host.\n  DATABASE_URL → ${redactedUrl}\n  Re-run with ALLOW_PROD=1 if truly intentional.\n`);
  process.exit(1);
}
const hostMatch = DATABASE_URL.match(/@([^/:]+)/);
const dbHost = hostMatch ? hostMatch[1] : '127.0.0.1 (local socket)';
console.log(`\n[setup-client] DB host: ${dbHost}`);
console.log('[setup-client] Starting Relayer client setup...\n');

import { hash } from 'bcryptjs';

async function run() {
  const { db } = await import('../../../lib/db');
  const { sql, eq, and } = await import('drizzle-orm');
  const { users, clients, clientMembers, clientWebsites, brandingProfiles, brandingMessaging, siteBranding } = await import('../../../lib/db/schema');
  const { generateUniqueSubdomain } = await import('../../../lib/subdomain');

  const [dbRow] = await db.execute(sql`SELECT current_database() AS db`);
  console.log(`[setup-client] Connected to database: ${(dbRow as Record<string, unknown>).db}\n`);

  // ─── 1. User ────────────────────────────────────────────────────────────────
  const RL_EMAIL = 'userelayer@simplerdevelopment.com';
  let userId: number;
  const existingUser = await db.select().from(users).where(eq(users.email, RL_EMAIL)).limit(1);
  if (existingUser.length > 0) {
    userId = existingUser[0].id;
    console.log(`  [user] Already exists — id=${userId}`);
  } else {
    const tempPassword = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
    const hashedPassword = await hash(tempPassword, 12);
    const [newUser] = await db.insert(users).values({
      name: 'Relayer', email: RL_EMAIL, password: hashedPassword, role: 'client', active: true,
    }).returning();
    userId = newUser.id;
    console.log(`  [user] Created — id=${userId}`);
  }

  // ─── 2. Client ─────────────────────────────────────────────────────────────
  let clientId: number;
  const existingClient = await db.select().from(clients).where(eq(clients.userId, userId)).limit(1);
  if (existingClient.length > 0) {
    clientId = existingClient[0].id;
    console.log(`  [client] Already exists — id=${clientId}`);
  } else {
    const [newClient] = await db.insert(clients).values({
      userId, company: 'Relayer', website: 'https://www.userelayer.com', phone: null,
    }).returning();
    clientId = newClient.id;
    console.log(`  [client] Created — id=${clientId}`);
  }

  // ─── 3. clientMembers (relayer user + admin) ───────────────────────────────
  const ensureMember = async (uid: number, label: string) => {
    const ex = await db.select().from(clientMembers).where(and(eq(clientMembers.clientId, clientId), eq(clientMembers.userId, uid))).limit(1);
    if (ex.length > 0) { console.log(`  [clientMembers] ${label} row exists — id=${ex[0].id}`); return; }
    const [m] = await db.insert(clientMembers).values({ clientId, userId: uid, role: 'owner' }).returning();
    console.log(`  [clientMembers] ${label} owner created — id=${m.id}`);
  };
  await ensureMember(userId, 'Relayer');
  const ADMIN_EMAIL = 'info@danielpcoyle.com';
  const adminRows = await db.select().from(users).where(eq(users.email, ADMIN_EMAIL)).limit(1);
  if (adminRows.length === 0) console.warn(`  [clientMembers] WARNING: ${ADMIN_EMAIL} not found — skipping admin member.`);
  else await ensureMember(adminRows[0].id, `Admin (${ADMIN_EMAIL})`);

  // ─── 4. clientWebsites ─────────────────────────────────────────────────────
  let websiteId: number;
  let subdomain: string;
  let vercelDomain: string;
  const existingWebsite = await db.select().from(clientWebsites)
    .where(and(eq(clientWebsites.clientId, clientId), eq(clientWebsites.name, 'Relayer'))).limit(1);
  if (existingWebsite.length > 0) {
    websiteId = existingWebsite[0].id;
    subdomain = existingWebsite[0].subdomain ?? 'relayer';
    vercelDomain = existingWebsite[0].vercelDomain ?? `${subdomain}.simplerdevelopment.com`;
    console.log(`  [clientWebsites] Already exists — id=${websiteId} subdomain=${subdomain}`);
  } else {
    subdomain = await generateUniqueSubdomain('Relayer', 'Relayer');
    vercelDomain = `${subdomain}.simplerdevelopment.com`;
    const [newSite] = await db.insert(clientWebsites).values({
      clientId, name: 'Relayer', domain: null, subdomain, vercelDomain,
      deploymentStatus: 'active', active: true, publicAccess: false,
    }).returning();
    websiteId = newSite.id;
    console.log(`  [clientWebsites] Created — id=${websiteId} subdomain=${subdomain}`);
  }

  // ─── Shared branding values (captured from userelayer.com computed styles) ───
  const FAVICON = 'https://framerusercontent.com/images/fFFb6lgPyN8eeIA59rXaIP8nE2I.png';
  const OG_IMAGE = 'https://framerusercontent.com/images/V2gxs3cjqwVdfwldVMDwJ5RIyw.png';
  const brandingValues = {
    primaryColor: '#032916',      // forest green
    secondaryColor: '#0A3A22',
    accentColor: '#23EE92',       // mint
    backgroundColor: '#E1DDD5',   // warm cream (dominant page bg)
    textColor: '#032916',
    navBackground: '#032916',     // nav sits on the forest hero
    navTextColor: '#F6F5F3',
    headingFont: 'Space Grotesk',
    bodyFont: 'Hanken Grotesk',
    logoUrl: FAVICON,
    logoRectUrl: FAVICON,
    logoSquareUrl: FAVICON,
    logoIconUrl: FAVICON,
    faviconUrl: FAVICON,
    logoAlt: 'Relayer',
    logoText: 'Relayer',
    ogImageUrl: OG_IMAGE,
    borderRadius: '14px',
    linkColor: '#032916',
    linkHoverColor: '#1ED584',
    buttonStyle: {
      primaryBg: '#23EE92',
      primaryText: '#032916',
      primaryHoverBg: '#1ED584',
      secondaryBg: 'transparent',
      secondaryText: '#F6F5F3',
      secondaryHoverBg: 'rgba(35,238,146,0.12)',
      borderRadius: '52px',
      variant: 'filled' as const,
    },
  };

  // ─── 5. brandingProfiles ───────────────────────────────────────────────────
  let brandingProfileId: number;
  const existingProfile = await db.select().from(brandingProfiles)
    .where(and(eq(brandingProfiles.clientId, clientId), eq(brandingProfiles.name, 'Relayer Brand'))).limit(1);
  if (existingProfile.length > 0) {
    brandingProfileId = existingProfile[0].id;
    await db.update(brandingProfiles).set({ ...brandingValues, updatedAt: new Date() }).where(eq(brandingProfiles.id, brandingProfileId));
    console.log(`  [brandingProfiles] Updated existing — id=${brandingProfileId}`);
  } else {
    const [newProfile] = await db.insert(brandingProfiles).values({
      clientId, name: 'Relayer Brand', isDefault: true, ...brandingValues,
    }).returning();
    brandingProfileId = newProfile.id;
    console.log(`  [brandingProfiles] Created — id=${brandingProfileId}`);
  }
  await db.update(clientWebsites).set({ brandingProfileId }).where(eq(clientWebsites.id, websiteId));
  console.log(`  [clientWebsites] Linked brandingProfileId=${brandingProfileId} to websiteId=${websiteId}`);

  // ─── 6. siteBranding (per-website) ─────────────────────────────────────────
  let siteBrandingId: number;
  const existingSB = await db.select().from(siteBranding).where(eq(siteBranding.websiteId, websiteId)).limit(1);
  if (existingSB.length > 0) {
    siteBrandingId = existingSB[0].id;
    await db.update(siteBranding).set({ ...brandingValues, updatedAt: new Date() }).where(eq(siteBranding.id, siteBrandingId));
    console.log(`  [siteBranding] Updated existing — id=${siteBrandingId}`);
  } else {
    const [newSB] = await db.insert(siteBranding).values({ websiteId, ...brandingValues }).returning();
    siteBrandingId = newSB.id;
    console.log(`  [siteBranding] Created — id=${siteBrandingId}`);
  }

  // ─── 7. brandingMessaging ──────────────────────────────────────────────────
  const existingMsg = await db.select().from(brandingMessaging).where(eq(brandingMessaging.clientId, clientId)).limit(1);
  if (existingMsg.length > 0) {
    console.log(`  [brandingMessaging] Already exists — id=${existingMsg[0].id}`);
  } else {
    const [m] = await db.insert(brandingMessaging).values({
      clientId, brandingProfileId,
      companyName: 'Relayer',
      tagline: 'AI Customer Care Layer for OEMs',
      valueProposition:
        'Relayer creates the shared operational layer between manufacturers and dealer networks, replacing fragmented post-sale systems with consistent execution and measurable outcomes.',
      industry: 'Automotive SaaS / Customer Experience',
      headquarters: 'West Chester, PA',
      websiteUrl: 'https://www.userelayer.com',
      keyDifferentiators: [
        'Shared OEM + dealer operational layer',
        'AI-powered post-sale customer-care workflows',
        'Network-wide execution and visibility',
        'Measurable, store-by-store outcomes',
      ],
    }).returning();
    console.log(`  [brandingMessaging] Created — id=${m.id}`);
  }

  // ─── Write _ids.json handoff ────────────────────────────────────────────────
  const fs = await import('fs');
  const path = await import('path');
  fs.writeFileSync(path.join(__dirname, '_ids.json'), JSON.stringify({ clientId, websiteId, userId, subdomain, brandingProfileId }, null, 2), 'utf8');

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  Relayer — Setup Complete');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  clientId:           ${clientId}`);
  console.log(`  websiteId:          ${websiteId}`);
  console.log(`  subdomain:          ${subdomain}`);
  console.log(`  vercelDomain:       ${vercelDomain}`);
  console.log(`  brandingProfileId:  ${brandingProfileId}`);
  console.log(`  Local URL:          http://localhost:3000/sites/${vercelDomain}/`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log(`RL_RESULT_WEBSITE_ID=${websiteId}`);
}

run().catch((err) => { console.error('FATAL:', err); process.exit(1); }).finally(() => process.exit(0));
