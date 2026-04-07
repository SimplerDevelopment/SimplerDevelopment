import * as dotenv from 'dotenv';
import { hash } from 'bcryptjs';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config({ path: '.env' });

async function setup() {
  const { db } = await import('../../../lib/db');
  const { users, clients, clientMembers, clientWebsites, brandingProfiles, brandingMessaging } = await import('../../../lib/db/schema');
  const { eq } = await import('drizzle-orm');

  const email = 'crosscapadvisors@simplerdevelopment.com';
  const companyName = 'Crossover Capital Advisors';

  // ── Check for existing records ──────────────────────────────────────
  const [existingUser] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (existingUser) {
    const [existingClient] = await db.select().from(clients).where(eq(clients.userId, existingUser.id)).limit(1);
    if (existingClient) {
      const sites = await db.select().from(clientWebsites).where(eq(clientWebsites.clientId, existingClient.id));
      const profiles = await db.select().from(brandingProfiles).where(eq(brandingProfiles.clientId, existingClient.id));
      console.log(`Client already exists: ID ${existingClient.id} (${companyName})`);
      if (sites.length > 0) console.log(`Website already exists: ID ${sites[0].id} (${sites[0].name})`);
      if (profiles.length > 0) console.log(`Branding profile already exists: ID ${profiles[0].id}`);

      const ids = {
        userId: existingUser.id,
        clientId: existingClient.id,
        websiteId: sites[0]?.id ?? null,
        brandingProfileId: profiles[0]?.id ?? null,
      };
      fs.writeFileSync(path.join(__dirname, 'ids.json'), JSON.stringify(ids, null, 2));
      console.log('IDs written to ids.json');
      process.exit(0);
    }
  }

  // ── 1. Create user ──────────────────────────────────────────────────
  const hashedPassword = await hash('crosscap2026', 10);
  const [user] = existingUser
    ? [existingUser]
    : await db.insert(users).values({
        name: 'Crossover Capital',
        email,
        password: hashedPassword,
        role: 'client' as const,
        active: true,
      }).returning();
  console.log(`User created: ID ${user.id}`);

  // ── 2. Create client profile ────────────────────────────────────────
  const [client] = await db.insert(clients).values({
    userId: user.id,
    company: companyName,
    phone: '215.396.5517',
    website: 'https://crosscapadvisors.com',
    notes: 'Crossover Capital Advisors - Wealth management & financial planning. Based in Yardley, PA.',
  }).returning();
  console.log(`Client created: ID ${client.id}`);

  // ── 3. Add as owner ─────────────────────────────────────────────────
  await db.insert(clientMembers).values({
    clientId: client.id,
    userId: user.id,
    role: 'owner',
  });
  console.log('Client member (owner) created');

  // ── 4. Create website ───────────────────────────────────────────────
  const [website] = await db.insert(clientWebsites).values({
    clientId: client.id,
    name: 'Crossover Capital Advisors',
    subdomain: 'crosscap-advisors',
    vercelDomain: 'crosscap-advisors.simplerdevelopment.com',
    deploymentStatus: 'active',
    active: true,
  }).returning();
  console.log(`Website created: ID ${website.id}, subdomain: crosscap-advisors`);

  // ── 5. Create branding profile ──────────────────────────────────────
  // Source site colors:
  // Navy: #0a1628, Navy Light: #0f2140, Gold: #cfa122, Gold Light: #dbb440
  // Warm White: #fafbfd, Steel: #64748b, Charcoal: #1e293b
  // Fonts: Cormorant Garamond (serif), Plus Jakarta Sans (sans)
  const [profile] = await db.insert(brandingProfiles).values({
    clientId: client.id,
    name: 'Crossover Capital Brand',
    isDefault: true,
    primaryColor: '#cfa122',       // Gold - the dominant brand accent
    secondaryColor: '#0a1628',     // Navy - used for dark sections and text
    accentColor: '#dbb440',        // Gold Light
    backgroundColor: '#ffffff',
    textColor: '#1e293b',          // Charcoal
    headingFont: 'Cormorant Garamond',
    bodyFont: 'Plus Jakarta Sans',
    navTemplate: 'modern',
    navPosition: 'top',
    navBackground: '#ffffff',
    navTextColor: '#1e293b',
    // Logos - reference from the source site's public dir served at localhost:3001
    logoUrl: 'http://localhost:3001/images/logo-w.svg',
    logoAlt: 'Crossover Capital Advisors',
    logoRectUrl: 'http://localhost:3001/images/logo-w.svg',
    logoText: 'Crossover Capital',
    borderRadius: '2px',           // Source site uses very subtle rounding (rounded-[2px], rounded-sm)
    linkColor: '#cfa122',
    linkHoverColor: '#dbb440',
    buttonStyle: {
      primaryBg: '#cfa122',
      primaryText: '#0a1628',
      primaryHoverBg: '#dbb440',
      secondaryBg: 'transparent',
      secondaryText: '#cfa122',
      secondaryHoverBg: 'rgba(207,161,34,0.1)',
      borderRadius: '2px',
      variant: 'filled',
    },
    faviconUrl: 'http://localhost:3001/images/cropped-favicon.png',
    ogImageUrl: 'http://localhost:3001/images/TEAM_Web-600x400.jpg',
  }).returning();
  console.log(`Branding profile created: ID ${profile.id}`);

  // ── 6. Link branding profile to website ─────────────────────────────
  await db.update(clientWebsites)
    .set({ brandingProfileId: profile.id })
    .where(eq(clientWebsites.id, website.id));
  console.log('Branding profile linked to website');

  // ── 7. Create branding messaging ────────────────────────────────────
  await db.insert(brandingMessaging).values({
    clientId: client.id,
    brandingProfileId: profile.id,
    companyName: 'Crossover Capital Advisors',
    tagline: 'Peace of Mind for All We Serve',
    missionStatement: 'Navigating the confusion and combating the anxiety in understanding your financial unknowns through personalized, tailored financial planning.',
    valueProposition: 'Comprehensive wealth management combining traditional financial planning with cutting-edge expertise in cryptocurrency, divorce financial planning, and family business consulting.',
    toneOfVoice: 'Professional, Refined, Empathetic, Trustworthy, Sophisticated',
    elevatorPitch: 'Crossover Capital Advisors is a SEC-registered investment advisor offering personalized wealth management, financial planning, divorce financial services, family business consulting, and cryptocurrency education. With 22+ years of combined experience, we provide a tailored experience that addresses your precise requirements and goals.',
    boilerplate: 'Crossover Capital Advisors offers personalized wealth management and financial planning services from their offices in Yardley, PA. Founded by Alexander Pron (CFP, CBDA) and Tasha M. Shadle (CIMA, CDFA, CBDA), the firm combines deep expertise in comprehensive financial planning, digital assets, divorce financial planning, and family business governance.',
    industry: 'Financial Services / Wealth Management',
    headquarters: 'Yardley, PA',
    websiteUrl: 'https://crosscapadvisors.com',
    keyDifferentiators: [
      'SEC Registered Investment Advisor with 100% fiduciary standard',
      'Unique combination of traditional wealth management and cryptocurrency expertise',
      'Specialized divorce financial planning with empathetic approach',
      'Family business governance and succession planning',
      '22+ years of combined experience across 4 service disciplines',
    ],
    targetAudience: 'High-net-worth individuals, families navigating divorce, family business owners, cryptocurrency investors',
    socialProof: 'SEC Registered Advisor. 22+ years combined experience. 4 service disciplines. 100% fiduciary standard.',
  });
  console.log('Branding messaging created');

  // ── 8. Write IDs to file ────────────────────────────────────────────
  const ids = {
    userId: user.id,
    clientId: client.id,
    websiteId: website.id,
    brandingProfileId: profile.id,
  };
  fs.writeFileSync(path.join(__dirname, 'ids.json'), JSON.stringify(ids, null, 2));
  console.log('IDs written to ids.json');

  console.log('\n=== CROSSOVER CAPITAL SETUP COMPLETE ===');
  console.log(JSON.stringify(ids, null, 2));

  process.exit(0);
}

setup().catch(err => { console.error(err); process.exit(1); });
