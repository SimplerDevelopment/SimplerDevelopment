import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config({ path: '.env' });

/**
 * Crossover Capital Advisors — Home Page Migration (v4 — custom blocks)
 *
 * Uses new generic block types:
 * - timeline: alternating process steps with connecting line + nodes
 * - team-showcase: magazine-spread photo/bio layout
 * - bento-grid: service cards with accent bars, dark/light variants
 */

async function importHome() {
  const { db } = await import('../../../lib/db');
  const { posts } = await import('../../../lib/db/schema');
  const { eq, and } = await import('drizzle-orm');

  const ids = JSON.parse(fs.readFileSync(path.join(__dirname, 'ids.json'), 'utf-8'));
  const websiteId = ids.websiteId;

  if (!websiteId) {
    console.error('No websiteId found in ids.json. Run setup-client first.');
    process.exit(1);
  }

  const [existing] = await db
    .select()
    .from(posts)
    .where(and(eq(posts.slug, 'home'), eq(posts.websiteId, websiteId)))
    .limit(1);

  if (existing) {
    console.log(`Home page already exists: ID ${existing.id} — updating...`);
    await db.update(posts).set({
      content: JSON.stringify({ blocks: buildBlocks(), version: '1.0' }),
    }).where(eq(posts.id, existing.id));
    console.log('Home page updated.');
    process.exit(0);
  }

  const [page] = await db.insert(posts).values({
    title: 'Home',
    slug: 'home',
    postType: 'page',
    content: JSON.stringify({ blocks: buildBlocks(), version: '1.0' }),
    published: true,
    websiteId,
    seoTitle: 'Crossover Capital Advisors | Peace of Mind for All We Serve',
    seoDescription: 'Crossover Capital Advisors offers personalized wealth management, financial planning, divorce financial services, family business consulting, and cryptocurrency education. Based in Yardley, PA.',
    ogImage: 'http://localhost:3001/images/TEAM_Web-600x400.jpg',
  }).returning();

  console.log(`Home page created: ID ${page.id}`);
  process.exit(0);
}

