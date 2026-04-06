import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });

/**
 * Creates a pitch deck for CY Strategies matching the PDF design:
 * - 6 slides: Cover, How I Think, What I Do, Fit, Recent Work, What's Next
 * - Color palette: teal backgrounds, cream/off-white backgrounds, copper accent
 * - Fonts: Work Sans (headings), Roboto (body)
 * - Circular headshot photo on cover slide
 */

const CALENDLY = 'https://calendly.com/cody-cystrategies/30min';
const LINKEDIN = 'https://www.linkedin.com/in/codyayork/';

// Color palette from the PDF
const C = {
  teal: '#0D6B6E',
  tealDark: '#094F51',
  tealLight: '#0E7C7F',
  cream: '#F5F0E8',
  creamDark: '#EDE7DC',
  white: '#FFFFFF',
  darkText: '#1A2A2A',
  bodyText: '#3D4F4F',
  mutedText: '#6B7A7A',
  copper: '#C87941',
  copperDot: '#D4875A',
  cardBg: '#E8F4F2',
  cardBgAlt: '#F0E8E0',
  ctaDark: '#0A5456',
  ctaOutline: '#0D6B6E',
};

const IMG = {
  cody: 'https://cystrategies.co/assets/images/image08.jpg',
};

// Build V2 slides using the block system
function buildSlides() {
  return [
    // ━━━━━ SLIDE 1: COVER ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    {
      id: 'slide-cover',
      label: 'Cover',
      blocks: [
        {
          id: 'cover-section',
          type: 'section',
          order: 1,
          backgroundColor: C.teal,
          paddingTop: '0px',
          paddingBottom: '0px',
          paddingLeft: '0px',
          paddingRight: '0px',
          blocks: [
            {
              id: 'cover-columns',
              type: 'columns',
              order: 1,
              columns: [
                {
                  id: 'cover-text-col',
                  width: '60%',
                  verticalAlign: 'middle',
                  padding: 'none',
                  blocks: [
                    {
                      id: 'cover-brand',
                      type: 'text',
                      order: 1,
                      content: 'CY STRATEGIES',
                      style: {
                        color: C.white,
                        fontFamily: 'Work Sans',
                        fontSize: '0.75rem',
                        fontWeight: '500',
                        letterSpacing: '0.2em',
                        margin: '0 0 24px 0',
                      },
                    },
                    {
                      id: 'cover-subtitle',
                      type: 'text',
                      order: 2,
                      content: 'MARKETING STRATEGY CONSULTANT',
                      style: {
                        color: C.copper,
                        fontFamily: 'Work Sans',
                        fontSize: '0.6875rem',
                        fontWeight: '500',
                        letterSpacing: '0.15em',
                        margin: '0 0 12px 0',
                      },
                    },
                    {
                      id: 'cover-heading',
                      type: 'heading',
                      order: 3,
                      content: "Hi. I'm Cody.",
                      level: 1,
                      style: {
                        color: C.white,
                        fontFamily: 'Work Sans',
                        fontSize: '3rem',
                        fontWeight: '800',
                        lineHeight: '1.1',
                        margin: '0 0 24px 0',
                      },
                    },
                    {
                      id: 'cover-desc',
                      type: 'text',
                      order: 4,
                      content: "I help companies get clear on what their marketing should actually be doing by figuring out what's driving growth and what isn't.",
                      style: {
                        color: 'rgba(255,255,255,0.9)',
                        fontFamily: 'Work Sans',
                        fontSize: '1.25rem',
                        fontWeight: '400',
                        lineHeight: '1.5',
                        margin: '0 0 32px 0',
                      },
                    },
                    {
                      id: 'cover-divider',
                      type: 'divider',
                      order: 5,
                      style: {
                        borderColor: 'rgba(255,255,255,0.3)',
                        margin: '0 0 24px 0',
                        maxWidth: '400px',
                      },
                    },
                    {
                      id: 'cover-tagline',
                      type: 'text',
                      order: 6,
                      content: 'Strategy before execution. Every time.',
                      style: {
                        color: 'rgba(255,255,255,0.7)',
                        fontFamily: 'Roboto',
                        fontSize: '0.875rem',
                        lineHeight: '1.6',
                        margin: '0 0 16px 0',
                      },
                    },
                    {
                      id: 'cover-body1',
                      type: 'text',
                      order: 7,
                      content: "Most companies don't need more marketing. They need to make better decisions about what's worth doing in the first place.",
                      style: {
                        color: 'rgba(255,255,255,0.7)',
                        fontFamily: 'Roboto',
                        fontSize: '0.875rem',
                        lineHeight: '1.6',
                        margin: '0 0 12px 0',
                      },
                    },
                    {
                      id: 'cover-body2',
                      type: 'text',
                      order: 8,
                      content: 'This is a quick look at how I think and whether working together would make sense.',
                      style: {
                        color: 'rgba(255,255,255,0.7)',
                        fontFamily: 'Roboto',
                        fontSize: '0.875rem',
                        lineHeight: '1.6',
                        margin: '0 0 24px 0',
                      },
                    },
                    {
                      id: 'cover-time',
                      type: 'text',
                      order: 9,
                      content: 'ABOUT 5-6 MINUTES',
                      style: {
                        color: 'rgba(255,255,255,0.5)',
                        fontFamily: 'Roboto',
                        fontSize: '0.6875rem',
                        letterSpacing: '0.15em',
                        fontWeight: '500',
                        padding: '6px 16px',
                        borderWidth: '1px',
                        borderColor: 'rgba(255,255,255,0.2)',
                        borderRadius: '20px',
                        display: 'inline-block',
                      },
                    },
                  ],
                },
                {
                  id: 'cover-photo-col',
                  width: '40%',
                  verticalAlign: 'middle',
                  padding: 'none',
                  blocks: [
                    {
                      id: 'cover-photo',
                      type: 'image',
                      order: 1,
                      url: IMG.cody,
                      alt: 'Cody York',
                      width: 'full',
                      alignment: 'center',
                      style: {
                        borderRadius: '50%',
                        maxWidth: '280px',
                        border: '4px solid rgba(0,0,0,0.3)',
                        margin: '0 auto',
                      },
                    },
                  ],
                },
              ],
              gap: 'xl',
              stackOnMobile: true,
            },
          ],
        },
      ],
      pageSettings: {
        backgroundColor: C.teal,
        color: C.white,
        fontFamily: 'Roboto',
      },
    },

    // ━━━━━ SLIDE 2: HOW I THINK ABOUT THIS ━━━━━━━━━━━━━━━━━━━━━━━━━━━
    {
      id: 'slide-how-i-think',
      label: 'How I Think',
      blocks: [
        {
          id: 'think-section',
          type: 'section',
          order: 1,
          backgroundColor: C.cream,
          paddingTop: '0px',
          paddingBottom: '0px',
          paddingLeft: '0px',
          paddingRight: '0px',
          maxWidth: '900px',
          blocks: [
            {
              id: 'think-brand',
              type: 'text',
              order: 1,
              content: 'CY STRATEGIES',
              style: {
                color: C.teal,
                fontFamily: 'Work Sans',
                fontSize: '0.75rem',
                fontWeight: '500',
                letterSpacing: '0.2em',
                margin: '0 0 24px 0',
              },
            },
            {
              id: 'think-label',
              type: 'text',
              order: 2,
              content: 'HOW I THINK ABOUT THIS',
              style: {
                color: C.teal,
                fontFamily: 'Work Sans',
                fontSize: '0.6875rem',
                fontWeight: '500',
                letterSpacing: '0.15em',
                margin: '0 0 12px 0',
              },
            },
            {
              id: 'think-heading',
              type: 'heading',
              order: 3,
              content: "There's a difference between having a goal and knowing what actually drives it.",
              level: 2,
              style: {
                color: C.darkText,
                fontFamily: 'Work Sans',
                fontSize: '2.25rem',
                fontWeight: '700',
                lineHeight: '1.2',
                margin: '0 0 8px 0',
              },
            },
            {
              id: 'think-accent-bar',
              type: 'divider',
              order: 4,
              style: {
                borderColor: C.teal,
                maxWidth: '60px',
                borderWidth: '3px',
                margin: '16px 0 24px 0',
              },
            },
            {
              id: 'think-body1',
              type: 'text',
              order: 5,
              content: 'Most companies know where they want to go.',
              style: {
                color: C.bodyText,
                fontFamily: 'Roboto',
                fontSize: '1rem',
                lineHeight: '1.7',
                margin: '0 0 8px 0',
              },
            },
            {
              id: 'think-body2',
              type: 'text',
              order: 6,
              content: "Very few know what's actually going to get them there.",
              style: {
                color: C.bodyText,
                fontFamily: 'Roboto',
                fontSize: '1rem',
                lineHeight: '1.7',
                margin: '0 0 16px 0',
              },
            },
            {
              id: 'think-body3',
              type: 'text',
              order: 7,
              content: "That's where strategy comes in. Before anything gets built, launched, or funded.",
              style: {
                color: C.bodyText,
                fontFamily: 'Roboto',
                fontSize: '1rem',
                lineHeight: '1.7',
                margin: '0 0 32px 0',
              },
            },
            // Callout box
            {
              id: 'think-callout-section',
              type: 'section',
              order: 8,
              backgroundColor: '#EDF5F4',
              paddingTop: '28px',
              paddingBottom: '28px',
              paddingLeft: '32px',
              paddingRight: '32px',
              blocks: [
                {
                  id: 'think-callout-title',
                  type: 'text',
                  order: 1,
                  content: 'Take a website.',
                  style: {
                    color: C.darkText,
                    fontFamily: 'Roboto',
                    fontSize: '1rem',
                    fontWeight: '700',
                    margin: '0 0 12px 0',
                  },
                },
                {
                  id: 'think-callout-body',
                  type: 'text',
                  order: 2,
                  content: 'When someone says "it\'s not working," that usually means one of three things:',
                  style: {
                    color: C.bodyText,
                    fontFamily: 'Roboto',
                    fontSize: '0.9375rem',
                    lineHeight: '1.6',
                    margin: '0 0 16px 0',
                  },
                },
                {
                  id: 'think-callout-bullet1',
                  type: 'text',
                  order: 3,
                  content: '&bull;&nbsp;&nbsp;Not enough people are finding it',
                  style: {
                    color: C.bodyText,
                    fontFamily: 'Roboto',
                    fontSize: '0.9375rem',
                    lineHeight: '2',
                  },
                },
                {
                  id: 'think-callout-bullet2',
                  type: 'text',
                  order: 4,
                  content: "&bull;&nbsp;&nbsp;People find it but don't take action",
                  style: {
                    color: C.bodyText,
                    fontFamily: 'Roboto',
                    fontSize: '0.9375rem',
                    lineHeight: '2',
                  },
                },
                {
                  id: 'think-callout-bullet3',
                  type: 'text',
                  order: 5,
                  content: "&bull;&nbsp;&nbsp;People don't understand what you offer or why it matters",
                  style: {
                    color: C.bodyText,
                    fontFamily: 'Roboto',
                    fontSize: '0.9375rem',
                    lineHeight: '2',
                    margin: '0 0 20px 0',
                  },
                },
                {
                  id: 'think-callout-summary',
                  type: 'text',
                  order: 6,
                  content: '<strong>Three different problems. Three different solutions.</strong><br/>Most teams guess. Strategy tells you which one you actually have.',
                  style: {
                    color: C.darkText,
                    fontFamily: 'Roboto',
                    fontSize: '0.9375rem',
                    lineHeight: '1.6',
                  },
                },
              ],
            },
          ],
        },
      ],
      pageSettings: {
        backgroundColor: C.cream,
        color: C.darkText,
        fontFamily: 'Roboto',
      },
    },

    // ━━━━━ SLIDE 3: WHAT I DO (Four Services) ━━━━━━━━━━━━━━━━━━━━━━━━
    {
      id: 'slide-services',
      label: 'What I Do',
      blocks: [
        {
          id: 'services-section',
          type: 'section',
          order: 1,
          backgroundColor: C.cream,
          paddingTop: '0px',
          paddingBottom: '0px',
          paddingLeft: '0px',
          paddingRight: '0px',
          maxWidth: '1000px',
          blocks: [
            {
              id: 'services-brand',
              type: 'text',
              order: 1,
              content: 'CY STRATEGIES',
              style: {
                color: C.teal,
                fontFamily: 'Work Sans',
                fontSize: '0.75rem',
                fontWeight: '500',
                letterSpacing: '0.2em',
                margin: '0 0 24px 0',
              },
            },
            {
              id: 'services-label',
              type: 'text',
              order: 2,
              content: 'FOUR WAYS TO WORK TOGETHER',
              style: {
                color: C.teal,
                fontFamily: 'Work Sans',
                fontSize: '0.6875rem',
                fontWeight: '500',
                letterSpacing: '0.15em',
                margin: '0 0 8px 0',
              },
            },
            {
              id: 'services-heading',
              type: 'heading',
              order: 3,
              content: 'What I do.',
              level: 2,
              style: {
                color: C.darkText,
                fontFamily: 'Work Sans',
                fontSize: '2.25rem',
                fontWeight: '700',
                lineHeight: '1.2',
                margin: '0 0 32px 0',
              },
            },
            // 2x2 grid of service cards
            {
              id: 'services-grid',
              type: 'columns',
              order: 4,
              columns: [
                {
                  id: 'svc-col-left',
                  width: '50%',
                  verticalAlign: 'top',
                  padding: 'sm',
                  blocks: [
                    // Card 1: Snapshot
                    {
                      id: 'svc-card1',
                      type: 'section',
                      order: 1,
                      backgroundColor: C.white,
                      paddingTop: '24px',
                      paddingBottom: '24px',
                      paddingLeft: '24px',
                      paddingRight: '24px',
                      blocks: [
                        {
                          id: 'svc1-number',
                          type: 'text',
                          order: 1,
                          content: '01',
                          alignment: 'right',
                          style: { color: '#D4D0C8', fontFamily: 'Work Sans', fontSize: '2.5rem', fontWeight: '700', lineHeight: '1', margin: '0 0 -20px 0' },
                        },
                        {
                          id: 'svc1-icon',
                          type: 'text',
                          order: 2,
                          content: '<span class="material-icons" style="font-size:24px;color:#0D6B6E">photo_camera</span>',
                          style: { margin: '0 0 8px 0' },
                        },
                        {
                          id: 'svc1-label',
                          type: 'text',
                          order: 3,
                          content: '01 / SNAPSHOT',
                          style: { color: C.mutedText, fontFamily: 'Work Sans', fontSize: '0.6875rem', letterSpacing: '0.1em', fontWeight: '500', margin: '0 0 6px 0' },
                        },
                        {
                          id: 'svc1-title',
                          type: 'heading',
                          order: 4,
                          content: 'Strategy Snapshot: 90-Day Priorities',
                          level: 4,
                          style: { color: C.darkText, fontFamily: 'Work Sans', fontSize: '1rem', fontWeight: '700', margin: '0 0 8px 0' },
                        },
                        {
                          id: 'svc1-desc',
                          type: 'text',
                          order: 5,
                          content: 'For when you need direction now, without committing to a full planning cycle. Identifies what to do next and what to stop doing.',
                          style: { color: C.bodyText, fontFamily: 'Roboto', fontSize: '0.8125rem', lineHeight: '1.6', margin: '0 0 16px 0' },
                        },
                        {
                          id: 'svc1-result',
                          type: 'text',
                          order: 6,
                          content: 'You get: A 2-page prioritized plan with 3 initiatives to act on immediately',
                          style: { color: C.teal, fontFamily: 'Roboto', fontSize: '0.8125rem', lineHeight: '1.5', backgroundColor: C.cardBg, padding: '10px 14px', borderRadius: '6px' },
                        },
                      ],
                    },
                    {
                      id: 'svc-spacer1',
                      type: 'spacer',
                      order: 2,
                      height: 'sm',
                    },
                    // Card 3: Blueprint
                    {
                      id: 'svc-card3',
                      type: 'section',
                      order: 3,
                      backgroundColor: C.white,
                      paddingTop: '24px',
                      paddingBottom: '24px',
                      paddingLeft: '24px',
                      paddingRight: '24px',
                      blocks: [
                        {
                          id: 'svc3-number',
                          type: 'text',
                          order: 1,
                          content: '03',
                          alignment: 'right',
                          style: { color: '#D4D0C8', fontFamily: 'Work Sans', fontSize: '2.5rem', fontWeight: '700', lineHeight: '1', margin: '0 0 -20px 0' },
                        },
                        {
                          id: 'svc3-icon',
                          type: 'text',
                          order: 2,
                          content: '<span class="material-icons" style="font-size:24px;color:#0D6B6E">filter_alt</span>',
                          style: { margin: '0 0 8px 0' },
                        },
                        {
                          id: 'svc3-label',
                          type: 'text',
                          order: 3,
                          content: '03 / BLUEPRINT',
                          style: { color: C.mutedText, fontFamily: 'Work Sans', fontSize: '0.6875rem', letterSpacing: '0.1em', fontWeight: '500', margin: '0 0 6px 0' },
                        },
                        {
                          id: 'svc3-title',
                          type: 'heading',
                          order: 4,
                          content: 'Targeted Campaign Blueprint',
                          level: 4,
                          style: { color: C.darkText, fontFamily: 'Work Sans', fontSize: '1rem', fontWeight: '700', margin: '0 0 8px 0' },
                        },
                        {
                          id: 'svc3-desc',
                          type: 'text',
                          order: 5,
                          content: 'System design for a specific growth motion. Right audience, right message, right channels. Built on real decisions, not assumptions.',
                          style: { color: C.bodyText, fontFamily: 'Roboto', fontSize: '0.8125rem', lineHeight: '1.6', margin: '0 0 16px 0' },
                        },
                        {
                          id: 'svc3-result',
                          type: 'text',
                          order: 6,
                          content: 'You get: A build-ready campaign structure with audience, message, channels, and measurement',
                          style: { color: C.teal, fontFamily: 'Roboto', fontSize: '0.8125rem', lineHeight: '1.5', backgroundColor: C.cardBg, padding: '10px 14px', borderRadius: '6px' },
                        },
                      ],
                    },
                  ],
                },
                {
                  id: 'svc-col-right',
                  width: '50%',
                  verticalAlign: 'top',
                  padding: 'sm',
                  blocks: [
                    // Card 2: Roadmap
                    {
                      id: 'svc-card2',
                      type: 'section',
                      order: 1,
                      backgroundColor: C.white,
                      paddingTop: '24px',
                      paddingBottom: '24px',
                      paddingLeft: '24px',
                      paddingRight: '24px',
                      blocks: [
                        {
                          id: 'svc2-number',
                          type: 'text',
                          order: 1,
                          content: '02',
                          alignment: 'right',
                          style: { color: '#D4D0C8', fontFamily: 'Work Sans', fontSize: '2.5rem', fontWeight: '700', lineHeight: '1', margin: '0 0 -20px 0' },
                        },
                        {
                          id: 'svc2-icon',
                          type: 'text',
                          order: 2,
                          content: '<span class="material-icons" style="font-size:24px;color:#0D6B6E">edit</span>',
                          style: { margin: '0 0 8px 0' },
                        },
                        {
                          id: 'svc2-label',
                          type: 'text',
                          order: 3,
                          content: '02 / ROADMAP',
                          style: { color: C.mutedText, fontFamily: 'Work Sans', fontSize: '0.6875rem', letterSpacing: '0.1em', fontWeight: '500', margin: '0 0 6px 0' },
                        },
                        {
                          id: 'svc2-title',
                          type: 'heading',
                          order: 4,
                          content: 'Strategy & Roadmap',
                          level: 4,
                          style: { color: C.darkText, fontFamily: 'Work Sans', fontSize: '1rem', fontWeight: '700', margin: '0 0 8px 0' },
                        },
                        {
                          id: 'svc2-desc',
                          type: 'text',
                          order: 5,
                          content: "For when you're about to invest in execution and need the full picture first. Defines what to build, what to delay, and why. Forces the decisions most teams avoid before investing in execution.",
                          style: { color: C.bodyText, fontFamily: 'Roboto', fontSize: '0.8125rem', lineHeight: '1.6', margin: '0 0 16px 0' },
                        },
                        {
                          id: 'svc2-result',
                          type: 'text',
                          order: 6,
                          content: 'You get: A sequenced, execution-ready roadmap your team can follow with confidence',
                          style: { color: C.teal, fontFamily: 'Roboto', fontSize: '0.8125rem', lineHeight: '1.5', backgroundColor: C.cardBg, padding: '10px 14px', borderRadius: '6px' },
                        },
                      ],
                    },
                    {
                      id: 'svc-spacer2',
                      type: 'spacer',
                      order: 2,
                      height: 'sm',
                    },
                    // Card 4: Advisory
                    {
                      id: 'svc-card4',
                      type: 'section',
                      order: 3,
                      backgroundColor: C.white,
                      paddingTop: '24px',
                      paddingBottom: '24px',
                      paddingLeft: '24px',
                      paddingRight: '24px',
                      blocks: [
                        {
                          id: 'svc4-number',
                          type: 'text',
                          order: 1,
                          content: '04',
                          alignment: 'right',
                          style: { color: '#D4D0C8', fontFamily: 'Work Sans', fontSize: '2.5rem', fontWeight: '700', lineHeight: '1', margin: '0 0 -20px 0' },
                        },
                        {
                          id: 'svc4-icon',
                          type: 'text',
                          order: 2,
                          content: '<span class="material-icons" style="font-size:24px;color:#0D6B6E">sync_alt</span>',
                          style: { margin: '0 0 8px 0' },
                        },
                        {
                          id: 'svc4-label',
                          type: 'text',
                          order: 3,
                          content: '04 / ADVISORY',
                          style: { color: C.mutedText, fontFamily: 'Work Sans', fontSize: '0.6875rem', letterSpacing: '0.1em', fontWeight: '500', margin: '0 0 6px 0' },
                        },
                        {
                          id: 'svc4-title',
                          type: 'heading',
                          order: 4,
                          content: 'Fractional Marketing Advisory',
                          level: 4,
                          style: { color: C.darkText, fontFamily: 'Work Sans', fontSize: '1rem', fontWeight: '700', margin: '0 0 8px 0' },
                        },
                        {
                          id: 'svc4-desc',
                          type: 'text',
                          order: 5,
                          content: 'Ongoing strategic guidance without adding headcount. Not execution. Ensuring the right decisions are made.',
                          style: { color: C.bodyText, fontFamily: 'Roboto', fontSize: '0.8125rem', lineHeight: '1.6', margin: '0 0 16px 0' },
                        },
                        {
                          id: 'svc4-result',
                          type: 'text',
                          order: 6,
                          content: 'You get: Consistent strategic input that keeps execution connected to the plan',
                          style: { color: C.teal, fontFamily: 'Roboto', fontSize: '0.8125rem', lineHeight: '1.5', backgroundColor: C.cardBg, padding: '10px 14px', borderRadius: '6px' },
                        },
                      ],
                    },
                  ],
                },
              ],
              gap: 'md',
              stackOnMobile: true,
            },
          ],
        },
      ],
      pageSettings: {
        backgroundColor: C.cream,
        color: C.darkText,
        fontFamily: 'Roboto',
      },
    },

    // ━━━━━ SLIDE 4: FIT ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    {
      id: 'slide-fit',
      label: 'Fit',
      blocks: [
        {
          id: 'fit-section',
          type: 'section',
          order: 1,
          backgroundColor: C.cream,
          paddingTop: '0px',
          paddingBottom: '0px',
          paddingLeft: '0px',
          paddingRight: '0px',
          maxWidth: '960px',
          blocks: [
            {
              id: 'fit-brand',
              type: 'text',
              order: 1,
              content: 'CY STRATEGIES',
              style: {
                color: C.teal,
                fontFamily: 'Work Sans',
                fontSize: '0.75rem',
                fontWeight: '500',
                letterSpacing: '0.2em',
                margin: '0 0 24px 0',
              },
            },
            {
              id: 'fit-label',
              type: 'text',
              order: 2,
              content: "LET'S BE HONEST ABOUT FIT",
              style: {
                color: C.teal,
                fontFamily: 'Work Sans',
                fontSize: '0.6875rem',
                fontWeight: '500',
                letterSpacing: '0.15em',
                margin: '0 0 8px 0',
              },
            },
            {
              id: 'fit-heading',
              type: 'heading',
              order: 3,
              content: 'Results matter. So does how we work together.',
              level: 2,
              style: {
                color: C.darkText,
                fontFamily: 'Work Sans',
                fontSize: '2.25rem',
                fontWeight: '700',
                lineHeight: '1.2',
                margin: '0 0 8px 0',
              },
            },
            {
              id: 'fit-accent-bar',
              type: 'divider',
              order: 4,
              style: {
                borderColor: C.teal,
                maxWidth: '60px',
                borderWidth: '3px',
                margin: '16px 0 20px 0',
              },
            },
            {
              id: 'fit-body',
              type: 'text',
              order: 5,
              content: "Short projects exist partly to test whether there's something worth continuing. You see how I think. I see if I can actually help. If it doesn't click, that's a fine outcome. I'd rather both sides know that upfront.",
              style: {
                color: C.bodyText,
                fontFamily: 'Roboto',
                fontSize: '0.9375rem',
                lineHeight: '1.7',
                margin: '0 0 32px 0',
              },
            },
            // Two-column fit/not-fit cards
            {
              id: 'fit-cards',
              type: 'columns',
              order: 6,
              columns: [
                {
                  id: 'fit-good-col',
                  width: '58%',
                  verticalAlign: 'top',
                  padding: 'none',
                  blocks: [
                    {
                      id: 'fit-good-card',
                      type: 'section',
                      order: 1,
                      backgroundColor: '#E8F4F2',
                      paddingTop: '28px',
                      paddingBottom: '28px',
                      paddingLeft: '28px',
                      paddingRight: '28px',
                      blocks: [
                        {
                          id: 'fit-good-title',
                          type: 'text',
                          order: 1,
                          content: 'TENDS TO BE A GOOD FIT',
                          style: { color: C.teal, fontFamily: 'Work Sans', fontSize: '0.6875rem', letterSpacing: '0.12em', fontWeight: '600', margin: '0 0 20px 0' },
                        },
                        {
                          id: 'fit-good-1',
                          type: 'text',
                          order: 2,
                          content: '+&nbsp;&nbsp;Owner-led or founder-adjacent service business at a growth inflection point',
                          style: { color: C.darkText, fontFamily: 'Roboto', fontSize: '0.875rem', lineHeight: '1.6', margin: '0 0 14px 0', paddingBottom: '14px', borderBottom: '1px solid rgba(13,107,110,0.1)' },
                        },
                        {
                          id: 'fit-good-2',
                          type: 'text',
                          order: 3,
                          content: '+&nbsp;&nbsp;$1M to $5M in revenue with limited internal marketing capacity',
                          style: { color: C.darkText, fontFamily: 'Roboto', fontSize: '0.875rem', lineHeight: '1.6', margin: '0 0 14px 0', paddingBottom: '14px', borderBottom: '1px solid rgba(13,107,110,0.1)' },
                        },
                        {
                          id: 'fit-good-3',
                          type: 'text',
                          order: 4,
                          content: '+&nbsp;&nbsp;Ready to make decisions about focus, even if it means changing direction',
                          style: { color: C.darkText, fontFamily: 'Roboto', fontSize: '0.875rem', lineHeight: '1.6', margin: '0 0 14px 0', paddingBottom: '14px', borderBottom: '1px solid rgba(13,107,110,0.1)' },
                        },
                        {
                          id: 'fit-good-4',
                          type: 'text',
                          order: 5,
                          content: '+&nbsp;&nbsp;Open to outside perspective and willing to challenge how things are currently being done',
                          style: { color: C.darkText, fontFamily: 'Roboto', fontSize: '0.875rem', lineHeight: '1.6', margin: '0 0 14px 0', paddingBottom: '14px', borderBottom: '1px solid rgba(13,107,110,0.1)' },
                        },
                        {
                          id: 'fit-good-5',
                          type: 'text',
                          order: 6,
                          content: '+&nbsp;&nbsp;Ready to be involved in the process, not just receive the output',
                          style: { color: C.darkText, fontFamily: 'Roboto', fontSize: '0.875rem', lineHeight: '1.6' },
                        },
                      ],
                    },
                  ],
                },
                {
                  id: 'fit-bad-col',
                  width: '42%',
                  verticalAlign: 'top',
                  padding: 'none',
                  blocks: [
                    {
                      id: 'fit-bad-card',
                      type: 'section',
                      order: 1,
                      backgroundColor: '#F0E8E0',
                      paddingTop: '28px',
                      paddingBottom: '28px',
                      paddingLeft: '28px',
                      paddingRight: '28px',
                      blocks: [
                        {
                          id: 'fit-bad-title',
                          type: 'text',
                          order: 1,
                          content: 'PROBABLY NOT THE RIGHT FIT',
                          style: { color: '#8B5E3C', fontFamily: 'Work Sans', fontSize: '0.6875rem', letterSpacing: '0.12em', fontWeight: '600', margin: '0 0 20px 0' },
                        },
                        {
                          id: 'fit-bad-1',
                          type: 'text',
                          order: 2,
                          content: '<span style="color:#C87941;font-weight:600">x</span>&nbsp;&nbsp;Already have a fully staffed in-house marketing department',
                          style: { color: C.darkText, fontFamily: 'Roboto', fontSize: '0.875rem', lineHeight: '1.6', margin: '0 0 14px 0', paddingBottom: '14px', borderBottom: '1px solid rgba(139,94,60,0.1)' },
                        },
                        {
                          id: 'fit-bad-2',
                          type: 'text',
                          order: 3,
                          content: '<span style="color:#C87941;font-weight:600">x</span>&nbsp;&nbsp;Looking for someone to run campaigns or manage production',
                          style: { color: C.darkText, fontFamily: 'Roboto', fontSize: '0.875rem', lineHeight: '1.6', margin: '0 0 14px 0', paddingBottom: '14px', borderBottom: '1px solid rgba(139,94,60,0.1)' },
                        },
                        {
                          id: 'fit-bad-3',
                          type: 'text',
                          order: 4,
                          content: '<span style="color:#C87941;font-weight:600">x</span>&nbsp;&nbsp;Primarily focused on finding the most affordable option',
                          style: { color: C.darkText, fontFamily: 'Roboto', fontSize: '0.875rem', lineHeight: '1.6' },
                        },
                      ],
                    },
                  ],
                },
              ],
              gap: 'md',
              stackOnMobile: true,
            },
          ],
        },
      ],
      pageSettings: {
        backgroundColor: C.cream,
        color: C.darkText,
        fontFamily: 'Roboto',
      },
    },

    // ━━━━━ SLIDE 5: RECENT WORK ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    {
      id: 'slide-work',
      label: 'Recent Work',
      blocks: [
        {
          id: 'work-section',
          type: 'section',
          order: 1,
          backgroundColor: C.cream,
          paddingTop: '0px',
          paddingBottom: '0px',
          paddingLeft: '0px',
          paddingRight: '0px',
          maxWidth: '900px',
          blocks: [
            {
              id: 'work-brand',
              type: 'text',
              order: 1,
              content: 'CY STRATEGIES',
              style: {
                color: C.teal,
                fontFamily: 'Work Sans',
                fontSize: '0.75rem',
                fontWeight: '500',
                letterSpacing: '0.2em',
                margin: '0 0 24px 0',
              },
            },
            {
              id: 'work-label',
              type: 'text',
              order: 2,
              content: 'RECENT WORK',
              style: {
                color: C.teal,
                fontFamily: 'Work Sans',
                fontSize: '0.6875rem',
                fontWeight: '500',
                letterSpacing: '0.15em',
                margin: '0 0 8px 0',
              },
            },
            {
              id: 'work-heading',
              type: 'heading',
              order: 3,
              content: 'A few examples.',
              level: 2,
              style: {
                color: C.darkText,
                fontFamily: 'Work Sans',
                fontSize: '2.25rem',
                fontWeight: '700',
                lineHeight: '1.2',
                margin: '0 0 32px 0',
              },
            },
            // Case Study 1: Post Captain Consulting
            {
              id: 'work-case1',
              type: 'section',
              order: 4,
              backgroundColor: C.white,
              paddingTop: '24px',
              paddingBottom: '24px',
              paddingLeft: '28px',
              paddingRight: '28px',
              blocks: [
                {
                  id: 'case1-header',
                  type: 'columns',
                  order: 1,
                  columns: [
                    {
                      id: 'case1-badge-col',
                      width: '48px',
                      verticalAlign: 'top',
                      padding: 'none',
                      blocks: [
                        {
                          id: 'case1-badge',
                          type: 'text',
                          order: 1,
                          content: 'PC',
                          alignment: 'center',
                          style: {
                            backgroundColor: C.teal,
                            color: C.white,
                            fontFamily: 'Work Sans',
                            fontSize: '0.8125rem',
                            fontWeight: '600',
                            width: '40px',
                            height: '40px',
                            lineHeight: '40px',
                            borderRadius: '8px',
                            textAlign: 'center',
                          },
                        },
                      ],
                    },
                    {
                      id: 'case1-text-col',
                      width: 'auto',
                      verticalAlign: 'top',
                      padding: 'none',
                      blocks: [
                        {
                          id: 'case1-name',
                          type: 'text',
                          order: 1,
                          content: 'POST CAPTAIN CONSULTING',
                          style: { color: C.teal, fontFamily: 'Work Sans', fontSize: '0.75rem', fontWeight: '600', letterSpacing: '0.1em', margin: '0 0 8px 0' },
                        },
                        {
                          id: 'case1-desc',
                          type: 'text',
                          order: 2,
                          content: "Jake Daly built Post Captain Consulting on referrals. When they were ready to grow intentionally, we built their first real marketing foundation from the ground up: brand, voice, story, positioning, data systems, and pipeline visibility. The goal was to look and sound like the company they already were.",
                          style: { color: C.bodyText, fontFamily: 'Roboto', fontSize: '0.8125rem', lineHeight: '1.6', margin: '0 0 12px 0' },
                        },
                        {
                          id: 'case1-result',
                          type: 'text',
                          order: 3,
                          content: 'Clear positioning + a foundation built for intentional growth',
                          style: { color: C.teal, fontFamily: 'Roboto', fontSize: '0.8125rem', backgroundColor: C.cardBg, padding: '8px 14px', borderRadius: '6px', display: 'inline-block' },
                        },
                      ],
                    },
                  ],
                  gap: 'md',
                  stackOnMobile: false,
                },
              ],
            },
            { id: 'work-spacer1', type: 'spacer', order: 5, height: 'xs' },
            // Case Study 2: Crossover Capital
            {
              id: 'work-case2',
              type: 'section',
              order: 6,
              backgroundColor: C.white,
              paddingTop: '24px',
              paddingBottom: '24px',
              paddingLeft: '28px',
              paddingRight: '28px',
              blocks: [
                {
                  id: 'case2-header',
                  type: 'columns',
                  order: 1,
                  columns: [
                    {
                      id: 'case2-badge-col',
                      width: '48px',
                      verticalAlign: 'top',
                      padding: 'none',
                      blocks: [
                        {
                          id: 'case2-badge',
                          type: 'text',
                          order: 1,
                          content: 'CC',
                          alignment: 'center',
                          style: {
                            backgroundColor: C.teal,
                            color: C.white,
                            fontFamily: 'Work Sans',
                            fontSize: '0.8125rem',
                            fontWeight: '600',
                            width: '40px',
                            height: '40px',
                            lineHeight: '40px',
                            borderRadius: '8px',
                            textAlign: 'center',
                          },
                        },
                      ],
                    },
                    {
                      id: 'case2-text-col',
                      width: 'auto',
                      verticalAlign: 'top',
                      padding: 'none',
                      blocks: [
                        {
                          id: 'case2-name',
                          type: 'text',
                          order: 1,
                          content: 'CROSSOVER CAPITAL',
                          style: { color: C.teal, fontFamily: 'Work Sans', fontSize: '0.75rem', fontWeight: '600', letterSpacing: '0.1em', margin: '0 0 8px 0' },
                        },
                        {
                          id: 'case2-desc',
                          type: 'text',
                          order: 2,
                          content: "Alex Pron needed to reach family law attorneys with a specific, credible message. We built the positioning, campaign structure, audience targeting, and content to do that. An attorney who said he never clicks ads reached out after clicking this one. The message was that precise.",
                          style: { color: C.bodyText, fontFamily: 'Roboto', fontSize: '0.8125rem', lineHeight: '1.6', margin: '0 0 12px 0' },
                        },
                        {
                          id: 'case2-result',
                          type: 'text',
                          order: 3,
                          content: 'Right strategy + right message + right audience',
                          style: { color: C.teal, fontFamily: 'Roboto', fontSize: '0.8125rem', backgroundColor: C.cardBg, padding: '8px 14px', borderRadius: '6px', display: 'inline-block' },
                        },
                      ],
                    },
                  ],
                  gap: 'md',
                  stackOnMobile: false,
                },
              ],
            },
            { id: 'work-spacer2', type: 'spacer', order: 7, height: 'xs' },
            // Case Study 3: JM Law
            {
              id: 'work-case3',
              type: 'section',
              order: 8,
              backgroundColor: C.white,
              paddingTop: '24px',
              paddingBottom: '24px',
              paddingLeft: '28px',
              paddingRight: '28px',
              blocks: [
                {
                  id: 'case3-header',
                  type: 'columns',
                  order: 1,
                  columns: [
                    {
                      id: 'case3-badge-col',
                      width: '48px',
                      verticalAlign: 'top',
                      padding: 'none',
                      blocks: [
                        {
                          id: 'case3-badge',
                          type: 'text',
                          order: 1,
                          content: 'JM',
                          alignment: 'center',
                          style: {
                            backgroundColor: C.teal,
                            color: C.white,
                            fontFamily: 'Work Sans',
                            fontSize: '0.8125rem',
                            fontWeight: '600',
                            width: '40px',
                            height: '40px',
                            lineHeight: '40px',
                            borderRadius: '8px',
                            textAlign: 'center',
                          },
                        },
                      ],
                    },
                    {
                      id: 'case3-text-col',
                      width: 'auto',
                      verticalAlign: 'top',
                      padding: 'none',
                      blocks: [
                        {
                          id: 'case3-name',
                          type: 'text',
                          order: 1,
                          content: 'JM LAW',
                          style: { color: C.teal, fontFamily: 'Work Sans', fontSize: '0.75rem', fontWeight: '600', letterSpacing: '0.1em', margin: '0 0 8px 0' },
                        },
                        {
                          id: 'case3-desc',
                          type: 'text',
                          order: 2,
                          content: "Josh Marks needed a process, not more content. We built the outreach workflow, lead management system, and follow-up structure to help him shift from scattered activity to focused B2B referral relationships with business brokers and referral partners.",
                          style: { color: C.bodyText, fontFamily: 'Roboto', fontSize: '0.8125rem', lineHeight: '1.6', margin: '0 0 12px 0' },
                        },
                        {
                          id: 'case3-result',
                          type: 'text',
                          order: 3,
                          content: 'Focused outreach. Better relationships. More consistency.',
                          style: { color: C.teal, fontFamily: 'Roboto', fontSize: '0.8125rem', backgroundColor: C.cardBg, padding: '8px 14px', borderRadius: '6px', display: 'inline-block' },
                        },
                      ],
                    },
                  ],
                  gap: 'md',
                  stackOnMobile: false,
                },
              ],
            },
          ],
        },
      ],
      pageSettings: {
        backgroundColor: C.cream,
        color: C.darkText,
        fontFamily: 'Roboto',
      },
    },

    // ━━━━━ SLIDE 6: WHAT'S NEXT / CTA ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    {
      id: 'slide-cta',
      label: "What's Next",
      blocks: [
        {
          id: 'cta-section',
          type: 'section',
          order: 1,
          backgroundColor: '#E0F0EE',
          paddingTop: '0px',
          paddingBottom: '0px',
          paddingLeft: '0px',
          paddingRight: '0px',
          maxWidth: '800px',
          blocks: [
            {
              id: 'cta-brand',
              type: 'text',
              order: 1,
              content: 'CY STRATEGIES',
              style: {
                color: C.teal,
                fontFamily: 'Work Sans',
                fontSize: '0.75rem',
                fontWeight: '500',
                letterSpacing: '0.2em',
                margin: '0 0 24px 0',
              },
            },
            {
              id: 'cta-label',
              type: 'text',
              order: 2,
              content: "WHAT'S NEXT",
              style: {
                color: C.teal,
                fontFamily: 'Work Sans',
                fontSize: '0.6875rem',
                fontWeight: '500',
                letterSpacing: '0.15em',
                margin: '0 0 8px 0',
              },
            },
            {
              id: 'cta-heading',
              type: 'heading',
              order: 3,
              content: 'Two ways to move forward.',
              level: 2,
              style: {
                color: C.darkText,
                fontFamily: 'Work Sans',
                fontSize: '2.25rem',
                fontWeight: '700',
                lineHeight: '1.2',
                margin: '0 0 8px 0',
              },
            },
            {
              id: 'cta-accent-bar',
              type: 'divider',
              order: 4,
              style: {
                borderColor: C.teal,
                maxWidth: '60px',
                borderWidth: '3px',
                margin: '16px 0 20px 0',
              },
            },
            {
              id: 'cta-body',
              type: 'text',
              order: 5,
              content: "If you want a clearer sense of scope, timing, and fit before we talk, start with the guided flow. If you'd rather start with a conversation, that works too.",
              style: {
                color: C.teal,
                fontFamily: 'Work Sans',
                fontSize: '1.0625rem',
                lineHeight: '1.6',
                margin: '0 0 40px 0',
              },
            },
            // CTA Card 1: Walk me through it
            {
              id: 'cta-card1',
              type: 'section',
              order: 6,
              backgroundColor: C.ctaDark,
              paddingTop: '24px',
              paddingBottom: '24px',
              paddingLeft: '28px',
              paddingRight: '28px',
              blocks: [
                {
                  id: 'cta1-label',
                  type: 'text',
                  order: 1,
                  content: 'GET CLARITY FIRST',
                  style: { color: 'rgba(255,255,255,0.6)', fontFamily: 'Work Sans', fontSize: '0.6875rem', letterSpacing: '0.12em', fontWeight: '500', margin: '0 0 4px 0' },
                },
                {
                  id: 'cta1-title',
                  type: 'heading',
                  order: 2,
                  content: 'Walk me through it',
                  level: 3,
                  style: { color: C.white, fontFamily: 'Work Sans', fontSize: '1.125rem', fontWeight: '600' },
                },
              ],
            },
            {
              id: 'cta-desc1',
              type: 'text',
              order: 7,
              content: "A short, guided set of questions that tailors my offerings to your business and shows how scope, timing, and priorities would likely take shape.",
              style: {
                color: C.bodyText,
                fontFamily: 'Roboto',
                fontSize: '0.875rem',
                lineHeight: '1.6',
                margin: '12px 0 24px 0',
              },
            },
            // CTA Card 2: Start a conversation
            {
              id: 'cta-card2',
              type: 'section',
              order: 8,
              backgroundColor: C.white,
              paddingTop: '24px',
              paddingBottom: '24px',
              paddingLeft: '28px',
              paddingRight: '28px',
              blocks: [
                {
                  id: 'cta2-label',
                  type: 'text',
                  order: 1,
                  content: 'START WITH A CONVERSATION',
                  style: { color: C.mutedText, fontFamily: 'Work Sans', fontSize: '0.6875rem', letterSpacing: '0.12em', fontWeight: '500', margin: '0 0 4px 0' },
                },
                {
                  id: 'cta2-title',
                  type: 'heading',
                  order: 2,
                  content: 'Start a conversation',
                  level: 3,
                  style: { color: C.teal, fontFamily: 'Work Sans', fontSize: '1.125rem', fontWeight: '600' },
                },
              ],
            },
            {
              id: 'cta-desc2',
              type: 'text',
              order: 9,
              content: "If you already have context and want to talk it through, we can start there and figure out fit together.",
              style: {
                color: C.bodyText,
                fontFamily: 'Roboto',
                fontSize: '0.875rem',
                lineHeight: '1.6',
                margin: '12px 0 32px 0',
              },
            },
            {
              id: 'cta-button',
              type: 'button',
              order: 10,
              text: 'Schedule a call',
              url: CALENDLY,
              variant: 'primary',
              alignment: 'left',
              size: 'lg',
              openInNewTab: true,
              icon: 'arrow_forward',
              iconPosition: 'right',
              hoverEffect: 'lift',
            },
          ],
        },
      ],
      pageSettings: {
        backgroundColor: '#E0F0EE',
        color: C.darkText,
        fontFamily: 'Roboto',
      },
    },
  ];
}

