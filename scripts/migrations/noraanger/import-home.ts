import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });

const WEBSITE_ID = 145;

// ── Premium Color Palette ──────────────────────────────────────────
// Elevated from the original olive green into a richer, warmer palette
const C = {
  // Core brand
  sage: '#5A7A2E',           // Deeper, richer sage green (primary)
  sageLight: '#7DA344',      // Lighter sage for accents
  sageMist: '#EEF2E6',       // Very pale sage tint for backgrounds
  sageFrost: 'rgba(90,122,46,0.06)', // Barely-there sage wash

  // Warm neutrals
  cream: '#FAF8F5',          // Warm cream background
  warmWhite: '#FFFFFF',
  linen: '#F3F0EB',          // Warm linen for alternating sections
  sand: '#E8E2D9',           // Warm border/divider

  // Text hierarchy
  ink: '#1C2417',             // Deep forest-ink for headings
  charcoal: '#3D4A35',       // Warm dark for body text
  stone: '#6B7563',          // Muted text
  pebble: '#99A18F',         // Subtle labels

  // Dark section
  forest: '#1E2B14',         // Deep forest green for dark sections
  forestMid: '#2A3D1C',      // Mid forest green

  // Functional
  white: '#FFFFFF',
};

// Free stock images (Unsplash — free for commercial use, no attribution required)
const IMG = {
  // Hero: Sunlight streaming through green forest — peace, healing, new beginnings
  hero: 'https://images.unsplash.com/photo-1600340053706-32d1278206ef?w=1920&q=80&auto=format&fit=crop',
  // About: Nora's bio photo
  about: 'https://img1.wsimg.com/isteam/ip/03572023-996e-48cd-94e5-399f84efd76d/Profile%20Pic.jpg/:/cr=t:0%25,l:0%25,w:100%25,h:100%25/rs=w:800,cg:true',
  // CTA bg: Forest canopy with light filtering through — hope, growth
  ctaBg: 'https://images.unsplash.com/photo-1758639543049-c251bff86be7?w=1920&q=80&auto=format&fit=crop',
  // Testimonial area: Warm forest path with golden light
  warmPath: 'https://images.unsplash.com/photo-1768037278759-3d5dca93a5b3?w=1920&q=80&auto=format&fit=crop',
  // Plants/wellness: Indoor plant shelf — calm, grounding
  wellness: 'https://images.unsplash.com/photo-1767605562698-f4d51fe5de04?w=600&q=80&auto=format&fit=crop',
};

const BOOKING_URL = 'https://noraanger.com/ola/services/phone-consultation-1';
const PSYCH_TODAY = 'https://www.psychologytoday.com/profile/705400';
const HEADWAY_URL = 'https://care.headway.co/providers/nora-anger';
const MENTAYA_URL = 'http://mentaya.com/c/RsvppPCG1ch5SN98iust';
const CAREER_URL = 'https://noraanger.com/ola/services/private-practice-career-mentorship';

const HP = '32px';
const MW = '1080px';
const MW_NARROW = '720px';

// Typography constants
const SERIF = 'Lusitana, Georgia, serif';
const SANS = 'Lato, sans-serif';

// Reusable overline style
const overline = (color = C.sage) => ({
  color,
  fontFamily: SANS,
  fontSize: '0.6875rem',
  fontWeight: '700',
  letterSpacing: '0.35em',
  textTransform: 'uppercase' as const,
});

