import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });

const WEBSITE_ID = 140;

const IMG = {
  hero: 'https://cdn.builder.io/api/v1/image/assets%2F6028ae1af3314380bad649a35f0c4d7e%2Fcd686cbbcc174461ad20b85c7fc07744',
  survey: 'https://thecaq.wpenginepowered.com/wp-content/uploads/2026/03/2026_03_Investor-Survey_Homepage.png',
  ctaBg: 'https://cdn.builder.io/api/v1/image/assets%2F6028ae1af3314380bad649a35f0c4d7e%2F98fdbb25616f42abb9fb09756e0f28ec',
  pattern: 'https://cdn.builder.io/api/v1/image/assets%2F6028ae1af3314380bad649a35f0c4d7e%2F101c27210557453b9eb378b6ceea6206',
  abrash: 'https://www.thecaq.org/wp-content/uploads/2023/01/Headshot_Abrash_Lara.png',
};

const C = {
  blue: '#296CFA',
  navy: '#1E376C',
  darkNavy: '#172136',
  deepNavy: '#0F1A2E',
  teal: '#2BD4A1',
  gold: '#FFD000',
  mint: '#E9F1EB',
  mintDark: '#D4E8D9',
  white: '#FFFFFF',
  offWhite: '#F5FDF7',
  textDark: '#172136',
  textBody: '#3D4F5F',
  textMuted: '#6B7D8D',
};

