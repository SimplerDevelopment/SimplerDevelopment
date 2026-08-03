/**
 * Extra pitch-deck slides for Crossover Capital Advisors.
 * Two standalone slides: "The Platform" and "Your Data, Your Keys"
 *
 * Brand: Crossover Capital Advisors
 *   Navy dark bg: #0a1628 | Navy card-on-dark: #16273f
 *   Light bg: #ffffff
 *   Gold (on dark): #cfa122
 *   Gold-dark eyebrows (on light): #8a6d14
 *   Display font: Cormorant Garamond, Georgia, serif
 *   Body font: Plus Jakarta Sans, sans-serif
 */

// ─────────────────────────────────────────────────────────────────────────────
// SLIDE: THE PLATFORM (LIGHT)
// ─────────────────────────────────────────────────────────────────────────────
export function platformSlide(): any {
  return {
    id: 'slide-platform',
    label: 'The Platform',
    blocks: [
      {
        id: 'plat-section',
        type: 'section',
        order: 1,
        backgroundColor: '#ffffff',
        paddingTop: '0px',
        paddingBottom: '0px',
        paddingLeft: '0px',
        paddingRight: '0px',
        maxWidth: '1080px',
        blocks: [
          {
            id: 'plat-eyebrow',
            type: 'text',
            order: 1,
            content: 'ONE PLATFORM, MANY TOOLS',
            style: {
              color: '#8a6d14',
              fontFamily: 'Plus Jakarta Sans, sans-serif',
              fontSize: '0.6875rem',
              fontWeight: '600',
              letterSpacing: '0.18em',
              margin: '0 0 12px 0',
            },
          },
          {
            id: 'plat-heading',
            type: 'heading',
            order: 2,
            content: 'Everything your firm runs on &mdash; in one place.',
            level: 2,
            style: {
              color: '#0a1628',
              fontFamily: 'Cormorant Garamond, Georgia, serif',
              fontSize: '2.5rem',
              fontWeight: '500',
              lineHeight: '1.1',
              margin: '0 0 16px 0',
            },
          },
          {
            id: 'plat-body',
            type: 'text',
            order: 3,
            content:
              'No more stitching together Calendly, Mailchimp, a separate CRM and a forms tool with five logins. SimplerDevelopment replaces the stack with one connected system &mdash; and Claude can drive all of it.',
            style: {
              color: '#475569',
              fontFamily: 'Plus Jakarta Sans, sans-serif',
              fontSize: '1.0625rem',
              lineHeight: '1.65',
              maxWidth: '860px',
              margin: '0 0 28px 0',
            },
          },
          {
            id: 'plat-card-grid',
            type: 'card-grid',
            order: 4,
            columns: 3,
            cards: [
              {
                id: 'plat-card-01',
                title: 'Website &amp; CMS',
                description:
                  'A fast, branded site you &mdash; or Claude &mdash; can edit block by block.',
              },
              {
                id: 'plat-card-02',
                title: 'CRM',
                description:
                  'Contacts, companies, pipelines and deal scoring. Your referral network lives here.',
              },
              {
                id: 'plat-card-03',
                title: 'Email Marketing',
                description:
                  'Newsletters, drip campaigns and lead-magnet automation. Replaces Mailchimp.',
              },
              {
                id: 'plat-card-04',
                title: 'Forms &amp; Surveys',
                description:
                  'Intake, qualification and feedback &mdash; responses route straight into the CRM.',
              },
              {
                id: 'plat-card-05',
                title: 'Booking &amp; Scheduling',
                description:
                  'Branded booking pages tied to your calendar. Replaces Calendly.',
              },
              {
                id: 'plat-card-06',
                title: 'Proposals &amp; E-Sign',
                description:
                  'Send, track and e-sign proposals and engagement letters.',
              },
              {
                id: 'plat-card-07',
                title: 'Slide Decks',
                description:
                  'Branded decks like this one &mdash; authored and kept current by AI.',
              },
              {
                id: 'plat-card-08',
                title: 'Project Board',
                description:
                  'A Kanban board to run engagements, tasks and deliverables.',
              },
              {
                id: 'plat-card-09',
                title: 'Company Brain',
                description:
                  'Your searchable memory: notes, documents and glossary &mdash; RAG-powered.',
              },
            ],
            elementStyles: {
              card: {
                backgroundColor: '#0a1628',
                borderColor: 'rgba(207,161,34,0.22)',
              },
              cardTitle: {
                fontFamily: 'Cormorant Garamond, Georgia, serif',
                color: '#ffffff',
              },
              cardDescription: {
                fontFamily: 'Plus Jakarta Sans, sans-serif',
                color: 'rgba(255,255,255,0.82)',
              },
            },
          },
          {
            id: 'plat-note',
            type: 'text',
            order: 5,
            content:
              'Plus automations, a media library and an MCP that exposes every tool to Claude.',
            style: {
              color: '#64748b',
              fontFamily: 'Plus Jakarta Sans, sans-serif',
              fontSize: '0.9rem',
              lineHeight: '1.65',
              maxWidth: '860px',
              margin: '24px 0 0 0',
            },
          },
        ],
      },
    ],
    pageSettings: {
      backgroundColor: '#ffffff',
      color: '#0a1628',
      fontFamily: 'Plus Jakarta Sans, sans-serif',
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// SLIDE: YOUR DATA, YOUR KEYS (DARK)
// ─────────────────────────────────────────────────────────────────────────────
export function byokSlide(): any {
  return {
    id: 'slide-byok',
    label: 'Your Data, Your Keys',
    blocks: [
      {
        id: 'byok-section',
        type: 'section',
        order: 1,
        backgroundColor: '#0a1628',
        paddingTop: '0px',
        paddingBottom: '0px',
        paddingLeft: '0px',
        paddingRight: '0px',
        maxWidth: '1080px',
        blocks: [
          {
            id: 'byok-eyebrow',
            type: 'text',
            order: 1,
            content: 'TRUST &amp; DATA SOVEREIGNTY',
            style: {
              color: '#cfa122',
              fontFamily: 'Plus Jakarta Sans, sans-serif',
              fontSize: '0.6875rem',
              fontWeight: '600',
              letterSpacing: '0.18em',
              margin: '0 0 12px 0',
            },
          },
          {
            id: 'byok-heading',
            type: 'heading',
            order: 2,
            content: 'Your data. Your keys. Your boundary.',
            level: 2,
            style: {
              color: '#ffffff',
              fontFamily: 'Cormorant Garamond, Georgia, serif',
              fontSize: '2.5rem',
              fontWeight: '500',
              lineHeight: '1.1',
              margin: '0 0 16px 0',
            },
          },
          {
            id: 'byok-body',
            type: 'text',
            order: 3,
            content:
              'Your agentic OS runs in a dedicated, single-tenant instance &mdash; so where the data lives and which model touches it is entirely yours to control, and client data never leaves a boundary your compliance team has approved.',
            style: {
              color: 'rgba(255,255,255,0.82)',
              fontFamily: 'Plus Jakarta Sans, sans-serif',
              fontSize: '1.0625rem',
              lineHeight: '1.65',
              maxWidth: '860px',
              margin: '0 0 28px 0',
            },
          },
          {
            id: 'byok-card-grid',
            type: 'card-grid',
            order: 4,
            columns: 2,
            cards: [
              {
                id: 'byok-card-01',
                title: 'Bring Your Own Key',
                description:
                  'Run AI on your own Anthropic or OpenAI key &mdash; under your contract, your billing and your data-processing terms.',
              },
              {
                id: 'byok-card-02',
                title: 'Your Own Boundary',
                description:
                  'If your RIA forbids third-party AI, we run a self-hosted or enterprise model so no client data leaves an approved perimeter.',
              },
              {
                id: 'byok-card-03',
                title: 'Encrypted End-to-End',
                description:
                  'Encryption in transit and at rest; secrets scoped, rotated and never shared across tenants.',
              },
              {
                id: 'byok-card-04',
                title: 'Full Audit Trail',
                description:
                  'Every AI action and data access is logged and reviewable &mdash; something your CCO can actually sign off on.',
              },
            ],
            elementStyles: {
              card: {
                backgroundColor: '#16273f',
                borderColor: 'rgba(207,161,34,0.22)',
              },
              cardTitle: {
                fontFamily: 'Cormorant Garamond, Georgia, serif',
                color: '#ffffff',
              },
              cardDescription: {
                fontFamily: 'Plus Jakarta Sans, sans-serif',
                color: 'rgba(255,255,255,0.82)',
              },
            },
          },
        ],
      },
    ],
    pageSettings: {
      backgroundColor: '#0a1628',
      color: '#ffffff',
      fontFamily: 'Plus Jakarta Sans, sans-serif',
    },
  };
}
