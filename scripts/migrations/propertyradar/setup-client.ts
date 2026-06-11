/**
 * Setup PropertyRadar client, website, and branding in SimplerDevelopment.
 *
 * Idempotent — checks by email/name before inserting. Safe to re-run.
 *
 * Safety: reads DATABASE_URL and refuses to run against prod hosts unless
 * ALLOW_PROD=1 is set (mirrors verify-db-target.ts logic).
 *
 * Run:  npx tsx scripts/migrations/propertyradar/setup-client.ts
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local', override: true }); if (process.env.PR_DATABASE_URL) process.env.DATABASE_URL = process.env.PR_DATABASE_URL;

// ─── Prod safety check ────────────────────────────────────────────────────────
const DATABASE_URL = process.env.DATABASE_URL ?? '';
if (!DATABASE_URL) {
  console.error('ERROR: DATABASE_URL is not set.');
  process.exit(1);
}

const PROD_INDICATORS = [
  'tramway.proxy.rlwy.net:43167',
  'metro.proxy.rlwy.net:25565',
];
const isProd =
  PROD_INDICATORS.some((p) => DATABASE_URL.includes(p)) ||
  process.env.RAILWAY_ENVIRONMENT_NAME === 'production';
const redactedUrl = DATABASE_URL.replace(/:\/\/[^@]*@/, '://[REDACTED]@');

if (isProd && process.env.ALLOW_PROD !== '1') {
  console.error('');
  console.error('  REFUSING: DATABASE_URL points at a production host.');
  console.error(`  DATABASE_URL → ${redactedUrl}`);
  console.error('  Re-run with ALLOW_PROD=1 if this is truly intentional.');
  console.error('');
  process.exit(1);
}

// Extract just the host for logging
const hostMatch = DATABASE_URL.match(/@([^/:]+)/);
const dbHost = hostMatch ? hostMatch[1] : '(unknown host)';

console.log(`\n[setup-client] DB host: ${dbHost}`);
console.log('[setup-client] Starting PropertyRadar client setup...\n');

import { hash } from 'bcryptjs';

async function run() {
  const { db } = await import('../../../lib/db');
  const { sql, eq, and } = await import('drizzle-orm');
  const { users, clients, clientMembers, clientWebsites } = await import('../../../lib/db/schema');
  const { brandingProfiles, brandingMessaging } = await import('../../../lib/db/schema');
  const { siteBranding } = await import('../../../lib/db/schema');
  const { generateUniqueSubdomain } = await import('../../../lib/subdomain');

  // Print current_database() for confirmation
  const [dbRow] = await db.execute(sql`SELECT current_database() AS db`);
  console.log(`[setup-client] Connected to database: ${(dbRow as Record<string, unknown>).db}\n`);

  // ─── 1. User ────────────────────────────────────────────────────────────────
  const PR_EMAIL = 'propertyradar@simplerdevelopment.com';
  let userId: number;
  let userCreated = false;

  const existingUser = await db.select().from(users).where(eq(users.email, PR_EMAIL)).limit(1);
  if (existingUser.length > 0) {
    userId = existingUser[0].id;
    console.log(`  [user] Already exists — id=${userId}`);
  } else {
    const tempPassword = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
    const hashedPassword = await hash(tempPassword, 12);
    const [newUser] = await db.insert(users).values({
      name: 'PropertyRadar',
      email: PR_EMAIL,
      password: hashedPassword,
      role: 'client',
      active: true,
    }).returning();
    userId = newUser.id;
    userCreated = true;
    console.log(`  [user] Created — id=${userId}`);
  }

  // ─── 2. Client ─────────────────────────────────────────────────────────────
  let clientId: number;
  let clientCreated = false;

  const existingClient = await db.select().from(clients).where(eq(clients.userId, userId)).limit(1);
  if (existingClient.length > 0) {
    clientId = existingClient[0].id;
    console.log(`  [client] Already exists — id=${clientId}`);
  } else {
    const [newClient] = await db.insert(clients).values({
      userId,
      company: 'PropertyRadar',
      website: 'https://www.propertyradar.com',
      phone: null,
    }).returning();
    clientId = newClient.id;
    clientCreated = true;
    console.log(`  [client] Created — id=${clientId}`);
  }

  // ─── 3. clientMembers ──────────────────────────────────────────────────────
  // Row 1: propertyradar user as owner
  const existingOwner = await db.select()
    .from(clientMembers)
    .where(and(eq(clientMembers.clientId, clientId), eq(clientMembers.userId, userId)))
    .limit(1);
  if (existingOwner.length > 0) {
    console.log(`  [clientMembers] PropertyRadar owner row already exists — id=${existingOwner[0].id}`);
  } else {
    const [m1] = await db.insert(clientMembers).values({
      clientId,
      userId,
      role: 'owner',
    }).returning();
    console.log(`  [clientMembers] PropertyRadar owner row created — id=${m1.id}`);
  }

  // Row 2: info@danielpcoyle.com as owner
  const ADMIN_EMAIL = 'info@danielpcoyle.com';
  const adminUserRows = await db.select().from(users).where(eq(users.email, ADMIN_EMAIL)).limit(1);
  if (adminUserRows.length === 0) {
    console.warn(`  [clientMembers] WARNING: User ${ADMIN_EMAIL} not found — skipping admin member row.`);
  } else {
    const adminUserId = adminUserRows[0].id;
    const existingAdminMember = await db.select()
      .from(clientMembers)
      .where(and(eq(clientMembers.clientId, clientId), eq(clientMembers.userId, adminUserId)))
      .limit(1);
    if (existingAdminMember.length > 0) {
      console.log(`  [clientMembers] Admin (${ADMIN_EMAIL}) owner row already exists — id=${existingAdminMember[0].id} userId=${adminUserId}`);
    } else {
      const [m2] = await db.insert(clientMembers).values({
        clientId,
        userId: adminUserId,
        role: 'owner',
      }).returning();
      console.log(`  [clientMembers] Admin (${ADMIN_EMAIL}) owner row created — id=${m2.id} userId=${adminUserId}`);
    }
  }

  // ─── 4. clientWebsites ─────────────────────────────────────────────────────
  let websiteId: number;
  let subdomain: string;
  let vercelDomain: string;
  let websiteCreated = false;

  const existingWebsite = await db.select()
    .from(clientWebsites)
    .where(and(eq(clientWebsites.clientId, clientId), eq(clientWebsites.name, 'PropertyRadar')))
    .limit(1);

  if (existingWebsite.length > 0) {
    websiteId = existingWebsite[0].id;
    subdomain = existingWebsite[0].subdomain ?? 'propertyradar';
    vercelDomain = existingWebsite[0].vercelDomain ?? `${subdomain}.simplerdevelopment.com`;
    console.log(`  [clientWebsites] Already exists — id=${websiteId} subdomain=${subdomain}`);
  } else {
    subdomain = await generateUniqueSubdomain('PropertyRadar', 'PropertyRadar');
    vercelDomain = `${subdomain}.simplerdevelopment.com`;
    const [newSite] = await db.insert(clientWebsites).values({
      clientId,
      name: 'PropertyRadar',
      domain: null,
      subdomain,
      vercelDomain,
      deploymentStatus: 'active',
      active: true,
      publicAccess: false,
    }).returning();
    websiteId = newSite.id;
    websiteCreated = true;
    console.log(`  [clientWebsites] Created — id=${websiteId} subdomain=${subdomain}`);
  }

  // ─── Shared branding values ────────────────────────────────────────────────
  const LOGO_RECT = 'https://www.propertyradar.com/hs-fs/hubfs/Brand%20Assets/5f6496ee50a79fe0a801cc27_PR-Logo-Full-p-800.png';
  const LOGO_SQUARE = 'https://www.propertyradar.com/hubfs/propertyradar-glyph.svg';
  const OG_IMAGE = 'https://www.propertyradar.com/hubfs/Social%20Sharing.png';

  const brandingValues = {
    primaryColor: '#0A1F44',
    secondaryColor: '#123563',
    accentColor: '#38CB89',
    backgroundColor: '#FFFFFF',
    textColor: '#0A1F44',
    navBackground: '#FFFFFF',
    navTextColor: '#0A1F44',
    headingFont: 'Poppins',
    bodyFont: 'Poppins',
    logoUrl: LOGO_RECT,
    logoRectUrl: LOGO_RECT,
    logoSquareUrl: LOGO_SQUARE,
    logoIconUrl: LOGO_SQUARE,
    faviconUrl: LOGO_SQUARE,
    logoAlt: 'PropertyRadar',
    logoText: 'PropertyRadar',
    ogImageUrl: OG_IMAGE,
    borderRadius: '10px',
    linkColor: '#19467F',
    linkHoverColor: '#2BA56C',
    buttonStyle: {
      primaryBg: '#38CB89',
      primaryText: '#0A1F44',
      primaryHoverBg: '#2BA56C',
      secondaryBg: 'transparent',
      secondaryText: '#0A1F44',
      secondaryHoverBg: 'rgba(10,31,68,0.06)',
      borderRadius: '10px',
      variant: 'filled' as const,
    },
  };

  // ─── 5. brandingProfiles ───────────────────────────────────────────────────
  let brandingProfileId: number;
  let brandingProfileCreated = false;

  const existingProfile = await db.select()
    .from(brandingProfiles)
    .where(and(eq(brandingProfiles.clientId, clientId), eq(brandingProfiles.name, 'PropertyRadar Brand')))
    .limit(1);

  if (existingProfile.length > 0) {
    brandingProfileId = existingProfile[0].id;
    console.log(`  [brandingProfiles] Already exists — id=${brandingProfileId}`);
  } else {
    const [newProfile] = await db.insert(brandingProfiles).values({
      clientId,
      name: 'PropertyRadar Brand',
      isDefault: true,
      ...brandingValues,
    }).returning();
    brandingProfileId = newProfile.id;
    brandingProfileCreated = true;
    console.log(`  [brandingProfiles] Created — id=${brandingProfileId}`);
  }

  // Update clientWebsites.brandingProfileId if not already set
  const currentSite = await db.select().from(clientWebsites).where(eq(clientWebsites.id, websiteId)).limit(1);
  if (currentSite[0] && !currentSite[0].brandingProfileId) {
    await db.update(clientWebsites)
      .set({ brandingProfileId })
      .where(eq(clientWebsites.id, websiteId));
    console.log(`  [clientWebsites] Linked brandingProfileId=${brandingProfileId} to websiteId=${websiteId}`);
  }

  // ─── 6. siteBranding ──────────────────────────────────────────────────────
  let siteBrandingId: number;
  let siteBrandingCreated = false;

  const existingSiteBranding = await db.select()
    .from(siteBranding)
    .where(eq(siteBranding.websiteId, websiteId))
    .limit(1);

  if (existingSiteBranding.length > 0) {
    siteBrandingId = existingSiteBranding[0].id;
    console.log(`  [siteBranding] Already exists — id=${siteBrandingId}`);
  } else {
    const [newSiteBranding] = await db.insert(siteBranding).values({
      websiteId,
      ...brandingValues,
    }).returning();
    siteBrandingId = newSiteBranding.id;
    siteBrandingCreated = true;
    console.log(`  [siteBranding] Created — id=${siteBrandingId}`);
  }

  // ─── 7. brandingMessaging ─────────────────────────────────────────────────
  let brandingMessagingId: number;
  let brandingMessagingCreated = false;

  const existingMessaging = await db.select()
    .from(brandingMessaging)
    .where(eq(brandingMessaging.clientId, clientId))
    .limit(1);

  if (existingMessaging.length > 0) {
    brandingMessagingId = existingMessaging[0].id;
    console.log(`  [brandingMessaging] Already exists — id=${brandingMessagingId}`);
  } else {
    const [newMessaging] = await db.insert(brandingMessaging).values({
      clientId,
      brandingProfileId,
      companyName: 'PropertyRadar',
      tagline: 'Find Motivated Property Owners',
      valueProposition:
        'Connect real estate, mortgage, and service pros with motivated property owners, qualify opportunities, and automate outreach — powered by 20 years of obsessive data quality.',
      industry: 'Real Estate Data / PropTech',
      headquarters: 'Truckee, CA',
      websiteUrl: 'https://www.propertyradar.com',
      keyDifferentiators: [
        'OwnerGraph™ relationship data',
        'Exclusive modeled data points',
        '20 years of data quality',
        'Daily-updated, backtested against county records',
      ],
    }).returning();
    brandingMessagingId = newMessaging.id;
    brandingMessagingCreated = true;
    console.log(`  [brandingMessaging] Created — id=${brandingMessagingId}`);
  }

  // ─── Summary ──────────────────────────────────────────────────────────────
  const adminUserFinal = await db.select().from(users).where(eq(users.email, ADMIN_EMAIL)).limit(1);
  const adminUserId = adminUserFinal[0]?.id ?? null;

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  PropertyRadar — Setup Complete');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  DB host:              ${dbHost}`);
  console.log(`  userId (PR):          ${userId}  [${userCreated ? 'CREATED' : 'existed'}]`);
  console.log(`  clientId:             ${clientId}  [${clientCreated ? 'CREATED' : 'existed'}]`);
  console.log(`  info@danielpcoyle.com userId: ${adminUserId ?? 'NOT FOUND'}  [looked up]`);
  console.log(`  websiteId:            ${websiteId}  [${websiteCreated ? 'CREATED' : 'existed'}]`);
  console.log(`  subdomain:            ${subdomain}`);
  console.log(`  vercelDomain:         ${vercelDomain}`);
  console.log(`  brandingProfileId:    ${brandingProfileId}  [${brandingProfileCreated ? 'CREATED' : 'existed'}]`);
  console.log(`  siteBrandingId:       ${siteBrandingId}  [${siteBrandingCreated ? 'CREATED' : 'existed'}]`);
  console.log(`  brandingMessagingId:  ${brandingMessagingId}  [${brandingMessagingCreated ? 'CREATED' : 'existed'}]`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Machine-readable handoff for the migration pipeline (target website id).
  const fs = await import('fs');
  const path = await import('path');
  fs.writeFileSync(path.join(__dirname, 'data', '.target-website-id'), String(websiteId), 'utf8');
  console.log(`PR_RESULT_WEBSITE_ID=${websiteId}`);
}

run().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
}).finally(() => {
  process.exit(0);
});