async function createPitchDeck() {
  const { db } = await import('../../../lib/db');
  const { pitchDecks, clients, users } = await import('../../../lib/db/schema');
  const { eq, and } = await import('drizzle-orm');

  // Find the CY Strategies client
  const [user] = await db.select().from(users).where(eq(users.email, 'cystrategies@simplerdevelopment.com')).limit(1);
  if (!user) {
    console.error('CY Strategies user not found. Run setup-client.ts first.');
    process.exit(1);
  }

  const [client] = await db.select().from(clients).where(eq(clients.userId, user.id)).limit(1);
  if (!client) {
    console.error('CY Strategies client not found.');
    process.exit(1);
  }

  const slug = 'pitch-deck-1';
  const title = 'CY Strategies - Marketing Strategy Consultant';

  const slides = buildSlides();
  const theme = {
    primaryColor: C.teal,
    accentColor: C.copper,
    backgroundColor: C.cream,
    textColor: C.darkText,
    headingFont: 'Work Sans',
    bodyFont: 'Roboto',
  };

  // Check if deck already exists
  const existing = await db.select().from(pitchDecks)
    .where(and(eq(pitchDecks.clientId, client.id), eq(pitchDecks.slug, slug)))
    .limit(1);

  if (existing.length > 0) {
    await db.update(pitchDecks)
      .set({
        title,
        description: 'Marketing strategy consulting pitch deck for CY Strategies by Cody York',
        slides: slides as any,
        theme,
        formatVersion: 2,
        status: 'published',
        updatedAt: new Date(),
      })
      .where(eq(pitchDecks.id, existing[0].id));
    console.log(`Pitch deck updated: ID ${existing[0].id}`);
  } else {
    const [deck] = await db.insert(pitchDecks).values({
      clientId: client.id,
      title,
      slug,
      description: 'Marketing strategy consulting pitch deck for CY Strategies by Cody York',
      status: 'published',
      slides: slides as any,
      theme,
      formatVersion: 2,
    }).returning();
    console.log(`Pitch deck created: ID ${deck.id}`);
  }

  console.log(`\nView at: https://cystrategies.co/pitch-deck/${slug}`);
  console.log('\n=== PITCH DECK CREATION COMPLETE ===');
  process.exit(0);
}

createPitchDeck().catch(err => { console.error(err); process.exit(1); });
