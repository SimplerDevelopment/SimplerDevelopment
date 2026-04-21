/**
 * Move postcaptain.com from its orphan client (100) to CY Strategies (98).
 * Also refreshes the branding profile with values derived from the live site.
 *
 * Idempotent — safe to re-run. Verifies state before/after.
 *
 * Run: npx tsx -r dotenv/config scripts/migrations/postcaptain/move-to-cystrategies.ts dotenv_config_path=.env
 */
import { db } from '@/lib/db';
import {
  clients,
  clientWebsites,
  brandingProfiles,
  brandingMessaging,
  siteBranding,
  clientMembers,
  users,
} from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';

const FROM_CLIENT_ID = 100;    // orphan "Post Captain Consulting" client
const TO_CLIENT_ID = 98;       // CY Strategies
const WEBSITE_ID = 144;        // postcaptain.com website

// Refreshed branding from live-site HTML analysis
const BRANDING = {
  primaryColor: '#004D80',      // deep navy — dominant (7+ section backgrounds, all button primaries)
  secondaryColor: '#A5C3E6',    // muted accent blue — 4 section backgrounds
  accentColor: '#FFD576',       // warm gold — 3 highlight blocks
  backgroundColor: '#FFFFFF',   // white dominant
  textColor: '#14111F',         // near-black body text
  navBackground: '#FFFFFF',
  navTextColor: '#004D80',
  navTemplate: 'classic',
  navPosition: 'top',
  headingFont: 'Poppins',
  bodyFont: 'DM Sans',
  borderRadius: '8px',
  linkColor: '#004D80',
  linkHoverColor: '#003861',
  buttonStyle: {
    // Matches live-site primary: pc-portals-cta__button
    primaryBg: '#004D80',
    primaryText: '#FFFFFF',
    primaryHoverBg: '#FFFFFF',
    // Matches live-site inverse: pc-audits__button
    secondaryBg: '#FFFFFF',
    secondaryText: '#004D80',
    secondaryHoverBg: '#004D80',
    borderRadius: '40px',       // pill CTA (4 hits in live CSS)
    variant: 'filled' as const,
  },
  logoUrl: 'https://postcaptain.com/wp-content/uploads/2024/05/482b161e27250212551fead7a9feaecd1f41c617.png',
  logoRectUrl: 'https://postcaptain.com/wp-content/uploads/2024/05/482b161e27250212551fead7a9feaecd1f41c617.png',
  logoSquareUrl: 'https://postcaptain.com/wp-content/uploads/2024/05/PostCaptain_IconCircle.svg',
  logoIconUrl: 'https://postcaptain.com/wp-content/uploads/2024/05/PostCaptain_IconCircle.svg',
  logoAlt: 'Post Captain Consulting',
  logoText: 'Post Captain',
  faviconUrl: 'https://postcaptain.com/wp-content/uploads/2024/05/PostCaptain_IconCircle.svg',
  ogImageUrl: 'https://postcaptain.com/wp-content/uploads/2025/01/Blue-background-logo-for-website-thumbnail.png',
};

