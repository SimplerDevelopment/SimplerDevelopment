import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });

const CLIENT_ID = 96;
const WEBSITE_ID = 140;

async function importBranding() {
  const { db } = await import('../../../lib/db');
  const { brandingProfiles, brandingMessaging, clientWebsites } = await import('../../../lib/db/schema');
  const { eq } = await import('drizzle-orm');

  // Create branding profile
  const [profile] = await db.insert(brandingProfiles).values({
    clientId: CLIENT_ID,
    name: 'CAQ Brand',
    isDefault: true,
    primaryColor: '#296CFA',
    secondaryColor: '#1E376C',
    accentColor: '#2BD4A1',
    backgroundColor: '#172136',
    textColor: '#F5FDF7',
    headingFont: 'Playfair Display',
    bodyFont: 'Roboto',
    navTemplate: 'classic',
    navPosition: 'top',
    navBackground: '#172136',
    navTextColor: '#F5FDF7',
    borderRadius: '8px',
    linkColor: '#296CFA',
    linkHoverColor: '#2BD4A1',
    buttonStyle: {
      primaryBg: '#296CFA',
      primaryText: '#FFFFFF',
      primaryHoverBg: '#1E376C',
      secondaryBg: 'transparent',
      secondaryText: '#296CFA',
      secondaryHoverBg: '#296CFA',
      borderRadius: '8px',
      variant: 'filled',
    },
    darkMode: {
      primaryColor: '#296CFA',
      secondaryColor: '#1E376C',
      accentColor: '#2BD4A1',
      backgroundColor: '#0F1520',
      textColor: '#F5FDF7',
      navBackground: '#0F1520',
      navTextColor: '#F5FDF7',
    },
  }).returning();
  console.log(`Branding profile created: ID ${profile.id}`);

  // Link to website
  await db.update(clientWebsites)
    .set({ brandingProfileId: profile.id })
    .where(eq(clientWebsites.id, WEBSITE_ID));
  console.log('Branding profile linked to website');

  // Create messaging
  await db.insert(brandingMessaging).values({
    clientId: CLIENT_ID,
    brandingProfileId: profile.id,
    companyName: 'Center for Audit Quality',
    tagline: 'Enhancing public trust in the capital markets by promoting high-quality financial reporting',
    missionStatement: 'The CAQ is an autonomous public policy organization dedicated to enhancing investor confidence and public trust in the global capital markets. The CAQ fosters high-quality performance by public company auditors; convenes and collaborates with other stakeholders to advance the discussion of critical issues; and advocates policies and standards that promote public company auditors\' objectivity, effectiveness, and responsiveness to dynamic market conditions.',
    visionStatement: 'A world where investors and the public trust audited financial information as the foundation of confident decision-making in global capital markets.',
    valueProposition: 'The CAQ serves as the voice of U.S. public company auditors and the bridge between auditors, policymakers, investors, and audit committees — promoting audit quality, transparency, and innovation that strengthens trust in financial reporting.',
    toneOfVoice: 'Authoritative, Professional, Trustworthy, Forward-looking, Collaborative',
    brandPersonality: 'The CAQ presents itself as a credible, nonpartisan authority on audit quality and capital market integrity. Communications are precise yet accessible, aimed at sophisticated stakeholders including institutional investors, audit committee members, policymakers, and accounting professionals.',
    writingStyle: 'Professional and evidence-based. Use clear, jargon-free language where possible while maintaining authority on technical accounting and audit topics. Lead with data and research findings. Tone should be measured and balanced — never promotional or sensationalized.',
    elevatorPitch: 'The Center for Audit Quality is an autonomous public policy organization that enhances investor confidence and public trust in the global capital markets. Through research, advocacy, and collaboration with auditors, investors, and policymakers, the CAQ promotes high-quality auditing that protects the interests of investors and the public.',
    boilerplate: 'The Center for Audit Quality (CAQ) is an autonomous public policy organization dedicated to enhancing investor confidence and public trust in the global capital markets. The CAQ fosters high-quality performance by public company auditors; convenes and collaborates with other stakeholders to advance the discussion of critical issues; and advocates policies and standards that promote public company auditors\' objectivity, effectiveness, and responsiveness to dynamic market conditions. Based in Washington, D.C., the CAQ is affiliated with the American Institute of CPAs.',
    keyDifferentiators: [
      'Only organization solely focused on U.S. public company audit quality',
      'Nonpartisan bridge between auditors, investors, policymakers, and audit committees',
      'Research-driven with flagship Institutional Investor Survey and S&P 500 analyses',
      'Governing board includes leaders from Big Four, mid-tier firms, and public company audit committees',
      'Accounting+ pipeline initiative reaching 261,000+ students',
    ],
    targetAudience: 'Institutional investors, public company audit committee members, policymakers and regulators (SEC, PCAOB), public company auditors at firms of all sizes, accounting academics, and aspiring accounting professionals. These stakeholders rely on CAQ research, policy analysis, and practical guidance to navigate evolving audit and financial reporting standards.',
    industry: 'Audit, Accounting, Financial Services, Public Policy',
    yearFounded: '2007',
    companySize: '20-30 employees',
    headquarters: 'Washington, D.C.',
    websiteUrl: 'https://www.thecaq.org',
    socialProof: '90% of institutional investors rely on audited financial statements; 91% trust the accuracy of audited statements; 84% are confident in audit committee information quality. Annual Institutional Investor Survey is a widely cited industry benchmark.',
    keyClients: 'Affiliated with AICPA-CIMA. Governing board includes leaders from Deloitte, EY, PwC, KPMG, BDO, RSM, Grant Thornton, Crowe, and Sullivan & Cromwell.',
    certifications: '',
    additionalContext: 'The CAQ publishes several flagship research products including the Annual Institutional Investor Survey, S&P 500 reporting analyses (climate, ESG, digital assets, AI), the Audit Committee Transparency Barometer, and the Role of the Auditor series. They also produce newsletters (Audit Insider, Capital Markets Pulse, Audit Committee Insights) and the AuditEffect campaign.',
  });
  console.log('Messaging created');

  console.log('\n=== BRANDING IMPORT COMPLETE ===');
  process.exit(0);
}

importBranding().catch(err => { console.error(err); process.exit(1); });