function buildBlocks() {
  const IMG = '/sites/crosscap';
  const SERIF = 'Cormorant Garamond, Georgia, serif';
  const SANS = 'Plus Jakarta Sans, sans-serif';

  return [
    // ══════════════════════════════════════════════════════════════════
    // 1. HERO — hero-slideshow with background video + left alignment
    // ══════════════════════════════════════════════════════════════════
    {
      type: 'hero-slideshow',
      id: 'hero-1',
      order: 1,
      slides: [
        {
          id: 'slide-1',
          title: `Peace of Mind<br/><em style="background:linear-gradient(135deg,#cfa122,#dbb440);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;font-weight:500">for All We Serve</em>`,
          subtitle: '<span style="display:inline-block;width:48px;height:2px;background:linear-gradient(to right,#cfa122,#dbb440);vertical-align:middle;margin-right:16px"></span>Crossover Capital Advisors',
          description: "We\u2019re here to navigate the confusion and combat the anxiety in understanding your financial unknowns.<br/><span style=\"color:rgba(255,255,255,0.6);font-size:0.9375rem;margin-top:12px;display:block\">By customizing our approach, we offer a tailored experience that addresses your precise requirements and goals.</span>",
          ctaText: 'Schedule a Call',
          ctaLink: '/schedule',
          secondaryCtaText: 'Explore Services',
          secondaryCtaLink: '#services',
          backgroundImage: `${IMG}/TEAM_Web-600x400.jpg`,
          overlayColor: 'rgba(10,22,40,0.75)',
          overlayOpacity: 1,
          textAlignment: 'left',
        },
      ],
      autoplay: false,
      showDots: false,
      showArrows: false,
      backgroundVideo: `${IMG}/Crossover_Hero_Short.mp4`,
      backgroundVideoOpacity: 0.6,
      height: '100vh',
      kenBurns: false,
      stats: [
        { id: 's1', value: '22+', label: 'Years Combined Experience' },
        { id: 's2', value: 'SEC', label: 'Registered Advisor' },
        { id: 's3', value: '4', label: 'Service Disciplines' },
        { id: 's4', value: '100%', label: 'Fiduciary Standard' },
      ],
      elementStyles: {
        subtitle: { color: '#cfa122', fontSize: '0.6875rem', letterSpacing: '0.35em', textTransform: 'uppercase' as const, fontFamily: SANS, fontWeight: '400', margin: '0 0 32px 0' },
        title: { fontFamily: SERIF, fontSize: '4.5rem', fontWeight: '300', letterSpacing: '-0.01em', lineHeight: '1', color: '#ffffff', customCSS: 'text-shadow: 0 2px 20px rgba(0,0,0,0.4)' },
        description: { color: 'rgba(255,255,255,0.8)', fontSize: '1.0625rem', lineHeight: '1.65', maxWidth: '440px', fontFamily: SANS },
        cta: { backgroundColor: '#cfa122', color: '#0a1628', fontWeight: '600', fontSize: '0.875rem', letterSpacing: '0.04em', padding: '16px 32px', borderRadius: '0px', customCSS: 'box-shadow: 0 4px 20px rgba(207,161,34,0.25)' },
        secondaryCta: { color: 'rgba(255,255,255,0.6)', fontSize: '0.875rem', letterSpacing: '0.04em', fontFamily: SANS, customCSS: 'backdrop-filter: none; background: transparent; border: 1px solid rgba(255,255,255,0.2)' },
        statValue: { fontFamily: SERIF, fontSize: '1.875rem', fontWeight: '300', color: '#cfa122' },
        statLabel: { fontSize: '0.625rem', letterSpacing: '0.2em', textTransform: 'uppercase' as const, color: 'rgba(255,255,255,0.6)', fontFamily: SANS },
      },
    },

    // ══════════════════════════════════════════════════════════════════
    // 3. SERVICES — bento-grid block (new custom type)
    // ══════════════════════════════════════════════════════════════════
    {
      type: 'section',
      id: 'services-section',
      order: 3,
      backgroundColor: '#fafbfd',
      paddingTop: '112px',
      paddingBottom: '112px',
      paddingLeft: '24px',
      paddingRight: '24px',
      maxWidth: '1280px',
      blocks: [
        {
          type: 'bento-grid',
          id: 'services-bento',
          order: 1,
          overline: 'What We Do',
          title: 'Comprehensive<br/>Financial Services',
          subtitle: "From wealth management to navigating life\u2019s transitions, we provide expert guidance tailored to your unique circumstances.",
          darkBg: '#0a1628',
          lightBorder: '#e8f0fe',
          accentColor: '#cfa122',
          cards: [
            {
              id: 'svc-invest',
              title: 'Investments & Planning',
              lead: 'Do you need help getting your finances organized?',
              items: ['Investment Management', 'Retirement Planning', 'Tax Planning', 'Risk Management', 'Education Planning', 'Charitable Planning', 'Dollar Cost Averaging', 'Alternative Investments'],
              link: '/services/investments-planning',
              linkText: 'Explore',
              variant: 'dark',
              span: 7,
            },
            {
              id: 'svc-family',
              title: 'Family Business',
              lead: 'Having issues with the family business?',
              items: ['Family Business Governance', 'Mission & Values Alignment', 'Family Council Formation', 'Succession Planning', 'Revenue Growth Strategy', 'Talent & Operations'],
              link: '/services/family-business',
              linkText: 'Explore',
              variant: 'light',
              span: 5,
            },
            {
              id: 'svc-divorce',
              title: 'Divorce Financial Planning',
              lead: 'Let us take the heavy lifting off your plate.',
              items: ['Financial Tools & Resources', 'Legal Referral Services', 'Coordinated Financial Planning', 'Estate & Beneficiary Reviews', 'College Planning', 'Insurance Planning', 'Goal Setting & Life Coaching', 'Career Coaching'],
              link: '/services/divorce',
              linkText: 'Explore',
              variant: 'light',
              span: 5,
            },
            {
              id: 'svc-crypto',
              title: 'Cryptocurrency Education',
              lead: 'The financial world is always changing.',
              items: ['Blockchain Fundamentals', 'Wallet Management', 'Risk & Compliance', 'Tax Implications & Reporting', 'Crypto Estate Planning', 'Tokenomics & Valuation', 'Exchange Selection', 'Behavioral Finance'],
              link: '/services/cryptocurrency',
              linkText: 'Explore',
              variant: 'dark',
              span: 7,
            },
          ],
          elementStyles: {
            overline: { color: '#cfa122', fontFamily: SANS },
            title: { fontFamily: SERIF, color: '#0a1628', fontWeight: '300', lineHeight: '1.05' },
            subtitle: { color: '#64748b', fontFamily: SANS },
            cardTitle: { fontFamily: SERIF },
            cardLead: { fontFamily: SANS },
          },
        },
      ],
    },

    // ══════════════════════════════════════════════════════════════════
    // 4. PROCESS — timeline block (new custom type)
    // ══════════════════════════════════════════════════════════════════
    {
      type: 'section',
      id: 'process-section',
      order: 4,
      backgroundColor: '#0a1628',
      paddingTop: '112px',
      paddingBottom: '112px',
      paddingLeft: '24px',
      paddingRight: '24px',
      maxWidth: '1080px',
      color: '#ffffff',
      blocks: [
        {
          type: 'timeline',
          id: 'process-timeline',
          order: 1,
          overline: 'How We Work',
          title: 'Our Process',
          subtitle: 'A structured approach that puts your needs at the center of every decision.',
          layout: 'alternating',
          lineColor: 'rgba(207,161,34,0.30)',
          numberColor: 'rgba(207,161,34,0.12)',
          nodeColor: '#0a1628',
          steps: [
            { id: 'p1', title: 'Introduction', description: 'Our first step is to gain a deeper understanding of you, your financial history, personality, objectives, and goals.' },
            { id: 'p2', title: 'Discover Your Needs', description: 'We will help you discover your core values and vision for what your ideal life might look like, which helps to build the foundation for a strong financial plan.' },
            { id: 'p3', title: 'Strategy & Recommendations', description: 'After gaining a thorough understanding of your needs, our team will develop a customized strategy to help you achieve your financial objectives.' },
            { id: 'p4', title: 'Implementation', description: 'After confirming that you are content with our proposed strategies, we will assist you in implementing your financial plan.' },
            { id: 'p5', title: 'Track Progress', description: 'Our team will monitor your progress to ensure that your financial plan remains aligned with your goals by assessing any changes in your life or the market.' },
          ],
          elementStyles: {
            overline: { color: '#cfa122', fontFamily: SANS },
            title: { fontFamily: SERIF, color: '#ffffff', fontWeight: '300' },
            subtitle: { color: 'rgba(255,255,255,0.5)', fontFamily: SANS },
            stepTitle: { fontFamily: SERIF, color: '#ffffff' },
            stepDescription: { color: 'rgba(255,255,255,0.5)', fontFamily: SANS },
          },
        },
      ],
    },

    // ══════════════════════════════════════════════════════════════════
    // 5. TEAM — team-showcase block (new custom type)
    // ══════════════════════════════════════════════════════════════════
    {
      type: 'section',
      id: 'team-section',
      order: 5,
      backgroundColor: '#fafbfd',
      paddingTop: '112px',
      paddingBottom: '32px',
      paddingLeft: '0px',
      paddingRight: '0px',
      maxWidth: '1280px',
      blocks: [
        {
          type: 'team-showcase',
          id: 'team-members',
          order: 1,
          overline: 'Who We Are',
          title: 'Meet Your Advisors',
          subtitle: "Every decision and every detail is made with the best interest of our clients in mind \u2014 that\u2019s why we created Crossover Capital.",
          bioPanelColor: '#faf8f5',
          accentColor: '#cfa122',
          photoFilter: 'sepia(0.08) saturate(1.05) brightness(0.97)',
          members: [
            {
              id: 'alex',
              name: 'Alexander Pron',
              title: 'Founder, Wealth Strategist',
              credentials: 'CFP\u00AE, CBDA',
              photo: `${IMG}/ALEX_Web-500x660.jpg`,
              bio: "Alex brings deep expertise in comprehensive financial planning and digital assets. Trained in Wharton\u2019s Blockchain Analytics and Digital Assets program, he combines traditional wealth management with cutting-edge cryptocurrency knowledge to deliver holistic financial guidance.",
              specialties: ['Comprehensive Financial Planning', 'Digital Asset Strategy', 'Tax Planning', 'Investment Management'],
            },
            {
              id: 'tasha',
              name: 'Tasha M. Shadle',
              title: 'Founder, Wealth Management Advisor',
              credentials: 'CIMA\u00AE, CDFA\u00AE, CBDA',
              photo: `${IMG}/TASHA_Web-500x660.jpg`,
              bio: "Tasha specializes in guiding clients through complex financial transitions, particularly divorce. Her empathetic approach and deep expertise in investment management and divorce financial planning ensure clients feel supported during life\u2019s most challenging moments.",
              specialties: ['Divorce Financial Planning', 'Investment Management', 'Estate Planning', 'Client Advocacy'],
            },
          ],
          elementStyles: {
            overline: { color: '#cfa122', fontFamily: SANS },
            title: { fontFamily: SERIF, color: '#0a1628', fontWeight: '300' },
            subtitle: { color: '#64748b', fontFamily: SANS },
            memberName: { fontFamily: SERIF, color: '#0a1628' },
            memberTitle: { fontFamily: SANS },
            memberCredentials: { color: '#64748b', fontFamily: SANS },
            memberBio: { color: 'rgba(30,41,59,0.7)', fontFamily: SANS },
            specialtyTag: { backgroundColor: 'rgba(10,22,40,0.04)', color: 'rgba(10,22,40,0.6)', borderWidth: '1px', borderColor: 'rgba(10,22,40,0.06)', borderStyle: 'solid' },
          },
        },
      ],
    },

    // ══════════════════════════════════════════════════════════════════
    // 6. TESTIMONIALS — cream bg, two featured quotes
    // ══════════════════════════════════════════════════════════════════
    {
      type: 'section',
      id: 'testimonials-section',
      order: 6,
      backgroundColor: '#f8f5f0',
      paddingTop: '128px',
      paddingBottom: '128px',
      paddingLeft: '24px',
      paddingRight: '24px',
      maxWidth: '900px',
      blocks: [
        { type: 'text', id: 'testi-overline', order: 1, content: 'Client Stories', alignment: 'center' as const,
          style: { color: '#cfa122', fontSize: '0.875rem', letterSpacing: '0.3em', textTransform: 'uppercase' as const, margin: '0 0 16px 0' } },
        { type: 'heading', id: 'testi-heading', order: 2, content: 'What Our Clients Say', level: 2 as const, alignment: 'center' as const,
          style: { fontFamily: SERIF, fontSize: '3rem', fontWeight: '300', color: '#0a1628', margin: '0 0 48px 0' } },
        {
          type: 'testimonial', id: 'testi-1', order: 3,
          quote: "\u201CWe\u2019ve worked with Alex on how to save for the future for our kids, for my nephews, for my nieces, and ensure that the family is passing things down the correct way, efficiently and tax effectively.\u201D",
          author: 'On family wealth planning',
          style: { textAlign: 'center' as const },
          elementStyles: {
            quote: { fontFamily: SERIF, fontSize: '1.875rem', color: 'rgba(10,22,40,0.8)', lineHeight: '1.5', fontStyle: 'italic' },
            author: { color: '#cfa122', fontSize: '0.8125rem', letterSpacing: '0.15em', textTransform: 'uppercase' as const },
            quoteIcon: { color: '#cfa122', opacity: '0.06', width: '64px', height: '64px' },
          },
        },
      ],
    },

    // ══════════════════════════════════════════════════════════════════
    // 7. INSIGHTS — ice-light bg, featured article + list
    // ══════════════════════════════════════════════════════════════════
    {
      type: 'section',
      id: 'insights-section',
      order: 7,
      backgroundColor: '#f4f7fc',
      paddingTop: '112px',
      paddingBottom: '112px',
      paddingLeft: '24px',
      paddingRight: '24px',
      maxWidth: '1280px',
      blocks: [
        {
          type: 'columns', id: 'insights-hdr', order: 1, gap: 'lg' as const, stackOnMobile: true,
          columns: [
            { id: 'ins-l', width: '60%', verticalAlign: 'bottom' as const, blocks: [
              { type: 'divider', id: 'ins-gold-line', order: 0,
                style: { width: '40px', height: '2px', customCSS: 'background: linear-gradient(to right, #cfa122, #dbb440cc); border: none', margin: '0 0 24px 0' } },
              { type: 'text', id: 'ins-ov', order: 1, content: 'Knowledge Center',
                style: { color: '#cfa122', fontSize: '0.875rem', letterSpacing: '0.3em', textTransform: 'uppercase' as const, margin: '0 0 16px 0' } },
              { type: 'heading', id: 'ins-h', order: 2, content: 'Recent Insights', level: 2 as const,
                style: { fontFamily: SERIF, fontSize: '3rem', fontWeight: '300', color: '#0a1628' } },
            ]},
            { id: 'ins-r', width: '40%', verticalAlign: 'bottom' as const, blocks: [
              { type: 'text', id: 'ins-d', order: 1,
                content: 'Stay informed with our latest research, analysis, and financial planning insights.',
                style: { color: '#64748b', fontSize: '0.875rem', lineHeight: '1.65', padding: '0 0 6px 0' } },
            ]},
          ],
          style: { margin: '0 0 -8px 0', padding: '0' },
        },
        {
          type: 'section', id: 'ins-featured', order: 2,
          backgroundColor: '#0a1628', paddingTop: '48px', paddingBottom: '48px', paddingLeft: '48px', paddingRight: '48px', maxWidth: '100%',
          blocks: [
            { type: 'text', id: 'ins-fc', order: 1, content: 'Crypto & Divorce',
              style: { color: '#cfa122', fontSize: '0.75rem', backgroundColor: 'rgba(207,161,34,0.2)', padding: '4px 12px', display: 'inline-block' as const, borderRadius: '2px', margin: '0 0 24px 0' } },
            { type: 'heading', id: 'ins-ft', order: 2, level: 3 as const,
              content: 'Hide & Lose Sleep: 14 Ways A Spouse Could Be Hiding Crypto from Your Client',
              style: { fontFamily: SERIF, fontSize: '2rem', color: '#ffffff', lineHeight: '1.3', maxWidth: '768px', margin: '0 0 24px 0' } },
            { type: 'text', id: 'ins-fd', order: 3, content: 'January 11, 2026',
              style: { color: 'rgba(255,255,255,0.4)', fontSize: '0.875rem' } },
          ],
          style: { customCSS: 'background: linear-gradient(135deg, #0a1628, #0f2140, #0a1628)', borderRadius: '2px' },
        },
        { type: 'text', id: 'a2', order: 3, content: 'December 20, 2025  \u2014  Retirement Plans & Their Max Contributions for 2025 & 2026',
          style: { fontFamily: SERIF, fontSize: '1.125rem', color: '#0a1628', padding: '24px 0', customCSS: 'border-bottom: 1px solid rgba(207,161,34,0.1)' } },
        { type: 'text', id: 'a3', order: 4, content: "September 8, 2025  \u2014  Tracing the 'Untraceable': How Crypto Can Be Discovered and Valued in Divorce",
          style: { fontFamily: SERIF, fontSize: '1.125rem', color: '#0a1628', padding: '24px 0', customCSS: 'border-bottom: 1px solid rgba(207,161,34,0.1)' } },
        { type: 'text', id: 'a4', order: 5, content: "August 15, 2025  \u2014  Bitcoin's Correlation (or Lack Thereof) to the U.S. Dollar & Major Indices",
          style: { fontFamily: SERIF, fontSize: '1.125rem', color: '#0a1628', padding: '24px 0', customCSS: 'border-bottom: 1px solid rgba(207,161,34,0.1)' } },
        { type: 'text', id: 'a5', order: 6, content: 'May 2, 2025  \u2014  What is XRP (Ripple) and Why Should I be Wary?',
          style: { fontFamily: SERIF, fontSize: '1.125rem', color: '#0a1628', padding: '24px 0', customCSS: 'border-bottom: 1px solid rgba(207,161,34,0.1)' } },
        { type: 'button', id: 'ins-cta', order: 7, text: 'View All Insights', url: '/insights',
          variant: 'secondary' as const, alignment: 'center' as const, icon: 'arrow_forward', iconPosition: 'right' as const, hoverEffect: 'lift' as const,
          style: { margin: '48px 0 0 0' } },
      ],
    },

    // ══════════════════════════════════════════════════════════════════
    // 8. CONTACT — navy bg, split CTA card
    // ══════════════════════════════════════════════════════════════════
    {
      type: 'section',
      id: 'contact-section',
      order: 8,
      backgroundColor: '#0a1628',
      splitColor: '#f8f5f0',
      splitClipPath: 'polygon(55% 0, 100% 0, 100% 100%, 45% 100%)',
      paddingTop: '112px',
      paddingBottom: '112px',
      paddingLeft: '24px',
      paddingRight: '24px',
      maxWidth: '1280px',
      blocks: [
        {
          type: 'columns', id: 'contact-cols', order: 1, gap: 'lg' as const, stackOnMobile: true,
          columns: [
            { id: 'ct-info', width: '50%', verticalAlign: 'top' as const, blocks: [
              { type: 'text', id: 'ct-ov', order: 1, content: 'Get In Touch',
                style: { color: '#cfa122', fontSize: '0.875rem', letterSpacing: '0.3em', textTransform: 'uppercase' as const, margin: '0 0 24px 0' } },
              { type: 'heading', id: 'ct-h', order: 2, content: 'Start Your Journey', level: 2 as const,
                style: { fontFamily: SERIF, fontSize: '3.5rem', fontWeight: '300', color: '#ffffff', lineHeight: '1.05', margin: '0 0 32px 0' } },
              { type: 'text', id: 'ct-d', order: 3,
                content: 'Ready to take control of your financial future? Schedule a complimentary consultation with our team.',
                style: { color: 'rgba(255,255,255,0.6)', fontSize: '1.125rem', lineHeight: '1.65', maxWidth: '440px', margin: '0 0 56px 0' } },
              { type: 'columns', id: 'ct-addr-row', order: 4, gap: 'sm' as const, stackOnMobile: false,
                columns: [
                  { id: 'ct-addr-icon', width: '48px', verticalAlign: 'top' as const, blocks: [
                    { type: 'text', id: 'ct-addr-ic', order: 1, content: '<span class="material-icons" style="font-size:16px">location_on</span>',
                      style: { width: '40px', height: '40px', borderRadius: '50%', customCSS: 'border: 1px solid rgba(207,161,34,0.3); display: flex; align-items: center; justify-content: center', color: '#cfa122' } },
                  ]},
                  { id: 'ct-addr-txt', width: 'auto', verticalAlign: 'top' as const, blocks: [
                    { type: 'text', id: 'ct-addr-label', order: 1, content: 'Visit Us',
                      style: { color: 'rgba(255,255,255,0.9)', fontSize: '0.875rem', fontWeight: '500', margin: '0 0 4px 0' } },
                    { type: 'text', id: 'ct-addr-val', order: 2, content: '113b Floral Vale Blvd\nYardley, PA 19067',
                      style: { color: 'rgba(255,255,255,0.5)', fontSize: '0.875rem', lineHeight: '1.65' } },
                  ]},
                ],
                style: { margin: '0 0 32px 0', padding: '0' },
              },
              { type: 'columns', id: 'ct-ph-row', order: 5, gap: 'sm' as const, stackOnMobile: false,
                columns: [
                  { id: 'ct-ph-icon', width: '48px', verticalAlign: 'top' as const, blocks: [
                    { type: 'text', id: 'ct-ph-ic', order: 1, content: '<span class="material-icons" style="font-size:16px">phone</span>',
                      style: { width: '40px', height: '40px', borderRadius: '50%', customCSS: 'border: 1px solid rgba(207,161,34,0.3); display: flex; align-items: center; justify-content: center', color: '#cfa122' } },
                  ]},
                  { id: 'ct-ph-txt', width: 'auto', verticalAlign: 'top' as const, blocks: [
                    { type: 'text', id: 'ct-ph-label', order: 1, content: 'Call Us',
                      style: { color: 'rgba(255,255,255,0.9)', fontSize: '0.875rem', fontWeight: '500', margin: '0 0 4px 0' } },
                    { type: 'text', id: 'ct-ph-val', order: 2, content: '215.396.5517',
                      style: { color: 'rgba(255,255,255,0.5)', fontSize: '0.875rem' } },
                  ]},
                ],
                style: { margin: '0 0 32px 0', padding: '0' },
              },
              { type: 'columns', id: 'ct-em-row', order: 6, gap: 'sm' as const, stackOnMobile: false,
                columns: [
                  { id: 'ct-em-icon', width: '48px', verticalAlign: 'top' as const, blocks: [
                    { type: 'text', id: 'ct-em-ic', order: 1, content: '<span class="material-icons" style="font-size:16px">email</span>',
                      style: { width: '40px', height: '40px', borderRadius: '50%', customCSS: 'border: 1px solid rgba(207,161,34,0.3); display: flex; align-items: center; justify-content: center', color: '#cfa122' } },
                  ]},
                  { id: 'ct-em-txt', width: 'auto', verticalAlign: 'top' as const, blocks: [
                    { type: 'text', id: 'ct-em-label', order: 1, content: 'Email Us',
                      style: { color: 'rgba(255,255,255,0.9)', fontSize: '0.875rem', fontWeight: '500', margin: '0 0 4px 0' } },
                    { type: 'text', id: 'ct-em-val', order: 2, content: 'info@crosscapadvisors.com',
                      style: { color: 'rgba(255,255,255,0.5)', fontSize: '0.875rem' } },
                  ]},
                ],
                style: { margin: '0', padding: '0' },
              },
            ]},
            { id: 'ct-card', width: '50%', backgroundColor: '#ffffff', padding: 'lg' as const, verticalAlign: 'top' as const,
              cssClass: 'rounded-sm shadow-lg',
              blocks: [
              { type: 'heading', id: 'cc-t', order: 1, content: 'Free Portfolio Risk Analysis', level: 3 as const,
                style: { fontFamily: SERIF, fontSize: '1.5rem', color: '#0a1628', margin: '0 0 12px 0' } },
              { type: 'text', id: 'cc-d', order: 2,
                content: "Get a comprehensive analysis of your current portfolio\u2019s risk profile. Understand where you stand and how to optimize your investments for your goals.",
                style: { color: 'rgba(10,22,40,0.5)', fontSize: '0.875rem', lineHeight: '1.65', margin: '0 0 32px 0' } },
              { type: 'text', id: 'cc-i', order: 3,
                content: '\u2713  Personalized risk assessment\n\u2713  Portfolio optimization recommendations\n\u2713  Tax efficiency review\n\u2713  Retirement readiness check',
                style: { color: 'rgba(10,22,40,0.7)', fontSize: '0.875rem', lineHeight: '2.2', margin: '0 0 32px 0' } },
              { type: 'button', id: 'cc-b', order: 4, text: 'Request Your Free Analysis', url: '/schedule',
                variant: 'primary' as const, size: 'lg' as const, alignment: 'center' as const,
                icon: 'arrow_forward', iconPosition: 'right' as const, hoverEffect: 'lift' as const },
              { type: 'text', id: 'cc-disc', order: 5, content: 'No obligation \u00B7 100% complimentary',
                alignment: 'center' as const, style: { color: 'rgba(10,22,40,0.3)', fontSize: '0.75rem', margin: '16px 0 0 0' } },
            ]},
          ],
          style: { margin: '-24px 0 0 0', padding: '0' },
        },
      ],
    },

    // ══ No site-footer block here, by design. ══
    // The public site layout (app/sites/[domain]/layout.tsx) renders a universal
    // <SiteFooter /> on every page; embedding a footer block here produced a
    // DOUBLE footer on the home page only. The brand contact info + SEC compliance
    // disclaimer now live in SITE_CONTACT_OVERRIDES ('crosscap-advisors') in that
    // layout so they render site-wide. Prod backfill: fix-double-footer.ts.
  ];
}

importHome().catch(err => { console.error(err); process.exit(1); });