async function rebuildHome() {
  const { db } = await import('../../../lib/db');
  const { posts } = await import('../../../lib/db/schema');
  const { eq, and } = await import('drizzle-orm');

  const blocks = [

    // ━━━━━ HERO: Full-bleed photo, elegant overlay, refined type ━━━━━━━━
    {
      id: 'hero',
      type: 'hero',
      order: 1,
      title: 'The Center for<br/><em>Audit Quality</em>',
      subtitle: 'ENHANCING INVESTOR CONFIDENCE',
      description: 'Promoting high-quality financial reporting and public trust in the global capital markets since 2007',
      ctaText: 'Explore Resources',
      ctaLink: '/resource-hub',
      secondaryCtaText: 'About the CAQ',
      secondaryCtaLink: '/about-us',
      backgroundImage: IMG.hero,
      style: {
        minHeight: '92vh',
        customCSS: 'background-blend-mode: darken',
      },
      elementStyles: {
        subtitle: {
          color: C.teal,
          fontSize: '0.75rem',
          letterSpacing: '0.35em',
          fontWeight: '600',
          customCSS: 'text-shadow: 0 1px 2px rgba(0,0,0,0.3)',
        },
        title: {
          fontFamily: 'Playfair Display',
          fontSize: '4.25rem',
          lineHeight: '1.12',
          color: '#FFFFFF',
          letterSpacing: '-0.015em',
          fontWeight: '700',
          customCSS: 'text-shadow: 0 2px 20px rgba(0,0,0,0.4)',
        },
        description: {
          color: 'rgba(255,255,255,0.75)',
          fontSize: '1.125rem',
          lineHeight: '1.8',
          letterSpacing: '0.01em',
          customCSS: 'text-shadow: 0 1px 4px rgba(0,0,0,0.3)',
        },
        cta: {
          backgroundColor: C.blue,
          color: '#FFFFFF',
          borderRadius: '28px',
          padding: '15px 40px',
          fontSize: '0.875rem',
          fontWeight: '600',
          letterSpacing: '0.04em',
          customCSS: 'text-transform: uppercase; box-shadow: 0 4px 20px rgba(41,108,250,0.4); transition: all 0.3s ease',
        },
        secondaryCta: {
          borderColor: 'rgba(255,255,255,0.35)',
          color: '#FFFFFF',
          borderRadius: '28px',
          padding: '15px 40px',
          fontSize: '0.875rem',
          letterSpacing: '0.04em',
          customCSS: 'text-transform: uppercase; backdrop-filter: blur(4px); background: rgba(255,255,255,0.08); transition: all 0.3s ease',
        },
      },
    },

    // ━━━━━ PILLARS: Mint cards with subtle border, refined spacing ━━━━━━
    {
      id: 'pillars',
      type: 'section',
      order: 2,
      backgroundColor: C.white,
      paddingTop: '100px',
      paddingBottom: '100px',
      paddingLeft: '24px',
      paddingRight: '24px',
      maxWidth: '1200px',
      blocks: [
        {
          id: 'pillars-overline', type: 'text', order: 1,
          content: 'WHAT WE DO',
          alignment: 'center',
          style: { color: C.blue, fontSize: '0.6875rem', letterSpacing: '0.3em', fontWeight: '700', margin: '0 0 12px 0', customCSS: 'text-transform: uppercase' },
        },
        {
          id: 'pillars-title', type: 'heading', order: 2,
          content: 'Strengthening Capital Markets', level: 2, alignment: 'center',
          style: { fontFamily: 'Playfair Display', fontSize: '2.75rem', color: C.textDark, margin: '0 0 16px 0', fontWeight: '700', lineHeight: '1.2' },
        },
        {
          id: 'pillars-subtitle', type: 'text', order: 3,
          content: 'The CAQ advances audit quality through research, advocacy, and collaboration with auditors, investors, and policymakers.',
          alignment: 'center',
          style: { color: C.textBody, fontSize: '1.0625rem', maxWidth: '580px', margin: '0 auto 56px auto', lineHeight: '1.75' },
        },
        {
          id: 'pillars-cols', type: 'columns', order: 4,
          gap: 'lg', stackOnMobile: true,
          columns: [
            {
              id: 'cp1', width: 33, padding: 'lg',
              blocks: [
                {
                  id: 'p1-icon', type: 'text', order: 1,
                  content: '<span style="display:inline-flex;width:48px;height:48px;border-radius:12px;background:rgba(41,108,250,0.1);align-items:center;justify-content:center;color:#296CFA;font-size:1.25rem;">&#9878;</span>',
                  style: { margin: '0 0 20px 0' },
                },
                { id: 'p1-t', type: 'heading', order: 2, content: 'Auditors & Capital Markets', level: 3,
                  style: { fontFamily: 'Playfair Display', fontSize: '1.375rem', color: C.textDark, margin: '0 0 10px 0', fontWeight: '600', lineHeight: '1.3' } },
                { id: 'p1-d', type: 'text', order: 3,
                  content: 'How auditors help power the economy by providing independent assurance on financial statements that investors rely on for confident decision-making.',
                  style: { color: C.textBody, lineHeight: '1.75', fontSize: '0.9375rem' } },
              ],
              cssClass: 'rounded-2xl',
              backgroundColor: C.mint,
            },
            {
              id: 'cp2', width: 33, padding: 'lg',
              blocks: [
                {
                  id: 'p2-icon', type: 'text', order: 1,
                  content: '<span style="display:inline-flex;width:48px;height:48px;border-radius:12px;background:rgba(43,212,161,0.12);align-items:center;justify-content:center;color:#2BD4A1;font-size:1.25rem;">&#9745;</span>',
                  style: { margin: '0 0 20px 0' },
                },
                { id: 'p2-t', type: 'heading', order: 2, content: 'Trust & Transparency', level: 3,
                  style: { fontFamily: 'Playfair Display', fontSize: '1.375rem', color: C.textDark, margin: '0 0 10px 0', fontWeight: '600', lineHeight: '1.3' } },
                { id: 'p2-d', type: 'text', order: 3,
                  content: 'Protecting investors and the public through advocacy for high-quality auditing standards, transparency in reporting, and robust oversight.',
                  style: { color: C.textBody, lineHeight: '1.75', fontSize: '0.9375rem' } },
              ],
              cssClass: 'rounded-2xl',
              backgroundColor: C.mint,
            },
            {
              id: 'cp3', width: 33, padding: 'lg',
              blocks: [
                {
                  id: 'p3-icon', type: 'text', order: 1,
                  content: '<span style="display:inline-flex;width:48px;height:48px;border-radius:12px;background:rgba(255,208,0,0.12);align-items:center;justify-content:center;color:#D4A800;font-size:1.25rem;">&#9881;</span>',
                  style: { margin: '0 0 20px 0' },
                },
                { id: 'p3-t', type: 'heading', order: 2, content: 'Independence & Expertise', level: 3,
                  style: { fontFamily: 'Playfair Display', fontSize: '1.375rem', color: C.textDark, margin: '0 0 10px 0', fontWeight: '600', lineHeight: '1.3' } },
                { id: 'p3-d', type: 'text', order: 3,
                  content: 'The unique cornerstones of the audit profession that ensure objectivity, professional skepticism, and credibility in financial reporting.',
                  style: { color: C.textBody, lineHeight: '1.75', fontSize: '0.9375rem' } },
              ],
              cssClass: 'rounded-2xl',
              backgroundColor: C.mint,
            },
          ],
        },
      ],
    },

    // ━━━━━ FEATURED RESEARCH: Asymmetric split with image ━━━━━━━━━━━━━━
    {
      id: 'featured',
      type: 'section',
      order: 3,
      backgroundColor: '#F7FAF8',
      paddingTop: '100px',
      paddingBottom: '100px',
      paddingLeft: '24px',
      paddingRight: '24px',
      maxWidth: '1100px',
      blocks: [
        {
          id: 'feat-cols', type: 'columns', order: 1,
          gap: 'lg', stackOnMobile: true,
          columns: [
            {
              id: 'feat-img-col', width: 48, verticalAlign: 'center',
              blocks: [{
                id: 'feat-img', type: 'image', order: 1,
                url: IMG.survey, alt: 'Annual Institutional Investor Survey 2026', width: 'full',
                style: { borderRadius: '20px', customCSS: 'box-shadow: 0 20px 60px rgba(23,33,54,0.12); overflow: hidden' },
              }],
            },
            {
              id: 'feat-text-col', width: 52, verticalAlign: 'center', padding: 'lg',
              blocks: [
                { id: 'feat-label', type: 'text', order: 1,
                  content: 'FLAGSHIP RESEARCH',
                  style: { color: C.blue, fontSize: '0.6875rem', letterSpacing: '0.25em', fontWeight: '700', margin: '0 0 14px 0', customCSS: 'text-transform: uppercase' } },
                { id: 'feat-title', type: 'heading', order: 2,
                  content: 'Annual Institutional<br/>Investor Survey', level: 2,
                  style: { fontFamily: 'Playfair Display', fontSize: '2.25rem', color: C.textDark, lineHeight: '1.2', margin: '0 0 18px 0', fontWeight: '700' } },
                {
                  id: 'feat-divider', type: 'divider', order: 3,
                  lineStyle: 'solid',
                  style: { maxWidth: '60px', margin: '0 0 18px 0', customCSS: 'border-color: #2BD4A1; opacity: 0.6' },
                },
                { id: 'feat-desc', type: 'text', order: 4,
                  content: 'Our flagship annual report exploring institutional investor perspectives on the role of auditors, assurance beyond financial statements, and confidence in the capital markets. Now in its 18th year.',
                  style: { color: C.textBody, lineHeight: '1.75', fontSize: '1rem', margin: '0 0 28px 0' } },
                { id: 'feat-btn', type: 'button', order: 5,
                  text: 'Read the Report', url: '/resource-hub', variant: 'primary',
                  style: { backgroundColor: C.blue, color: '#FFFFFF', borderRadius: '28px', padding: '13px 36px', fontSize: '0.875rem', fontWeight: '600', letterSpacing: '0.02em', customCSS: 'box-shadow: 0 4px 16px rgba(41,108,250,0.3)' } },
              ],
            },
          ],
        },
      ],
    },

    // ━━━━━ STATS: Dark navy with teal accents and refined typography ━━━━
    {
      id: 'stats',
      type: 'section',
      order: 4,
      backgroundColor: C.deepNavy,
      color: C.offWhite,
      paddingTop: '90px',
      paddingBottom: '90px',
      paddingLeft: '24px',
      paddingRight: '24px',
      maxWidth: '1000px',
      style: {
        customCSS: 'background-image: radial-gradient(ellipse at 50% 0%, rgba(41,108,250,0.08) 0%, transparent 60%)',
      },
      blocks: [
        { id: 'stats-overline', type: 'text', order: 1, content: 'BY THE NUMBERS', alignment: 'center',
          style: { color: C.teal, fontSize: '0.6875rem', letterSpacing: '0.3em', fontWeight: '600', margin: '0 0 12px 0', customCSS: 'text-transform: uppercase' } },
        { id: 'stats-title', type: 'heading', order: 2, content: 'Investor Trust in the Audit', level: 2, alignment: 'center',
          style: { fontFamily: 'Playfair Display', color: '#FFFFFF', fontSize: '2.25rem', margin: '0 0 56px 0', fontWeight: '600' } },
        {
          id: 'stats-cols', type: 'columns', order: 3, gap: 'lg', stackOnMobile: true,
          columns: [
            { id: 'sc1', width: 33, blocks: [
              { id: 'sv1', type: 'heading', order: 1, content: '90%', level: 2, alignment: 'center',
                style: { fontFamily: 'Playfair Display', color: C.teal, fontSize: '3.75rem', fontWeight: '700', margin: '0 0 8px 0', lineHeight: '1', customCSS: 'text-shadow: 0 0 30px rgba(43,212,161,0.2)' } },
              { id: 'sl1', type: 'text', order: 2, content: 'of institutional investors rely on audited financial statements', alignment: 'center',
                style: { color: 'rgba(245,253,247,0.6)', fontSize: '0.9375rem', lineHeight: '1.6' } },
            ]},
            { id: 'sc2', width: 33, blocks: [
              { id: 'sv2', type: 'heading', order: 1, content: '91%', level: 2, alignment: 'center',
                style: { fontFamily: 'Playfair Display', color: C.teal, fontSize: '3.75rem', fontWeight: '700', margin: '0 0 8px 0', lineHeight: '1', customCSS: 'text-shadow: 0 0 30px rgba(43,212,161,0.2)' } },
              { id: 'sl2', type: 'text', order: 2, content: 'trust the accuracy of audited statements', alignment: 'center',
                style: { color: 'rgba(245,253,247,0.6)', fontSize: '0.9375rem', lineHeight: '1.6' } },
            ]},
            { id: 'sc3', width: 33, blocks: [
              { id: 'sv3', type: 'heading', order: 1, content: '84%', level: 2, alignment: 'center',
                style: { fontFamily: 'Playfair Display', color: C.teal, fontSize: '3.75rem', fontWeight: '700', margin: '0 0 8px 0', lineHeight: '1', customCSS: 'text-shadow: 0 0 30px rgba(43,212,161,0.2)' } },
              { id: 'sl3', type: 'text', order: 2, content: 'confident in audit committee information quality', alignment: 'center',
                style: { color: 'rgba(245,253,247,0.6)', fontSize: '0.9375rem', lineHeight: '1.6' } },
            ]},
          ],
        },
      ],
    },

    // ━━━━━ PRIORITIES: Elegant card grid with hover-ready styling ━━━━━━━
    {
      id: 'priorities',
      type: 'card-grid',
      order: 5,
      title: 'Our Priorities',
      description: 'The CAQ advances critical issues at the intersection of audit quality, corporate reporting, and investor protection.',
      columns: 3,
      cards: [
        { id: 'pr1', title: 'Audit Quality', description: 'Our capital markets evolve, but commitment to audit quality remains the constant that investors depend on.', icon: 'verified', link: '/audit-quality' },
        { id: 'pr2', title: 'Independence', description: 'The cornerstone of public trust \u2014 ensuring auditors maintain objectivity free from conflicts of interest.', icon: 'shield', link: '/independence' },
        { id: 'pr3', title: 'Corporate Reporting', description: 'Tracking and shaping evolving standards across climate, AI, digital assets, and ESG disclosure.', icon: 'trending_up', link: '/corporate-reporting-trends' },
        { id: 'pr4', title: 'Anti-Fraud', description: 'Working with auditors, executives, and directors to deter and detect financial fraud through collaboration.', icon: 'security', link: '/anti-fraud' },
        { id: 'pr5', title: 'ESG & Sustainability', description: 'Positioning the profession to provide reliable assurance over ESG information.', icon: 'eco', link: '/esg' },
        { id: 'pr6', title: 'Future Talent', description: 'Building a diverse talent pipeline through Accounting+ \u2014 reaching 261,000+ students.', icon: 'school', link: '/future-talent' },
      ],
      style: { backgroundColor: C.white, padding: '100px 24px' },
      elementStyles: {
        title: { fontFamily: 'Playfair Display', color: C.textDark, fontSize: '2.75rem', fontWeight: '700' },
        description: { color: C.textBody, fontSize: '1.0625rem', lineHeight: '1.7' },
        card: {
          backgroundColor: C.mint,
          borderRadius: '20px',
          padding: '36px',
          borderWidth: '1px',
          borderColor: C.mintDark,
          borderStyle: 'solid',
          customCSS: 'transition: all 0.3s ease; box-shadow: 0 2px 8px rgba(23,33,54,0.04)',
        },
        cardTitle: { color: C.textDark, fontFamily: 'Playfair Display', fontSize: '1.25rem', fontWeight: '600' },
        cardDescription: { color: C.textBody, fontSize: '0.9375rem', lineHeight: '1.7' },
        cardIcon: { color: C.navy, fontSize: '1.75rem', customCSS: 'opacity: 0.8' },
      },
    },

    // ━━━━━ QUOTE: Centered testimonial on mint with decorative divider ━━
    {
      id: 'quote',
      type: 'section',
      order: 6,
      backgroundColor: C.mint,
      paddingTop: '90px',
      paddingBottom: '90px',
      paddingLeft: '24px',
      paddingRight: '24px',
      maxWidth: '750px',
      blocks: [
        { id: 'q-divider-top', type: 'text', order: 1, content: '<div style="width:60px;height:2px;background:linear-gradient(to right,transparent,#296CFA,transparent);margin:0 auto 32px"></div>', alignment: 'center' },
        {
          id: 'q-block', type: 'testimonial', order: 2,
          quote: 'Getting it right means consistently delivering trustworthy services in a data-driven environment, combining professional skepticism with technology-enabled insights.',
          author: 'Lara Abrash',
          role: 'Chair, CAQ Governing Board',
          company: 'Chair, Deloitte US',
          avatar: IMG.abrash,
          elementStyles: {
            quote: { fontFamily: 'Playfair Display', fontSize: '1.5rem', lineHeight: '1.65', color: C.textDark, fontWeight: '400', fontStyle: 'italic' },
            author: { color: C.navy, fontWeight: '700', fontSize: '1rem' },
            role: { color: C.textMuted, fontSize: '0.875rem' },
          },
        },
        { id: 'q-divider-bot', type: 'text', order: 3, content: '<div style="width:60px;height:2px;background:linear-gradient(to right,transparent,#296CFA,transparent);margin:32px auto 0"></div>', alignment: 'center' },
      ],
    },

    // ━━━━━ TRENDING RESOURCES ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    {
      id: 'trending',
      type: 'blog-posts',
      order: 7,
      title: 'Trending Resources',
      description: 'The latest research, analysis, and insights from the CAQ',
      limit: 3, columns: 3, showExcerpt: true,
      style: { backgroundColor: C.white, padding: '100px 24px' },
      elementStyles: {
        title: { fontFamily: 'Playfair Display', color: C.textDark, fontSize: '2.75rem', fontWeight: '700' },
        description: { color: C.textBody },
      },
    },

    // ━━━━━ CTA: Dark section with background image, glass button ━━━━━━━
    {
      id: 'cta',
      type: 'section',
      order: 8,
      backgroundColor: C.deepNavy,
      backgroundImage: IMG.ctaBg,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      paddingTop: '120px',
      paddingBottom: '120px',
      paddingLeft: '24px',
      paddingRight: '24px',
      maxWidth: '680px',
      color: '#FFFFFF',
      style: {
        customCSS: 'background-blend-mode: overlay',
      },
      blocks: [
        { id: 'cta-overline', type: 'text', order: 1, content: 'GET STARTED', alignment: 'center',
          style: { color: C.teal, fontSize: '0.6875rem', letterSpacing: '0.3em', fontWeight: '600', margin: '0 0 14px 0', customCSS: 'text-transform: uppercase' } },
        { id: 'cta-title', type: 'heading', order: 2, content: 'Stay Connected', level: 2, alignment: 'center',
          style: { fontFamily: 'Playfair Display', fontSize: '2.75rem', color: '#FFFFFF', margin: '0 0 18px 0', fontWeight: '700', customCSS: 'text-shadow: 0 2px 12px rgba(0,0,0,0.3)' } },
        { id: 'cta-desc', type: 'text', order: 3, alignment: 'center',
          content: 'Create your personalized dashboard to manage subscriptions, track events, and access the latest research on audit quality and capital markets.',
          style: { color: 'rgba(255,255,255,0.7)', fontSize: '1.0625rem', lineHeight: '1.75', margin: '0 0 36px 0' } },
        { id: 'cta-btn', type: 'button', order: 4, text: 'Create Your Dashboard', url: '/email-login', variant: 'primary', alignment: 'center',
          style: { backgroundColor: C.blue, color: '#FFFFFF', borderRadius: '28px', padding: '15px 40px', fontSize: '0.875rem', fontWeight: '600', letterSpacing: '0.04em', customCSS: 'text-transform: uppercase; box-shadow: 0 4px 24px rgba(41,108,250,0.45)' } },
      ],
    },
  ];

  const content = JSON.stringify({ blocks, version: '1.0' });

  const [existing] = await db.select({ id: posts.id }).from(posts)
    .where(and(eq(posts.websiteId, WEBSITE_ID), eq(posts.slug, 'home')))
    .limit(1);

  if (existing) {
    await db.update(posts).set({ content, updatedAt: new Date() }).where(eq(posts.id, existing.id));
    console.log(`Updated home page (ID: ${existing.id})`);
  } else {
    const [page] = await db.insert(posts).values({
      title: 'Home', slug: 'home', postType: 'page', content,
      published: false, websiteId: WEBSITE_ID,
      seoTitle: 'The Center for Audit Quality',
      seoDescription: 'Enhancing investor confidence and public trust in the global capital markets through high-quality financial reporting.',
    }).returning();
    console.log(`Created home page (ID: ${page.id})`);
  }

  console.log('Home page rebuilt with premium design');
  process.exit(0);
}

rebuildHome().catch(err => { console.error(err); process.exit(1); });