const MESSAGING = {
  companyName: 'Post Captain Consulting',
  tagline: 'Slate Consulting for Universities and Colleges',
  valueProposition: 'Post Captain Consulting, a Platinum Preferred Partner, supports 100+ colleges, universities, and foundations in achieving mission-critical goals in Slate.',
  boilerplate: 'Post Captain Consulting is a Platinum Preferred Slate Partner supporting 100+ colleges, universities, and foundations through implementations, projects, support, portals, and audits.',
  elevatorPitch: 'We don\'t just create custom solutions — we build Slate teams. Post Captain helps higher-ed institutions chart a clear course through admissions, student success, and advancement.',
  missionStatement: 'Supports colleges, universities, and foundations in achieving mission-critical goals in Slate CRM.',
  visionStatement: 'A higher education partner who sees the big picture, speaks your language, and helps you create value with Slate.',
  industry: 'Higher Education Technology Consulting',
  companySize: 'Small consulting firm',
  websiteUrl: 'https://postcaptain.com',
  targetAudience: 'Higher-education leaders in admissions, enrollment, advancement, and student success using Technolutions Slate CRM.',
  keyDifferentiators: [
    'Platinum Preferred Slate Partner',
    'Team of former Slate Captains with deep institutional knowledge',
    'Collaborative approach — builds teams, not just solutions',
    'Trusted by 100+ colleges, universities, and foundations',
    'Coverage across Admissions, Student Success, and Advancement',
  ],
  socialProof: 'William Peace University: 83% increase in readmit completions. Loyola University Maryland: $965K+ raised from 2,600+ donors. VCU: 2 days of staff time saved. Landmark College: 5 years of historical data integrated.',
  keyClients: 'UC, Cooper Union, UVM, Northwestern, Carleton, Penn, William Peace University, Loyola University Maryland, VCU, Landmark College',
  toneOfVoice: 'Professional, knowledgeable, approachable, collaborative, trustworthy',
  brandPersonality: 'Experienced navigators and trusted guides. Confident without being boastful. Collaborative and warm — partners, not vendors. Nautical metaphors (captains, charts, True North) used naturally.',
  writingStyle: 'Plain English. Active voice. Lead with the outcome. Respect the reader\'s time. Quietly authoritative — earned expertise, not boasting.',
  toneAxes: {
    formal: 0.3,
    playful: -0.1,
    traditional: 0.2,
    authoritative: 0.5,
  },
  additionalContext: 'Nautical-themed brand (post captain = ship captain). Services: Implementations, Projects, Support, Portals, Audits. Solutions: Admissions, Student Success, Advancement. Newsletter: True North.',
};

