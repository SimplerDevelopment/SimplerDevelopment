import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });

const WEBSITE_ID = 144;

async function importHome() {
  const { db } = await import('../../../lib/db');
  const { posts } = await import('../../../lib/db/schema');
  const { eq, and } = await import('drizzle-orm');

  // Check if home already exists
  const existing = await db.select().from(posts)
    .where(and(eq(posts.websiteId, WEBSITE_ID), eq(posts.slug, 'home')))
    .limit(1);
  if (existing.length > 0) {
    console.log(`Home page already exists: ID ${existing[0].id} — deleting and re-creating...`);
    await db.delete(posts).where(eq(posts.id, existing[0].id));
  }

  const blocks = [
    // =========================================================================
    // 1. HERO — bg-image, 90px heading, 700px height, Platinum badge
    // =========================================================================
    {
      id: 'hero-1',
      type: 'hero',
      order: 1,
      title: 'DISCOVER A NEW WAY FORWARD',
      description: "We don\u2019t just create custom solutions\u2014we build Slate teams.",
      ctaText: "LET'S TALK SLATE",
      ctaLink: '/contact',
      secondaryCtaText: 'GET BIWEEKLY INSIGHTS',
      secondaryCtaLink: '/true-north',
      backgroundImage: 'https://postcaptain.com/wp-content/uploads/2025/05/home-bg.png',
      style: {
        minHeight: '700px',
        textAlign: 'center' as const,
        customCSS: 'background-size: cover; background-position: center',
      },
      elementStyles: {
        title: {
          color: '#FFFFFF',
          fontFamily: 'Poppins',
          fontSize: '90px',
          fontWeight: '500',
          letterSpacing: '1.8px',
          lineHeight: '99px',
          textTransform: 'uppercase' as const,
          customCSS: 'text-shadow: 0 2px 20px rgba(0,0,0,0.3)',
        },
        description: {
          color: '#FFFFFF',
          fontFamily: 'DM Sans',
          fontSize: '24px',
          fontWeight: '300',
          lineHeight: '1.5',
        },
        cta: {
          backgroundColor: '#FFFFFF',
          color: '#004D80',
          fontFamily: 'Poppins',
          fontWeight: '600',
          fontSize: '16px',
          borderRadius: '8px',
          borderWidth: '2px',
          borderColor: '#FFFFFF',
          borderStyle: 'solid',
          customCSS: 'text-transform: uppercase; letter-spacing: 0.05em; padding: 16px 40px',
        },
        secondaryCta: {
          backgroundColor: 'transparent',
          color: '#FFFFFF',
          borderWidth: '2px',
          borderColor: '#FFFFFF',
          borderStyle: 'solid',
          borderRadius: '8px',
          fontFamily: 'Poppins',
          fontWeight: '600',
          fontSize: '16px',
          customCSS: 'text-transform: uppercase; letter-spacing: 0.05em; padding: 16px 40px',
        },
      },
    },

    // =========================================================================
    // 2. CLIENT LOGOS — white bg, "Trusted by 100+ Colleges & Universities"
    // =========================================================================
    {
      id: 'clients-section',
      type: 'section',
      order: 2,
      backgroundColor: '#FFFFFF',
      paddingTop: '48px',
      paddingBottom: '48px',
      paddingLeft: '24px',
      paddingRight: '24px',
      maxWidth: '1080px',
      blocks: [
        {
          id: 'clients-heading',
          type: 'heading',
          order: 1,
          content: 'TRUSTED BY 100+ COLLEGES & UNIVERSITIES',
          level: 3,
          alignment: 'center' as const,
          style: {
            color: '#004D80',
            fontFamily: 'Poppins',
            fontSize: '16px',
            fontWeight: '700',
            letterSpacing: '0.2em',
            textTransform: 'uppercase' as const,
            margin: '0 0 32px 0',
          },
        },
        {
          id: 'clients-logos',
          type: 'columns',
          order: 2,
          gap: 'lg' as const,
          stackOnMobile: false,
          columns: [
            {
              id: 'logo-col-1',
              width: '16.66%',
              verticalAlign: 'center' as const,
              blocks: [{
                id: 'logo-uc',
                type: 'image',
                order: 1,
                url: 'https://postcaptain.com/wp-content/uploads/2025/06/client-logos-UC.png',
                alt: 'University of Cincinnati',
                alignment: 'center' as const,
                style: { opacity: '0.7', maxHeight: '50px' },
              }],
            },
            {
              id: 'logo-col-2',
              width: '16.66%',
              verticalAlign: 'center' as const,
              blocks: [{
                id: 'logo-cooper',
                type: 'image',
                order: 1,
                url: 'https://postcaptain.com/wp-content/uploads/2025/06/cooperunion.png',
                alt: 'Cooper Union',
                alignment: 'center' as const,
                style: { opacity: '0.7', maxHeight: '50px' },
              }],
            },
            {
              id: 'logo-col-3',
              width: '16.66%',
              verticalAlign: 'center' as const,
              blocks: [{
                id: 'logo-uvm',
                type: 'image',
                order: 1,
                url: 'https://postcaptain.com/wp-content/uploads/2025/06/client-logos-UVM-1.png',
                alt: 'University of Vermont',
                alignment: 'center' as const,
                style: { opacity: '0.7', maxHeight: '50px' },
              }],
            },
            {
              id: 'logo-col-4',
              width: '16.66%',
              verticalAlign: 'center' as const,
              blocks: [{
                id: 'logo-northwestern',
                type: 'image',
                order: 1,
                url: 'https://postcaptain.com/wp-content/uploads/2025/06/client-logos-northwestern-1.png',
                alt: 'Northwestern University',
                alignment: 'center' as const,
                style: { opacity: '0.7', maxHeight: '50px' },
              }],
            },
            {
              id: 'logo-col-5',
              width: '16.66%',
              verticalAlign: 'center' as const,
              blocks: [{
                id: 'logo-carleton',
                type: 'image',
                order: 1,
                url: 'https://postcaptain.com/wp-content/uploads/2025/06/client-logos-carleton-1.png',
                alt: 'Carleton College',
                alignment: 'center' as const,
                style: { opacity: '0.7', maxHeight: '50px' },
              }],
            },
            {
              id: 'logo-col-6',
              width: '16.66%',
              verticalAlign: 'center' as const,
              blocks: [{
                id: 'logo-penn',
                type: 'image',
                order: 1,
                url: 'https://postcaptain.com/wp-content/uploads/2025/06/client-logos-penn-1.png',
                alt: 'University of Pennsylvania',
                alignment: 'center' as const,
                style: { opacity: '0.7', maxHeight: '50px' },
              }],
            },
          ],
        },
      ],
    },

    // =========================================================================
    // 3. SERVICES — "Mapping Smarter Moves" intro + tabbed service details
    // =========================================================================
    {
      id: 'services-section',
      type: 'section',
      order: 3,
      backgroundColor: '#FFFFFF',
      paddingTop: '80px',
      paddingBottom: '0px',
      paddingLeft: '24px',
      paddingRight: '24px',
      maxWidth: '1080px',
      blocks: [
        {
          id: 'services-intro',
          type: 'columns',
          order: 1,
          gap: 'lg' as const,
          columns: [
            {
              id: 'services-intro-left',
              width: '40%',
              verticalAlign: 'center' as const,
              blocks: [
                {
                  id: 'services-overline',
                  type: 'text',
                  order: 1,
                  content: 'OUR SERVICES',
                  style: {
                    color: '#5BA573',
                    fontFamily: 'Poppins',
                    fontSize: '0.75rem',
                    fontWeight: '700',
                    letterSpacing: '0.3em',
                    textTransform: 'uppercase' as const,
                    margin: '0 0 8px 0',
                  },
                },
                {
                  id: 'services-heading',
                  type: 'heading',
                  order: 2,
                  content: 'Mapping Smarter Moves',
                  level: 2,
                  style: {
                    color: '#004D80',
                    fontFamily: 'Poppins',
                    fontSize: '2.5rem',
                    fontWeight: '700',
                    margin: '0',
                  },
                },
              ],
            },
            {
              id: 'services-intro-right',
              width: '60%',
              verticalAlign: 'center' as const,
              blocks: [
                {
                  id: 'services-desc',
                  type: 'text',
                  order: 1,
                  content: "Slate is a transformative platform, but it\u2019s your direction that unlocks its power. With the right guidance and a little momentum, we\u2019ll help you move forward in ways that make your work\u2014and its impact\u2014even more rewarding.",
                  style: {
                    color: '#4B5563',
                    fontFamily: 'DM Sans',
                    fontSize: '1.0625rem',
                    lineHeight: '1.7',
                  },
                },
              ],
            },
          ],
        },
      ],
    },

    // =========================================================================
    // 4. SERVICE CARDS — Implementations / Projects / Support
    // =========================================================================
    {
      id: 'service-cards-section',
      type: 'section',
      order: 4,
      backgroundColor: '#FFFFFF',
      paddingTop: '40px',
      paddingBottom: '80px',
      paddingLeft: '24px',
      paddingRight: '24px',
      maxWidth: '1080px',
      blocks: [
        {
          id: 'service-cards',
          type: 'card-grid',
          order: 1,
          columns: 3,
          cards: [
            {
              id: 'svc-impl',
              title: 'Implementations',
              description: 'Set everyone up for success in Slate. We take a collaborative approach so your team learns by doing.',
              icon: 'rocket_launch',
              link: '/service/implementations',
            },
            {
              id: 'svc-projects',
              title: 'Projects',
              description: 'Ensure smooth execution in Slate. Bring big ideas to life, while we handle the heavy lifting.',
              icon: 'conversion_path',
              link: '/service/projects',
            },
            {
              id: 'svc-support',
              title: 'Support',
              description: 'Access our Slate Captain services. Get expert support on demand, without the bots or ticket queues.',
              icon: 'handshake',
              link: '/service/support',
            },
          ],
          elementStyles: {
            card: {
              backgroundColor: '#FFFFFF',
              borderRadius: '12px',
              borderWidth: '1px',
              borderColor: '#E5E7EB',
              borderStyle: 'solid',
              padding: '36px',
              customCSS: 'box-shadow: 0 4px 24px rgba(0,77,128,0.06); transition: all 0.3s ease',
            },
            cardTitle: {
              color: '#004D80',
              fontFamily: 'Poppins',
              fontWeight: '700',
              fontSize: '1.25rem',
            },
            cardDescription: {
              color: '#4B5563',
              fontFamily: 'DM Sans',
              fontSize: '0.9375rem',
              lineHeight: '1.7',
            },
            cardIcon: {
              color: '#004D80',
              fontSize: '2.5rem',
            },
          },
        },
      ],
    },

    // =========================================================================
    // 5. PORTALS CTA — Light blue bg (#A5C3E6) with PORTALS overline
    // =========================================================================
    {
      id: 'portals-section',
      type: 'section',
      order: 5,
      backgroundColor: '#A5C3E6',
      paddingTop: '80px',
      paddingBottom: '80px',
      paddingLeft: '24px',
      paddingRight: '24px',
      maxWidth: '1080px',
      blocks: [
        {
          id: 'portals-content',
          type: 'columns',
          order: 1,
          gap: 'lg' as const,
          columns: [
            {
              id: 'portals-text-col',
              width: '45%',
              verticalAlign: 'center' as const,
              blocks: [
                {
                  id: 'portals-overline',
                  type: 'text',
                  order: 1,
                  content: 'PORTALS',
                  style: {
                    color: '#004D80',
                    fontFamily: 'Poppins',
                    fontSize: '0.75rem',
                    fontWeight: '700',
                    letterSpacing: '0.3em',
                    textTransform: 'uppercase' as const,
                    margin: '0 0 12px 0',
                  },
                },
                {
                  id: 'portals-heading',
                  type: 'heading',
                  order: 2,
                  content: 'See What\u2019s Possible in Slate',
                  level: 2,
                  style: {
                    color: '#004D80',
                    fontFamily: 'Poppins',
                    fontSize: '2.25rem',
                    fontWeight: '700',
                    margin: '0 0 16px 0',
                  },
                },
                {
                  id: 'portals-desc',
                  type: 'text',
                  order: 3,
                  content: 'Post Captain portals make it easy to create experiences that feel both personal and purposeful.',
                  style: {
                    color: '#004D80',
                    fontFamily: 'DM Sans',
                    fontSize: '1.0625rem',
                    lineHeight: '1.7',
                    margin: '0 0 32px 0',
                  },
                },
                {
                  id: 'portals-btn',
                  type: 'button',
                  order: 4,
                  text: 'LEARN MORE',
                  url: '/service/portals',
                  variant: 'primary' as const,
                  icon: 'arrow_forward',
                  iconPosition: 'right' as const,
                  hoverEffect: 'lift' as const,
                },
              ],
            },
            {
              id: 'portals-image-col',
              width: '55%',
              verticalAlign: 'center' as const,
              blocks: [
                {
                  id: 'portals-preview',
                  type: 'image',
                  order: 1,
                  url: 'https://postcaptain.com/wp-content/uploads/2025/11/Group-39609.png',
                  alt: 'Post Captain portal preview',
                  style: {
                    borderRadius: '12px',
                    customCSS: 'box-shadow: 0 20px 60px rgba(0,77,128,0.15)',
                  },
                },
              ],
            },
          ],
        },
      ],
    },

    // =========================================================================
    // 6. AUDITS — DARK bg (#004D80), AUDITS overline, heading, desc, badges, btn
    // =========================================================================
    {
      id: 'audits-section',
      type: 'section',
      order: 6,
      backgroundColor: '#004D80',
      paddingTop: '80px',
      paddingBottom: '80px',
      paddingLeft: '24px',
      paddingRight: '24px',
      maxWidth: '1080px',
      color: '#FFFFFF',
      blocks: [
        {
          id: 'audits-overline',
          type: 'text',
          order: 1,
          content: 'AUDITS',
          alignment: 'center' as const,
          style: {
            color: '#FFFFFF',
            fontFamily: 'Poppins',
            fontSize: '0.75rem',
            fontWeight: '700',
            letterSpacing: '0.3em',
            textTransform: 'uppercase' as const,
            margin: '0 0 12px 0',
          },
        },
        {
          id: 'audits-heading',
          type: 'heading',
          order: 2,
          content: 'Get More from Your Slate Instance',
          level: 2,
          alignment: 'center' as const,
          style: {
            color: '#FFFFFF',
            fontFamily: 'Poppins',
            fontSize: '2.25rem',
            fontWeight: '700',
            margin: '0 0 16px 0',
          },
        },
        {
          id: 'audits-desc',
          type: 'text',
          order: 3,
          content: 'Uncover solutions and discover what Slate can do for you with a Post Captain audit.',
          alignment: 'center' as const,
          style: {
            color: 'rgba(255,255,255,0.85)',
            fontFamily: 'DM Sans',
            fontSize: '1.0625rem',
            lineHeight: '1.7',
            maxWidth: '680px',
            margin: '0 auto 40px auto',
          },
        },
        {
          id: 'audit-badges',
          type: 'columns',
          order: 4,
          gap: 'md' as const,
          columns: [
            {
              id: 'badge-col-1',
              width: '33.33%',
              verticalAlign: 'center' as const,
              blocks: [{
                id: 'badge-targeted',
                type: 'text',
                order: 1,
                content: 'TARGETED AUDIT',
                alignment: 'center' as const,
                style: {
                  color: '#FFFFFF',
                  fontFamily: 'Poppins',
                  fontSize: '0.8125rem',
                  fontWeight: '600',
                  letterSpacing: '0.1em',
                  padding: '16px 24px',
                  borderWidth: '1px',
                  borderColor: 'rgba(255,255,255,0.3)',
                  borderStyle: 'solid',
                  borderRadius: '40px',
                  textAlign: 'center' as const,
                },
              }],
            },
            {
              id: 'badge-col-2',
              width: '33.33%',
              verticalAlign: 'center' as const,
              blocks: [{
                id: 'badge-database',
                type: 'text',
                order: 1,
                content: 'DATABASE AUDIT',
                alignment: 'center' as const,
                style: {
                  color: '#FFFFFF',
                  fontFamily: 'Poppins',
                  fontSize: '0.8125rem',
                  fontWeight: '600',
                  letterSpacing: '0.1em',
                  padding: '16px 24px',
                  borderWidth: '1px',
                  borderColor: 'rgba(255,255,255,0.3)',
                  borderStyle: 'solid',
                  borderRadius: '40px',
                  textAlign: 'center' as const,
                },
              }],
            },
            {
              id: 'badge-col-3',
              width: '33.33%',
              verticalAlign: 'center' as const,
              blocks: [{
                id: 'badge-org',
                type: 'text',
                order: 1,
                content: 'ORGANIZATION & GOVERNANCE',
                alignment: 'center' as const,
                style: {
                  color: '#FFFFFF',
                  fontFamily: 'Poppins',
                  fontSize: '0.8125rem',
                  fontWeight: '600',
                  letterSpacing: '0.1em',
                  padding: '16px 24px',
                  borderWidth: '1px',
                  borderColor: 'rgba(255,255,255,0.3)',
                  borderStyle: 'solid',
                  borderRadius: '40px',
                  textAlign: 'center' as const,
                },
              }],
            },
          ],
        },
        {
          id: 'audits-btn',
          type: 'button',
          order: 5,
          text: 'LEARN MORE',
          url: '/service/audits',
          variant: 'secondary' as const,
          alignment: 'center' as const,
          icon: 'arrow_forward',
          iconPosition: 'right' as const,
          hoverEffect: 'lift' as const,
          style: { margin: '40px auto 0 auto' },
        },
      ],
    },

    // =========================================================================
    // 7. SOLUTIONS — Green gradient bg, "Charting a Clear Course"
    // =========================================================================
    {
      id: 'solutions-section',
      type: 'section',
      order: 7,
      paddingTop: '80px',
      paddingBottom: '80px',
      paddingLeft: '24px',
      paddingRight: '24px',
      maxWidth: '1080px',
      style: {
        backgroundImage: 'linear-gradient(rgb(168, 213, 176) 0%, rgb(238, 247, 239) 100%)',
      },
      blocks: [
        {
          id: 'solutions-overline',
          type: 'text',
          order: 1,
          content: 'SLATE SOLUTIONS',
          alignment: 'center' as const,
          style: {
            color: '#004D80',
            fontFamily: 'Poppins',
            fontSize: '0.75rem',
            fontWeight: '700',
            letterSpacing: '0.3em',
            textTransform: 'uppercase' as const,
            margin: '0 0 16px 0',
          },
        },
        {
          id: 'solutions-heading',
          type: 'heading',
          order: 2,
          content: 'Charting a Clear Course',
          level: 2,
          alignment: 'center' as const,
          style: {
            color: '#004D80',
            fontFamily: 'Poppins',
            fontSize: '2.5rem',
            fontWeight: '700',
            margin: '0 0 16px 0',
          },
        },
        {
          id: 'solutions-desc',
          type: 'text',
          order: 3,
          content: 'Every institution has unique goals, challenges, and opportunities. We customize our approach to fit your specific needs\u2014whether you\u2019re optimizing admissions, supporting student success, or advancing fundraising.',
          alignment: 'center' as const,
          style: {
            color: '#004D80',
            fontFamily: 'DM Sans',
            fontSize: '1.0625rem',
            lineHeight: '1.7',
            maxWidth: '680px',
            margin: '0 auto 48px auto',
          },
        },
        {
          id: 'solutions-cards',
          type: 'card-grid',
          order: 4,
          columns: 3,
          cards: [
            {
              id: 'sol-admissions',
              title: 'ADMISSIONS',
              description: 'Streamline your enrollment funnel, from inquiry to admitted student, with a Slate instance built for your team.',
              icon: 'school',
              link: '/solution/admissions',
            },
            {
              id: 'sol-success',
              title: 'STUDENT SUCCESS',
              description: 'Build proactive support systems that identify at-risk students early and connect them with the right resources.',
              icon: 'trending_up',
              link: '/solution/student-success',
            },
            {
              id: 'sol-advancement',
              title: 'ADVANCEMENT',
              description: 'Strengthen donor engagement and fundraising outcomes with Slate tools designed for your advancement team.',
              icon: 'volunteer_activism',
              link: '/solution/advancement',
            },
          ],
          elementStyles: {
            card: {
              backgroundColor: '#FFFFFF',
              borderRadius: '16px',
              padding: '36px',
              customCSS: 'box-shadow: 0 8px 32px rgba(0,77,128,0.08); transition: all 0.3s ease',
            },
            cardTitle: {
              color: '#004D80',
              fontFamily: 'Poppins',
              fontWeight: '700',
              fontSize: '1.125rem',
              textTransform: 'uppercase' as const,
              letterSpacing: '0.05em',
            },
            cardDescription: {
              color: '#4B5563',
              fontFamily: 'DM Sans',
              fontSize: '0.9375rem',
              lineHeight: '1.7',
            },
            cardIcon: {
              color: '#5BA573',
              fontSize: '2.5rem',
            },
          },
        },
      ],
    },

    // =========================================================================
    // 8. CASE STUDIES — white bg, 4 stat cards with logos
    // =========================================================================
    {
      id: 'casestudies-section',
      type: 'section',
      order: 8,
      backgroundColor: '#FFFFFF',
      paddingTop: '80px',
      paddingBottom: '80px',
      paddingLeft: '24px',
      paddingRight: '24px',
      maxWidth: '1080px',
      blocks: [
        {
          id: 'cs-heading',
          type: 'heading',
          order: 1,
          content: 'TURNING SLATE INTO A STRATEGIC GROWTH ENGINE',
          level: 2,
          alignment: 'center' as const,
          style: {
            color: '#004D80',
            fontFamily: 'Poppins',
            fontSize: '2.25rem',
            fontWeight: '700',
            textTransform: 'uppercase' as const,
            letterSpacing: '0.02em',
            margin: '0 0 16px 0',
          },
        },
        {
          id: 'cs-desc',
          type: 'text',
          order: 2,
          content: "Finally\u2014a partner who sees the big picture, speaks your language, and helps you create value. While others offer technical support, Post Captain Consulting is the only firm that turns this operational tool into a true engine for growth in higher education.",
          alignment: 'center' as const,
          style: {
            color: '#4B5563',
            fontFamily: 'DM Sans',
            fontSize: '1.0625rem',
            lineHeight: '1.7',
            maxWidth: '720px',
            margin: '0 auto 48px auto',
          },
        },
        // Row 1: WPU + Loyola
        {
          id: 'cs-row1',
          type: 'columns',
          order: 3,
          gap: 'lg' as const,
          columns: [
            {
              id: 'cs-wpu-col',
              width: '50%',
              padding: 'md' as const,
              backgroundColor: '#FFFFFF',
              blocks: [
                {
                  id: 'cs-wpu-stat',
                  type: 'heading',
                  order: 1,
                  content: '83%',
                  level: 3,
                  style: { color: '#004D80', fontFamily: 'Poppins', fontSize: '2.5rem', fontWeight: '700', margin: '0 0 4px 0' },
                },
                {
                  id: 'cs-wpu-label',
                  type: 'text',
                  order: 2,
                  content: 'Increase',
                  style: { color: '#004D80', fontFamily: 'Poppins', fontSize: '1rem', fontWeight: '500', margin: '0 0 16px 0' },
                },
                {
                  id: 'cs-wpu-logo',
                  type: 'image',
                  order: 3,
                  url: 'https://postcaptain.com/wp-content/uploads/2025/06/WPU.svg',
                  alt: 'William Peace University',
                  style: { maxHeight: '60px', maxWidth: '160px' },
                },
              ],
            },
            {
              id: 'cs-loyola-col',
              width: '50%',
              padding: 'md' as const,
              backgroundColor: '#FFFFFF',
              blocks: [
                {
                  id: 'cs-loyola-stat',
                  type: 'heading',
                  order: 1,
                  content: '$965K+',
                  level: 3,
                  style: { color: '#004D80', fontFamily: 'Poppins', fontSize: '2.5rem', fontWeight: '700', margin: '0 0 4px 0' },
                },
                {
                  id: 'cs-loyola-label',
                  type: 'text',
                  order: 2,
                  content: 'Raised',
                  style: { color: '#004D80', fontFamily: 'Poppins', fontSize: '1rem', fontWeight: '500', margin: '0 0 16px 0' },
                },
                {
                  id: 'cs-loyola-logo',
                  type: 'image',
                  order: 3,
                  url: 'https://postcaptain.com/wp-content/uploads/2024/10/Loyola_Logo.jpg',
                  alt: 'Loyola University Maryland',
                  style: { maxHeight: '60px', maxWidth: '160px' },
                },
              ],
            },
          ],
        },
        // Row 2: VCU + Landmark
        {
          id: 'cs-row2',
          type: 'columns',
          order: 4,
          gap: 'lg' as const,
          columns: [
            {
              id: 'cs-vcu-col',
              width: '50%',
              padding: 'md' as const,
              backgroundColor: '#FFFFFF',
              blocks: [
                {
                  id: 'cs-vcu-stat',
                  type: 'heading',
                  order: 1,
                  content: '2 Days',
                  level: 3,
                  style: { color: '#004D80', fontFamily: 'Poppins', fontSize: '2.5rem', fontWeight: '700', margin: '0 0 4px 0' },
                },
                {
                  id: 'cs-vcu-label',
                  type: 'text',
                  order: 2,
                  content: 'of Staff Time Saved',
                  style: { color: '#004D80', fontFamily: 'Poppins', fontSize: '1rem', fontWeight: '500', margin: '0 0 16px 0' },
                },
                {
                  id: 'cs-vcu-logo',
                  type: 'image',
                  order: 3,
                  url: 'https://postcaptain.com/wp-content/uploads/2025/06/VCU-1.webp',
                  alt: 'VCU',
                  style: { maxHeight: '60px', maxWidth: '160px' },
                },
              ],
            },
            {
              id: 'cs-landmark-col',
              width: '50%',
              padding: 'md' as const,
              backgroundColor: '#FFFFFF',
              blocks: [
                {
                  id: 'cs-landmark-stat',
                  type: 'heading',
                  order: 1,
                  content: '5 Years',
                  level: 3,
                  style: { color: '#004D80', fontFamily: 'Poppins', fontSize: '2.5rem', fontWeight: '700', margin: '0 0 4px 0' },
                },
                {
                  id: 'cs-landmark-label',
                  type: 'text',
                  order: 2,
                  content: 'of Historical Data',
                  style: { color: '#004D80', fontFamily: 'Poppins', fontSize: '1rem', fontWeight: '500', margin: '0 0 16px 0' },
                },
                {
                  id: 'cs-landmark-logo',
                  type: 'image',
                  order: 3,
                  url: 'https://postcaptain.com/wp-content/uploads/2025/06/Landmark.png',
                  alt: 'Landmark College',
                  style: { maxHeight: '60px', maxWidth: '160px' },
                },
              ],
            },
          ],
        },
      ],
    },

    // =========================================================================
    // 9. TEAM — white bg, 4 members, team showcase
    // =========================================================================
    {
      id: 'team-section',
      type: 'section',
      order: 9,
      backgroundColor: '#FFFFFF',
      paddingTop: '80px',
      paddingBottom: '40px',
      paddingLeft: '24px',
      paddingRight: '24px',
      maxWidth: '1080px',
      blocks: [
        {
          id: 'team-showcase',
          type: 'team-showcase',
          order: 1,
          title: "Follow Our Team\u2019s Lead",
          subtitle: 'Led by a team of former Slate Captains, Post Captain Consulting combines unparalleled technical expertise with a deep understanding of your unique institutional needs.',
          accentColor: '#004D80',
          bioPanelColor: '#004D80',
          members: [
            {
              id: 'tm-emily',
              name: 'EMILY MYERS',
              title: 'Senior Director, Advancement Solutions',
              photo: 'https://postcaptain.com/wp-content/uploads/2025/04/Emily-Myers-rachel-3-1.png',
              bio: "Slate Captain, Mount St. Mary\u2019s University (2019\u20132023)",
            },
            {
              id: 'tm-chris',
              name: 'CHRIS WILD',
              title: 'Associate Director, Enrollment Solutions',
              photo: 'https://postcaptain.com/wp-content/uploads/2025/04/Chris-Wild-chris-wild.png',
              bio: 'Slate Captain, Goucher College (2017\u20132025)',
            },
            {
              id: 'tm-paula',
              name: 'PAULA SCHAEFER-RILEY',
              title: 'Director, Slate Strategy',
              photo: 'https://postcaptain.com/wp-content/uploads/2025/04/Paula-Schaefer-Riley-paula.png',
              bio: 'Slate Captain, Allegheny College. Product Manager, Technolutions (2019\u20132025)',
            },
            {
              id: 'tm-vinnie',
              name: 'VINNIE RODRIGUEZ',
              title: 'Director, Custom Solutions',
              photo: 'https://postcaptain.com/wp-content/uploads/2025/04/Vinnie-Rodriguez-vinnie.png',
              bio: 'Slate Captain, Jacksonville University (2018\u20132022)',
            },
          ],
          elementStyles: {
            title: {
              color: '#004D80',
              fontFamily: 'Poppins',
              fontSize: '2.5rem',
              fontWeight: '700',
            },
            subtitle: {
              color: '#4B5563',
              fontFamily: 'DM Sans',
              fontSize: '1.0625rem',
              lineHeight: '1.7',
            },
          },
        },
        {
          id: 'team-link',
          type: 'button',
          order: 2,
          text: 'MEET FULL TEAM',
          url: '/why-post-captain#team',
          variant: 'outline' as const,
          alignment: 'center' as const,
          icon: 'arrow_forward',
          iconPosition: 'right' as const,
          hoverEffect: 'lift' as const,
          style: { margin: '32px auto 0 auto' },
        },
      ],
    },

    // =========================================================================
    // 10. CTA — DARK bg (#004D80) with background image
    // =========================================================================
    {
      id: 'cta-section',
      type: 'section',
      order: 10,
      backgroundColor: '#004D80',
      backgroundImage: 'https://postcaptain.com/wp-content/uploads/2025/05/call2actionbg.png',
      backgroundSize: 'cover' as const,
      backgroundPosition: 'center',
      paddingTop: '100px',
      paddingBottom: '100px',
      paddingLeft: '24px',
      paddingRight: '24px',
      maxWidth: '1080px',
      color: '#FFFFFF',
      blocks: [
        {
          id: 'cta-heading',
          type: 'heading',
          order: 1,
          content: 'Your Slate Journey Starts Here',
          level: 2,
          alignment: 'center' as const,
          style: {
            color: '#FFFFFF',
            fontFamily: 'Poppins',
            fontSize: '2.5rem',
            fontWeight: '700',
            margin: '0 0 16px 0',
            customCSS: 'text-shadow: 0 2px 20px rgba(0,0,0,0.3)',
          },
        },
        {
          id: 'cta-desc',
          type: 'text',
          order: 2,
          content: 'Schedule an intro call with a team that truly understands your work.',
          alignment: 'center' as const,
          style: {
            color: 'rgba(255,255,255,0.9)',
            fontFamily: 'DM Sans',
            fontSize: '1.125rem',
            lineHeight: '1.7',
            maxWidth: '600px',
            margin: '0 auto 40px auto',
          },
        },
        {
          id: 'cta-btn',
          type: 'button',
          order: 3,
          text: "LET'S TALK SLATE",
          url: '/contact',
          variant: 'primary' as const,
          alignment: 'center' as const,
          hoverEffect: 'glow' as const,
        },
      ],
    },

    // =========================================================================
    // 11. FOOTER
    // =========================================================================
    {
      id: 'footer-1',
      type: 'site-footer',
      order: 11,
      logoUrl: 'https://postcaptain.com/wp-content/uploads/2024/05/482b161e27250212551fead7a9feaecd1f41c617-scaled.png',
      logoAlt: 'Post Captain Consulting',
      tagline: 'Slate consulting services for higher education.',
      backgroundColor: '#FFFFFF',
      textColor: '#4B5563',
      accentColor: '#004D80',
      linkGroups: [
        {
          label: 'Services',
          links: [
            { label: 'Implementations', href: '/service/implementations' },
            { label: 'Projects', href: '/service/projects' },
            { label: 'Support', href: '/service/support' },
            { label: 'Portals', href: '/service/portals' },
            { label: 'Audits', href: '/service/audits' },
          ],
        },
        {
          label: 'Solutions',
          links: [
            { label: 'Admissions', href: '/solution/admissions' },
            { label: 'Student Success', href: '/solution/student-success' },
            { label: 'Advancement', href: '/solution/advancement' },
          ],
        },
        {
          label: 'Resources',
          links: [
            { label: 'True North', href: '/true-north' },
            { label: 'Why Post Captain', href: '/why-post-captain' },
            { label: 'Contact', href: '/contact' },
          ],
        },
      ],
      socialLinks: [
        { platform: 'linkedin', url: 'https://www.linkedin.com/company/post-captain-consulting/', label: 'LinkedIn' },
      ],
      copyright: '\u00a9 2026 Post Captain Consulting. All rights reserved.',
    },
  ];

  const [page] = await db.insert(posts).values({
    title: 'Home',
    slug: 'home',
    postType: 'page',
    content: JSON.stringify({ blocks, version: '1.0' }),
    published: true,
    websiteId: WEBSITE_ID,
    seoTitle: 'Slate Consulting Services for Higher Education | Post Captain Consulting',
    seoDescription: 'Post Captain Consulting, a Platinum Preferred Partner, supports 100+ colleges, universities, and foundations in achieving mission-critical goals in Slate.',
    ogImage: 'https://postcaptain.com/wp-content/uploads/2025/01/Blue-background-logo-for-website-thumbnail.png',
  }).returning();

  console.log(`Home page created: ID ${page.id}`);
  console.log('\n=== HOME PAGE IMPORT COMPLETE ===');
  process.exit(0);
}

importHome().catch(err => { console.error(err); process.exit(1); });
