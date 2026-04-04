import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config({ path: '.env' });

// ── Reusable block fragments ──────────────────────────────────────────────

const darkHeroStyle = {
  backgroundColor: '#14111f',
  color: '#ffffff',
  minHeight: '80vh',
  textAlign: 'center' as const,
};

const minimalDarkHeroStyle = {
  ...darkHeroStyle,
  minHeight: '50vh',
};

const darkHeroElementStyles = {
  title: {
    fontSize: '3.5rem',
    fontWeight: '700',
    fontFamily: 'Inter',
    letterSpacing: '-0.02em',
    color: '#ffffff',
  },
  subtitle: {
    fontSize: '1.25rem',
    color: 'rgba(255,255,255,0.7)',
    fontWeight: '400',
    maxWidth: '650px',
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
};

function overline(id: string, text: string, color: string = '#4d34fa') {
  return {
    type: 'text',
    id,
    content: text,
    alignment: 'center',
    style: {
      color,
      fontSize: '0.75rem',
      fontWeight: '600',
      letterSpacing: '0.3em',
      textTransform: 'uppercase',
    },
  };
}

function sectionHeading(id: string, content: string, color: string = '#14111f') {
  return {
    type: 'heading',
    id,
    content,
    level: 2,
    alignment: 'center',
    style: { color, fontSize: '2.25rem', fontWeight: '700', fontFamily: 'Inter' },
  };
}

function spacer(id: string, height: string = 'lg') {
  return { type: 'spacer', id, height };
}

const glassCardStyles = {
  card: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: '20px',
    padding: '36px',
    customCSS: 'backdrop-filter: blur(4px); border: 1px solid rgba(255,255,255,0.08)',
  },
  cardTitle: { color: '#ffffff', fontSize: '1.25rem', fontWeight: '600' },
  cardDescription: { color: 'rgba(255,255,255,0.65)', fontSize: '0.9375rem', lineHeight: '1.7' },
  icon: { color: '#13af8a', fontSize: '2rem' },
};

const lightCardStyles = {
  card: {
    backgroundColor: '#ffffff',
    borderRadius: '16px',
    padding: '36px',
    customCSS: 'box-shadow: 0 4px 24px rgba(0,0,0,0.06)',
  },
  cardTitle: { color: '#14111f', fontSize: '1.25rem', fontWeight: '600' },
  cardDescription: { color: '#636381', fontSize: '0.9375rem', lineHeight: '1.7' },
  icon: { color: '#4d34fa', fontSize: '2rem' },
};

function ctaBlock(id: string, title: string, opts: {
  description?: string;
  primaryButtonText?: string;
  primaryButtonUrl?: string;
} = {}) {
  return {
    type: 'cta',
    id,
    order: 0, // will be set per page
    title,
    description: opts.description ?? 'Ready to see how easily and quickly you can reduce patient backlog?',
    primaryButtonText: opts.primaryButtonText ?? 'Schedule a Demo',
    primaryButtonUrl: opts.primaryButtonUrl ?? '/schedule-a-demo',
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
  };
}

