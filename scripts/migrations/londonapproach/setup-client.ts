import * as dotenv from 'dotenv';
import { hash } from 'bcryptjs';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config({ path: '.env' });

async function setup() {
  const { db } = await import('../../../lib/db');
  const { users, clients, clientMembers, clientWebsites, brandingProfiles, brandingMessaging } = await import('../../../lib/db/schema');
  const { eq } = await import('drizzle-orm');

  const email = 'londonapproach@simplerdevelopment.com';
  const companyName = 'London Approach';
  const subdomain = 'london-approach';

  // ── Check for existing records ──────────────────────────────────────
  const [existingUser] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  let user = existingUser;

  if (!user) {
    const hashedPassword = await hash('londonapproach2026', 10);
    const [created] = await db.insert(users).values({
      name: 'London Approach',
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
      phone: '+1-610-590-4900',
      website: 'https://londonapproach.com',
      notes: 'London Approach — Professional Search Firm based in Conshohocken, PA. Women-owned.',
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
      name: 'London Approach',
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
  const existingProfiles = await db.select().from(brandingProfiles).where(eq(brandingProfiles.clientId, client.id));
  let profile = existingProfiles[0];

  const profileValues = {
    clientId: client.id,
    name: 'London Approach Brand',
    isDefault: true,
    primaryColor: '#124334',
    secondaryColor: '#F0F4F4',
    accentColor: '#124334',
    backgroundColor: '#ffffff',
    textColor: '#0c0e13',
    headingFont: 'Montserrat',
    bodyFont: 'Montserrat',
    navTemplate: 'modern',
    navPosition: 'top' as const,
    navBackground: '#ffffff',
    navTextColor: '#0c0e13',
    logoText: 'LONDON APPROACH',
    logoAlt: 'London Approach',
    borderRadius: '0px',
    linkColor: '#124334',
    linkHoverColor: '#0d2f24',
    buttonStyle: {
      primaryBg: '#124334',
      primaryText: '#ffffff',
      primaryHoverBg: '#0d2f24',
      secondaryBg: 'transparent',
      secondaryText: '#124334',
      secondaryHoverBg: 'rgba(18,67,52,0.08)',
      borderRadius: '0px',
      variant: 'filled' as const,
    },
    faviconUrl: 'https://www.londonapproach.com/favicon.ico',
  };

  if (!profile) {
    const [created] = await db.insert(brandingProfiles).values(profileValues).returning();
    profile = created;
    console.log(`Branding profile created: ID ${profile.id}`);
  } else {
    await db.update(brandingProfiles).set(profileValues).where(eq(brandingProfiles.id, profile.id));
    console.log(`Branding profile updated: ID ${profile.id}`);
  }

  // Link to website
  if (website.brandingProfileId !== profile.id) {
    await db.update(clientWebsites).set({ brandingProfileId: profile.id }).where(eq(clientWebsites.id, website.id));
    console.log('Branding profile linked to website');
  }

  // ── Branding Messaging ──────────────────────────────────────────────
  const existingMsg = await db.select().from(brandingMessaging).where(eq(brandingMessaging.clientId, client.id));
  const messagingValues = {
    clientId: client.id,
    brandingProfileId: profile.id,
    companyName,
    tagline: 'Modern Staffing Solutions',
    missionStatement: 'We provide high impact talent for top organizations across North America.',
    valueProposition: 'A results-driven staffing firm specializing in Temporary Solutions, Direct Hire Recruiting, Diversity Initiatives, and Retained Search.',
    toneOfVoice: 'Confident, Editorial, Modern, Professional, Sharp',
    elevatorPitch: 'London Approach is a women-owned professional search firm that partners with startups through Fortune 100 companies to deliver high-impact talent.',
    boilerplate: 'London Approach is a modern staffing firm headquartered in Conshohocken, PA with offices in Tampa, FL. We specialize in temporary staffing, direct-hire search, and passive candidate recruitment across IT, Accounting & Finance, HR, Engineering, Administration, and Construction & Real Estate.',
    industry: 'Professional Staffing / Executive Search',
    headquarters: 'Conshohocken, PA',
    websiteUrl: 'https://londonapproach.com',
    keyDifferentiators: [
      'Women-owned professional search firm',
      'Expertise across IT, Finance, HR, Engineering, Admin, and Construction',
      'Proven 8-step search methodology',
      'Passive candidate recruitment',
      'Partners from start-ups to Fortune 100',
    ],
    targetAudience: 'Hiring managers and talent leaders at startups through Fortune 100, plus passive candidates seeking executive opportunities',
    socialProof: 'Trusted by top organizations across North America. Women-owned.',
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
  fs.writeFileSync(path.join(__dirname, 'ids.json'), JSON.stringify(ids, null, 2));
  console.log('IDs written to ids.json');
  console.log('\n=== LONDON APPROACH SETUP COMPLETE ===');
  console.log(JSON.stringify(ids, null, 2));
  process.exit(0);
}

setup().catch(err => { console.error(err); process.exit(1); });
