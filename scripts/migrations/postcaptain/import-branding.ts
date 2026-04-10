import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });

const CLIENT_ID = 100;
const WEBSITE_ID = 144;

async function importBranding() {
  const { db } = await import('../../../lib/db');
  const { brandingProfiles, brandingMessaging, clientWebsites, siteBranding } = await import('../../../lib/db/schema');
  const { eq } = await import('drizzle-orm');

  // Post Captain brand colors extracted from the live site:
  // Primary: #004D80 (midnight blue) — used on buttons, links, service icons
  // Accent: #5BA573 (green) — used on icons and accents
  // Calm blue border: #A5C3E6
  // Background: predominantly white (#FFFFFF) with light gray sections (#F5F5F5)
  // Text: #333333 primary, #4B5563 secondary
  // Fonts: DM Sans (body), Poppins (headings/buttons)

  const [profile] = await db.insert(brandingProfiles).values({
    clientId: CLIENT_ID,
    name: 'Post Captain Brand',
    isDefault: true,
    primaryColor: '#004D80',
    secondaryColor: '#003D5C',
    accentColor: '#5BA573',
    backgroundColor: '#FFFFFF',
    textColor: '#333333',
    headingFont: 'Poppins',
    bodyFont: 'DM Sans',
    navTemplate: 'mega',
    navPosition: 'top',
    navBackground: '#FFFFFF',
    navTextColor: '#333333',
    borderRadius: '8px',
    linkColor: '#004D80',
    linkHoverColor: '#003D5C',
    logoUrl: 'https://postcaptain.com/wp-content/uploads/2024/05/482b161e27250212551fead7a9feaecd1f41c617-scaled.png',
    logoAlt: 'Post Captain Consulting',
    logoSquareUrl: 'https://postcaptain.com/wp-content/uploads/2025/01/Blue-background-logo-for-website-thumbnail.png',
    logoRectUrl: 'https://postcaptain.com/wp-content/uploads/2024/05/482b161e27250212551fead7a9feaecd1f41c617-scaled.png',
    logoText: 'Post Captain',
    logoIconUrl: 'https://postcaptain.com/wp-content/uploads/2025/01/Blue-background-logo-for-website-thumbnail.png',
    buttonStyle: {
      primaryBg: '#FFFFFF',
      primaryText: '#004D80',
      primaryHoverBg: '#004D80',
      secondaryBg: 'transparent',
      secondaryText: '#FFFFFF',
      secondaryHoverBg: '#004D80',
      borderRadius: '8px',
      variant: 'outline',
    },
    faviconUrl: 'https://postcaptain.com/wp-content/uploads/2025/01/Blue-background-logo-for-website-thumbnail.png',
    ogImageUrl: 'https://postcaptain.com/wp-content/uploads/2025/01/Blue-background-logo-for-website-thumbnail.png',
  }).returning();
  console.log(`Branding profile created: ID ${profile.id}`);

  // Link to website
  await db.update(clientWebsites)
    .set({ brandingProfileId: profile.id })
    .where(eq(clientWebsites.id, WEBSITE_ID));
  console.log('Branding profile linked to website');

  // Create site branding
  await db.insert(siteBranding).values({
    websiteId: WEBSITE_ID,
    logoUrl: 'https://postcaptain.com/wp-content/uploads/2024/05/482b161e27250212551fead7a9feaecd1f41c617-scaled.png',
    logoAlt: 'Post Captain Consulting',
    primaryColor: '#004D80',
    secondaryColor: '#003D5C',
    accentColor: '#5BA573',
    backgroundColor: '#FFFFFF',
    textColor: '#333333',
    navTemplate: 'mega',
    navPosition: 'top',
    navBackground: '#FFFFFF',
    navTextColor: '#333333',
    headingFont: 'Poppins',
    bodyFont: 'DM Sans',
    logoSquareUrl: 'https://postcaptain.com/wp-content/uploads/2025/01/Blue-background-logo-for-website-thumbnail.png',
    logoRectUrl: 'https://postcaptain.com/wp-content/uploads/2024/05/482b161e27250212551fead7a9feaecd1f41c617-scaled.png',
    logoText: 'Post Captain',
    logoIconUrl: 'https://postcaptain.com/wp-content/uploads/2025/01/Blue-background-logo-for-website-thumbnail.png',
    borderRadius: '8px',
    linkColor: '#004D80',
    linkHoverColor: '#003D5C',
    buttonStyle: {
      primaryBg: '#FFFFFF',
      primaryText: '#004D80',
      primaryHoverBg: '#004D80',
      secondaryBg: 'transparent',
      secondaryText: '#FFFFFF',
      secondaryHoverBg: '#004D80',
      borderRadius: '8px',
      variant: 'outline',
    },
    faviconUrl: 'https://postcaptain.com/wp-content/uploads/2025/01/Blue-background-logo-for-website-thumbnail.png',
    ogImageUrl: 'https://postcaptain.com/wp-content/uploads/2025/01/Blue-background-logo-for-website-thumbnail.png',
  }).onConflictDoNothing();
  console.log('Site branding created');

  // Create messaging
  await db.insert(brandingMessaging).values({
    clientId: CLIENT_ID,
    brandingProfileId: profile.id,
    companyName: 'Post Captain Consulting',
    tagline: 'Discover a New Way Forward',
    missionStatement: 'Post Captain Consulting supports colleges, universities, and foundations in achieving mission-critical goals in Slate CRM.',
    visionStatement: 'A higher education partner who sees the big picture, speaks your language, and helps you create value with Slate.',
    valueProposition: 'Led by a team of former Slate Captains, Post Captain combines unparalleled technical expertise with deep understanding of institutional needs to deliver implementations, projects, support, portals, and audits.',
    toneOfVoice: 'Professional, Knowledgeable, Approachable, Collaborative, Trustworthy',
    brandPersonality: 'Post Captain Consulting is a Platinum Preferred Slate Partner serving 100+ colleges and universities. The brand is nautical-themed (captain, navigator) and positions itself as a collaborative partner that builds teams, not just solutions. The voice is that of an experienced guide — confident and knowledgeable but warm and collaborative.',
    writingStyle: 'Professional yet warm. Use nautical metaphors naturally (charting a course, navigating, etc.). Focus on partnership and collaboration. Emphasize the team\'s background as former Slate Captains.',
    elevatorPitch: 'Post Captain Consulting, a Platinum Preferred Partner, supports 100+ colleges, universities, and foundations in achieving mission-critical goals in Slate. We don\'t just create custom solutions — we build Slate teams.',
    boilerplate: 'Post Captain Consulting is a Platinum Preferred Slate Partner that supports over 100 colleges, universities, and foundations. Led by a team of former Slate Captains, Post Captain provides implementations, projects, support, portals, and audits for Admissions, Student Success, and Advancement teams.',
    keyDifferentiators: [
      'Platinum Preferred Slate Partner',
      'Team of former Slate Captains with deep institutional knowledge',
      'Collaborative approach — builds teams, not just solutions',
      'Trusted by 100+ colleges and universities',
      'Solutions for Admissions, Student Success, and Advancement',
      'Real human support — no bots or ticket queues',
    ],
    targetAudience: 'Higher education institutions (colleges, universities, foundations) using or considering Technolutions Slate CRM for admissions, student success, and advancement.',
    industry: 'Higher Education Technology Consulting',
    companySize: 'Small consulting firm',
    websiteUrl: 'https://postcaptain.com',
    socialProof: 'William Peace University: 83% increase in readmit completions. Loyola University Maryland: $965K+ raised from 2,600+ donors. VCU: 2 days of staff time saved. Landmark College: 5 years of historical data integrated.',
    keyClients: 'UC, Cooper Union, UVM, Northwestern, Carleton, Penn, William Peace University, Loyola University Maryland, VCU, Landmark College',
    additionalContext: 'Nautical-themed brand identity (post captain = ship captain). Services are categorized into Services (Implementations, Projects, Support, Portals, Audits) and Solutions (Admissions, Student Success, Advancement). Has a newsletter called "True North" and offers Office Hours, workshops, and events.',
  });
  console.log('Messaging created');

  console.log('\n=== BRANDING IMPORT COMPLETE ===');
  process.exit(0);
}

importBranding().catch(err => { console.error(err); process.exit(1); });