async function main() {
  console.log('─── Pre-flight checks ───');

  const [fromClient] = await db.select().from(clients).where(eq(clients.id, FROM_CLIENT_ID));
  const [toClient] = await db.select().from(clients).where(eq(clients.id, TO_CLIENT_ID));
  if (!toClient) throw new Error(`Target client ${TO_CLIENT_ID} (CY Strategies) not found`);
  console.log(`  From client: ${fromClient ? `${FROM_CLIENT_ID} "${fromClient.company}"` : 'already removed'}`);
  console.log(`  To client:   ${TO_CLIENT_ID} "${toClient.company}"`);

  const [website] = await db.select().from(clientWebsites).where(eq(clientWebsites.id, WEBSITE_ID));
  if (!website) throw new Error(`Website ${WEBSITE_ID} not found`);
  console.log(`  Website ${WEBSITE_ID}: currently under client ${website.clientId}`);

  console.log('\n─── 1. Move website to CY Strategies ───');
  if (website.clientId === TO_CLIENT_ID) {
    console.log('  ✓ Already on CY Strategies');
  } else {
    await db.update(clientWebsites).set({ clientId: TO_CLIENT_ID, updatedAt: new Date() }).where(eq(clientWebsites.id, WEBSITE_ID));
    console.log(`  ✓ Moved website ${WEBSITE_ID} to client ${TO_CLIENT_ID}`);
  }

  console.log('\n─── 2. Move + refresh branding profile ───');
  // Find the existing profile attached to the website
  const [existingProfile] = await db.select().from(brandingProfiles).where(eq(brandingProfiles.name, 'Post Captain Brand'));
  let profileId: number;
  if (existingProfile) {
    await db.update(brandingProfiles).set({
      clientId: TO_CLIENT_ID,
      isDefault: false,         // CY Strategies' existing default stays default
      ...BRANDING,
      updatedAt: new Date(),
    }).where(eq(brandingProfiles.id, existingProfile.id));
    profileId = existingProfile.id;
    console.log(`  ✓ Moved + refreshed branding profile ${profileId} to client ${TO_CLIENT_ID}`);
  } else {
    const [newProfile] = await db.insert(brandingProfiles).values({
      clientId: TO_CLIENT_ID,
      name: 'Post Captain Brand',
      isDefault: false,
      ...BRANDING,
    }).returning();
    profileId = newProfile.id;
    console.log(`  ✓ Created branding profile ${profileId}`);
  }

  // Ensure website points to the right profile
  if (website.brandingProfileId !== profileId) {
    await db.update(clientWebsites).set({ brandingProfileId: profileId, updatedAt: new Date() }).where(eq(clientWebsites.id, WEBSITE_ID));
    console.log(`  ✓ Linked website ${WEBSITE_ID} to profile ${profileId}`);
  }

  console.log('\n─── 3. Move + refresh messaging (raw SQL — staging DB missing tone_axes/voice_samples) ───');
  // Raw SQL to avoid Drizzle selecting columns that don't exist on staging DB.
  // Migrations 0047 (tone_axes, voice_samples) is unapplied on this DB.
  const { toneAxes: _toneAxes, ...MSG_SAFE } = MESSAGING;
  void _toneAxes;
  const pg = await import('postgres');
  const rawSql = pg.default(process.env.DATABASE_URL!, { max: 1 });
  try {
    const [existingMsg] = await rawSql<{ id: number }[]>`
      SELECT id FROM branding_messaging WHERE branding_profile_id = ${profileId} LIMIT 1
    `;
    if (existingMsg) {
      await rawSql`
        UPDATE branding_messaging SET
          client_id = ${TO_CLIENT_ID},
          company_name = ${MSG_SAFE.companyName},
          tagline = ${MSG_SAFE.tagline},
          mission_statement = ${MSG_SAFE.missionStatement},
          vision_statement = ${MSG_SAFE.visionStatement},
          value_proposition = ${MSG_SAFE.valueProposition},
          tone_of_voice = ${MSG_SAFE.toneOfVoice},
          brand_personality = ${MSG_SAFE.brandPersonality},
          writing_style = ${MSG_SAFE.writingStyle},
          elevator_pitch = ${MSG_SAFE.elevatorPitch},
          boilerplate = ${MSG_SAFE.boilerplate},
          key_differentiators = ${rawSql.json(MSG_SAFE.keyDifferentiators)},
          target_audience = ${MSG_SAFE.targetAudience},
          industry = ${MSG_SAFE.industry},
          company_size = ${MSG_SAFE.companySize},
          website_url = ${MSG_SAFE.websiteUrl},
          social_proof = ${MSG_SAFE.socialProof},
          key_clients = ${MSG_SAFE.keyClients},
          additional_context = ${MSG_SAFE.additionalContext},
          updated_at = now()
        WHERE id = ${existingMsg.id}
      `;
      console.log(`  ✓ Refreshed messaging ${existingMsg.id}`);
    } else {
      const [row] = await rawSql<{ id: number }[]>`
        INSERT INTO branding_messaging (
          client_id, branding_profile_id, company_name, tagline, mission_statement, vision_statement,
          value_proposition, tone_of_voice, brand_personality, writing_style, elevator_pitch, boilerplate,
          key_differentiators, target_audience, industry, company_size, website_url, social_proof, key_clients, additional_context
        ) VALUES (
          ${TO_CLIENT_ID}, ${profileId}, ${MSG_SAFE.companyName}, ${MSG_SAFE.tagline},
          ${MSG_SAFE.missionStatement}, ${MSG_SAFE.visionStatement}, ${MSG_SAFE.valueProposition},
          ${MSG_SAFE.toneOfVoice}, ${MSG_SAFE.brandPersonality}, ${MSG_SAFE.writingStyle},
          ${MSG_SAFE.elevatorPitch}, ${MSG_SAFE.boilerplate}, ${rawSql.json(MSG_SAFE.keyDifferentiators)},
          ${MSG_SAFE.targetAudience}, ${MSG_SAFE.industry}, ${MSG_SAFE.companySize}, ${MSG_SAFE.websiteUrl},
          ${MSG_SAFE.socialProof}, ${MSG_SAFE.keyClients}, ${MSG_SAFE.additionalContext}
        ) RETURNING id
      `;
      console.log(`  ✓ Created messaging ${row.id}`);
    }
  } finally {
    await rawSql.end();
  }

  console.log('\n─── 4. Refresh siteBranding (per-site override) ───');
  const [existingSB] = await db.select().from(siteBranding).where(eq(siteBranding.websiteId, WEBSITE_ID));
  const siteBrandingValues = {
    logoUrl: BRANDING.logoUrl,
    logoAlt: BRANDING.logoAlt,
    logoSquareUrl: BRANDING.logoSquareUrl,
    logoRectUrl: BRANDING.logoRectUrl,
    logoIconUrl: BRANDING.logoIconUrl,
    logoText: BRANDING.logoText,
    primaryColor: BRANDING.primaryColor,
    secondaryColor: BRANDING.secondaryColor,
    accentColor: BRANDING.accentColor,
    backgroundColor: BRANDING.backgroundColor,
    textColor: BRANDING.textColor,
    navTemplate: BRANDING.navTemplate,
    navPosition: BRANDING.navPosition,
    navBackground: BRANDING.navBackground,
    navTextColor: BRANDING.navTextColor,
    headingFont: BRANDING.headingFont,
    bodyFont: BRANDING.bodyFont,
    borderRadius: BRANDING.borderRadius,
    linkColor: BRANDING.linkColor,
    linkHoverColor: BRANDING.linkHoverColor,
    buttonStyle: BRANDING.buttonStyle,
    faviconUrl: BRANDING.faviconUrl,
    ogImageUrl: BRANDING.ogImageUrl,
  };
  if (existingSB) {
    await db.update(siteBranding).set({ ...siteBrandingValues, updatedAt: new Date() }).where(eq(siteBranding.id, existingSB.id));
    console.log(`  ✓ Refreshed siteBranding ${existingSB.id}`);
  } else {
    const [newSB] = await db.insert(siteBranding).values({ websiteId: WEBSITE_ID, ...siteBrandingValues }).returning();
    console.log(`  ✓ Created siteBranding ${newSB.id}`);
  }

  console.log('\n─── 5. Clean up orphan client 100 ───');
  if (fromClient) {
    // Verify nothing else references client 100
    const residualSites = await db.select({ id: clientWebsites.id }).from(clientWebsites).where(eq(clientWebsites.clientId, FROM_CLIENT_ID));
    const residualProfiles = await db.select({ id: brandingProfiles.id }).from(brandingProfiles).where(eq(brandingProfiles.clientId, FROM_CLIENT_ID));
    const residualMessaging = await db.select({ id: brandingMessaging.id }).from(brandingMessaging).where(eq(brandingMessaging.clientId, FROM_CLIENT_ID));
    console.log(`  Residual on client ${FROM_CLIENT_ID}: ${residualSites.length} sites, ${residualProfiles.length} profiles, ${residualMessaging.length} messaging`);

    if (residualSites.length === 0 && residualProfiles.length === 0 && residualMessaging.length === 0) {
      const ownerUserId = fromClient.userId;
      await db.delete(clientMembers).where(eq(clientMembers.clientId, FROM_CLIENT_ID));
      await db.delete(clients).where(eq(clients.id, FROM_CLIENT_ID));
      console.log(`  ✓ Deleted orphan client ${FROM_CLIENT_ID} + memberships`);
      // Only delete user if no other clients reference them
      const otherClients = await db.select({ id: clients.id }).from(clients).where(eq(clients.userId, ownerUserId));
      const otherMemberships = await db.select({ id: clientMembers.id }).from(clientMembers).where(eq(clientMembers.userId, ownerUserId));
      if (otherClients.length === 0 && otherMemberships.length === 0) {
        await db.delete(users).where(eq(users.id, ownerUserId));
        console.log(`  ✓ Deleted orphan user ${ownerUserId} (postcaptain@simplerdevelopment.com)`);
      } else {
        console.log(`  ⚠  User ${ownerUserId} retained — still referenced by ${otherClients.length} clients / ${otherMemberships.length} memberships`);
      }
    } else {
      console.log(`  ⚠  Skipping client deletion — residual records exist. Manual review needed.`);
    }
  } else {
    console.log('  ✓ Already cleaned');
  }

  console.log('\n─── Done ───');
  const [finalWebsite] = await db.select().from(clientWebsites).where(eq(clientWebsites.id, WEBSITE_ID));
  const [finalProfile] = await db.select().from(brandingProfiles).where(eq(brandingProfiles.id, profileId));
  console.log(`  Website ${WEBSITE_ID}: clientId=${finalWebsite?.clientId}, brandingProfileId=${finalWebsite?.brandingProfileId}`);
  console.log(`  Profile ${profileId}: clientId=${finalProfile?.clientId}, isDefault=${finalProfile?.isDefault}, primary=${finalProfile?.primaryColor}`);
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
