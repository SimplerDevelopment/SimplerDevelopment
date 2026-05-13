import * as dotenv from 'dotenv';
import { hash } from 'bcryptjs';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config({ path: '.env' });

async function setup() {
  const { db } = await import('../../../lib/db');
  const { users, clients, clientMembers, clientWebsites, brandingProfiles, brandingMessaging } = await import('../../../lib/db/schema');
  const { eq } = await import('drizzle-orm');

  const email = 'robingoffman@simplerdevelopment.com';
  const companyName = 'Robin Goffman';
  const subdomain = 'robin-goffman';

  // ── User ────────────────────────────────────────────────────────────
  const [existingUser] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  let user = existingUser;

  if (!user) {
    const hashedPassword = await hash('robingoffman2026', 10);
    const [created] = await db.insert(users).values({
      name: 'Robin Goffman',
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
      company: companyName,
      website: 'https://www.robingoffman.com',
      notes: 'Robin Goffman — Brand Thinker & Design Strategist. Designer portfolio site. Migrated from Wix.',
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
      name: 'Robin Goffman Portfolio',
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

  // ── Branding Profile ────────────────────────────────────────────────
  // Sourced from the live site computed styles:
  //   main bg #FDF9F0 (warm cream), header bg #FFFFFF, text #2A2A2A
  //   nav font: DM Sans medium; body font: DM Sans regular
  //   footer is DIN Next light, 11px, uppercase letterspaced — handled per-block
  //   no traditional CTA buttons on the site — minimal designer portfolio aesthetic
  const existingProfiles = await db.select().from(brandingProfiles).where(eq(brandingProfiles.clientId, client.id));
  let profile = existingProfiles[0];

  // Colors verified by computed-styles inspection on the live site:
  //   body bg #FDF9F0, header bg #FFFFFF, text #2A2A2A,
  //   accent coral #FF6161 (BRAND THINKER overlay, contact CTA, submit button),
  //   accent teal #84C4C3 (contact heading + success message).
  const profileValues = {
    clientId: client.id,
    name: 'studio rg',
    isDefault: true,
    primaryColor: '#2A2A2A',
    secondaryColor: '#84C4C3',
    accentColor: '#FF6161',
    backgroundColor: '#FDF9F0',
    textColor: '#2A2A2A',
    headingFont: 'DM Sans',
    bodyFont: 'DM Sans',
    navTemplate: 'minimal',
    navPosition: 'top' as const,
    navBackground: '#FFFFFF',
    navTextColor: '#2A2A2A',
    logoText: 'studio rg',
    logoAlt: 'studio rg — Robin Goffman',
    // logoUrl is populated by setup-branding.ts after the asset map is built.
    borderRadius: '0px',
    linkColor: '#2A2A2A',
    linkHoverColor: '#FF6161',
    buttonStyle: {
      primaryBg: '#FF6161',
      primaryText: '#FFFFFF',
      primaryHoverBg: '#E54A4A',
      secondaryBg: 'transparent',
      secondaryText: '#2A2A2A',
      secondaryHoverBg: 'rgba(42,42,42,0.06)',
      borderRadius: '999px',
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
    companyName: 'Robin Goffman',
    tagline: 'Brand Thinker / Design Strategist',
    missionStatement: 'I work at the intersection of design and strategy, collaborating with organizations of all sizes to launch brands, design cross-platform products, and enable business strategy development.',
    valueProposition: 'Purposeful data, beautiful design, and business strategies together to change behavior, evoke emotion, and inspire reaction — manifesting the magical moment of engagement that teams and brands are all in pursuit of.',
    toneOfVoice: 'Warm, considered, design-led, personal',
    elevatorPitch: 'Robin Goffman is a brand thinker and design strategist who partners with organizations to launch brands, design products, and translate strategy into work people feel.',
    industry: 'Brand & Design Strategy',
    websiteUrl: 'https://www.robingoffman.com',
    keyDifferentiators: [
      'Creative Strategy',
      'Brand Development',
      'Graphic Design',
      'Website Design',
      'Product Design',
    ],
    targetAudience: 'Founders and teams building brands, products, and business strategies who care about craft and emotional impact.',
  };
  if (existingMsg.length === 0) {
    await db.insert(brandingMessaging).values(messagingValues);
    console.log('Branding messaging created');
  } else {
    await db.update(brandingMessaging).set(messagingValues).where(eq(brandingMessaging.clientId, client.id));
    console.log('Branding messaging updated');
  }

  // ── Write IDs ───────────────────────────────────────────────────────
  const ids = {
    userId: user.id,
    clientId: client.id,
    websiteId: website.id,
    brandingProfileId: profile.id,
  };
  fs.writeFileSync(path.join(__dirname, 'data', 'ids.json'), JSON.stringify(ids, null, 2));
  console.log('IDs written to data/ids.json');
  console.log('\n=== ROBIN GOFFMAN SETUP COMPLETE ===');
  console.log(JSON.stringify(ids, null, 2));
  process.exit(0);
}

setup().catch(err => { console.error(err); process.exit(1); });
