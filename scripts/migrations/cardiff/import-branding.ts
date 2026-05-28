/**
 * Cardiff migration — Step 3: Branding extraction + import
 *
 * Creates the branding profile, site-level branding, and messaging
 * records from extracted/home.json. Idempotent.
 *
 * Run:  npx tsx scripts/migrations/cardiff/import-branding.ts
 */

import * as dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { join } from 'path';

dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local', override: true });

async function main() {
  const { db } = await import('../../../lib/db');
  const { brandingProfiles, brandingMessaging, siteBranding } = await import('../../../lib/db/schema');
  const { eq, and } = await import('drizzle-orm');

  const state = JSON.parse(readFileSync(join(process.cwd(), 'scripts/migrations/cardiff/.state/ids.json'), 'utf-8'));
  const home = JSON.parse(readFileSync(join(process.cwd(), 'scripts/migrations/cardiff/extracted/home.json'), 'utf-8'));
  const b = home.branding;

  // 1. brandingProfiles — client-scoped
  const existingProfile = await db.select().from(brandingProfiles)
    .where(and(eq(brandingProfiles.clientId, state.clientId), eq(brandingProfiles.isDefault, true)))
    .limit(1);

  let profile = existingProfile[0];
  if (!profile) {
    [profile] = await db.insert(brandingProfiles).values({
      clientId: state.clientId,
      name: 'Cardiff Brand',
      isDefault: true,
      primaryColor: b.primaryColor,
      secondaryColor: b.secondaryColor,
      accentColor: b.accentColor,
      backgroundColor: b.backgroundColor,
      textColor: b.textColor,
      navTemplate: 'classic',
      navPosition: 'top',
      navBackground: b.navBackground,
      navTextColor: b.navTextOnLight,
      headingFont: b.headingFont,
      bodyFont: b.bodyFont,
      logoUrl: b.logoUrl,
      logoRectUrl: b.logoUrl,
      logoSquareUrl: b.appleTouchIcon,
      logoIconUrl: b.faviconUrl,
      logoText: 'Cardiff',
      logoAlt: b.logoAlt,
      faviconUrl: b.faviconUrl,
      ogImageUrl: b.ogImageUrl,
      borderRadius: b.borderRadius,
      linkColor: b.primaryColor,
      linkHoverColor: b.secondaryColor,
      buttonStyle: {
        primaryBg: b.accentColor,
        primaryText: '#ffffff',
        primaryHoverBg: '#d54d1f',
        secondaryBg: '#ffffff',
        secondaryText: b.primaryColor,
        secondaryHoverBg: b.lightBlueBgAlt,
        borderRadius: b.borderRadius,
        variant: 'filled',
      },
    }).returning();
    console.log(`✅ Created brandingProfile id=${profile.id} (default)`);
  } else {
    console.log(`ℹ️  brandingProfile id=${profile.id} already present`);
  }

  // 2. siteBranding — bind branding to the website (unique on websiteId)
  const existingSite = await db.select().from(siteBranding)
    .where(eq(siteBranding.websiteId, state.websiteId)).limit(1);

  if (!existingSite.length) {
    await db.insert(siteBranding).values({
      websiteId: state.websiteId,
      logoUrl: b.logoUrl,
      logoAlt: b.logoAlt,
      logoRectUrl: b.logoUrl,
      logoSquareUrl: b.appleTouchIcon,
      logoIconUrl: b.faviconUrl,
      logoText: 'Cardiff',
      primaryColor: b.primaryColor,
      secondaryColor: b.secondaryColor,
      accentColor: b.accentColor,
      backgroundColor: b.backgroundColor,
      textColor: b.textColor,
      navTemplate: 'classic',
      navPosition: 'top',
      navBackground: b.navBackground,
      navTextColor: b.navTextOnLight,
      headingFont: b.headingFont,
      bodyFont: b.bodyFont,
      borderRadius: b.borderRadius,
      linkColor: b.primaryColor,
      linkHoverColor: b.secondaryColor,
      buttonStyle: {
        primaryBg: b.accentColor,
        primaryText: '#ffffff',
        primaryHoverBg: '#d54d1f',
        secondaryBg: '#ffffff',
        secondaryText: b.primaryColor,
        secondaryHoverBg: b.lightBlueBgAlt,
        borderRadius: b.borderRadius,
        variant: 'filled',
      },
      faviconUrl: b.faviconUrl,
      ogImageUrl: b.ogImageUrl,
    });
    console.log(`✅ Created siteBranding for websiteId=${state.websiteId}`);
  } else {
    console.log(`ℹ️  siteBranding already present for websiteId=${state.websiteId}`);
  }

  // 3. Link the website to the branding profile (via clientWebsites.brandingProfileId)
  const { clientWebsites } = await import('../../../lib/db/schema');
  await db.update(clientWebsites)
    .set({ brandingProfileId: profile.id })
    .where(eq(clientWebsites.id, state.websiteId));
  console.log(`✅ Linked website id=${state.websiteId} → brandingProfile id=${profile.id}`);

  // 4. brandingMessaging — company identity / voice
  const existingMsg = await db.select().from(brandingMessaging)
    .where(and(eq(brandingMessaging.clientId, state.clientId), eq(brandingMessaging.brandingProfileId, profile.id)))
    .limit(1);

  if (!existingMsg.length) {
    await db.insert(brandingMessaging).values({
      clientId: state.clientId,
      brandingProfileId: profile.id,
      companyName: 'Cardiff',
      tagline: home.tagline,
      missionStatement: 'Help small business owners borrow better — faster decisions, flexible terms, and capital that aligns with how a business actually runs.',
      valueProposition: 'Same-day funding up to $250,000 with approvals in under 2 minutes. Cardiff considers the full picture of your business — revenue, fundamentals, and trajectory — not just your credit score.',
      toneOfVoice: 'Professional, direct, business-savvy. Approachable but not casual. Confident without being aggressive.',
      brandPersonality: 'A modern alternative to traditional bank lending. Cardiff understands the realities of running a small business — uneven cash flow, time-sensitive opportunities, seasonal swings. Speaks the language of operators, not bankers.',
      writingStyle: 'Active voice. Short, scannable paragraphs. Lead with the benefit, not the product. Use concrete numbers ($12B funded, 2-minute approvals, 5.99% rates) whenever possible.',
      elevatorPitch: 'Cardiff is the alternative business lender for small businesses that can\'t wait — or don\'t qualify — for traditional bank loans. We fund working capital, equipment, lines of credit, and SBA loans up to $250,000 with approvals in minutes and funds in your account the same day.',
      boilerplate: 'Cardiff is a leading provider of small business financing, having funded over $12 billion across the United States. Headquartered in Del Mar, California, Cardiff offers working capital loans, lines of credit, equipment financing, merchant cash advances, business credit cards, and SBA loans to small businesses in dozens of industries.',
      keyDifferentiators: [
        'Funded over $12 billion across the US',
        'Approvals in under 2 minutes',
        'Same-day funding',
        'No minimum credit score required',
        'Lending up to $250,000',
        'No prepayment penalties',
        'Average approved term: 39 months',
        'Considers full business health, not just credit score',
      ],
      targetAudience: 'Small business owners across retail, healthcare, construction, hospitality, contracting, auto repair, restaurants, and professional services — particularly those who have been declined by traditional banks or who need capital faster than a bank can move.',
      industry: 'Small Business Lending / Alternative Finance',
      headquarters: home.address,
      websiteUrl: home.url,
      socialProof: `$12B+ funded. California Lender License 60DBO-129171. BBB-rated.`,
      certifications: home.license,
      additionalContext: `Phone: ${home.phone}. Contact emails: ${home.emails.join(', ')}.`,
      toneAxes: {
        formal: 0.3,
        playful: -0.1,
        traditional: -0.2,
        authoritative: 0.5,
      },
    });
    console.log(`✅ Created brandingMessaging`);
  } else {
    console.log(`ℹ️  brandingMessaging already present`);
  }

  process.exit(0);
}

main().catch(err => {
  console.error('❌', err);
  process.exit(1);
});
