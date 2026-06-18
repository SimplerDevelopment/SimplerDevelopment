/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars -- one-off migration tooling */
import * as dotenv from 'dotenv';
import { hash } from 'bcryptjs';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config({ path: '.env' });

/**
 * Scribble (goscribble.ai) — new client + website + branding setup.
 * Idempotent: safe to re-run. Mirrors scripts/migrations/robingoffman/setup-client.ts.
 *
 * Brand colors verified via live computed styles (see COLOR-MAP.md):
 *   navy #0C1F3F (dark sections + headings), navy-mid #0A2A4A (gradient end),
 *   teal #00B896 (primary accent/CTA), teal-dark #009E80 (hover), teal-light #E6F9F5,
 *   off-white #F7F9FC (alt light sections), body text #64748B.
 *   Fonts: Plus Jakarta Sans (heading+body), Caveat (handwritten logo/accent).
 */
async function setup() {
  const { db } = await import('../../../lib/db');
  const {
    users, clients, clientMembers, clientWebsites,
    brandingProfiles, brandingMessaging, storeSettings,
  } = await import('../../../lib/db/schema');
  const { eq } = await import('drizzle-orm');

  const email = 'scribble@simplerdevelopment.com';
  const companyName = 'Scribble Labs Corp';
  const subdomain = 'scribble';

  // ── User ────────────────────────────────────────────────────────────
  const [existingUser] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  let user = existingUser;
  if (!user) {
    const hashedPassword = await hash('scribble2026', 10);
    const [created] = await db.insert(users).values({
      name: 'Scribble',
      email,
      password: hashedPassword,
      role: 'client' as const,
      active: true,
    }).returning();
    user = created;
    console.log(`User created: ID ${user.id}`);
  } else {
    console.log(`User exists: ID ${user.id}`);
  }

  // ── Client ──────────────────────────────────────────────────────────
  const [existingClient] = await db.select().from(clients).where(eq(clients.userId, user.id)).limit(1);
  let client = existingClient;
  if (!client) {
    const [created] = await db.insert(clients).values({
      userId: user.id,
      company: 'Scribble',
      website: 'https://goscribble.ai',
      notes: 'Scribble (Scribble Labs Corp) — Point-of-Care / ambient AI for home health documentation (real-time OASIS, visit notes, 485 orders). Migrated from static goscribble.ai. HQ: 5 Great Valley Pkwy, Suite 210, Malvern PA 19355.',
    }).returning();
    client = created;
    console.log(`Client created: ID ${client.id}`);
  } else {
    console.log(`Client exists: ID ${client.id}`);
  }

  // ── Member ──────────────────────────────────────────────────────────
  const existingMembers = await db.select().from(clientMembers).where(eq(clientMembers.clientId, client.id));
  if (!existingMembers.find(m => m.userId === user.id)) {
    await db.insert(clientMembers).values({ clientId: client.id, userId: user.id, role: 'owner' });
    console.log('Client member (owner) created');
  } else {
    console.log('Client member exists');
  }

  // ── Website ─────────────────────────────────────────────────────────
  const existingSites = await db.select().from(clientWebsites).where(eq(clientWebsites.clientId, client.id));
  let website = existingSites.find(s => s.subdomain === subdomain) ?? existingSites[0];
  if (!website) {
    const [created] = await db.insert(clientWebsites).values({
      clientId: client.id,
      name: 'Scribble',
      subdomain,
      vercelDomain: `${subdomain}.simplerdevelopment.com`,
      deploymentStatus: 'active',
      active: true,
    }).returning();
    website = created;
    console.log(`Website created: ID ${website.id}`);
  } else {
    console.log(`Website exists: ID ${website.id}`);
  }

  // back-fill default website on the client
  if (client.defaultWebsiteId !== website.id) {
    await db.update(clients).set({ defaultWebsiteId: website.id }).where(eq(clients.id, client.id));
    console.log('clients.defaultWebsiteId back-filled');
  }

  // ── Branding Profile ────────────────────────────────────────────────
  const existingProfiles = await db.select().from(brandingProfiles).where(eq(brandingProfiles.clientId, client.id));
  let profile = existingProfiles[0];

  const profileValues = {
    clientId: client.id,
    name: 'Scribble',
    isDefault: true,
    primaryColor: '#0C1F3F',      // navy — headings / brand
    secondaryColor: '#0A2A4A',    // navy-mid (gradient end)
    accentColor: '#00B896',       // teal — CTAs / accents
    backgroundColor: '#FFFFFF',
    textColor: '#0F172A',
    navTemplate: 'classic',
    navPosition: 'top' as const,
    navBackground: '#FFFFFF',
    navTextColor: '#0C1F3F',
    headingFont: 'Plus Jakarta Sans',
    bodyFont: 'Plus Jakarta Sans',
    logoText: 'Scribble',
    logoAlt: 'Scribble — Point-of-Care AI for Home Health',
    logoIconUrl: 'https://goscribble.ai/icon.png',
    faviconUrl: 'https://goscribble.ai/icon.png',
    borderRadius: '10px',
    linkColor: '#00B896',
    linkHoverColor: '#009E80',
    buttonStyle: {
      primaryBg: '#00B896',
      primaryText: '#FFFFFF',
      primaryHoverBg: '#009E80',
      secondaryBg: 'transparent',
      secondaryText: '#0C1F3F',
      secondaryHoverBg: 'rgba(12,31,63,0.06)',
      borderRadius: '10px',
      variant: 'filled' as const,
    },
  };

  if (!profile) {
    const [created] = await db.insert(brandingProfiles).values(profileValues).returning();
    profile = created;
    console.log(`Branding profile created: ID ${profile.id}`);
  } else {
    await db.update(brandingProfiles).set(profileValues).where(eq(brandingProfiles.id, profile.id));
    console.log(`Branding profile updated: ID ${profile.id}`);
  }

  if (website.brandingProfileId !== profile.id) {
    await db.update(clientWebsites).set({ brandingProfileId: profile.id }).where(eq(clientWebsites.id, website.id));
    console.log('Branding profile linked to website');
  }

  // ── Branding Messaging ──────────────────────────────────────────────
  const existingMsg = await db.select().from(brandingMessaging).where(eq(brandingMessaging.clientId, client.id));
  const messagingValues = {
    clientId: client.id,
    brandingProfileId: profile.id,
    companyName: 'Scribble',
    tagline: 'The Point-of-Care AI for home health',
    missionStatement: 'Eliminate the documentation burden in home health so clinicians can focus on patients, not paperwork.',
    valueProposition: 'Scribble captures what happens at the bedside and fills OASIS, visit notes, and 485 orders in real time — making every downstream process (documentation, billing, compliance, care) faster and more accurate. Clinicians save ~45 minutes per visit.',
    toneOfVoice: 'Clinical, credible, reassuring, ROI-focused',
    elevatorPitch: 'Scribble is the leading ambient AI platform for home health agencies. It listens during the visit, maps the conversation to OASIS fields in real time, and pushes documentation straight to your EHR — saving clinicians ~1 hour a day and turning that time into new capacity and revenue.',
    industry: 'Home Health / Healthcare AI',
    websiteUrl: 'https://goscribble.ai',
    headquarters: '5 Great Valley Pkwy, Suite 210, Malvern PA 19355',
    keyDifferentiators: [
      'Real-time OASIS documentation at the point of care',
      'Understands clinical context (not just dictation)',
      'HIPAA-compliant, BAA with every agency',
      'Integrates with KanTime, WellSky, Netsmart, Axxess, MatrixCare via HL7/FHIR',
      'Live in 2–4 weeks',
    ],
    targetAudience: 'Home health agency leaders (clinical, operations, finance) and the RNs/PTs/OTs who document OASIS in the field.',
    socialProof: 'Active in 12 states. Real feedback from nurses and therapists nationwide.',
  };
  if (existingMsg.length === 0) {
    await db.insert(brandingMessaging).values(messagingValues);
    console.log('Branding messaging created');
  } else {
    await db.update(brandingMessaging).set(messagingValues).where(eq(brandingMessaging.clientId, client.id));
    console.log('Branding messaging updated');
  }

  // ── Store settings (prevents designer-route 404 on websites with no store row) ──
  // Best-effort: the live (metro) DB can lag the ORM's store_settings schema
  // (e.g. missing fulfillment_provider column). Scribble is a marketing site with
  // no store, so a drift here must NOT abort provisioning — just skip it.
  try {
    const existingStore = await db.select({ id: storeSettings.id }).from(storeSettings).where(eq(storeSettings.websiteId, website.id));
    if (existingStore.length === 0) {
      await db.insert(storeSettings).values({ websiteId: website.id });
      console.log('storeSettings row created');
    } else {
      console.log('storeSettings row exists');
    }
  } catch (e: any) {
    console.warn(`storeSettings skipped (schema drift / non-fatal): ${e?.message?.split('\n')[0]}`);
  }

  // ── Write IDs ───────────────────────────────────────────────────────
  const ids = {
    userId: user.id,
    clientId: client.id,
    websiteId: website.id,
    brandingProfileId: profile.id,
    subdomain,
  };
  fs.mkdirSync(path.join(__dirname, 'data'), { recursive: true });
  fs.writeFileSync(path.join(__dirname, 'data', 'ids.json'), JSON.stringify(ids, null, 2));
  console.log('IDs written to data/ids.json');
  console.log('\n=== SCRIBBLE SETUP COMPLETE ===');
  console.log(JSON.stringify(ids, null, 2));
  process.exit(0);
}

setup().catch(err => { console.error(err); process.exit(1); });
