import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });

const WEBSITE_ID = 142;

// Color constants — from actual rendered page (predominantly light)
const C = {
  white: '#FFFFFF',
  offWhite: '#F9FAFB',
  darkText: '#1A1629',
  bodyText: '#3D3650',
  mutedText: '#6B6380',
  darkBg: '#362E4F',
  cyan: '#6BE8E8',
  purple: '#A480F2',
  black: '#000000',
  border: '#E8E5EF',
};

const IMG = {
  hero: 'https://cystrategies.co/assets/images/image01.png',
  cody: 'https://cystrategies.co/assets/images/image08.jpg',
};

const CALENDLY = 'https://calendly.com/cody-cystrategies/30min';
const LINKEDIN = 'https://www.linkedin.com/in/codyayork/';

// Consistent horizontal padding for all sections
// Section renders: full-width <section> → inner <div maxWidth + margin:auto>
// paddingLeft/Right go on the outer <section>, maxWidth constrains inner content
const HP = '24px'; // horizontal padding on section
const MW = '1080px'; // standard max-width matching site nav (~max-w-6xl)
const MW_NARROW = '680px'; // narrow text sections

async function importHome() {
  const { db } = await import('../../../lib/db');
  const { posts } = await import('../../../lib/db/schema');
  const { eq, and } = await import('drizzle-orm');

  const blocks = [

    // ━━━━━ HERO ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    {
      id: 'hero-section',
      type: 'section',
      order: 1,
      backgroundColor: C.white,
      paddingTop: '72px',
      paddingBottom: '72px',
      paddingLeft: HP,
      paddingRight: HP,
      maxWidth: MW_NARROW,
      blocks: [
        {
          id: 'hero-logo',
          type: 'image',
          order: 1,
          url: IMG.hero,
          alt: 'CY Strategies',
          width: 'small',
          alignment: 'left',
          style: { maxWidth: '72px', margin: '0 0 24px 0' },
        },
        {
          id: 'hero-heading',
          type: 'heading',
          order: 2,
          content: 'Marketing strategy built for clarity and scale. So your funnel works harder.',
          level: 2,
          alignment: 'left',
          style: {
            color: C.darkText,
            fontFamily: 'Work Sans',
            fontSize: '1.75rem',
            fontWeight: '700',
            lineHeight: '1.35',
            margin: '0 0 20px 0',
          },
        },
        {
          id: 'hero-desc',
          type: 'text',
          order: 3,
          content: 'I design marketing strategies that connect audience, message, channels, and measurement into a system that grows with your business and that teams can execute with confidence.',
          alignment: 'left',
          style: { color: C.bodyText, fontFamily: 'Roboto', fontSize: '0.9375rem', lineHeight: '1.7' },
        },
        {
          id: 'hero-desc2',
          type: 'text',
          order: 4,
          content: 'Marketing works best when every action supports a clear plan.',
          alignment: 'left',
          style: { color: C.bodyText, fontFamily: 'Roboto', fontSize: '0.9375rem', lineHeight: '1.7' },
        },
        {
          id: 'hero-desc3',
          type: 'text',
          order: 5,
          content: 'Consider me your Marketing Strategy Architect.',
          alignment: 'left',
          style: { color: C.bodyText, fontFamily: 'Roboto', fontSize: '0.9375rem', lineHeight: '1.7', margin: '0 0 28px 0' },
        },
        {
          id: 'hero-cta',
          type: 'button',
          order: 6,
          text: 'Schedule time to chat',
          url: CALENDLY,
          variant: 'primary',
          alignment: 'left',
          size: 'md',
          openInNewTab: true,
          icon: 'arrow_forward',
          iconPosition: 'right',
          hoverEffect: 'lift',
        },
      ],
    },

    // ━━━━━ THREE PILLARS: SEE / WHY / STRATEGIES ━━━━━━━━━━━━━━━━━━━━━
    {
      id: 'pillars-section',
      type: 'section',
      order: 2,
      backgroundColor: C.white,
      paddingTop: '48px',
      paddingBottom: '48px',
      paddingLeft: HP,
      paddingRight: HP,
      maxWidth: MW,
      blocks: [
        {
          id: 'pillars-grid',
          type: 'columns',
          order: 1,
          columns: [
            {
              id: 'pillar-see',
              width: '33.33%',
              verticalAlign: 'top',
              padding: 'sm',
              blocks: [
                {
                  id: 'see-heading',
                  type: 'heading',
                  order: 1,
                  content: 'SEE',
                  level: 3,
                  alignment: 'left',
                  style: { color: C.darkText, fontFamily: 'Work Sans', fontSize: '1.125rem', fontWeight: '700', letterSpacing: '0.05em', margin: '0 0 8px 0' },
                },
                {
                  id: 'see-text',
                  type: 'text',
                  order: 2,
                  content: 'Without a clear vision, it\'s difficult to know your direction. A strong business vision is crucial for an effective marketing strategy. I help founders and companies recognize the value of marketing and evaluate ROI to achieve ambitious business goals that have felt out of reach.',
                  style: { color: C.bodyText, fontFamily: 'Roboto', fontSize: '0.875rem', lineHeight: '1.7' },
                },
              ],
            },
            {
              id: 'pillar-why',
              width: '33.33%',
              verticalAlign: 'top',
              padding: 'sm',
              blocks: [
                {
                  id: 'why-heading',
                  type: 'heading',
                  order: 1,
                  content: 'WHY',
                  level: 3,
                  alignment: 'left',
                  style: { color: C.darkText, fontFamily: 'Work Sans', fontSize: '1.125rem', fontWeight: '700', letterSpacing: '0.05em', margin: '0 0 8px 0' },
                },
                {
                  id: 'why-text',
                  type: 'text',
                  order: 2,
                  content: 'Every life coach emphasizes the importance of finding your \'why,\' and your business needs one too. This purpose is the foundation of your brand and is essential for standing out in the market. Together, we\'ll bring your brand to life and ensure consistent representation across all touchpoints.',
                  style: { color: C.bodyText, fontFamily: 'Roboto', fontSize: '0.875rem', lineHeight: '1.7' },
                },
              ],
            },
            {
              id: 'pillar-strategies',
              width: '33.33%',
              verticalAlign: 'top',
              padding: 'sm',
              blocks: [
                {
                  id: 'strategies-heading',
                  type: 'heading',
                  order: 1,
                  content: 'STRATEGIES',
                  level: 3,
                  alignment: 'left',
                  style: { color: C.darkText, fontFamily: 'Work Sans', fontSize: '1.125rem', fontWeight: '700', letterSpacing: '0.05em', margin: '0 0 8px 0' },
                },
                {
                  id: 'strategies-text',
                  type: 'text',
                  order: 2,
                  content: 'Strategy combines vision with purpose to create a clear direction. Is your marketing plan effective? Are you consistently closing sales and analyzing performance in your sales funnel? If not, now is the time to elevate your business. I believe marketing can always work smarter and harder.',
                  style: { color: C.bodyText, fontFamily: 'Roboto', fontSize: '0.875rem', lineHeight: '1.7' },
                },
              ],
            },
          ],
          gap: 'lg',
          stackOnMobile: true,
        },
      ],
    },

    // ━━━━━ ABOUT: Cody York ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    {
      id: 'about-section',
      type: 'section',
      order: 3,
      backgroundColor: C.white,
      paddingTop: '64px',
      paddingBottom: '64px',
      paddingLeft: HP,
      paddingRight: HP,
      maxWidth: MW,
      blocks: [
        {
          id: 'about-columns',
          type: 'columns',
          order: 1,
          columns: [
            {
              id: 'about-photo-col',
              width: '30%',
              verticalAlign: 'top',
              padding: 'sm',
              blocks: [
                {
                  id: 'about-photo',
                  type: 'image',
                  order: 1,
                  url: IMG.cody,
                  alt: 'Cody York - CY Strategies',
                  width: 'full',
                  style: { borderRadius: '50%', maxWidth: '200px' },
                },
              ],
            },
            {
              id: 'about-text-col',
              width: '70%',
              verticalAlign: 'top',
              padding: 'sm',
              blocks: [
                {
                  id: 'about-heading',
                  type: 'heading',
                  order: 1,
                  content: 'I\'m Cody York.',
                  level: 2,
                  style: { color: C.darkText, fontFamily: 'Work Sans', fontSize: '1.75rem', fontWeight: '700', margin: '0 0 12px 0' },
                },
                {
                  id: 'about-body',
                  type: 'text',
                  order: 2,
                  content: 'I reside in Durham, North Carolina, supporting clients worldwide. I have been in marketing for over 16 years, with experience in agencies (serving large and small clients), leading university marketing efforts, and managing events marketing for a large software company. Now, I\'m leveraging my enterprise-grade marketing expertise to assist companies at a pivotal growth moment by seizing opportunities and enhancing their marketing effectiveness.',
                  style: { color: C.bodyText, fontFamily: 'Roboto', fontSize: '0.9375rem', lineHeight: '1.75', margin: '0 0 20px 0' },
                },
                {
                  id: 'about-cta',
                  type: 'button',
                  order: 3,
                  text: 'Connect on LinkedIn',
                  url: LINKEDIN,
                  variant: 'outline',
                  size: 'md',
                  openInNewTab: true,
                  icon: 'open_in_new',
                  iconPosition: 'right',
                  hoverEffect: 'fill',
                },
              ],
            },
          ],
          gap: 'lg',
          stackOnMobile: true,
        },
      ],
    },

    // ━━━━━ SERVICES ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // CardGridBlockRender adds its own py-16, so reduce section padding
    {
      id: 'services-section',
      type: 'section',
      order: 4,
      backgroundColor: C.offWhite,
      paddingTop: '48px',
      paddingBottom: '16px', // card-grid adds py-16 (64px) internally
      paddingLeft: HP,
      paddingRight: HP,
      maxWidth: MW,
      blocks: [
        {
          id: 'services-heading',
          type: 'heading',
          order: 1,
          content: 'What exactly is marketing strategy consulting? What I help businesses do:',
          level: 2,
          alignment: 'left',
          style: { color: C.darkText, fontFamily: 'Work Sans', fontSize: '1.375rem', fontWeight: '700', lineHeight: '1.35', margin: '0 0 12px 0' },
        },
        {
          id: 'services-intro',
          type: 'text',
          order: 2,
          content: 'Most businesses are active in their marketing, but lack clarity on who they are targeting, what message matters most, or how success is measured. Without a clear strategy, effort becomes fragmented and results are inconsistent. I work upstream of tactics to help businesses define direction before investing further in execution.',
          alignment: 'left',
          style: { color: C.bodyText, fontFamily: 'Roboto', fontSize: '0.9375rem', lineHeight: '1.7' },
        },
        {
          id: 'services-grid',
          type: 'card-grid',
          order: 3,
          columns: 3,
          cards: [
            { id: 'svc-audits', title: 'Audits & Assessments', description: 'To figure out what\'s going on, let\'s take a closer look at the details together.', icon: 'fact_check' },
            { id: 'svc-strategy', title: 'Strategy & Planning', description: 'Without a marketing strategy, you lack a roadmap. Without a destination, it\'s difficult to seek directions.', icon: 'route' },
            { id: 'svc-funnel', title: 'Funnel Optimization', description: 'If you need more leads to become clients, enhancing your marketing funnel is the most effective way to engage your audience.', icon: 'filter_alt' },
            { id: 'svc-digital', title: 'Digital Campaigns', description: 'Unsure if your digital campaigns are effective or which platforms to choose? I can help optimize a tailored campaign.', icon: 'campaign' },
            { id: 'svc-brand', title: 'Brand Strategy', description: 'Your brand is your strongest asset -- maximize its potential with a clear strategy first.', icon: 'palette' },
            { id: 'svc-martech', title: 'Marketing Technology', description: 'The technologies managing your business are crucial, even if unseen. Ensure your tools are integrated and functioning correctly.', icon: 'settings_suggest' },
          ],
          elementStyles: {
            card: {
              backgroundColor: C.white,
              borderRadius: '12px',
              padding: '24px',
              borderWidth: '1px',
              borderColor: C.border,
              customCSS: 'box-shadow: 0 1px 4px rgba(0,0,0,0.04)',
            },
            cardTitle: { color: C.darkText, fontFamily: 'Work Sans', fontWeight: '600', fontSize: '1rem' },
            cardDescription: { color: C.bodyText, fontFamily: 'Roboto', fontSize: '0.875rem', lineHeight: '1.6' },
            cardIcon: { color: C.darkText },
          },
        },
        {
          id: 'services-cta',
          type: 'button',
          order: 4,
          text: 'Let\'s check what you need together',
          url: CALENDLY,
          variant: 'primary',
          alignment: 'left',
          size: 'md',
          openInNewTab: true,
          icon: 'check_circle',
          iconPosition: 'left',
          hoverEffect: 'lift',
        },
      ],
    },

    // ━━━━━ TRUST / METAPHOR — THE ONLY DARK SECTION ━━━━━━━━━━━━━━━━
    {
      id: 'trust-section',
      type: 'section',
      order: 5,
      backgroundColor: C.darkBg,
      paddingTop: '80px',
      paddingBottom: '80px',
      paddingLeft: HP,
      paddingRight: HP,
      maxWidth: MW_NARROW,
      blocks: [
        {
          id: 'trust-heading',
          type: 'heading',
          order: 1,
          content: 'Marketing doesn\'t have to be crazy',
          level: 2,
          alignment: 'center',
          style: { color: C.white, fontFamily: 'Work Sans', fontSize: '1.75rem', fontWeight: '700', margin: '0 0 6px 0' },
        },
        {
          id: 'trust-subheading',
          type: 'text',
          order: 2,
          content: 'It simply has to work.',
          alignment: 'center',
          style: { color: C.white, fontFamily: 'Work Sans', fontSize: '1.0625rem', fontWeight: '500', margin: '0 0 24px 0' },
        },
        {
          id: 'trust-body',
          type: 'text',
          order: 3,
          content: 'Crafting a winning marketing strategy doesn\'t have to feel like leaping off a bridge with just a cord to catch you. When you fuse marketing with the right tech to hit your goals, you won\'t need a safety harness because I\'ve got your back. Just like the bungee cord provides backup, you will have a reliable (and fearless) expert to protect your marketing efforts when we collaborate.',
          alignment: 'center',
          style: { color: 'rgba(255,255,255,0.8)', fontFamily: 'Roboto', fontSize: '0.9375rem', lineHeight: '1.75' },
        },
        {
          id: 'trust-spacer',
          type: 'spacer',
          order: 4,
          height: 'sm',
        },
        {
          id: 'trust-cta',
          type: 'button',
          order: 5,
          text: 'Take the leap',
          url: CALENDLY,
          variant: 'primary',
          alignment: 'center',
          size: 'md',
          openInNewTab: true,
          icon: 'arrow_forward',
          iconPosition: 'right',
          hoverEffect: 'glow',
        },
      ],
    },

    // ━━━━━ CONTACT / FINAL CTA ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    {
      id: 'contact-section',
      type: 'section',
      order: 6,
      backgroundColor: C.white,
      paddingTop: '64px',
      paddingBottom: '64px',
      paddingLeft: HP,
      paddingRight: HP,
      maxWidth: MW_NARROW,
      blocks: [
        {
          id: 'contact-heading',
          type: 'heading',
          order: 1,
          content: 'If you made it this far...',
          level: 2,
          alignment: 'left',
          style: { color: C.darkText, fontFamily: 'Work Sans', fontSize: '1.75rem', fontWeight: '700', margin: '0 0 12px 0' },
        },
        {
          id: 'contact-body',
          type: 'text',
          order: 2,
          content: 'That means you: A. love scrolling B. hate virtual meetings or emailing me directly C. potentially have a fear of commitment or a love for filling out forms (even rarer if it\'s both!) Either way, if you\'re still reading, let\'s connect. I\'ll be happy to review your needs in detail and prepare a custom meeting just for you, including a tailored sports metaphor, a custom joke related to your comment and will list any state capital of your choosing on command.',
          alignment: 'left',
          style: { color: C.bodyText, fontFamily: 'Roboto', fontSize: '0.9375rem', lineHeight: '1.75', margin: '0 0 24px 0' },
        },
        {
          id: 'contact-cta',
          type: 'button',
          order: 3,
          text: 'Schedule a call',
          url: CALENDLY,
          variant: 'primary',
          alignment: 'left',
          size: 'md',
          openInNewTab: true,
          icon: 'calendar_today',
          iconPosition: 'left',
          hoverEffect: 'slide',
        },
        {
          id: 'contact-divider',
          type: 'divider',
          order: 4,
          style: { margin: '28px 0', borderColor: C.border },
        },
        {
          id: 'contact-social',
          type: 'button',
          order: 5,
          text: 'Connect on LinkedIn',
          url: LINKEDIN,
          variant: 'outline',
          alignment: 'left',
          size: 'md',
          openInNewTab: true,
          icon: 'open_in_new',
          iconPosition: 'right',
          hoverEffect: 'fill',
        },
      ],
    },

    // ━━━━━ FOOTER ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    {
      id: 'footer-section',
      type: 'section',
      order: 7,
      backgroundColor: C.offWhite,
      paddingTop: '24px',
      paddingBottom: '24px',
      paddingLeft: HP,
      paddingRight: HP,
      blocks: [
        {
          id: 'footer-text',
          type: 'text',
          order: 1,
          content: 'CY Strategies. All rights reserved.',
          alignment: 'center',
          style: { color: C.mutedText, fontFamily: 'Roboto', fontSize: '0.8125rem' },
        },
      ],
    },
  ];

  const pageContent = JSON.stringify({
    blocks,
    pageSettings: {
      backgroundColor: C.white,
      color: C.darkText,
      fontFamily: 'Roboto',
    },
    version: '1.0',
  });

  const existing = await db.select().from(posts)
    .where(and(eq(posts.websiteId, WEBSITE_ID), eq(posts.slug, 'home')))
    .limit(1);

  if (existing.length > 0) {
    await db.update(posts)
      .set({
        content: pageContent,
        title: 'Home',
        seoTitle: 'CY Strategies | Marketing Strategy Built for Clarity and Scale',
        seoDescription: 'I design marketing strategies that connect audience, message, channels, and measurement into a system that grows with your business. 16+ years enterprise marketing experience.',
        updatedAt: new Date(),
      })
      .where(eq(posts.id, existing[0].id));
    console.log(`Home page updated: ID ${existing[0].id}`);
  } else {
    const [page] = await db.insert(posts).values({
      title: 'Home',
      slug: 'home',
      postType: 'page',
      content: pageContent,
      published: true,
      websiteId: WEBSITE_ID,
      seoTitle: 'CY Strategies | Marketing Strategy Built for Clarity and Scale',
      seoDescription: 'I design marketing strategies that connect audience, message, channels, and measurement into a system that grows with your business. 16+ years enterprise marketing experience.',
    }).returning();
    console.log(`Home page created: ID ${page.id}`);
  }

  console.log('\n=== HOME PAGE IMPORT COMPLETE (v4 - container-aware) ===');
  process.exit(0);
}

importHome().catch(err => { console.error(err); process.exit(1); });