async function importHome() {
  const { db } = await import('../../../lib/db');
  const { posts } = await import('../../../lib/db/schema');
  const { eq, and } = await import('drizzle-orm');

  const blocks = [

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 1. HERO SLIDESHOW — Ken Burns, overlay, left-aligned text
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    {
      id: 'hero-slideshow',
      type: 'hero-slideshow',
      order: 1,
      height: '88vh',
      autoplay: false,
      kenBurns: true,
      showDots: false,
      showArrows: false,
      transition: 'fade',
      transitionDuration: 1200,
      slides: [
        {
          id: 'slide-1',
          title: 'Find Your Path<br/>Towards Peace',
          subtitle: 'Nora R. Anger, M.S. — Licensed Professional Counselor',
          description: 'Experienced, compassionate therapy in Delaware County. In-person & virtual sessions available.',
          ctaText: 'Book a Free Consultation',
          ctaLink: BOOKING_URL,
          secondaryCtaText: 'Learn More',
          secondaryCtaLink: '#about-section',
          backgroundImage: IMG.hero,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          overlayColor: '#000000',
          overlayOpacity: 0.6,
          textAlignment: 'left',
        },
      ],
      // Stats bar at the bottom of the hero
      stats: [
        { id: 'stat-exp', value: 'Trauma & Grief', label: 'Specialization' },
        { id: 'stat-loc', value: 'Media, PA', label: 'Delaware County' },
        { id: 'stat-mode', value: 'In-Person & Virtual', label: 'Session Options' },
      ],
      style: {
        customCSS: 'border-bottom: 3px solid rgba(90,122,46,0.2)',
      },
      elementStyles: {
        subtitle: {
          color: '#FFFFFF',
          fontFamily: SANS,
          fontSize: '0.8125rem',
          fontWeight: '700',
          letterSpacing: '0.25em',
          textTransform: 'uppercase' as const,
          customCSS: 'text-shadow: 0 1px 8px rgba(0,0,0,0.7), 0 0 20px rgba(0,0,0,0.3)',
        },
        title: {
          color: C.white,
          fontFamily: SERIF,
          fontSize: '3.25rem',
          fontWeight: '700',
          lineHeight: '1.12',
          letterSpacing: '-0.015em',
          customCSS: 'text-shadow: 0 2px 12px rgba(0,0,0,0.6), 0 4px 30px rgba(0,0,0,0.3)',
        },
        description: {
          color: '#FFFFFF',
          fontFamily: SANS,
          fontSize: '1.0625rem',
          lineHeight: '1.7',
          maxWidth: '480px',
          customCSS: 'text-shadow: 0 1px 8px rgba(0,0,0,0.6), 0 0 20px rgba(0,0,0,0.3)',
        },
        cta: {
          backgroundColor: C.sage,
          color: C.white,
          borderRadius: '28px',
          padding: '15px 40px',
          fontFamily: SANS,
          fontWeight: '700',
          fontSize: '0.8125rem',
          letterSpacing: '0.1em',
          textTransform: 'uppercase' as const,
          customCSS: 'box-shadow: 0 6px 24px rgba(90,122,46,0.4); transition: all 0.3s ease',
        },
        secondaryCta: {
          backgroundColor: 'rgba(255,255,255,0.08)',
          color: C.white,
          borderRadius: '28px',
          padding: '15px 40px',
          fontFamily: SANS,
          fontWeight: '600',
          fontSize: '0.8125rem',
          letterSpacing: '0.1em',
          textTransform: 'uppercase' as const,
          customCSS: 'backdrop-filter: blur(8px); border: 1px solid rgba(255,255,255,0.15); transition: all 0.3s ease',
        },
        statValue: {
          color: C.white,
          fontFamily: SERIF,
          fontSize: '1rem',
          fontWeight: '700',
          customCSS: 'text-shadow: 0 1px 4px rgba(0,0,0,0.5)',
        },
        statLabel: {
          color: 'rgba(255,255,255,0.8)',
          fontFamily: SANS,
          fontSize: '0.75rem',
          fontWeight: '600',
          letterSpacing: '0.1em',
          textTransform: 'uppercase' as const,
          customCSS: 'text-shadow: 0 1px 4px rgba(0,0,0,0.5)',
        },
      },
    },

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 2. ABOUT — Featured content split: text left, image right
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    {
      id: 'about-section',
      type: 'section',
      order: 2,
      backgroundColor: C.cream,
      paddingTop: '100px',
      paddingBottom: '100px',
      paddingLeft: HP,
      paddingRight: HP,
      maxWidth: MW,
      blocks: [
        {
          id: 'about-cols',
          type: 'columns',
          order: 1,
          gap: 'lg',
          stackOnMobile: true,
          columns: [
            {
              id: 'about-col-text',
              width: 55,
              verticalAlign: 'center',
              blocks: [
                {
                  id: 'about-overline',
                  type: 'text',
                  order: 1,
                  content: 'About My Practice',
                  style: { ...overline(), margin: '0 0 16px 0' },
                },
                {
                  id: 'about-heading',
                  type: 'heading',
                  order: 2,
                  content: "Therapy That Goes Beyond the Diagnosis",
                  level: 2,
                  alignment: 'left',
                  style: {
                    color: C.ink,
                    fontFamily: SERIF,
                    fontSize: '2.25rem',
                    fontWeight: '700',
                    lineHeight: '1.2',
                    margin: '0 0 16px 0',
                  },
                },
                {
                  id: 'about-divider',
                  type: 'divider',
                  order: 3,
                  style: {
                    maxWidth: '48px',
                    margin: '0 0 28px 0',
                    borderColor: C.sage,
                    borderTopWidth: '2px',
                  },
                },
                {
                  id: 'about-p1',
                  type: 'text',
                  order: 4,
                  content: 'Are you new to counseling? Have you had a poor experience with therapy in the past? I hope to either introduce you or repair your journey with therapy.',
                  style: {
                    color: C.charcoal,
                    fontFamily: SANS,
                    fontSize: '1.0625rem',
                    lineHeight: '1.85',
                    margin: '0 0 20px 0',
                  },
                },
                {
                  id: 'about-p2',
                  type: 'text',
                  order: 5,
                  content: "Client testimonials indicate that they appreciate my authenticity, warmth and transparency. If you want to try a more holistic approach to therapy before resorting to medication, our goals are aligned. Your current strengths and insights will play a major part in the healing process.",
                  style: {
                    color: C.charcoal,
                    fontFamily: SANS,
                    fontSize: '1.0625rem',
                    lineHeight: '1.85',
                    margin: '0 0 20px 0',
                  },
                },
                {
                  id: 'about-p3',
                  type: 'text',
                  order: 6,
                  content: 'I use a person-centered approach that assumes you are the expert on yourself. I specialize in trauma survivors, grief, parents, postpartum mothers, veterans, workplace trauma, and those with loved ones struggling with addiction or mental illness.',
                  style: {
                    color: C.charcoal,
                    fontFamily: SANS,
                    fontSize: '1.0625rem',
                    lineHeight: '1.85',
                    margin: '0 0 32px 0',
                  },
                },
                {
                  id: 'about-btn',
                  type: 'button',
                  order: 7,
                  text: 'Schedule a Free Consultation',
                  url: BOOKING_URL,
                  variant: 'primary',
                  size: 'lg',
                  alignment: 'left',
                  icon: 'arrow_forward',
                  iconPosition: 'right',
                  hoverEffect: 'lift',
                },
              ],
            },
            {
              id: 'about-col-image',
              width: 45,
              verticalAlign: 'center',
              padding: 'sm',
              blocks: [
                {
                  id: 'about-image',
                  type: 'image',
                  order: 1,
                  url: IMG.about,
                  alt: 'Nora R. Anger, M.S., Licensed Professional Counselor',
                  width: 'full',
                  style: {
                    borderRadius: '16px',
                    customCSS: 'box-shadow: 0 20px 60px rgba(30,43,20,0.12); aspect-ratio: 4/5; object-fit: cover',
                  },
                },
              ],
            },
          ],
        },
      ],
    },

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 3. SERVICES — Premium card grid on warm linen background
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    {
      id: 'services-section',
      type: 'section',
      order: 3,
      backgroundColor: C.warmWhite,
      paddingTop: '100px',
      paddingBottom: '100px',
      paddingLeft: HP,
      paddingRight: HP,
      maxWidth: MW,
      blocks: [
        {
          id: 'services-overline',
          type: 'text',
          order: 1,
          content: 'How I Can Help',
          alignment: 'center',
          style: { ...overline(), margin: '0 0 16px 0' },
        },
        {
          id: 'services-heading',
          type: 'heading',
          order: 2,
          content: 'Counseling Services',
          level: 2,
          alignment: 'center',
          style: {
            color: C.ink,
            fontFamily: SERIF,
            fontSize: '2.25rem',
            fontWeight: '700',
            lineHeight: '1.2',
            margin: '0 0 12px 0',
          },
        },
        {
          id: 'services-subtitle',
          type: 'text',
          order: 3,
          content: 'Specialized, evidence-based approaches tailored to your unique needs and goals.',
          alignment: 'center',
          style: {
            color: C.stone,
            fontFamily: SANS,
            fontSize: '1.0625rem',
            lineHeight: '1.7',
            maxWidth: '540px',
            margin: '0 auto 56px auto',
          },
        },
        {
          id: 'services-grid',
          type: 'card-grid',
          order: 4,
          columns: 3,
          cards: [
            {
              id: 'svc-individual',
              title: 'Individual Counseling',
              description: 'Overcome personal challenges — life transitions, perfectionism, work stressors, relationships, and behavior change. Don\'t wait until you\'re in crisis to make a positive change.',
              icon: 'person',
            },
            {
              id: 'svc-trauma',
              title: 'Trauma Informed Therapy',
              description: 'Feel safe, secure, and rebuild a life worth living. We\'ll explore your narrative, understand triggers, and help you regain a sense of control after traumatic experiences.',
              icon: 'spa',
            },
            {
              id: 'svc-grief',
              title: 'Grief Counseling',
              description: 'Navigate loss — anticipated, sudden, or the complex grief of "grieving the living" through addiction, estrangement, or cognitive conditions. You don\'t have to do this alone.',
              icon: 'favorite_border',
            },
            {
              id: 'svc-group',
              title: 'Group Therapy',
              description: 'Join 8-week support groups for connection and new coping skills. Groups include Mom Support, Grief Support, and a Self-Help Book Club.',
              icon: 'diversity_3',
            },
            {
              id: 'svc-career',
              title: 'Career Mentorship',
              description: 'Pursuing a mental health career? Seeking supervision in PA? Starting a private practice? I help future counselors navigate their path in mental health.',
              icon: 'school',
              link: CAREER_URL,
            },
            {
              id: 'svc-anxiety',
              title: 'Anxiety & Depression',
              description: 'Modalities that focus on enhancing your strengths and honoring your values to address the symptoms adjacent to trauma — anxiety, depression, and overwhelming stress.',
              icon: 'self_improvement',
            },
          ],
          elementStyles: {
            card: {
              backgroundColor: C.cream,
              borderRadius: '16px',
              padding: '40px 32px',
              customCSS: 'box-shadow: 0 1px 3px rgba(30,43,20,0.04); border: 1px solid rgba(232,226,217,0.7); transition: all 0.35s ease',
            },
            cardTitle: {
              color: C.ink,
              fontFamily: SERIF,
              fontSize: '1.1875rem',
              fontWeight: '700',
              lineHeight: '1.3',
            },
            cardDescription: {
              color: C.stone,
              fontFamily: SANS,
              fontSize: '0.9375rem',
              lineHeight: '1.75',
            },
            cardIcon: {
              color: C.sage,
              fontSize: '1.75rem',
              customCSS: `background: ${C.sageMist}; border-radius: 14px; padding: 14px; display: inline-flex`,
            },
          },
        },
      ],
    },

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 4. PROCESS TIMELINE — "Your Healing Journey"
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    {
      id: 'process-section',
      type: 'section',
      order: 4,
      backgroundColor: C.cream,
      paddingTop: '100px',
      paddingBottom: '100px',
      paddingLeft: HP,
      paddingRight: HP,
      maxWidth: MW,
      blocks: [
        {
          id: 'process-timeline',
          type: 'timeline',
          order: 1,
          overline: 'Getting Started',
          title: 'Your Path to Healing',
          subtitle: 'A simple, supportive process from first contact to lasting change.',
          layout: 'alternating',
          lineColor: 'rgba(90,122,46,0.25)',
          numberColor: 'rgba(90,122,46,0.08)',
          nodeColor: C.sage,
          steps: [
            {
              id: 'step-1',
              title: 'Free Phone Consultation',
              description: "We'll start with a brief conversation to discuss your concerns, answer questions, and determine if we're a good fit. This is a no-pressure call — just a chance to connect.",
              number: '01',
            },
            {
              id: 'step-2',
              title: 'Intake & Assessment',
              description: "During your first full session, we'll explore your history, goals, and what you hope to gain from therapy. Together, we'll create a personalized plan that honors your strengths and values.",
              number: '02',
            },
            {
              id: 'step-3',
              title: 'Ongoing Healing',
              description: "Weekly sessions using person-centered, trauma-informed modalities. You'll build coping skills, process experiences, and begin to see meaningful change — at your own pace.",
              number: '03',
            },
          ],
          elementStyles: {
            overline: overline(),
            title: {
              color: C.ink,
              fontFamily: SERIF,
              fontSize: '2.25rem',
              fontWeight: '700',
              lineHeight: '1.2',
            },
            subtitle: {
              color: C.stone,
              fontFamily: SANS,
              fontSize: '1.0625rem',
              lineHeight: '1.7',
            },
            stepTitle: {
              color: C.ink,
              fontFamily: SERIF,
              fontSize: '1.375rem',
              fontWeight: '700',
            },
            stepDescription: {
              color: C.charcoal,
              fontFamily: SANS,
              fontSize: '0.9375rem',
              lineHeight: '1.8',
            },
          },
        },
      ],
    },

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 5. QUOTE / TESTIMONIAL — Warm sage background
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    {
      id: 'quote-section',
      type: 'section',
      order: 5,
      backgroundColor: C.sageMist,
      paddingTop: '80px',
      paddingBottom: '80px',
      paddingLeft: HP,
      paddingRight: HP,
      maxWidth: MW_NARROW,
      blocks: [
        {
          id: 'testimonial-1',
          type: 'testimonial',
          order: 1,
          quote: "I specialize in trauma, grief, and symptoms adjacent to trauma like anxiety, depression, and grief. I utilize modalities that focus on enhancing your strengths and honoring your values.",
          author: 'Nora R. Anger, M.S.',
          role: 'Licensed Professional Counselor',
          elementStyles: {
            quoteIcon: {
              color: C.sage,
              opacity: '0.2',
            },
            quote: {
              color: C.ink,
              fontFamily: SERIF,
              fontSize: '1.375rem',
              fontWeight: '400',
              lineHeight: '1.65',
              customCSS: 'font-style: italic',
            },
            author: {
              color: C.sage,
              fontFamily: SANS,
              fontWeight: '700',
              fontSize: '0.9375rem',
              letterSpacing: '0.05em',
            },
          },
        },
      ],
    },

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 6. INSURANCE & RESOURCES — Clean card grid
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    {
      id: 'resources-section',
      type: 'section',
      order: 6,
      backgroundColor: C.warmWhite,
      paddingTop: '100px',
      paddingBottom: '100px',
      paddingLeft: HP,
      paddingRight: HP,
      maxWidth: MW,
      blocks: [
        {
          id: 'resources-overline',
          type: 'text',
          order: 1,
          content: 'Insurance & Resources',
          alignment: 'center',
          style: { ...overline(), margin: '0 0 16px 0' },
        },
        {
          id: 'resources-heading',
          type: 'heading',
          order: 2,
          content: 'Verify Your Coverage',
          level: 2,
          alignment: 'center',
          style: {
            color: C.ink,
            fontFamily: SERIF,
            fontSize: '2.25rem',
            fontWeight: '700',
            lineHeight: '1.2',
            margin: '0 0 12px 0',
          },
        },
        {
          id: 'resources-subtitle',
          type: 'text',
          order: 3,
          content: 'I accept Aetna and Quest Behavioral Health through Headway, and offer out-of-network support through Mentaya.',
          alignment: 'center',
          style: {
            color: C.stone,
            fontFamily: SANS,
            fontSize: '1.0625rem',
            lineHeight: '1.7',
            maxWidth: '540px',
            margin: '0 auto 56px auto',
          },
        },
        {
          id: 'resources-cards',
          type: 'card-grid',
          order: 4,
          columns: 3,
          cards: [
            {
              id: 'res-psych',
              title: 'Psychology Today',
              description: 'View my full profile, credentials, specialties, and client reviews on Psychology Today.',
              icon: 'psychology',
              link: PSYCH_TODAY,
            },
            {
              id: 'res-headway',
              title: 'Check Insurance (Headway)',
              description: 'Have Aetna or Quest Behavioral Health? Check if you\'re eligible to use insurance to cover therapy sessions.',
              icon: 'verified_user',
              link: HEADWAY_URL,
            },
            {
              id: 'res-mentaya',
              title: 'Out-of-Network (Mentaya)',
              description: 'Save an average of 67% on out-of-network costs. Mentaya handles the hassle of submitting insurance claims for you.',
              icon: 'savings',
              link: MENTAYA_URL,
            },
          ],
          elementStyles: {
            card: {
              backgroundColor: C.cream,
              borderRadius: '16px',
              padding: '40px 32px',
              customCSS: 'border: 1px solid rgba(232,226,217,0.7); transition: all 0.35s ease',
            },
            cardTitle: {
              color: C.ink,
              fontFamily: SERIF,
              fontSize: '1.1875rem',
              fontWeight: '700',
            },
            cardDescription: {
              color: C.stone,
              fontFamily: SANS,
              fontSize: '0.9375rem',
              lineHeight: '1.75',
            },
            cardIcon: {
              color: C.sage,
              fontSize: '1.75rem',
              customCSS: `background: ${C.sageMist}; border-radius: 14px; padding: 14px; display: inline-flex`,
            },
          },
        },
      ],
    },

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 7. CTA — Deep forest green with ambient glow
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    {
      id: 'cta-section',
      type: 'section',
      order: 7,
      backgroundColor: C.forest,
      paddingTop: '96px',
      paddingBottom: '96px',
      paddingLeft: HP,
      paddingRight: HP,
      maxWidth: MW_NARROW,
      color: C.white,
      blocks: [
        {
          id: 'cta-overline',
          type: 'text',
          order: 1,
          content: 'Take the First Step',
          alignment: 'center',
          style: { ...overline(C.sageLight), margin: '0 0 20px 0' },
        },
        {
          id: 'cta-heading',
          type: 'heading',
          order: 2,
          content: 'Ready to Begin<br/>Your Journey?',
          level: 2,
          alignment: 'center',
          style: {
            color: C.white,
            fontFamily: SERIF,
            fontSize: '2.5rem',
            fontWeight: '700',
            lineHeight: '1.15',
            margin: '0 0 20px 0',
          },
        },
        {
          id: 'cta-desc',
          type: 'text',
          order: 3,
          content: "Schedule a free phone consultation to see if we're a good fit. No pressure, no commitment — just a warm conversation about your path forward.",
          alignment: 'center',
          style: {
            color: 'rgba(255,255,255,0.75)',
            fontFamily: SANS,
            fontSize: '1.0625rem',
            lineHeight: '1.75',
            maxWidth: '480px',
            margin: '0 auto 40px auto',
          },
        },
        {
          id: 'cta-btn',
          type: 'button',
          order: 4,
          text: 'Book a Free Consultation',
          url: BOOKING_URL,
          variant: 'primary',
          size: 'lg',
          alignment: 'center',
          icon: 'arrow_forward',
          iconPosition: 'right',
          hoverEffect: 'glow',
          style: { margin: '0 auto' },
        },
        {
          id: 'cta-phone',
          type: 'text',
          order: 5,
          content: 'or call 610-364-5743',
          alignment: 'center',
          style: {
            color: 'rgba(255,255,255,0.45)',
            fontFamily: SANS,
            fontSize: '0.875rem',
            margin: '20px 0 0 0',
            letterSpacing: '0.05em',
          },
        },
      ],
    },

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 8. CONTACT — Elegant two-column layout
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    {
      id: 'contact-section',
      type: 'section',
      order: 8,
      backgroundColor: C.cream,
      paddingTop: '100px',
      paddingBottom: '100px',
      paddingLeft: HP,
      paddingRight: HP,
      maxWidth: MW_NARROW,
      blocks: [
        {
          id: 'contact-overline',
          type: 'text',
          order: 1,
          content: 'Get in Touch',
          alignment: 'center',
          style: { ...overline(), margin: '0 0 16px 0' },
        },
        {
          id: 'contact-heading',
          type: 'heading',
          order: 2,
          content: 'Contact Nora',
          level: 2,
          alignment: 'center',
          style: {
            color: C.ink,
            fontFamily: SERIF,
            fontSize: '2.25rem',
            fontWeight: '700',
            lineHeight: '1.2',
            margin: '0 0 12px 0',
          },
        },
        {
          id: 'contact-divider',
          type: 'divider',
          order: 3,
          style: {
            maxWidth: '48px',
            margin: '0 auto 48px auto',
            borderColor: C.sage,
            borderTopWidth: '2px',
          },
        },
        {
          id: 'contact-columns',
          type: 'columns',
          order: 4,
          gap: 'lg',
          stackOnMobile: true,
          columns: [
            {
              id: 'contact-col-left',
              width: 50,
              verticalAlign: 'top',
              blocks: [
                {
                  id: 'cl-address-label',
                  type: 'text',
                  order: 1,
                  content: 'Office Address',
                  style: { ...overline(), margin: '0 0 10px 0' },
                },
                {
                  id: 'cl-address',
                  type: 'text',
                  order: 2,
                  content: '200 North Monroe Street\nMedia, PA 19063',
                  style: { color: C.charcoal, fontFamily: SANS, fontSize: '1rem', lineHeight: '1.7', margin: '0 0 32px 0' },
                },
                {
                  id: 'cl-hours-label',
                  type: 'text',
                  order: 3,
                  content: 'Office Hours',
                  style: { ...overline(), margin: '0 0 10px 0' },
                },
                {
                  id: 'cl-hours',
                  type: 'text',
                  order: 4,
                  content: 'Monday – Friday\n9:00 AM – 5:00 PM',
                  style: { color: C.charcoal, fontFamily: SANS, fontSize: '1rem', lineHeight: '1.7' },
                },
              ],
            },
            {
              id: 'contact-col-right',
              width: 50,
              verticalAlign: 'top',
              blocks: [
                {
                  id: 'cr-phone-label',
                  type: 'text',
                  order: 1,
                  content: 'Phone',
                  style: { ...overline(), margin: '0 0 10px 0' },
                },
                {
                  id: 'cr-phone',
                  type: 'text',
                  order: 2,
                  content: '610-364-5743',
                  style: { color: C.charcoal, fontFamily: SANS, fontSize: '1rem', lineHeight: '1.7', margin: '0 0 32px 0' },
                },
                {
                  id: 'cr-email-label',
                  type: 'text',
                  order: 3,
                  content: 'Email',
                  style: { ...overline(), margin: '0 0 10px 0' },
                },
                {
                  id: 'cr-email',
                  type: 'text',
                  order: 4,
                  content: 'nora.angerlpc@gmail.com',
                  style: { color: C.charcoal, fontFamily: SANS, fontSize: '1rem', lineHeight: '1.7' },
                },
              ],
            },
          ],
        },
        {
          id: 'contact-btn',
          type: 'button',
          order: 5,
          text: 'Schedule a Consultation',
          url: BOOKING_URL,
          variant: 'primary',
          size: 'lg',
          alignment: 'center',
          icon: 'calendar_today',
          iconPosition: 'left',
          hoverEffect: 'lift',
          style: { margin: '48px auto 0 auto' },
        },
      ],
    },

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 9. FOOTER — Deep forest green
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    {
      id: 'footer-1',
      type: 'site-footer',
      order: 9,
      logoText: 'Delco Counseling',
      tagline: 'Experienced, compassionate therapy in Delaware County, PA.',
      linkGroups: [
        {
          label: 'Services',
          links: [
            { label: 'Individual Counseling', href: '#services-section' },
            { label: 'Trauma Therapy', href: '#services-section' },
            { label: 'Grief Counseling', href: '#services-section' },
            { label: 'Group Therapy', href: '#services-section' },
            { label: 'Career Mentorship', href: CAREER_URL },
          ],
        },
        {
          label: 'Resources',
          links: [
            { label: 'Psychology Today', href: PSYCH_TODAY },
            { label: 'Insurance (Headway)', href: HEADWAY_URL },
            { label: 'Out-of-Network (Mentaya)', href: MENTAYA_URL },
          ],
        },
      ],
      contactInfo: {
        address: '200 North Monroe Street, Media, PA 19063',
        phone: '610-364-5743',
        email: 'nora.angerlpc@gmail.com',
      },
      socialLinks: [
        { platform: 'facebook', url: 'https://www.facebook.com/profile.php?id=61555986377693', label: 'Facebook' },
        { platform: 'instagram', url: 'https://www.instagram.com/nora.anger.lpc', label: 'Instagram' },
        { platform: 'linkedin', url: 'https://www.linkedin.com/in/nora-rafferty-814909123/', label: 'LinkedIn' },
      ],
      copyright: '2026 Delco Counseling & Therapy. All Rights Reserved.',
      backgroundColor: C.forest,
      textColor: 'rgba(255,255,255,0.5)',
      accentColor: C.sageLight,
    },
  ];

  // Check for existing home page
  const existing = await db.select().from(posts)
    .where(and(eq(posts.websiteId, WEBSITE_ID), eq(posts.slug, 'home')));

  const pageSettings = {
    backgroundColor: C.cream,
    fontFamily: SANS,
    color: C.charcoal,
  };

  if (existing.length > 0) {
    await db.update(posts)
      .set({
        content: JSON.stringify({ blocks, pageSettings, version: '1.0' }),
        updatedAt: new Date(),
      })
      .where(eq(posts.id, existing[0].id));
    console.log(`Home page updated: ID ${existing[0].id}`);
  } else {
    const [page] = await db.insert(posts).values({
      title: 'Home',
      slug: 'home',
      postType: 'page',
      content: JSON.stringify({ blocks, pageSettings, version: '1.0' }),
      published: true,
      websiteId: WEBSITE_ID,
      seoTitle: 'Delco Counseling & Therapy | Nora R. Anger, M.S., LPC | Media, PA',
      seoDescription: 'Experienced, compassionate therapy in Delaware County, PA. Specializing in trauma, grief, anxiety, and depression. In-person & virtual sessions. Book a free consultation.',
    }).returning();
    console.log(`Home page created: ID ${page.id}`);
  }

  console.log('\n=== HOME PAGE IMPORT COMPLETE ===');
  process.exit(0);
}

importHome().catch(err => { console.error(err); process.exit(1); });
