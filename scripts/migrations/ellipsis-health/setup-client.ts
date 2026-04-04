import * as dotenv from 'dotenv';
import { hash } from 'bcryptjs';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config({ path: '.env' });

async function setup() {
  const { db } = await import('../../../lib/db');
  const { users, clients, clientMembers, clientWebsites, brandingProfiles, brandingMessaging } = await import('../../../lib/db/schema');
  const { eq } = await import('drizzle-orm');

  const email = 'ellipsis@simplerdevelopment.com';
  const companyName = 'Ellipsis Health';

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
  const hashedPassword = await hash('ellipsis2026', 10);
  const [user] = existingUser
    ? [existingUser]
    : await db.insert(users).values({
        name: 'Ellipsis',
        email,
        password: hashedPassword,
        role: 'client' as const,
        active: true,
      }).returning();
  console.log(`\u2713 User created: ID ${user.id}`);

  // ── 2. Create client profile ────────────────────────────────────────
  const [client] = await db.insert(clients).values({
    userId: user.id,
    company: companyName,
    phone: '',
    website: 'https://ellipsishealth.com',
    notes: 'Ellipsis Health - AI Care Manager',
  }).returning();
  console.log(`\u2713 Client created: ID ${client.id}`);

  // ── 3. Add as owner ─────────────────────────────────────────────────
  await db.insert(clientMembers).values({
    clientId: client.id,
    userId: user.id,
    role: 'owner',
  });
  console.log('\u2713 Client member (owner) created');

  // ── 4. Create website ───────────────────────────────────────────────
  const [website] = await db.insert(clientWebsites).values({
    clientId: client.id,
    name: 'Ellipsis Health',
    subdomain: 'ellipsis-health',
    vercelDomain: 'ellipsis-health.simplerdevelopment.com',
    deploymentStatus: 'active',
    active: true,
  }).returning();
  console.log(`\u2713 Website created: ID ${website.id}, subdomain: ellipsis-health`);

  // ── 5. Create branding profile ──────────────────────────────────────
  const [profile] = await db.insert(brandingProfiles).values({
    clientId: client.id,
    name: 'Ellipsis Health Brand',
    isDefault: true,
    primaryColor: '#4d34fa',
    secondaryColor: '#14111f',
    accentColor: '#13af8a',
    backgroundColor: '#ffffff',
    textColor: '#14111f',
    headingFont: 'Inter',
    bodyFont: 'Inter',
    navTemplate: 'modern',
    navPosition: 'top',
    navBackground: '#ffffff',
    navTextColor: '#14111f',
    logoUrl: 'https://ellipsishealth.com/wp-content/uploads/2025/04/logo-ellipsis-1.png',
    logoAlt: 'Ellipsis Health',
    logoRectUrl: 'https://ellipsishealth.com/wp-content/uploads/2025/04/logo-ellipsis-1.png',
    logoText: 'Ellipsis Health',
    borderRadius: '12px',
    linkColor: '#4d34fa',
    linkHoverColor: '#3a22d6',
    buttonStyle: {
      primaryBg: '#4d34fa',
      primaryText: '#ffffff',
      primaryHoverBg: '#3a22d6',
      secondaryBg: 'transparent',
      secondaryText: '#4d34fa',
      secondaryHoverBg: '#e4e1fe',
      borderRadius: '28px',
      variant: 'filled',
    },
    faviconUrl: 'https://ellipsishealth.com/wp-content/uploads/2025/04/sage-icon-1.png',
    ogImageUrl: 'https://ellipsishealth.com/wp-content/uploads/2025/05/Yoast-1200x675-Title.jpg',
    darkMode: {
      primaryColor: '#7c6bfa',
      secondaryColor: '#ffffff',
      backgroundColor: '#14111f',
      textColor: '#ffffff',
      navBackground: '#14111f',
      navTextColor: '#ffffff',
      logoUrl: 'https://ellipsishealth.com/wp-content/uploads/2025/04/logo-ellipsis-white-1.png',
    },
  }).returning();
  console.log(`\u2713 Branding profile created: ID ${profile.id}`);

  // ── 6. Link branding profile to website ─────────────────────────────
  await db.update(clientWebsites)
    .set({ brandingProfileId: profile.id })
    .where(eq(clientWebsites.id, website.id));
  console.log('\u2713 Branding profile linked to website');

  // ── 7. Create branding messaging ────────────────────────────────────
  await db.insert(brandingMessaging).values({
    clientId: client.id,
    brandingProfileId: profile.id,
    companyName: 'Ellipsis Health',
    tagline: 'Hearing is believing.',
    missionStatement: 'Delivering empathetic, innovative AI solutions that improve care operations and unlock life-changing outcomes for every patient.',
    valueProposition: '24/7 emotionally intelligent care management for Health Plans, Health Systems, Specialty Care, and Pharma.',
    toneOfVoice: 'Professional, Empathetic, Innovative, Trustworthy',
    elevatorPitch: "Ellipsis Health's AI Care Manager, Sage, makes fully autonomous virtual care management calls that are empathetic, consistent, and multi-lingual. Trusted by CVS Health, Optum, Duke Health and more.",
    boilerplate: "Ellipsis Health is the healthcare AI company delivering empathetic AI solutions that improve care operations. Founded in 2017 and backed by Salesforce Ventures, Khosla Ventures, and CVS Ventures, Ellipsis Health's AI Care Manager Sage expands capacity, reduces costs, and elevates patient care.",
    industry: 'Healthcare / Health Tech',
    yearFounded: '2017',
    headquarters: 'San Francisco, CA',
    websiteUrl: 'https://ellipsishealth.com',
    keyDifferentiators: [
      'Proprietary Empathy Engine with patented vocal biomarker technology',
      'Trained on 3.1M+ real clinical conversations',
      'HIPAA and SOC2 Type 2 compliant',
      'Seamless EHR/CRM integration',
      '24/7 autonomous care management calls',
    ],
    targetAudience: 'Health Plans, Health Systems, Specialty Care Managers, Pharma',
    keyClients: 'CVS Health, Optum, Duke Health, Highmark, Nemours Children\'s Health, Guardant Health, Virta Health',
    socialProof: 'Backed by Salesforce Ventures, Khosla Ventures, CVS Ventures. 10+ peer-reviewed publications. HIPAA and SOC2 Type 2 certified.',
  });
  console.log('\u2713 Branding messaging created');

  // ── 8. Write IDs to file ────────────────────────────────────────────
  const ids = {
    userId: user.id,
    clientId: client.id,
    websiteId: website.id,
    brandingProfileId: profile.id,
  };
  fs.writeFileSync(path.join(__dirname, 'ids.json'), JSON.stringify(ids, null, 2));
  console.log('\u2713 IDs written to ids.json');

  console.log('\n=== ELLIPSIS HEALTH SETUP COMPLETE ===');
  console.log(JSON.stringify(ids, null, 2));

  process.exit(0);
}

setup().catch(err => { console.error(err); process.exit(1); });