/** AI Safety section reusable across pages */
function aiSafetySection(idPrefix: string) {
  return {
    type: 'section',
    id: `${idPrefix}-safety-section`,
    backgroundColor: '#14111f',
    paddingTop: '100px',
    paddingBottom: '100px',
    blocks: [
      overline(`${idPrefix}-safety-overline`, 'SECURITY', '#13af8a'),
      sectionHeading(`${idPrefix}-safety-heading`, 'AI safety and security: Built for healthcare', '#ffffff'),
      spacer(`${idPrefix}-safety-spacer`),
      {
        type: 'card-grid',
        id: `${idPrefix}-safety-cards`,
        columns: 3,
        cards: [
          { id: `${idPrefix}-s1`, title: 'Clinical Oversight', description: 'Clinical oversight of all AI operations', icon: 'medical_services' },
          { id: `${idPrefix}-s2`, title: 'HIPAA & SOC2', description: 'HIPAA and SOC2 Type 2 compliant infrastructure', icon: 'verified_user' },
          { id: `${idPrefix}-s3`, title: 'End-to-End Encryption', description: 'Secure data handling with end-to-end encryption', icon: 'lock' },
          { id: `${idPrefix}-s4`, title: 'Security Audits', description: 'Regular third-party security audits', icon: 'policy' },
          { id: `${idPrefix}-s5`, title: 'Transparent AI', description: 'Transparent AI decision-making processes', icon: 'visibility' },
          { id: `${idPrefix}-s6`, title: 'Continuous Monitoring', description: 'Continuous validation and monitoring', icon: 'monitoring' },
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
  };
}

// ── Page definitions ──────────────────────────────────────────────────────

interface PageDef {
  title: string;
  slug: string;
  seoTitle: string;
  seoDescription: string;
  blocks: any[];
}

function buildPages(): PageDef[] {
  return [
    // ━━ PAGE 1: Product ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    {
      title: 'Product',
      slug: 'product',
      seoTitle: 'Sage - The Empathetic AI Care Manager | Ellipsis Health',
      seoDescription: 'Sage automates care management while maintaining personalized, empathetic communication with every patient.',
      blocks: [
        {
          type: 'hero',
          id: 'product-hero',
          order: 1,
          title: 'The empathetic AI Care Manager',
          subtitle: 'Sage automates care management while maintaining personalized, empathetic communication with every patient.',
          ctaText: 'Schedule a Demo',
          ctaLink: '/schedule-a-demo',
          style: darkHeroStyle,
          elementStyles: darkHeroElementStyles,
        },
        {
          type: 'section',
          id: 'product-usecases-section',
          order: 2,
          backgroundColor: '#14111f',
          paddingTop: '100px',
          paddingBottom: '100px',
          blocks: [
            overline('product-uc-overline', 'HOW SAGE WORKS', '#13af8a'),
            sectionHeading('product-uc-heading', 'Use Cases', '#ffffff'),
            spacer('product-uc-spacer'),
            {
              type: 'card-grid',
              id: 'product-uc-cards',
              columns: 3,
              cards: [
                {
                  id: 'product-uc-1',
                  title: 'Engagement & Enrollment',
                  description: 'Reduces backlogs and streamlines registration through automated outreach. Sage engages patients, answers questions, and guides enrollment.',
                  icon: 'group_add',
                },
                {
                  id: 'product-uc-2',
                  title: 'Assessments & Surveys',
                  description: 'Conducts clinical assessments (HRAs, Care, PRAPARE) and surveys (HOS, NPS, HCAHPS) through conversational AI.',
                  icon: 'assignment',
                },
                {
                  id: 'product-uc-3',
                  title: 'Clinical Support',
                  description: 'Care coordination, clinical adherence, Star Rating & Quality Measures, pre and post-discharge check-ins, transitions of care.',
                  icon: 'medical_services',
                },
              ],
              style: { backgroundColor: 'transparent', color: '#ffffff' },
              elementStyles: glassCardStyles,
            },
          ],
        },
        {
          type: 'section',
          id: 'product-impl-section',
          order: 3,
          backgroundColor: '#f6f6fc',
          paddingTop: '100px',
          paddingBottom: '100px',
          blocks: [
            overline('product-impl-overline', 'IMPLEMENTATION'),
            sectionHeading('product-impl-heading', 'Streamlined Implementation'),
            spacer('product-impl-spacer'),
            {
              type: 'card-grid',
              id: 'product-impl-cards',
              columns: 4,
              cards: [
                { id: 'product-impl-1', title: 'Rapid Onboarding', description: 'Immediate setup post-contract with phased rollout', icon: 'rocket_launch' },
                { id: 'product-impl-2', title: 'White Glove Support', description: 'Collaborative refinement with custom prompt development', icon: 'support_agent' },
                { id: 'product-impl-3', title: 'Simple Integration', description: 'EHR/case management connectivity with API-first architecture', icon: 'integration_instructions' },
                { id: 'product-impl-4', title: 'Partnership Approach', description: 'Comprehensive support with joint call monitoring and continuous refinement', icon: 'handshake' },
              ],
              style: {},
              elementStyles: lightCardStyles,
            },
          ],
        },
        { ...aiSafetySection('product'), order: 4 },
        { ...ctaBlock('product-cta', 'Getting started is easy'), order: 5 },
      ],
    },

    // ━━ PAGE 2: Solutions ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    {
      title: 'Solutions',
      slug: 'solutions',
      seoTitle: 'Healthcare AI Solutions | Ellipsis Health',
      seoDescription: 'Transform healthcare operations with a 24x7 Care Management team.',
      blocks: [
        {
          type: 'hero',
          id: 'solutions-hero',
          order: 1,
          title: 'Transform healthcare operations with a 24x7 Care Management team',
          ctaText: 'Schedule a Demo',
          ctaLink: '/schedule-a-demo',
          style: darkHeroStyle,
          elementStyles: darkHeroElementStyles,
        },
        {
          type: 'section',
          id: 'solutions-who-section',
          order: 2,
          backgroundColor: '#f6f6fc',
          paddingTop: '100px',
          paddingBottom: '100px',
          blocks: [
            overline('solutions-who-overline', 'SOLUTIONS'),
            sectionHeading('solutions-who-heading', 'Who we serve'),
            spacer('solutions-who-spacer'),
            {
              type: 'card-grid',
              id: 'solutions-who-cards',
              columns: 2,
              cards: [
                { id: 'sol-who-1', title: 'Health Plans', description: 'Streamline member outreach, reduce call center volume, enhance satisfaction. Close gaps in care and improve HEDIS performance.', icon: 'health_and_safety' },
                { id: 'sol-who-2', title: 'Health Systems', description: 'Maximize efficiency while controlling costs. Enable staff to practice at top of license with timely outreach and consistent messaging.', icon: 'local_hospital' },
                { id: 'sol-who-3', title: 'Specialty Care Managers', description: 'Expand capacity for complex cases while containing costs. Deliver consistent, high-quality, empathetic messaging.', icon: 'psychology' },
                { id: 'sol-who-4', title: 'Patients', description: 'Around-the-clock accessibility. Sage can call or patients can call Sage. Simplified enrollment and personalized support.', icon: 'person' },
              ],
              style: {},
              elementStyles: lightCardStyles,
            },
          ],
        },
        {
          type: 'section',
          id: 'solutions-integration-section',
          order: 3,
          backgroundColor: '#ffffff',
          paddingTop: '100px',
          paddingBottom: '100px',
          blocks: [
            overline('solutions-int-overline', 'INTEGRATION'),
            sectionHeading('solutions-int-heading', 'Seamless Integration'),
            {
              type: 'text',
              id: 'solutions-int-text',
              content: 'Sage seamlessly integrates with existing healthcare infrastructure, connecting to your EMR, CRM, and other systems with minimal setup.',
              alignment: 'center',
              style: {
                color: '#636381',
                fontSize: '1.125rem',
                maxWidth: '650px',
                margin: '0 auto',
                lineHeight: '1.7',
              },
            },
            spacer('solutions-int-spacer'),
            {
              type: 'card-grid',
              id: 'solutions-int-cards',
              columns: 4,
              cards: [
                { id: 'sol-int-1', title: 'EMR Integration', description: '', icon: 'clinical_notes' },
                { id: 'sol-int-2', title: 'CRM Integration', description: '', icon: 'hub' },
                { id: 'sol-int-3', title: 'HIPAA Compliant', description: '', icon: 'verified_user' },
                { id: 'sol-int-4', title: 'Turnkey Implementation', description: '', icon: 'settings_suggest' },
              ],
              style: {},
              elementStyles: lightCardStyles,
            },
          ],
        },
        { ...ctaBlock('solutions-cta', 'Getting started is easy'), order: 4 },
      ],
    },

    // ━━ PAGE 3: About Us ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    {
      title: 'About Us',
      slug: 'about-us',
      seoTitle: 'About Ellipsis Health - Connecting Dots to a Healthier Future',
      seoDescription: 'Founded in San Francisco, Ellipsis Health delivers empathetic AI solutions that improve care operations.',
      blocks: [
        {
          type: 'hero',
          id: 'about-hero',
          order: 1,
          title: 'Connecting the dots to a healthier and happier future',
          subtitle: 'Founded in San Francisco and powered by a passionate, global team',
          style: darkHeroStyle,
          elementStyles: darkHeroElementStyles,
        },
        {
          type: 'section',
          id: 'about-mission-section',
          order: 2,
          backgroundColor: '#ffffff',
          paddingTop: '100px',
          paddingBottom: '100px',
          blocks: [
            overline('about-mission-overline', 'OUR MISSION'),
            sectionHeading('about-mission-heading', 'Empathy in Action'),
            spacer('about-mission-spacer'),
            {
              type: 'text',
              id: 'about-mission-text-1',
              content: 'The healthcare system is being overwhelmed: patients are getting more complex while the system itself is getting harder to navigate.',
              alignment: 'center',
              style: { color: '#636381', fontSize: '1.125rem', maxWidth: '700px', margin: '0 auto', lineHeight: '1.8' },
            },
            spacer('about-mission-spacer-2', 'md'),
            {
              type: 'text',
              id: 'about-mission-text-2',
              content: "We believe every patient's physical, mental, and social needs should be consistently met. Every clinician should be supported by technology that extends their time and compassion. Every healthcare organization can fulfill its mission while strengthening its bottom line.",
              alignment: 'center',
              style: { color: '#636381', fontSize: '1.125rem', maxWidth: '700px', margin: '0 auto', lineHeight: '1.8' },
            },
            spacer('about-mission-spacer-3', 'md'),
            {
              type: 'text',
              id: 'about-mission-text-3',
              content: 'Sage is an emotionally intelligent AI voice agent, designed to expand capacity and elevate patient care, powered by our proprietary Empathy Engine.',
              alignment: 'center',
              style: { color: '#14111f', fontSize: '1.25rem', fontWeight: '600', maxWidth: '700px', margin: '0 auto', lineHeight: '1.8' },
            },
          ],
        },
        {
          type: 'section',
          id: 'about-investors-section',
          order: 3,
          backgroundColor: '#f6f6fc',
          paddingTop: '80px',
          paddingBottom: '80px',
          blocks: [
            overline('about-inv-overline', 'BACKED BY THE BEST'),
            sectionHeading('about-inv-heading', 'Our Investors'),
            spacer('about-inv-spacer'),
            {
              type: 'marquee',
              id: 'about-inv-marquee',
              items: [
                { id: 'inv-1', type: 'text', text: 'Khosla Ventures' },
                { id: 'inv-2', type: 'text', text: 'Salesforce Ventures' },
                { id: 'inv-3', type: 'text', text: 'CVS Health Ventures' },
                { id: 'inv-4', type: 'text', text: 'Greycroft' },
                { id: 'inv-5', type: 'text', text: 'SJF Ventures' },
                { id: 'inv-6', type: 'text', text: 'Time Ventures' },
                { id: 'inv-7', type: 'text', text: 'AIX Ventures' },
              ],
              speed: 40,
              pauseOnHover: true,
              gradient: true,
              gradientColor: '#f6f6fc',
              autoFill: true,
              gap: '60px',
              style: { height: '60px' },
            },
          ],
        },
        {
          type: 'section',
          id: 'about-team-section',
          order: 4,
          backgroundColor: '#ffffff',
          paddingTop: '100px',
          paddingBottom: '100px',
          blocks: [
            overline('about-team-overline', 'LEADERSHIP'),
            sectionHeading('about-team-heading', 'Executive Team'),
            spacer('about-team-spacer'),
            {
              type: 'card-grid',
              id: 'about-team-cards',
              columns: 3,
              cards: [
                { id: 'team-1', title: 'Mainul Mondal', description: 'Founder & CEO' },
                { id: 'team-2', title: 'Michael Aratow', description: 'Co-Founder & CMO' },
                { id: 'team-3', title: 'Melissa McCool', description: 'Chief Operating Officer' },
                { id: 'team-4', title: 'Angela Suthrave', description: 'Chief Product Officer' },
                { id: 'team-5', title: 'Rafael Viturro', description: 'Chief Commercial Officer' },
                { id: 'team-6', title: 'Amanda Bury', description: 'Chief Growth Officer' },
              ],
              style: {},
              elementStyles: {
                card: {
                  backgroundColor: '#ffffff',
                  borderRadius: '16px',
                  padding: '36px',
                  textAlign: 'center',
                  customCSS: 'box-shadow: 0 4px 24px rgba(0,0,0,0.06)',
                },
                cardTitle: { color: '#14111f', fontSize: '1.25rem', fontWeight: '700' },
                cardDescription: { color: '#636381', fontSize: '1rem', fontWeight: '500' },
              },
            },
          ],
        },
        { ...ctaBlock('about-cta', 'Getting started is easy'), order: 5 },
      ],
    },

    // ━━ PAGE 4: Ethical AI ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    {
      title: 'Ethical AI',
      slug: 'ethical-ai',
      seoTitle: 'Ethical AI in Healthcare | Ellipsis Health',
      seoDescription: 'Our approach to ethical AI puts patient wellbeing at the center of everything we do.',
      blocks: [
        {
          type: 'hero',
          id: 'ethical-hero',
          order: 1,
          title: 'Ethical AI',
          subtitle: 'At Ellipsis Health, we believe powerful technology must be guided by strong ethical principles. Our AI care management solution, Sage, is built on a comprehensive ethical framework that puts patient wellbeing at the center of everything we do.',
          style: darkHeroStyle,
          elementStyles: darkHeroElementStyles,
        },
        {
          type: 'section',
          id: 'ethical-principles-section',
          order: 2,
          backgroundColor: '#ffffff',
          paddingTop: '100px',
          paddingBottom: '100px',
          blocks: [
            overline('ethical-pr-overline', 'PRINCIPLES'),
            sectionHeading('ethical-pr-heading', 'Core Ethical Principles'),
            spacer('ethical-pr-spacer'),
            {
              type: 'card-grid',
              id: 'ethical-pr-cards',
              columns: 3,
              cards: [
                { id: 'eth-pr-1', title: 'Patient-Centered Care', description: 'We prioritize patient wellbeing, autonomy, and safety. Every design choice is measured against its potential impact on patient welfare.', icon: 'favorite' },
                { id: 'eth-pr-2', title: 'Privacy & Security', description: 'Healthcare-grade security standards including HIPAA and SOC2 compliance with encryption, role-based access, and data minimization.', icon: 'shield' },
                { id: 'eth-pr-3', title: 'Fairness & Inclusivity', description: 'Our AI serves diverse patient populations equitably. We actively identify and mitigate biases through regular audits.', icon: 'diversity_3' },
                { id: 'eth-pr-4', title: 'Human Oversight', description: 'Sage supports human decision-making rather than replacing it. We maintain a human-in-the-loop approach for complex cases.', icon: 'supervisor_account' },
                { id: 'eth-pr-5', title: 'Transparency', description: 'Clear explanations about how our AI works, what data it uses, and how it makes recommendations.', icon: 'visibility' },
              ],
              style: {},
              elementStyles: lightCardStyles,
            },
          ],
        },
        {
          type: 'section',
          id: 'ethical-governance-section',
          order: 3,
          backgroundColor: '#f6f6fc',
          paddingTop: '100px',
          paddingBottom: '100px',
          blocks: [
            overline('ethical-gov-overline', 'GOVERNANCE'),
            sectionHeading('ethical-gov-heading', 'Our Governance Framework'),
            spacer('ethical-gov-spacer'),
            {
              type: 'card-grid',
              id: 'ethical-gov-cards',
              columns: 4,
              cards: [
                { id: 'eth-gov-1', title: 'Ethics Committee', description: 'Cross-functional AI Ethics Committee reviews all healthcare AI applications', icon: 'groups' },
                { id: 'eth-gov-2', title: 'Clinical Oversight', description: 'Physicians, nurses, and care managers validate clinical safety of every update', icon: 'medical_services' },
                { id: 'eth-gov-3', title: 'Regular Auditing', description: 'Ongoing reviews of active projects to identify and mitigate risks', icon: 'fact_check' },
                { id: 'eth-gov-4', title: 'Continuous Improvement', description: 'Robust feedback loop integrating patient and care manager reports into updates', icon: 'autorenew' },
              ],
              style: {},
              elementStyles: lightCardStyles,
            },
          ],
        },
        { ...aiSafetySection('ethical'), order: 4 },
        { ...ctaBlock('ethical-cta', 'Getting started is easy'), order: 5 },
      ],
    },

    // ━━ PAGE 5: Partners ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    {
      title: 'Partners',
      slug: 'partners',
      seoTitle: 'Partner with Ellipsis Health | AI Care Management Partnerships',
      seoDescription: 'Collaborating to create seamless integration of Sage into care management workflows.',
      blocks: [
        {
          type: 'hero',
          id: 'partners-hero',
          order: 1,
          title: 'Partner with us to redefine agentic AI Care Management',
          subtitle: 'Collaborating to create seamless integration of Sage into care management workflows.',
          ctaText: 'Explore Partnership',
          ctaLink: '/partner-contact',
          style: darkHeroStyle,
          elementStyles: darkHeroElementStyles,
        },
        {
          type: 'section',
          id: 'partners-featured-section',
          order: 2,
          backgroundColor: '#ffffff',
          paddingTop: '100px',
          paddingBottom: '100px',
          blocks: [
            overline('partners-feat-overline', 'FEATURED PARTNERS'),
            sectionHeading('partners-feat-heading', 'Strategic Partnerships'),
            spacer('partners-feat-spacer'),
            {
              type: 'card-grid',
              id: 'partners-feat-cards',
              columns: 3,
              cards: [
                { id: 'partner-1', title: 'Salesforce AppExchange', description: 'Sage is integrated into Salesforce Agentforce Health, available through AppExchange with quick install for all assessments.', icon: 'cloud' },
                { id: 'partner-2', title: 'Epic Showroom', description: 'Available in Epic Showroom. Sage uses patient data from Epic to drive empathetic interactions and returns structured insights.', icon: 'local_hospital' },
                { id: 'partner-3', title: 'NVIDIA', description: 'Partnership enables lower latency speech processing with higher transcription accuracy for medical terms and emotional cues.', icon: 'memory' },
              ],
              style: {},
              elementStyles: lightCardStyles,
            },
          ],
        },
        {
          type: 'section',
          id: 'partners-why-section',
          order: 3,
          backgroundColor: '#f6f6fc',
          paddingTop: '100px',
          paddingBottom: '100px',
          blocks: [
            overline('partners-why-overline', 'WHY PARTNER'),
            sectionHeading('partners-why-heading', 'Revolutionizing Care Management'),
            spacer('partners-why-spacer'),
            {
              type: 'card-grid',
              id: 'partners-why-cards',
              columns: 4,
              cards: [
                { id: 'partner-why-1', title: 'Clinical Expertise', description: '3.1M+ clinical conversations guiding Sage\'s empathy engine', icon: 'psychology' },
                { id: 'partner-why-2', title: 'Solution Scalability', description: 'Autonomous 24/7 outreach integrating into existing workflows', icon: 'trending_up' },
                { id: 'partner-why-3', title: 'Trust & Safety', description: 'HIPAA-compliant, transparent, security-first infrastructure', icon: 'verified_user' },
                { id: 'partner-why-4', title: 'Innovative Collaboration', description: 'Custom integrations specific to customer needs', icon: 'handshake' },
              ],
              style: {},
              elementStyles: lightCardStyles,
            },
          ],
        },
        {
          ...ctaBlock('partners-cta', 'Contact our partner team', {
            primaryButtonText: 'Contact Us',
            primaryButtonUrl: '/partner-contact',
          }),
          order: 4,
        },
      ],
    },

    // ━━ PAGE 6: Contact Us ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    {
      title: 'Contact Us',
      slug: 'contact-us',
      seoTitle: 'Contact Ellipsis Health',
      seoDescription: "Want to see Sage in action? Share your info and we'll be in touch.",
      blocks: [
        {
          type: 'hero',
          id: 'contact-hero',
          order: 1,
          title: 'Want to see Sage in action?',
          subtitle: "Share your info and we'll be in touch.",
          ctaText: 'Schedule a Demo',
          ctaLink: '/schedule-a-demo',
          style: darkHeroStyle,
          elementStyles: darkHeroElementStyles,
        },
        {
          type: 'section',
          id: 'contact-form-section',
          order: 2,
          backgroundColor: '#ffffff',
          paddingTop: '100px',
          paddingBottom: '100px',
          blocks: [
            sectionHeading('contact-heading', 'Get in Touch'),
            spacer('contact-spacer'),
            {
              type: 'text',
              id: 'contact-text',
              content: 'Interested in learning how Sage can transform your care management operations? Fill out the form on our website or reach out directly.',
              alignment: 'center',
              style: { color: '#636381', fontSize: '1.125rem', maxWidth: '600px', margin: '0 auto', lineHeight: '1.7' },
            },
            spacer('contact-spacer-2', 'md'),
            {
              type: 'button',
              id: 'contact-btn',
              text: 'Schedule a Demo',
              url: '/schedule-a-demo',
              variant: 'primary',
              alignment: 'center',
              style: {
                backgroundColor: '#4d34fa',
                color: '#ffffff',
                borderRadius: '28px',
                padding: '15px 40px',
                fontWeight: '600',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              },
            },
          ],
        },
      ],
    },

    // ━━ PAGE 7: FAQ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    {
      title: 'FAQ',
      slug: 'faq',
      seoTitle: 'FAQ | Ellipsis Health',
      seoDescription: 'Frequently asked questions about Ellipsis Health, Sage, and our AI care management solutions.',
      blocks: [
        {
          type: 'hero',
          id: 'faq-hero',
          order: 1,
          title: 'Frequently Asked Questions',
          subtitle: 'Everything you need to know about Ellipsis Health and Sage',
          style: minimalDarkHeroStyle,
          elementStyles: darkHeroElementStyles,
        },
        {
          type: 'section',
          id: 'faq-general-section',
          order: 2,
          backgroundColor: '#ffffff',
          paddingTop: '100px',
          paddingBottom: '100px',
          blocks: [
            sectionHeading('faq-general-heading', 'General'),
            spacer('faq-general-spacer'),
            {
              type: 'accordion',
              id: 'faq-general-accordion',
              items: [
                {
                  id: 'faq-g-1',
                  title: 'What is Ellipsis Health?',
                  content: 'The healthcare AI company delivering empathetic, innovative AI solutions that improve care operations and unlock life-changing outcomes for every patient. Sage is our HIPAA-compliant AI Care Manager.',
                },
                {
                  id: 'faq-g-2',
                  title: 'How did Ellipsis Health get started?',
                  content: "Founded in 2017 by CEO Mainul Mondal, inspired by his parents' healthcare struggles. The vision: creating a care manager available 24/7 for patients, someone who would listen with empathy, never get tired, and provide consistent, high-quality support.",
                },
                {
                  id: 'faq-g-3',
                  title: 'What problem is Ellipsis Health solving?',
                  content: 'Healthcare teams face critical staff shortages, widespread burnout, mounting patient backlogs, and relentless pressure to cut costs while improving outcomes.',
                },
                {
                  id: 'faq-g-4',
                  title: 'How is Ellipsis Health solving that problem?',
                  content: 'Sage makes and receives fully autonomous phone calls on behalf of healthcare organizations, handling enrollment, engagement, assessments, and clinical follow-ups 24/7.',
                },
                {
                  id: 'faq-g-5',
                  title: 'What is new and innovative about Ellipsis Health?',
                  content: 'Sage uses a proprietary Empathy Engine, a breakthrough combination of patented vocal biomarker technology, therapeutic techniques, and training based on millions of real clinical patient calls.',
                },
                {
                  id: 'faq-g-6',
                  title: "Who are Ellipsis Health's customers?",
                  content: 'Leading health plans, health systems, and specialty care management organizations across the United States. Backed by Salesforce Ventures, Khosla Ventures, and CVS Ventures.',
                },
                {
                  id: 'faq-g-7',
                  title: 'How is the technology validated?',
                  content: 'Built on years of rigorous clinical research with over 10 peer-reviewed publications, third-party security audits, and HIPAA/SOC 2 compliance.',
                },
              ],
              style: { maxWidth: '800px', margin: '0 auto' },
              elementStyles: {
                title: { color: '#14111f', fontSize: '1.0625rem', fontWeight: '600' },
                content: { color: '#636381', fontSize: '0.9375rem', lineHeight: '1.7' },
              },
            },
          ],
        },
        {
          type: 'section',
          id: 'faq-privacy-section',
          order: 3,
          backgroundColor: '#f6f6fc',
          paddingTop: '100px',
          paddingBottom: '100px',
          blocks: [
            sectionHeading('faq-privacy-heading', 'Privacy & Security'),
            spacer('faq-privacy-spacer'),
            {
              type: 'accordion',
              id: 'faq-privacy-accordion',
              items: [
                {
                  id: 'faq-p-1',
                  title: 'Is Ellipsis Health HIPAA and GDPR compliant?',
                  content: 'Yes. We maintain full HIPAA compliance protecting health information and GDPR compliance for EU resident data protection.',
                },
                {
                  id: 'faq-p-2',
                  title: 'What data do you collect?',
                  content: 'Sage collects only information necessary for effective care management -- the same type of clinical and demographic data collected during any care management call. All data uses healthcare-grade security.',
                },
                {
                  id: 'faq-p-3',
                  title: 'Who can see the collected data?',
                  content: 'Per HIPAA, only those on an approved need-to-know basis. Access is governed through business associate agreements.',
                },
                {
                  id: 'faq-p-4',
                  title: 'Can someone delete their data?',
                  content: 'Yes. Users can request deletion by emailing privacy@ellipsishealth.com. We may retain data if legally required.',
                },
                {
                  id: 'faq-p-5',
                  title: 'What do you do to keep data safe?',
                  content: 'Encryption in transit and at rest, limited access via HIPAA compliance, daily backups, two-factor authentication, role-based access control, audit logs, annual penetration tests, breach response procedures, data de-identification, and third-party security audits.',
                },
              ],
              style: { maxWidth: '800px', margin: '0 auto' },
              elementStyles: {
                title: { color: '#14111f', fontSize: '1.0625rem', fontWeight: '600' },
                content: { color: '#636381', fontSize: '0.9375rem', lineHeight: '1.7' },
              },
            },
          ],
        },
        {
          ...ctaBlock('faq-cta', 'Still have questions?', {
            primaryButtonText: 'Contact Us',
            primaryButtonUrl: '/contact-us',
          }),
          order: 4,
        },
      ],
    },

    // ━━ PAGE 8: Insights ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    {
      title: 'Insights',
      slug: 'insights',
      seoTitle: 'Insights | Ellipsis Health',
      seoDescription: 'Latest news, research, and thought leadership from Ellipsis Health.',
      blocks: [
        {
          type: 'hero',
          id: 'insights-hero',
          order: 1,
          title: 'Insights',
          subtitle: 'News, research, and thought leadership from Ellipsis Health',
          style: minimalDarkHeroStyle,
          elementStyles: darkHeroElementStyles,
        },
        {
          type: 'section',
          id: 'insights-posts-section',
          order: 2,
          backgroundColor: '#ffffff',
          paddingTop: '100px',
          paddingBottom: '100px',
          blocks: [
            {
              type: 'blog-posts',
              id: 'insights-blog-posts',
              postType: 'blog',
              limit: 9,
              columns: 3,
              showExcerpt: true,
            },
          ],
        },
        {
          ...ctaBlock('insights-cta', 'Want to learn more?', {
            primaryButtonText: 'Schedule a Demo',
            primaryButtonUrl: '/schedule-a-demo',
          }),
          order: 3,
        },
      ],
    },

    // ━━ PAGE 9: Careers ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    {
      title: 'Careers',
      slug: 'careers',
      seoTitle: 'Careers at Ellipsis Health',
      seoDescription: 'Join our team and help transform healthcare with empathetic AI.',
      blocks: [
        {
          type: 'hero',
          id: 'careers-hero',
          order: 1,
          title: 'Join Our Team',
          subtitle: "Help us transform healthcare with empathetic AI. We're building the future of care management.",
          ctaText: 'View Open Positions',
          ctaLink: '#positions',
          style: darkHeroStyle,
          elementStyles: darkHeroElementStyles,
        },
        {
          type: 'section',
          id: 'careers-why-section',
          order: 2,
          backgroundColor: '#ffffff',
          paddingTop: '100px',
          paddingBottom: '100px',
          blocks: [
            sectionHeading('careers-why-heading', 'Why Ellipsis Health?'),
            spacer('careers-why-spacer'),
            {
              type: 'card-grid',
              id: 'careers-why-cards',
              columns: 3,
              cards: [
                { id: 'career-1', title: 'Mission-Driven', description: 'Make a real impact on healthcare outcomes for millions of patients', icon: 'favorite' },
                { id: 'career-2', title: 'Cutting-Edge AI', description: 'Work with state-of-the-art AI and speech technology', icon: 'smart_toy' },
                { id: 'career-3', title: 'Great Team', description: 'Collaborate with world-class engineers, clinicians, and researchers', icon: 'groups' },
              ],
              style: {},
              elementStyles: lightCardStyles,
            },
          ],
        },
        {
          ...ctaBlock('careers-cta', 'Interested? Get in touch.', {
            primaryButtonText: 'Contact Us',
            primaryButtonUrl: '/contact-us',
          }),
          order: 3,
        },
      ],
    },

    // ━━ PAGE 10: Schedule a Demo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    {
      title: 'Schedule a Demo',
      slug: 'schedule-a-demo',
      seoTitle: 'Schedule a Demo | Ellipsis Health',
      seoDescription: 'See Sage in action. Schedule a personalized demo of our AI care management solution.',
      blocks: [
        {
          type: 'hero',
          id: 'demo-hero',
          order: 1,
          title: 'Schedule a Demo',
          subtitle: 'See how Sage can transform your care management operations. Our team will walk you through a personalized demo.',
          style: minimalDarkHeroStyle,
          elementStyles: darkHeroElementStyles,
        },
        {
          type: 'section',
          id: 'demo-form-section',
          order: 2,
          backgroundColor: '#ffffff',
          paddingTop: '100px',
          paddingBottom: '100px',
          blocks: [
            sectionHeading('demo-heading', 'Request a Demo'),
            spacer('demo-spacer'),
            {
              type: 'text',
              id: 'demo-text',
              content: 'Fill out the form on our website or contact us directly at info@ellipsishealth.com to schedule your personalized demo.',
              alignment: 'center',
              style: { color: '#636381', fontSize: '1.125rem', maxWidth: '600px', margin: '0 auto', lineHeight: '1.7' },
            },
            spacer('demo-spacer-2', 'md'),
            {
              type: 'button',
              id: 'demo-btn',
              text: 'Contact Us',
              url: '/contact-us',
              variant: 'primary',
              alignment: 'center',
              style: {
                backgroundColor: '#4d34fa',
                color: '#ffffff',
                borderRadius: '28px',
                padding: '15px 40px',
                fontWeight: '600',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              },
            },
          ],
        },
      ],
    },

    // ━━ PAGE 11: Patents ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    {
      title: 'Patents',
      slug: 'patents',
      seoTitle: 'Patents | Ellipsis Health',
      seoDescription: 'Ellipsis Health patent portfolio covering AI-driven healthcare innovations.',
      blocks: [
        {
          type: 'section',
          id: 'patents-section',
          order: 1,
          backgroundColor: '#ffffff',
          paddingTop: '100px',
          paddingBottom: '100px',
          blocks: [
            sectionHeading('patents-heading', 'Patents'),
            spacer('patents-spacer'),
            {
              type: 'text',
              id: 'patents-text',
              content: 'Ellipsis Health maintains a portfolio of patents covering our AI-driven healthcare innovations, including vocal biomarker technology and our proprietary Empathy Engine.',
              alignment: 'center',
              style: { color: '#636381', fontSize: '1.125rem', maxWidth: '700px', margin: '0 auto', lineHeight: '1.7' },
            },
          ],
        },
        {
          ...ctaBlock('patents-cta', 'Learn more about our technology', {
            primaryButtonText: 'Contact Us',
            primaryButtonUrl: '/contact-us',
          }),
          order: 2,
        },
      ],
    },
  ];
}

