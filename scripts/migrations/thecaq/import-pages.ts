import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });

const WEBSITE_ID = 140;

async function importPages() {
  const { db } = await import('../../../lib/db');
  const { posts, siteNavigation } = await import('../../../lib/db/schema');
  const { eq, and } = await import('drizzle-orm');

  // Helper to check if page already exists
  async function pageExists(slug: string): Promise<boolean> {
    const [existing] = await db.select({ id: posts.id }).from(posts)
      .where(and(eq(posts.websiteId, WEBSITE_ID), eq(posts.slug, slug)))
      .limit(1);
    return !!existing;
  }

  async function createPage(title: string, slug: string, blocks: unknown[], seoTitle?: string, seoDescription?: string) {
    if (await pageExists(slug)) {
      console.log(`  [skip] ${slug} already exists`);
      return;
    }
    const [page] = await db.insert(posts).values({
      title,
      slug,
      postType: 'page',
      content: JSON.stringify({ blocks, version: '1.0' }),
      published: false,
      websiteId: WEBSITE_ID,
      seoTitle: seoTitle || title,
      seoDescription: seoDescription || '',
    }).returning();
    console.log(`  [created] ${slug} (ID: ${page.id})`);
    return page;
  }

  // ========== PHASE 1: HOME PAGE ==========
  console.log('\n=== PHASE 1: HOME PAGE ===');

  const homeBlocks = [
    {
      id: 'hero-1', type: 'hero', order: 1,
      title: 'The Center for Audit Quality',
      subtitle: 'Enhancing public trust in the capital markets by promoting high-quality financial reporting',
      ctaText: 'Explore Resources',
      ctaLink: '/resource-hub',
      secondaryCtaText: 'About the CAQ',
      secondaryCtaLink: '/about-us',
      style: { backgroundColor: '#172136', color: '#F5FDF7', padding: '80px 40px', textAlign: 'center' as const },
    },
    {
      id: 'cards-pillars', type: 'card-grid', order: 2,
      title: 'Strengthening Capital Markets',
      columns: 3,
      cards: [
        { id: 'c1', title: 'Auditors & Capital Markets', description: 'How auditors help power the economy by providing independent assurance on financial statements that investors rely on.', icon: 'account_balance' },
        { id: 'c2', title: 'Trust & Transparency', description: 'Protecting investors and the public through advocacy for high-quality auditing standards and practices.', icon: 'verified_user' },
        { id: 'c3', title: 'Independence & Expertise', description: 'The unique cornerstones of the audit profession that ensure objectivity and credibility in financial reporting.', icon: 'balance' },
      ],
      style: { padding: '60px 40px', backgroundColor: '#FFFFFF' },
    },
    {
      id: 'stats-trust', type: 'stats', order: 3,
      title: 'Investor Trust in Auditing',
      columns: 3,
      stats: [
        { id: 's1', value: '90%', label: 'of investors rely on audited financial statements' },
        { id: 's2', value: '91%', label: 'trust the accuracy of audited statements' },
        { id: 's3', value: '84%', label: 'confident in audit committee information quality' },
      ],
      style: { backgroundColor: '#1E376C', color: '#F5FDF7', padding: '60px 40px', textAlign: 'center' as const },
    },
    {
      id: 'featured-survey', type: 'featured-content', order: 4,
      title: 'Annual Institutional Investor Survey',
      description: 'Our flagship annual report exploring institutional investor perspectives on the role of auditors, assurance over information beyond the financial statements, and confidence in the capital markets.',
      buttonText: 'Learn More',
      buttonUrl: '/resource-hub',
      style: { padding: '60px 40px' },
    },
    {
      id: 'priorities-grid', type: 'card-grid', order: 5,
      title: 'Our Priorities',
      description: 'The CAQ advances critical issues in audit quality, independence, and financial reporting.',
      columns: 3,
      cards: [
        { id: 'p1', title: 'Audit Quality', description: 'Capital markets evolve, but commitment to audit quality remains unchanged.', icon: 'verified', link: '/audit-quality' },
        { id: 'p2', title: 'Independence', description: 'Auditor commitment to maintaining independence as a cornerstone of trust.', icon: 'shield', link: '/independence' },
        { id: 'p3', title: 'Corporate Reporting Trends', description: 'Working at the forefront of evolving reporting standards and requirements.', icon: 'trending_up', link: '/corporate-reporting-trends' },
        { id: 'p4', title: 'Anti-Fraud', description: 'The profession\'s role in deterring and detecting financial fraud.', icon: 'security', link: '/anti-fraud' },
        { id: 'p5', title: 'ESG', description: 'Meeting growing demand for reliable environmental, social, and governance information.', icon: 'eco', link: '/esg' },
        { id: 'p6', title: 'Future Talent', description: 'Building and sustaining a diverse pipeline of future auditors and accountants.', icon: 'school', link: '/future-talent' },
      ],
      style: { padding: '60px 40px', backgroundColor: '#F8FAFC' },
    },
    {
      id: 'blog-recent', type: 'blog-posts', order: 6,
      title: 'Trending Resources',
      description: 'The latest research, analysis, and insights from the CAQ.',
      limit: 3,
      columns: 3,
      showExcerpt: true,
      style: { padding: '60px 40px' },
    },
    {
      id: 'cta-dashboard', type: 'cta', order: 7,
      title: 'Stay Connected',
      description: 'Create your personalized dashboard to manage email subscriptions, see event registrations, and access your favorite content.',
      primaryButtonText: 'Create your Dashboard',
      primaryButtonUrl: '/email-login',
      backgroundStyle: 'gradient',
      style: { backgroundColor: '#296CFA', color: '#FFFFFF', padding: '60px 40px', textAlign: 'center' as const },
    },
  ];

  await createPage(
    'Home',
    'home',
    homeBlocks,
    'The Center for Audit Quality',
    'Discover latest insights, resources, and standards in auditing and accounting at CAQ',
  );

  // ========== PHASE 2: MARKETING PAGES ==========
  console.log('\n=== PHASE 2: MARKETING PAGES ===');

  // About Us
  await createPage('About Us', 'about-us', [
    {
      id: 'about-hero', type: 'hero', order: 1,
      title: 'About the CAQ',
      subtitle: 'An autonomous public policy organization dedicated to enhancing investor confidence and public trust in the global capital markets',
      style: { backgroundColor: '#172136', color: '#F5FDF7', padding: '80px 40px', textAlign: 'center' as const },
    },
    {
      id: 'about-mission', type: 'text', order: 2,
      content: 'The Center for Audit Quality (CAQ) fosters high-quality performance by public company auditors; convenes and collaborates with other stakeholders to advance the discussion of critical issues; and advocates policies and standards that promote public company auditors\' objectivity, effectiveness, and responsiveness to dynamic market conditions.',
      size: 'lg',
      alignment: 'center',
      style: { padding: '40px 60px', maxWidth: '800px', margin: '0 auto' },
    },
    {
      id: 'about-quote', type: 'testimonial', order: 3,
      quote: 'Getting it right means consistently delivering trustworthy services in a data-driven environment, combining professional skepticism with technology-enabled insights.',
      author: 'Lara Abrash',
      role: 'Chair, CAQ Governing Board',
      company: 'Chair, Deloitte US',
      style: { padding: '40px', backgroundColor: '#F8FAFC' },
    },
    {
      id: 'about-stats', type: 'stats', order: 4,
      title: 'CAQ by the Numbers',
      columns: 4,
      stats: [
        { id: 'as1', value: '2007', label: 'Year Founded' },
        { id: 'as2', value: '261K+', label: 'Students Reached via Accounting+' },
        { id: 'as3', value: '13', label: 'Governing Board Members' },
        { id: 'as4', value: '20+', label: 'Staff Members' },
      ],
      style: { backgroundColor: '#1E376C', color: '#F5FDF7', padding: '60px 40px' },
    },
    {
      id: 'about-info', type: 'card-grid', order: 5,
      title: 'Contact Information',
      columns: 3,
      cards: [
        { id: 'ai1', title: 'Address', description: '555 13th Street NW, Ste 425 E\nWashington, DC 20004', icon: 'location_on' },
        { id: 'ai2', title: 'Phone', description: '202-609-8120', icon: 'phone' },
        { id: 'ai3', title: 'Email', description: 'info@thecaq.org', icon: 'email' },
      ],
      style: { padding: '60px 40px' },
    },
  ], 'About Us | Center for Audit Quality', 'Learn about the CAQ\'s mission to enhance investor confidence and public trust in the global capital markets.');

  // Audit Quality
  await createPage('Audit Quality', 'audit-quality', [
    {
      id: 'aq-hero', type: 'hero', order: 1,
      title: 'Audit Quality',
      subtitle: 'Our capital markets evolve with the world around us, but our profession\'s commitment to maintaining audit quality remains unchanged.',
      style: { backgroundColor: '#172136', color: '#F5FDF7', padding: '80px 40px', textAlign: 'center' as const },
    },
    {
      id: 'aq-text', type: 'text', order: 2,
      content: 'Auditors demonstrate strong adaptability while maintaining the integrity that capital markets require. Professional expertise, independence, and technological innovation combine to strengthen trust in financial statements.',
      size: 'lg', alignment: 'center',
      style: { padding: '40px 60px', maxWidth: '800px', margin: '0 auto' },
    },
    {
      id: 'aq-stats', type: 'stats', order: 3,
      title: 'Investor Trust in the Audit',
      columns: 3,
      stats: [
        { id: 'aqs1', value: '90%', label: 'of investors rely on audited financial statements' },
        { id: 'aqs2', value: '91%', label: 'trust the accuracy of audited statements' },
        { id: 'aqs3', value: '84%', label: 'confident in audit committee information quality' },
      ],
      style: { backgroundColor: '#1E376C', color: '#F5FDF7', padding: '60px 40px' },
    },
    {
      id: 'aq-timeline-heading', type: 'heading', order: 4,
      content: 'Milestones in Audit Quality', level: 2, alignment: 'center',
      style: { padding: '40px 40px 20px' },
    },
    {
      id: 'aq-timeline', type: 'card-grid', order: 5,
      columns: 4,
      cards: [
        { id: 'tl1', title: '1926', description: 'CPAs audited 90% of NYSE-listed companies', icon: 'history' },
        { id: 'tl2', title: '1933', description: 'Securities Act mandates audited statements for NYSE companies', icon: 'gavel' },
        { id: 'tl3', title: '2002', description: 'Sarbanes-Oxley Act strengthens financial reporting oversight', icon: 'policy' },
        { id: 'tl4', title: '2019', description: 'Financial restatements reach a 20-year low', icon: 'trending_down' },
      ],
      style: { padding: '20px 40px 60px' },
    },
    {
      id: 'aq-resources', type: 'card-grid', order: 6,
      title: 'Key Resources',
      columns: 3,
      cards: [
        { id: 'aqr1', title: 'Value of the Audit', description: 'How audits support capital markets functionality and stakeholder roles', icon: 'assessment', link: '/value-of-the-audit-2' },
        { id: 'aqr2', title: 'Investor Survey', description: 'Investor perspectives on audit value and assurance', icon: 'poll', link: '/resource-hub' },
        { id: 'aqr3', title: 'Audit Quality Disclosure Framework', description: 'Standardizing how audit quality is communicated', icon: 'description', link: '/audit-quality-disclosure-framework' },
      ],
      style: { padding: '60px 40px', backgroundColor: '#F8FAFC' },
    },
  ], 'Audit Quality | Center for Audit Quality', 'Our capital markets evolve with the world around us, but our profession\'s commitment to maintaining audit quality remains unchanged.');

  // People
  await createPage('People', 'people', [
    {
      id: 'people-hero', type: 'hero', order: 1,
      title: 'Our People',
      subtitle: 'Leadership and staff of the Center for Audit Quality',
      style: { backgroundColor: '#172136', color: '#F5FDF7', padding: '80px 40px', textAlign: 'center' as const },
    },
    {
      id: 'people-board-heading', type: 'heading', order: 2,
      content: 'Governing Board', level: 2, alignment: 'center',
      style: { padding: '40px 40px 10px' },
    },
    {
      id: 'people-board', type: 'card-grid', order: 3,
      columns: 4,
      cards: [
        { id: 'gb1', title: 'Lara Abrash', description: 'Chair, Deloitte US', image: 'https://www.thecaq.org/wp-content/uploads/2023/01/Headshot_Abrash_Lara.png' },
        { id: 'gb2', title: 'Julie Bell Lindsay', description: 'Chief Executive Officer', image: 'https://www.thecaq.org/wp-content/uploads/2026/01/Headshot_2026_Lindsay_Julie-Bell.png' },
        { id: 'gb3', title: 'Brian Becker', description: 'Managing Partner & CEO, RSM US LLP', image: 'https://www.thecaq.org/wp-content/uploads/2022/09/Becker.png' },
        { id: 'gb4', title: 'Wayne Berson', description: 'CEO, BDO USA & Chairman, BDO International', image: 'https://www.thecaq.org/wp-content/uploads/2019/03/Berson-1.png' },
        { id: 'gb5', title: 'Julie Boland', description: 'US Chair and Managing Partner, EY', image: 'https://www.thecaq.org/wp-content/uploads/2022/07/Boland.png' },
        { id: 'gb6', title: 'Paul Griggs', description: 'US Senior Partner, PwC LLP', image: 'https://www.thecaq.org/wp-content/uploads/2024/06/Headshot_Griggs_Paul.png' },
        { id: 'gb7', title: 'Timothy J. Walsh', description: 'Chair & CEO, KPMG LLP', image: 'https://www.thecaq.org/wp-content/uploads/2025/10/Headshot_Walsh_Tim.png' },
        { id: 'gb8', title: 'Mark Koziel', description: 'President & CEO, AICPA', image: 'https://www.thecaq.org/wp-content/uploads/2025/01/Headshot_Koziel_Mark.png' },
      ],
      style: { padding: '10px 40px 60px' },
    },
    {
      id: 'people-staff-heading', type: 'heading', order: 4,
      content: 'CAQ Staff', level: 2, alignment: 'center',
      style: { padding: '40px 40px 10px', backgroundColor: '#F8FAFC' },
    },
    {
      id: 'people-staff', type: 'card-grid', order: 5,
      columns: 4,
      cards: [
        { id: 'st1', title: 'Dennis McGowan', description: 'VP, Professional Practice & Anti-Fraud', image: 'https://www.thecaq.org/wp-content/uploads/2026/01/Headshot_2026_McGowan_Dennis.png' },
        { id: 'st2', title: 'Amy O\'Connor', description: 'VP, Public Affairs', image: 'https://www.thecaq.org/wp-content/uploads/2026/01/Headshot_2026_Oconnor_Amy.png' },
        { id: 'st3', title: 'Brad Jacklin', description: 'Senior Director, Communications', image: 'https://www.thecaq.org/wp-content/uploads/2026/01/Headshot_2026_Jacklin_Brad.png' },
        { id: 'st4', title: 'Emily Lucas', description: 'Senior Director, Professional Practice', image: 'https://www.thecaq.org/wp-content/uploads/2026/01/Headshot_2026_Lucas_Emily.png' },
        { id: 'st5', title: 'Zlatana Alibegovic', description: 'Senior Director, Stakeholder Engagement & Marketing', image: 'https://www.thecaq.org/wp-content/uploads/2026/01/Headshot_2026_Alibegovic_Zlatana.png' },
        { id: 'st6', title: 'Desiré Carroll', description: 'Senior Director, Professional Practice', image: 'https://www.thecaq.org/wp-content/uploads/2026/01/Headshot_2026_Carroll_Desire.png' },
        { id: 'st7', title: 'Annette Schumacher', description: 'Senior Director, Professional Practice', image: 'https://www.thecaq.org/wp-content/uploads/2026/01/Headshot_2026_Schumacher_Annette.png' },
        { id: 'st8', title: 'Vanessa Teitelbaum', description: 'Senior Director, Professional Practice', image: 'https://www.thecaq.org/wp-content/uploads/2026/01/Headshot_2026_Teitelbaum_Vanessa.png' },
      ],
      style: { padding: '10px 40px 60px', backgroundColor: '#F8FAFC' },
    },
  ], 'Our People | Center for Audit Quality', 'Meet the governing board and staff of the Center for Audit Quality.');

  // Additional marketing pages - simpler structure
  const simplePages = [
    {
      slug: 'independence', title: 'Independence',
      subtitle: 'Auditor commitment to maintaining independence as a cornerstone of trust in financial reporting',
      body: 'Independence is the foundation of the audit profession. The CAQ works to ensure that auditors maintain their objectivity and skepticism, free from conflicts of interest that could compromise the quality of their work. Through research, guidance, and advocacy, the CAQ supports the profession\'s commitment to independence.',
      seo: 'Learn about auditor independence and the CAQ\'s work to maintain this cornerstone of the audit profession.',
    },
    {
      slug: 'anti-fraud', title: 'Anti-Fraud',
      subtitle: 'The profession\'s critical role in deterring and detecting financial fraud',
      body: 'The CAQ is committed to supporting the auditing profession\'s role in fighting financial fraud. Through the Anti-Fraud Collaboration — a partnership with the AICPA, Financial Executives International, and the National Association of Corporate Directors — the CAQ works to reduce incidences of financial fraud through research, education, and the promotion of best practices.',
      seo: 'Learn about the CAQ\'s anti-fraud initiatives and the profession\'s role in deterring and detecting financial fraud.',
    },
    {
      slug: 'esg', title: 'ESG',
      subtitle: 'Meeting growing demand for reliable environmental, social, and governance information',
      body: 'As companies increasingly report on environmental, social, and governance (ESG) matters, the CAQ works to ensure that the auditing profession is positioned to provide assurance over this information. Through research, education, and engagement with standard-setters, the CAQ supports the development of a robust ESG reporting ecosystem.',
      seo: 'Learn about the CAQ\'s work on ESG reporting and the role of auditors in sustainability assurance.',
    },
    {
      slug: 'future-talent', title: 'Future Talent',
      subtitle: 'Building and sustaining a diverse pipeline of future auditors and accountants',
      body: 'The CAQ\'s Accounting+ initiative is committed to building a more robust and diverse talent pipeline for the accounting profession. Through classroom engagement reaching over 261,000 students, the CAQ works to raise awareness about accounting as a career path and to inspire the next generation of auditors and financial professionals.',
      seo: 'Learn about the CAQ\'s Accounting+ initiative and commitment to building a diverse talent pipeline for the accounting profession.',
    },
    {
      slug: 'corporate-reporting-trends', title: 'Corporate Reporting Trends',
      subtitle: 'Working at the forefront of evolving reporting standards and requirements',
      body: 'The landscape of corporate reporting continues to evolve rapidly. The CAQ tracks and analyzes trends across S&P 500 companies, including reporting on climate, AI, digital assets, and ESG matters. Our research helps stakeholders understand how corporate reporting is changing and what it means for audit quality and investor protection.',
      seo: 'Explore corporate reporting trends including S&P 500 analysis on climate, AI, digital assets, and ESG reporting.',
    },
    {
      slug: 'events', title: 'Events',
      subtitle: 'CAQ conferences, webinars, and professional development opportunities',
      body: 'The CAQ hosts events throughout the year that bring together auditors, investors, policymakers, and other stakeholders to discuss critical issues affecting audit quality and the capital markets.',
      seo: 'Browse upcoming CAQ events including conferences, webinars, and professional development opportunities.',
    },
    {
      slug: 'press-room', title: 'Press Room',
      subtitle: 'News, press releases, and media resources from the Center for Audit Quality',
      body: 'For the latest news and updates from the CAQ, including press releases, media advisories, and information for journalists.',
      seo: 'News, press releases, and media resources from the Center for Audit Quality.',
    },
    {
      slug: 'careers', title: 'Careers',
      subtitle: 'Join the team at the Center for Audit Quality',
      body: 'The CAQ is always looking for talented professionals who are passionate about audit quality and public policy. Based in Washington, D.C., the CAQ offers a collaborative work environment focused on making a meaningful impact on the capital markets.',
      seo: 'Explore career opportunities at the Center for Audit Quality in Washington, D.C.',
    },
    {
      slug: 'privacy', title: 'Privacy Policy',
      subtitle: 'How we collect, use, and protect your information',
      body: 'The Center for Audit Quality is committed to protecting your privacy. This policy describes how we collect, use, and safeguard your personal information.',
      seo: 'Privacy policy for the Center for Audit Quality website.',
    },
    {
      slug: 'terms', title: 'Terms and Conditions',
      subtitle: 'Terms of use for the CAQ website',
      body: 'These terms and conditions govern your use of the Center for Audit Quality website and services.',
      seo: 'Terms and conditions for the Center for Audit Quality website.',
    },
  ];

  for (const p of simplePages) {
    await createPage(p.title, p.slug, [
      {
        id: `${p.slug}-hero`, type: 'hero', order: 1,
        title: p.title,
        subtitle: p.subtitle,
        style: { backgroundColor: '#172136', color: '#F5FDF7', padding: '80px 40px', textAlign: 'center' as const },
      },
      {
        id: `${p.slug}-body`, type: 'text', order: 2,
        content: p.body,
        size: 'lg', alignment: 'center',
        style: { padding: '40px 60px', maxWidth: '800px', margin: '0 auto' },
      },
      {
        id: `${p.slug}-cta`, type: 'cta', order: 3,
        title: 'Explore Our Resources',
        description: 'Browse the latest research, analysis, and guidance from the CAQ.',
        primaryButtonText: 'Resource Hub',
        primaryButtonUrl: '/resource-hub',
        backgroundStyle: 'solid',
        style: { backgroundColor: '#1E376C', color: '#F5FDF7', padding: '60px 40px' },
      },
    ], `${p.title} | Center for Audit Quality`, p.seo);
  }

  // ========== NAVIGATION ==========
  console.log('\n=== SETTING UP NAVIGATION ===');

  // Check if nav already exists
  const existingNav = await db.select().from(siteNavigation).where(eq(siteNavigation.websiteId, WEBSITE_ID));
  if (existingNav.length > 0) {
    console.log('  [skip] Navigation already exists');
  } else {
    const navItems = [
      { label: 'About Us', url: '/about-us', sortOrder: 1 },
      { label: 'Audit Quality', url: '/audit-quality', sortOrder: 2 },
      { label: 'Independence', url: '/independence', sortOrder: 3 },
      { label: 'Anti-Fraud', url: '/anti-fraud', sortOrder: 4 },
      { label: 'ESG', url: '/esg', sortOrder: 5 },
      { label: 'People', url: '/people', sortOrder: 6 },
      { label: 'Events', url: '/events', sortOrder: 7 },
      { label: 'Resource Hub', url: '/resource-hub', sortOrder: 8 },
    ];
    for (const item of navItems) {
      await db.insert(siteNavigation).values({
        websiteId: WEBSITE_ID,
        label: item.label,
        url: item.url,
        sortOrder: item.sortOrder,
        visible: true,
      });
    }
    console.log(`  [created] ${navItems.length} navigation items`);
  }

  console.log('\n=== PAGE IMPORT COMPLETE ===');
  process.exit(0);
}

importPages().catch(err => { console.error(err); process.exit(1); });
