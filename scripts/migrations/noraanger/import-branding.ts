import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });

const CLIENT_ID = 101;
const WEBSITE_ID = 145;

async function importBranding() {
  const { db } = await import('../../../lib/db');
  const { brandingProfiles, brandingMessaging, clientWebsites, siteBranding } = await import('../../../lib/db/schema');
  const { eq } = await import('drizzle-orm');

  // Olive green brand palette extracted from noraanger.com
  const colors = {
    primary: '#6B8E23',       // Olive green (main brand)
    primaryHover: '#5C7A1F',  // Darker olive on hover
    secondary: '#4A6318',     // Deep olive
    accent: '#81AA2C',        // Lighter olive accent
    bg: '#FFFFFF',            // White background
    text: '#1B1B1B',          // Near-black text
    bodyText: '#474747',      // Dark gray body
    mutedText: '#5E5E5E',     // Muted gray
    lightBg: '#F6F6F6',      // Light gray sections
    border: '#E2E2E2',       // Border color
  };

  const blobImageUrl = 'https://img1.wsimg.com/isteam/ip/03572023-996e-48cd-94e5-399f84efd76d/blob-ac7de89.png';

  // Create branding profile
  const [profile] = await db.insert(brandingProfiles).values({
    clientId: CLIENT_ID,
    name: 'Delco Counseling Brand',
    isDefault: true,
    primaryColor: colors.primary,
    secondaryColor: colors.secondary,
    accentColor: colors.accent,
    backgroundColor: colors.bg,
    textColor: colors.text,
    headingFont: 'Lusitana',
    bodyFont: 'Lato',
    navTemplate: 'classic',
    navPosition: 'top',
    navBackground: colors.bg,
    navTextColor: colors.text,
    borderRadius: '4px',
    linkColor: colors.primary,
    linkHoverColor: colors.primaryHover,
    buttonStyle: {
      primaryBg: colors.primary,
      primaryText: '#FFFFFF',
      primaryHoverBg: colors.primaryHover,
      secondaryBg: 'transparent',
      secondaryText: colors.primary,
      secondaryHoverBg: colors.lightBg,
      borderRadius: '4px',
      variant: 'filled',
    },
    logoUrl: blobImageUrl,
    logoAlt: 'Delco Counseling & Therapy',
    logoText: 'Delco Counseling',
    faviconUrl: blobImageUrl,
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
    logoUrl: blobImageUrl,
    logoAlt: 'Delco Counseling & Therapy',
    logoText: 'Delco Counseling',
    primaryColor: colors.primary,
    secondaryColor: colors.secondary,
    accentColor: colors.accent,
    backgroundColor: colors.bg,
    textColor: colors.text,
    navTemplate: 'classic',
    navPosition: 'top',
    navBackground: colors.bg,
    navTextColor: colors.text,
    headingFont: 'Lusitana',
    bodyFont: 'Lato',
    borderRadius: '4px',
    linkColor: colors.primary,
    linkHoverColor: colors.primaryHover,
    buttonStyle: {
      primaryBg: colors.primary,
      primaryText: '#FFFFFF',
      primaryHoverBg: colors.primaryHover,
      secondaryBg: 'transparent',
      secondaryText: colors.primary,
      secondaryHoverBg: colors.lightBg,
      borderRadius: '4px',
      variant: 'filled',
    },
    faviconUrl: blobImageUrl,
  }).onConflictDoNothing();
  console.log('Site branding created');

  // Create messaging
  await db.insert(brandingMessaging).values({
    clientId: CLIENT_ID,
    brandingProfileId: profile.id,
    companyName: 'Delco Counseling & Therapy',
    tagline: 'Experienced, compassionate therapy in Delaware County.',
    missionStatement: 'To provide holistic, person-centered therapy that goes beyond the diagnosis, helping clients heal from trauma, grief, anxiety, and depression using their own strengths and values.',
    valueProposition: 'Authentic, warm, and transparent counseling from a trained trauma specialist. In-person and virtual sessions available in Delaware County, PA.',
    toneOfVoice: 'Warm, Compassionate, Professional, Authentic, Encouraging',
    brandPersonality: 'Nora Anger is a licensed professional counselor who values authenticity, warmth, and transparency. The brand voice is that of a caring professional who empowers clients to use their own strengths in the healing process.',
    writingStyle: 'Warm and approachable but professional. Use inclusive language. First person perspective. Avoid clinical jargon when possible.',
    elevatorPitch: 'Delco Counseling & Therapy, led by Nora Anger, M.S., LPC, provides experienced and compassionate counseling in Delaware County, PA. Specializing in trauma, grief, anxiety, and depression, Nora uses a person-centered approach that honors each client as the expert on their own life.',
    boilerplate: 'Delco Counseling & Therapy is a counseling practice in Media, PA led by Nora R. Anger, M.S., Licensed Professional Counselor. The practice specializes in individual counseling for adults, trauma-informed therapy, grief counseling, group counseling, and career mentorship for mental health professionals. Nora accepts Aetna and Quest Behavioral Health insurance through Headway.',
    keyDifferentiators: [
      'Person-centered approach — client is the expert on themselves',
      'Specialized in trauma, grief, and symptoms adjacent to trauma',
      'Holistic approach before resorting to medication',
      'Career mentorship for aspiring mental health professionals',
      'In-person and virtual sessions available',
    ],
    targetAudience: 'Adults seeking counseling for trauma, grief, anxiety, depression, life transitions, and relationship challenges in Delaware County, PA. Also mental health professionals seeking career mentorship and supervision.',
    industry: 'Mental Health Counseling',
    companySize: 'Solo practitioner',
    headquarters: 'Media, PA',
    websiteUrl: 'https://noraanger.com',
    socialProof: 'Client testimonials indicate appreciation for authenticity, warmth and transparency.',
    additionalContext: 'Single-page website. Accepts Aetna and Quest Behavioral Health through Headway. Uses Mentaya for out-of-network benefits. Has a Psychology Today profile. Offers group therapy including Mom Support Groups, Grief Support Groups, and Self-Help Book Club.',
  });
  console.log('Messaging created');

  console.log('\n=== BRANDING IMPORT COMPLETE ===');
  process.exit(0);
}

importBranding().catch(err => { console.error(err); process.exit(1); });