// ── Main ──────────────────────────────────────────────────────────────────

async function importMarketing() {
  const { db } = await import('../../../lib/db');
  const { posts } = await import('../../../lib/db/schema');
  const { eq, and } = await import('drizzle-orm');

  const ids = JSON.parse(fs.readFileSync(path.join(__dirname, 'ids.json'), 'utf-8'));
  const websiteId = ids.websiteId;

  if (!websiteId) {
    console.error('No websiteId found in ids.json. Run setup-client first.');
    process.exit(1);
  }

  const pages = buildPages();

  for (const page of pages) {
    // Check if page already exists
    const [existing] = await db
      .select()
      .from(posts)
      .where(and(eq(posts.slug, page.slug), eq(posts.websiteId, websiteId)))
      .limit(1);

    if (existing) {
      console.log(`[SKIP] "${page.title}" already exists (ID ${existing.id}, slug: ${page.slug})`);
      continue;
    }

    const [created] = await db.insert(posts).values({
      title: page.title,
      slug: page.slug,
      postType: 'page',
      content: JSON.stringify({ blocks: page.blocks, version: '1.0' }),
      published: false,
      websiteId,
      seoTitle: page.seoTitle,
      seoDescription: page.seoDescription,
    }).returning();

    console.log(`[CREATED] "${page.title}" - ID ${created.id} (slug: ${page.slug})`);
  }

  console.log('\n=== MARKETING PAGES IMPORT COMPLETE ===');
  process.exit(0);
}

importMarketing().catch(err => {
  console.error(err);
  process.exit(1);
});
