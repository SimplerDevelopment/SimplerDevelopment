import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config({ path: '.env' });

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

  // Check if home page already exists
  const [existing] = await db
    .select()
    .from(posts)
    .where(and(eq(posts.slug, 'home'), eq(posts.websiteId, websiteId)))
    .limit(1);

  if (existing) {
    console.log(`Home page already exists: ID ${existing.id}`);
    process.exit(0);
  }

  // ── Build blocks ────────────────────────────────────────────────────

  const blocks = [
    // Block 1: Hero
    {
      type: 'hero',
      id: 'hero-1',
      order: 1,
      title: 'The most trusted AI Care Manager in healthcare',
      subtitle: '24/7 emotionally intelligent care management for Health Plans, Health Systems, Specialty Care, and Pharma',
      ctaText: 'Schedule a Demo',
      ctaLink: '/schedule-a-demo',
      backgroundImage: 'https://ellipsishealth.com/wp-content/themes/ellipsis/assets/images/light_hero.png',
      style: {
        backgroundColor: '#f6f6fc',
        color: '#14111f',
        minHeight: '92vh',
        textAlign: 'center' as const,
      },
      elementStyles: {
        title: {
          fontSize: '3.5rem',
          fontWeight: '700',
          fontFamily: 'Inter',
          letterSpacing: '-0.02em',
          color: '#14111f',
          customCSS: 'text-shadow: 0 2px 10px rgba(0,0,0,0.04)',
        },
        subtitle: {
          fontSize: '1.25rem',
          color: '#636381',
          fontWeight: '400',
          maxWidth: '600px',
          margin: '0 auto',
          lineHeight: '1.7',
        },
        cta: {
          backgroundColor: '#4d34fa',
          color: '#ffffff',
          borderRadius: '28px',
          padding: '15px 40px',
          fontWeight: '600',
          fontSize: '1rem',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          customCSS: 'box-shadow: 0 4px 20px rgba(77,52,250,0.3)',
        },
      },
    },

    // Block 2: Trusted by + Marquee
    {
      type: 'section',
      id: 'trusted-section',
      order: 2,
      backgroundColor: '#ffffff',
      paddingTop: '40px',
      paddingBottom: '40px',
      blocks: [
        {
          type: 'text',
          id: 'trusted-text',
          content: 'Trusted by industry leaders:',
          alignment: 'center',
          style: {
            color: '#636381',
            fontSize: '0.875rem',
            fontWeight: '500',
            textTransform: 'uppercase',
            letterSpacing: '0.15em',
          },
        },
        {
          type: 'marquee',
          id: 'client-logos',
          items: [
            { id: 'logo-cvs', type: 'image', imageUrl: 'https://ellipsishealth.com/wp-content/uploads/2026/cvs-health.png', imageAlt: 'CVS Health' },
            { id: 'logo-optum', type: 'image', imageUrl: 'https://ellipsishealth.com/wp-content/uploads/2026/optum.png', imageAlt: 'Optum' },
            { id: 'logo-duke', type: 'image', imageUrl: 'https://ellipsishealth.com/wp-content/uploads/2026/duke-health.svg', imageAlt: 'Duke Health' },
            { id: 'logo-highmark', type: 'image', imageUrl: 'https://ellipsishealth.com/wp-content/uploads/2026/highmark.png', imageAlt: 'Highmark' },
            { id: 'logo-nemours', type: 'image', imageUrl: 'https://ellipsishealth.com/wp-content/uploads/2026/nemours-childrens-health.png', imageAlt: 'Nemours' },
            { id: 'logo-caremark', type: 'image', imageUrl: 'https://ellipsishealth.com/wp-content/uploads/2026/cvs-caremark.png', imageAlt: 'CVS Caremark' },
            { id: 'logo-genworth', type: 'image', imageUrl: 'https://ellipsishealth.com/wp-content/uploads/2026/genworth.png', imageAlt: 'Genworth' },
            { id: 'logo-virta', type: 'image', imageUrl: 'https://ellipsishealth.com/wp-content/uploads/2026/virta-health.png', imageAlt: 'Virta Health' },
            { id: 'logo-guardant', type: 'image', imageUrl: 'https://ellipsishealth.com/wp-content/uploads/2026/guardant-health.svg', imageAlt: 'Guardant Health' },
            { id: 'logo-agilon', type: 'image', imageUrl: 'https://ellipsishealth.com/wp-content/uploads/2026/agilon-health.svg', imageAlt: 'Agilon Health' },
            { id: 'logo-strive', type: 'image', imageUrl: 'https://ellipsishealth.com/wp-content/uploads/2026/strive-health.svg', imageAlt: 'Strive Health' },
            { id: 'logo-equality', type: 'image', imageUrl: 'https://ellipsishealth.com/wp-content/uploads/2026/04/Equality_Health_Logo.jpg', imageAlt: 'Equality Health' },
          ],
          speed: 40,
          pauseOnHover: true,
          gradient: true,
          gradientColor: '#ffffff',
          autoFill: true,
          gap: '60px',
          style: { height: '60px' },
        },
      ],
    },

    // Block 3: Meet Sage
    {
      type: 'section',
      id: 'meet-sage-section',
      order: 3,
      backgroundColor: '#14111f',
      backgroundImage: 'https://ellipsishealth.com/wp-content/themes/ellipsis/assets/images/meet-sage-new-bg.jpg',
      backgroundSize: 'cover',
      paddingTop: '100px',
      paddingBottom: '100px',
      blocks: [
        {
          type: 'text',
          id: 'sage-overline',
          content: 'PRODUCT',
          alignment: 'center',
          style: {
            color: '#13af8a',
            fontSize: '0.75rem',
            fontWeight: '600',
            letterSpacing: '0.3em',
            textTransform: 'uppercase',
          },
        },
        {
          type: 'heading',
          id: 'sage-heading',
          content: 'Meet Sage: your AI Care Manager',
          level: 2,
          alignment: 'center',
          style: {
            color: '#ffffff',
            fontSize: '2.75rem',
            fontWeight: '700',
            fontFamily: 'Inter',
          },
        },
        {
          type: 'text',
          id: 'sage-desc',
          content: 'Empathetic, consistent, multi-lingual and friendly, Sage makes fully autonomous virtual care management calls',
          alignment: 'center',
          style: {
            color: 'rgba(255,255,255,0.7)',
            fontSize: '1.125rem',
            maxWidth: '600px',
            margin: '0 auto',
            lineHeight: '1.7',
          },
        },
        { type: 'spacer', id: 'sage-spacer', height: 'lg' },
        {
          type: 'card-grid',
          id: 'sage-cards',
          columns: 3,
          cards: [
            {
              id: 'card-engage',
              title: 'Engagements & Enrollment',
              description: 'Program enrollment, benefits overview, eligibility verification, copay check, addressing queries',
              icon: 'group_add',
              image: 'https://ellipsishealth.com/wp-content/uploads/2025/04/icon_meet_sage_1.png',
            },
            {
              id: 'card-assess',
              title: 'Assessments & Surveys',
              description: 'HRAs, Care assessments, HOS, outcomes, HCAHPS, Satisfaction surveys',
              icon: 'assignment',
              image: 'https://ellipsishealth.com/wp-content/uploads/2025/04/icon_meet_sage_2.png',
            },
            {
              id: 'card-clinical',
              title: 'Clinical Support',
              description: 'Care coordination, clinical adherence, Star Rating & Quality Measures, pre/post-discharge check-ins',
              icon: 'medical_services',
              image: 'https://ellipsishealth.com/wp-content/uploads/2025/04/icon_meet_sage_3.png',
            },
          ],
          style: { backgroundColor: 'transparent', color: '#ffffff' },
          elementStyles: {
            card: {
              backgroundColor: 'rgba(255,255,255,0.06)',
              borderRadius: '20px',
              padding: '36px',
              customCSS: 'backdrop-filter: blur(4px); border: 1px solid rgba(255,255,255,0.08)',
            },
            cardTitle: { color: '#ffffff', fontSize: '1.25rem', fontWeight: '600' },
            cardDescription: { color: 'rgba(255,255,255,0.65)', fontSize: '0.9375rem', lineHeight: '1.7' },
          },
        },
      ],
    },

    // Block 4: Stats
    {
      type: 'section',
      id: 'stats-section',
      order: 4,
      backgroundColor: '#f6f6fc',
      paddingTop: '80px',
      paddingBottom: '80px',
      blocks: [
        {
          type: 'stats',
          id: 'home-stats',
          title: 'Results that speak for themselves',
          columns: 3,
          stats: [
            { id: 'stat-1', value: '60%', label: 'Reduction in administrative tasks' },
            { id: 'stat-2', value: '4x', label: 'Return on investment' },
            { id: 'stat-3', value: '6x', label: 'Faster program enrollment' },
          ],
          style: { textAlign: 'center' },
          elementStyles: {
            title: { color: '#14111f', fontSize: '2.25rem', fontWeight: '700', marginBottom: '48px' },
            statValue: {
              color: '#4d34fa',
              fontSize: '3.5rem',
              fontWeight: '800',
              fontFamily: 'Inter',
              customCSS: 'text-shadow: 0 0 30px rgba(77,52,250,0.15)',
            },
            statLabel: { color: '#636381', fontSize: '1rem', fontWeight: '500' },
          },
        },
      ],
    },

    // Block 5: Testimonials
    {
      type: 'section',
      id: 'testimonials-section',
      order: 5,
      backgroundColor: '#ffffff',
      backgroundImage: 'https://ellipsishealth.com/wp-content/themes/ellipsis/assets/images/light_testi.png',
      backgroundSize: 'cover',
      paddingTop: '100px',
      paddingBottom: '100px',
      blocks: [
        {
          type: 'text',
          id: 'testi-overline',
          content: 'TESTIMONIALS',
          alignment: 'center',
          style: {
            color: '#4d34fa',
            fontSize: '0.75rem',
            fontWeight: '600',
            letterSpacing: '0.3em',
            textTransform: 'uppercase',
          },
        },
        {
          type: 'heading',
          id: 'testi-heading',
          content: 'What our partners say',
          level: 2,
          alignment: 'center',
          style: { color: '#14111f', fontSize: '2.25rem', fontWeight: '700' },
        },
        { type: 'spacer', id: 'testi-spacer', height: 'lg' },
        {
          type: 'testimonial',
          id: 'testimonial-1',
          quote: 'When it comes to quality of voice AI agent, customer service, and commitment to clinical excellence, Ellipsis Health is lightyears ahead of the competition.',
          author: 'Patrick Mobley',
          role: 'CEO/Co-Founder',
          company: 'Vivid Health',
          avatar: 'https://ellipsishealth.com/wp-content/uploads/2025/04/patrick-mobley-headshot.png',
          style: { backgroundColor: '#f6f6fc', borderRadius: '20px', padding: '48px' },
          elementStyles: {
            quote: { color: '#14111f', fontSize: '1.25rem', fontStyle: 'italic', lineHeight: '1.8' },
            author: { color: '#14111f', fontWeight: '700' },
            role: { color: '#636381' },
          },
        },
        { type: 'spacer', id: 'testi-spacer-2', height: 'md' },
        {
          type: 'testimonial',
          id: 'testimonial-2',
          quote: 'Our partnership is redefining conversational AI \u2014 driving efficiency, unlocking revenue, and setting a new standard for interactions.',
          author: 'Lisa Shah',
          role: 'CMO',
          company: 'Twin Health',
          avatar: 'https://ellipsishealth.com/wp-content/uploads/2025/04/lisa-shah-headshot.png',
          style: { backgroundColor: '#f6f6fc', borderRadius: '20px', padding: '48px' },
          elementStyles: {
            quote: { color: '#14111f', fontSize: '1.25rem', fontStyle: 'italic', lineHeight: '1.8' },
            author: { color: '#14111f', fontWeight: '700' },
            role: { color: '#636381' },
          },
        },
      ],
    },

    // Block 6: AI Safety
    {
      type: 'section',
      id: 'ai-safety-section',
      order: 6,
      backgroundColor: '#14111f',
      backgroundImage: 'https://ellipsishealth.com/wp-content/themes/ellipsis/assets/images/light_ai_new-com.png',
      backgroundSize: 'cover',
      paddingTop: '100px',
      paddingBottom: '100px',
      blocks: [
        {
          type: 'text',
          id: 'safety-overline',
          content: 'SECURITY',
          alignment: 'center',
          style: {
            color: '#13af8a',
            fontSize: '0.75rem',
            fontWeight: '600',
            letterSpacing: '0.3em',
            textTransform: 'uppercase',
          },
        },
        {
          type: 'heading',
          id: 'safety-heading',
          content: 'AI safety and security: Built for healthcare',
          level: 2,
          alignment: 'center',
          style: { color: '#ffffff', fontSize: '2.25rem', fontWeight: '700' },
        },
        { type: 'spacer', id: 'safety-spacer', height: 'lg' },
        {
          type: 'card-grid',
          id: 'safety-cards',
          columns: 3,
          cards: [
            { id: 'safety-1', title: 'Clinical Oversight', description: 'Clinical oversight of all AI operations', icon: 'medical_services' },
            { id: 'safety-2', title: 'HIPAA & SOC2', description: 'HIPAA and SOC2 Type 2 compliant infrastructure', icon: 'verified_user' },
            { id: 'safety-3', title: 'End-to-End Encryption', description: 'Secure data handling with end-to-end encryption', icon: 'lock' },
            { id: 'safety-4', title: 'Security Audits', description: 'Regular third-party security audits', icon: 'policy' },
            { id: 'safety-5', title: 'Transparent AI', description: 'Transparent AI decision-making processes', icon: 'visibility' },
            { id: 'safety-6', title: 'Continuous Monitoring', description: 'Continuous validation and monitoring', icon: 'monitoring' },
          ],
          style: { backgroundColor: 'transparent', color: '#ffffff' },
          elementStyles: {
            card: {
              backgroundColor: 'rgba(255,255,255,0.04)',
              borderRadius: '16px',
              padding: '32px',
              textAlign: 'center',
              customCSS: 'border: 1px solid rgba(255,255,255,0.06)',
            },
            cardTitle: { color: '#ffffff', fontSize: '1.0625rem', fontWeight: '600' },
            cardDescription: { color: 'rgba(255,255,255,0.6)', fontSize: '0.9375rem', lineHeight: '1.6' },
            icon: { color: '#13af8a', fontSize: '2rem' },
          },
        },
      ],
    },

    // Block 7: Insights
    {
      type: 'section',
      id: 'insights-section',
      order: 7,
      backgroundColor: '#f6f6fc',
      paddingTop: '100px',
      paddingBottom: '100px',
      blocks: [
        {
          type: 'text',
          id: 'insights-overline',
          content: 'INSIGHTS',
          alignment: 'center',
          style: {
            color: '#4d34fa',
            fontSize: '0.75rem',
            fontWeight: '600',
            letterSpacing: '0.3em',
            textTransform: 'uppercase',
          },
        },
        {
          type: 'heading',
          id: 'insights-heading',
          content: 'Latest from Ellipsis Health',
          level: 2,
          alignment: 'center',
          style: { color: '#14111f', fontSize: '2.25rem', fontWeight: '700' },
        },
        { type: 'spacer', id: 'insights-spacer', height: 'lg' },
        {
          type: 'card-grid',
          id: 'insights-cards',
          columns: 3,
          cards: [
            {
              id: 'insight-1',
              title: 'Sage, the Empathetic Agentic AI Solution Changing Care Management',
              description: 'Not just the workflow \u2014 discover how Sage is transforming the care management experience.',
              image: 'https://ellipsishealth.com/wp-content/uploads/2026/01/IMG_6907-copy.png',
              link: '/insights',
            },
            {
              id: 'insight-2',
              title: 'Ellipsis Health and NVIDIA Partner to Deliver More Natural AI Care Management',
              description: 'Partnership enables enhanced speed and transcription accuracy in patient conversations.',
              image: 'https://ellipsishealth.com/wp-content/uploads/2025/11/NVIDIA-blog-thumbnail.png',
              link: '/insights',
            },
            {
              id: 'insight-3',
              title: 'Ellipsis Health and Salesforce Partner to Transform Healthcare',
              description: 'Agentic AI integration brings Sage into Salesforce Health Cloud.',
              image: 'https://ellipsishealth.com/wp-content/uploads/2025/10/dreamforce-use.png',
              link: '/insights',
            },
          ],
          style: {},
          elementStyles: {
            card: {
              backgroundColor: '#ffffff',
              borderRadius: '16px',
              customCSS: 'box-shadow: 0 4px 24px rgba(0,0,0,0.06); overflow: hidden',
            },
            cardTitle: { color: '#14111f', fontSize: '1.0625rem', fontWeight: '600', lineHeight: '1.5' },
            cardDescription: { color: '#636381', fontSize: '0.9375rem', lineHeight: '1.6' },
          },
        },
        { type: 'spacer', id: 'insights-spacer-2', height: 'md' },
        {
          type: 'button',
          id: 'insights-btn',
          text: 'See More Insights',
          url: '/insights',
          variant: 'outline',
          alignment: 'center',
          style: { color: '#4d34fa', borderColor: '#4d34fa', borderRadius: '28px' },
        },
      ],
    },

    // Block 8: CTA
    {
      type: 'cta',
      id: 'home-cta',
      order: 8,
      title: 'Getting started is easy',
      description: 'Ready to see how easily and quickly you can reduce patient backlog?',
      primaryButtonText: 'Schedule a Demo',
      primaryButtonUrl: '/schedule-a-demo',
      backgroundStyle: 'gradient',
      style: {
        backgroundImage: 'linear-gradient(135deg, #4D34FA, #ad34fa)',
        color: '#ffffff',
        padding: '100px 40px',
        borderRadius: '0',
      },
      elementStyles: {
        title: { color: '#ffffff', fontSize: '2.5rem', fontWeight: '700' },
        description: { color: 'rgba(255,255,255,0.85)', fontSize: '1.125rem' },
        primaryButton: {
          backgroundColor: '#ffffff',
          color: '#4d34fa',
          borderRadius: '28px',
          padding: '15px 40px',
          fontWeight: '600',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
        },
      },
    },
  ];

  // ── Insert page ───────────────────────────────────────────────────────

  const [page] = await db.insert(posts).values({
    title: 'Home',
    slug: 'home',
    postType: 'page',
    content: JSON.stringify({ blocks, version: '1.0' }),
    published: false,
    websiteId,
    seoTitle: 'Ellipsis Health - The Most Trusted AI Care Manager in Healthcare',
    seoDescription: 'Emotionally intelligent AI Care Management to elevate your clinical operations. Immediately expands capacity. Reduces costs. Supercharges existing workflows.',
    ogImage: 'https://ellipsishealth.com/wp-content/uploads/2025/05/Yoast-1200x675-Title.jpg',
  }).returning();

  console.log(`Home page created successfully: ID ${page.id}`);
  process.exit(0);
}

importHome().catch(err => {
  console.error(err);
  process.exit(1);
});
