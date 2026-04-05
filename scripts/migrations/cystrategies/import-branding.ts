import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });

const CLIENT_ID = 98;
const WEBSITE_ID = 142;

async function importBranding() {
  const { db } = await import('../../../lib/db');
  const { brandingProfiles, brandingMessaging, clientWebsites, siteBranding } = await import('../../../lib/db/schema');
  const { eq } = await import('drizzle-orm');

  // Create branding profile
  const [profile] = await db.insert(brandingProfiles).values({
    clientId: CLIENT_ID,
    name: 'CY Strategies Brand',
    isDefault: true,
    primaryColor: '#1A1629',
    secondaryColor: '#362E4F',
    accentColor: '#6BE8E8',
    backgroundColor: '#1A1629',
    textColor: '#FFFFFF',
    headingFont: 'Work Sans',
    bodyFont: 'Roboto',
    navTemplate: 'minimal',
    navPosition: 'top',
    navBackground: '#1A1629',
    navTextColor: '#FFFFFF',
    borderRadius: '8px',
    linkColor: '#6BE8E8',
    linkHoverColor: '#A480F2',
    buttonStyle: {
      primaryBg: '#000000',
      primaryText: '#FFFFFF',
      primaryHoverBg: '#362E4F',
      secondaryBg: 'transparent',
      secondaryText: '#6BE8E8',
      secondaryHoverBg: '#362E4F',
      borderRadius: '8px',
      variant: 'filled',
    },
    faviconUrl: 'https://cystrategies.co/assets/images/favicon.ico',
    darkMode: {
      primaryColor: '#1A1629',
      secondaryColor: '#362E4F',
      accentColor: '#6BE8E8',
      backgroundColor: '#0E0B19',
      textColor: '#FFFFFF',
      navBackground: '#0E0B19',
      navTextColor: '#FFFFFF',
    },
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
    logoUrl: 'https://cystrategies.co/assets/images/image01.png',
    logoAlt: 'CY Strategies',
    primaryColor: '#1A1629',
    secondaryColor: '#362E4F',
    accentColor: '#6BE8E8',
    backgroundColor: '#1A1629',
    textColor: '#FFFFFF',
    navTemplate: 'minimal',
    navPosition: 'top',
    navBackground: '#1A1629',
    navTextColor: '#FFFFFF',
    headingFont: 'Work Sans',
    bodyFont: 'Roboto',
    borderRadius: '8px',
    linkColor: '#6BE8E8',
    linkHoverColor: '#A480F2',
    buttonStyle: {
      primaryBg: '#000000',
      primaryText: '#FFFFFF',
      primaryHoverBg: '#362E4F',
      secondaryBg: 'transparent',
      secondaryText: '#6BE8E8',
      secondaryHoverBg: '#362E4F',
      borderRadius: '8px',
      variant: 'filled',
    },
    faviconUrl: 'https://cystrategies.co/assets/images/favicon.ico',
  }).onConflictDoNothing();
  console.log('Site branding created');

  // Create messaging
  await db.insert(brandingMessaging).values({
    clientId: CLIENT_ID,
    brandingProfileId: profile.id,
    companyName: 'CY Strategies',
    tagline: 'Marketing strategy built for clarity and scale.',
    missionStatement: 'I design marketing strategies that connect audience, message, channels, and measurement into a system that grows with your business and that teams can execute with confidence.',
    visionStatement: 'Marketing works best when every action supports a clear plan.',
    valueProposition: 'Enterprise-grade marketing expertise for companies at a pivotal growth moment — connecting strategy, execution, and measurement into scalable systems.',
    toneOfVoice: 'Confident, Approachable, Strategic, Direct, Witty',
    brandPersonality: 'CY Strategies (Cody York) is a seasoned marketing strategist with 16+ years of experience spanning agencies, university marketing, and enterprise software companies. The brand voice is that of a trusted advisor — confident but personable, with occasional humor and sports metaphors.',
    writingStyle: 'Direct and conversational but authoritative. Use clear language, avoid marketing jargon unless explaining it. Inject personality and humor where appropriate. First person perspective (I, not we).',
    elevatorPitch: 'CY Strategies helps businesses design marketing strategies that connect audience, message, channels, and measurement into a system that grows with their business. With 16+ years of enterprise marketing experience, Cody York works upstream of tactics to help businesses define direction before investing further in execution.',
    boilerplate: 'CY Strategies, led by Cody York from Durham, North Carolina, provides marketing strategy consulting for companies at pivotal growth moments. With over 16 years of experience in agencies, university marketing, and enterprise software events marketing, CY Strategies helps businesses align their audience, messaging, channels, and measurement into scalable, effective marketing systems.',
    keyDifferentiators: [
      '16+ years enterprise-grade marketing experience',
      'Works upstream of tactics — strategy first, execution second',
      'Connects audience, message, channels, and measurement into unified systems',
      'Personal, hands-on consulting — not a large agency',
      'Experience spanning agencies, universities, and large software companies',
    ],
    targetAudience: 'Founders and companies at a pivotal growth moment who are active in marketing but lack clarity on targeting, messaging, or measurement. Businesses that need strategic direction before investing further in execution.',
    industry: 'Marketing Strategy Consulting',
    companySize: 'Solo practitioner',
    headquarters: 'Durham, North Carolina',
    websiteUrl: 'https://cystrategies.co',
    socialProof: '',
    keyClients: '',
    additionalContext: 'Single-page dark-themed website. Primary CTA is scheduling a 30-minute consultation via Calendly. Services include: Audits & Assessments, Strategy & Planning, Funnel Optimization, Digital Campaigns, Brand Strategy, and Marketing Technology.',
  });
  console.log('Messaging created');

  console.log('\n=== BRANDING IMPORT COMPLETE ===');
  process.exit(0);
}

importBranding().catch(err => { console.error(err); process.exit(1); });
