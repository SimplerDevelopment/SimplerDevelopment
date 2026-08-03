/**
 * Agentic OS pitch deck slides for Crossover Capital Advisors.
 * 9 slides pitching SimplerDevelopment's agentic OS capabilities
 * to Alex Pron, Tasha Shadle & Danielle Montgomery.
 *
 * Brand: Crossover Capital Advisors
 *   Navy dark bg: #0a1628 | Navy card-on-dark: #16273f
 *   Light bg A: #ffffff  | Light bg B: #fafbfd
 *   Gold (on dark): #cfa122
 *   Gold-dark eyebrows (on light): #8a6d14
 *   Gold-dark stat values (on light): #9a7817
 *   Display font: Cormorant Garamond, Georgia, serif
 *   Body font: Plus Jakarta Sans, sans-serif
 */

export function buildAgenticSlides(): any[] {
  return [

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // SLIDE 1 — COVER (DARK)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    {
      id: 'slide-agentic-cover',
      label: 'Cover',
      blocks: [
        {
          id: 'cover-section',
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
              id: 'cover-eyebrow',
              type: 'text',
              order: 1,
              content: 'SIMPLERDEVELOPMENT &nbsp;&times;&nbsp; CROSSOVER CAPITAL',
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
              id: 'cover-heading',
              type: 'heading',
              order: 2,
              content: 'An agentic operating system<br/>for your firm.',
              level: 1,
              style: {
                color: '#ffffff',
                fontFamily: 'Cormorant Garamond, Georgia, serif',
                fontSize: '3.5rem',
                fontWeight: '500',
                lineHeight: '1.1',
                margin: '0 0 8px 0',
              },
            },
            {
              id: 'cover-divider',
              type: 'divider',
              order: 3,
              style: {
                borderColor: '#cfa122',
                maxWidth: '60px',
                borderWidth: '3px',
                margin: '12px 0 24px 0',
              },
            },
            {
              id: 'cover-body',
              type: 'text',
              order: 4,
              content: 'One brain that connects your tools, surfaces what matters, and lets you run the business by simply asking &mdash; built on the foundation already live in your portal.',
              style: {
                color: 'rgba(255,255,255,0.82)',
                fontFamily: 'Plus Jakarta Sans, sans-serif',
                fontSize: '1.0625rem',
                lineHeight: '1.65',
                maxWidth: '820px',
                margin: '0 0 28px 0',
              },
            },
            {
              id: 'cover-meta-cols',
              type: 'columns',
              order: 5,
              columns: [
                {
                  id: 'cover-meta-left',
                  width: '50%',
                  verticalAlign: 'top',
                  padding: 'sm',
                  blocks: [
                    {
                      id: 'cover-prepared-label',
                      type: 'text',
                      order: 1,
                      content: 'PREPARED FOR',
                      style: {
                        color: 'rgba(255,255,255,0.6)',
                        fontFamily: 'Plus Jakarta Sans, sans-serif',
                        fontSize: '0.6875rem',
                        fontWeight: '600',
                        letterSpacing: '0.15em',
                        margin: '0 0 6px 0',
                      },
                    },
                    {
                      id: 'cover-prepared-value',
                      type: 'text',
                      order: 2,
                      content: 'Alex Pron, Tasha Shadle &amp; Danielle Montgomery / Crossover Capital Advisors',
                      style: {
                        color: '#ffffff',
                        fontFamily: 'Plus Jakarta Sans, sans-serif',
                        fontSize: '0.9375rem',
                        fontWeight: '500',
                        lineHeight: '1.5',
                      },
                    },
                  ],
                },
                {
                  id: 'cover-meta-right',
                  width: '50%',
                  verticalAlign: 'top',
                  padding: 'sm',
                  blocks: [
                    {
                      id: 'cover-from-label',
                      type: 'text',
                      order: 1,
                      content: 'FROM',
                      style: {
                        color: 'rgba(255,255,255,0.6)',
                        fontFamily: 'Plus Jakarta Sans, sans-serif',
                        fontSize: '0.6875rem',
                        fontWeight: '600',
                        letterSpacing: '0.15em',
                        margin: '0 0 6px 0',
                      },
                    },
                    {
                      id: 'cover-from-value',
                      type: 'text',
                      order: 2,
                      content: 'Dan Coyle &amp; Cody York / SimplerDevelopment + CY Strategies',
                      style: {
                        color: '#ffffff',
                        fontFamily: 'Plus Jakarta Sans, sans-serif',
                        fontSize: '0.9375rem',
                        fontWeight: '500',
                        lineHeight: '1.5',
                      },
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
        backgroundColor: '#0a1628',
        color: '#ffffff',
        fontFamily: 'Plus Jakarta Sans, sans-serif',
      },
    },

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // SLIDE 2 — ALREADY BUILT (LIGHT)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    {
      id: 'slide-already-built',
      label: 'Already Built',
      blocks: [
        {
          id: 'built-section',
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
              id: 'built-eyebrow',
              type: 'text',
              order: 1,
              content: 'WHAT&rsquo;S ALREADY LIVE',
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
              id: 'built-heading',
              type: 'heading',
              order: 2,
              content: 'We didn&rsquo;t start with a slide. We started with your OS.',
              level: 2,
              style: {
                color: '#0a1628',
                fontFamily: 'Cormorant Garamond, Georgia, serif',
                fontSize: '2.5rem',
                fontWeight: '500',
                lineHeight: '1.1',
                margin: '0 0 8px 0',
              },
            },
            {
              id: 'built-divider',
              type: 'divider',
              order: 3,
              style: {
                borderColor: '#cfa122',
                maxWidth: '60px',
                borderWidth: '3px',
                margin: '12px 0 24px 0',
              },
            },
            {
              id: 'built-body',
              type: 'text',
              order: 4,
              content: 'In just a few weeks we built and proved a working foundation &mdash; ready to stand up in a dedicated instance of your own, with Alex&rsquo;s dashboard on top.',
              style: {
                color: '#475569',
                fontFamily: 'Plus Jakarta Sans, sans-serif',
                fontSize: '1.0625rem',
                lineHeight: '1.65',
                maxWidth: '820px',
                margin: '0 0 28px 0',
              },
            },
            {
              id: 'built-stats',
              type: 'stats',
              order: 5,
              columns: 4,
              stats: [
                { id: 'stat-contacts', value: '1,416', label: 'Referral Contacts Enriched' },
                { id: 'stat-firms', value: '1,226', label: 'Firms Mapped' },
                { id: 'stat-articles', value: '69', label: 'Brain Articles Indexed' },
                { id: 'stat-mcp', value: '100%', label: 'MCP-Connected' },
              ],
              elementStyles: {
                statValue: {
                  fontFamily: 'Cormorant Garamond, Georgia, serif',
                  fontSize: '2.5rem',
                  fontWeight: '300',
                  color: '#9a7817',
                },
                statLabel: {
                  fontSize: '0.6875rem',
                  letterSpacing: '0.16em',
                  textTransform: 'uppercase',
                  color: '#64748b',
                  fontFamily: 'Plus Jakarta Sans, sans-serif',
                },
              },
            },
            {
              id: 'built-spacer',
              type: 'spacer',
              order: 6,
              height: 'md',
            },
            {
              id: 'built-card-grid',
              type: 'card-grid',
              order: 7,
              columns: 4,
              cards: [
                {
                  id: 'card-website',
                  title: 'Live Website',
                  description: 'Branded Crossover Capital site, access-gated and ready to convert.',
                },
                {
                  id: 'card-brain',
                  title: 'Company Brain',
                  description: '69 notes plus your Form ADV, Form CRS and Privacy docs and a 28-term glossary &mdash; embedded and searchable.',
                },
                {
                  id: 'card-crm',
                  title: 'Referral CRM',
                  description: '1,416 attorney contacts and 1,226 firms, scraped and enriched by an autonomous run.',
                },
                {
                  id: 'card-content',
                  title: 'Content Engine',
                  description: 'A digital-asset article library, drafted by Claude from your brain.',
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
          ],
        },
      ],
      pageSettings: {
        backgroundColor: '#ffffff',
        color: '#0a1628',
        fontFamily: 'Plus Jakarta Sans, sans-serif',
      },
    },

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // SLIDE 3 — THE PROBLEM (DARK)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    {
      id: 'slide-problem',
      label: 'The Problem',
      blocks: [
        {
          id: 'problem-section',
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
              id: 'problem-eyebrow',
              type: 'text',
              order: 1,
              content: 'WHY THIS MATTERS',
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
              id: 'problem-heading',
              type: 'heading',
              order: 2,
              content: 'Your tools don&rsquo;t talk. So the work lands on Alex.',
              level: 2,
              style: {
                color: '#ffffff',
                fontFamily: 'Cormorant Garamond, Georgia, serif',
                fontSize: '2.5rem',
                fontWeight: '500',
                lineHeight: '1.1',
                margin: '0 0 8px 0',
              },
            },
            {
              id: 'problem-divider',
              type: 'divider',
              order: 3,
              style: {
                borderColor: '#cfa122',
                maxWidth: '60px',
                borderWidth: '3px',
                margin: '12px 0 24px 0',
              },
            },
            {
              id: 'problem-body',
              type: 'text',
              order: 4,
              content: 'Hazel records the meeting. Wealthbox holds half the records, Orion the other half. QuickBooks lives apart, Study tasks don&rsquo;t sync. Leads go cold and follow-ups slip.',
              style: {
                color: 'rgba(255,255,255,0.82)',
                fontFamily: 'Plus Jakarta Sans, sans-serif',
                fontSize: '1.0625rem',
                lineHeight: '1.65',
                maxWidth: '820px',
                margin: '0 0 28px 0',
              },
            },
            {
              id: 'problem-spacer',
              type: 'spacer',
              order: 5,
              height: 'md',
            },
            {
              id: 'problem-pullquote',
              type: 'section',
              order: 6,
              backgroundColor: '#16273f',
              paddingTop: '28px',
              paddingBottom: '28px',
              paddingLeft: '36px',
              paddingRight: '36px',
              blocks: [
                {
                  id: 'pq-quote',
                  type: 'text',
                  order: 1,
                  content: '&ldquo;If we built something that&rsquo;s sort of a brain that also created one dashboard with it all in it &mdash; CRM, booking, email &mdash; that would be amazing.',
                  style: {
                    color: 'rgba(255,255,255,0.92)',
                    fontFamily: 'Plus Jakarta Sans, sans-serif',
                    fontSize: '1.125rem',
                    fontStyle: 'italic',
                    lineHeight: '1.55',
                    margin: '0 0 10px 0',
                  },
                },
                {
                  id: 'pq-attr',
                  type: 'text',
                  order: 2,
                  content: '&mdash; Danielle Montgomery, Fractional COO',
                  style: {
                    color: '#cfa122',
                    fontFamily: 'Plus Jakarta Sans, sans-serif',
                    fontSize: '0.8125rem',
                    fontWeight: '600',
                  },
                },
              ],
            },
          ],
        },
      ],
      pageSettings: {
        backgroundColor: '#0a1628',
        color: '#ffffff',
        fontFamily: 'Plus Jakarta Sans, sans-serif',
      },
    },

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // SLIDE 4 — THE VISION (LIGHT)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    {
      id: 'slide-vision',
      label: 'The Vision',
      blocks: [
        {
          id: 'vision-section',
          type: 'section',
          order: 1,
          backgroundColor: '#fafbfd',
          paddingTop: '0px',
          paddingBottom: '0px',
          paddingLeft: '0px',
          paddingRight: '0px',
          maxWidth: '1080px',
          blocks: [
            {
              id: 'vision-eyebrow',
              type: 'text',
              order: 1,
              content: 'THE MODEL',
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
              id: 'vision-heading',
              type: 'heading',
              order: 2,
              content: 'One brain. One place to ask. Every tool underneath.',
              level: 2,
              style: {
                color: '#0a1628',
                fontFamily: 'Cormorant Garamond, Georgia, serif',
                fontSize: '2.5rem',
                fontWeight: '500',
                lineHeight: '1.1',
                margin: '0 0 8px 0',
              },
            },
            {
              id: 'vision-divider',
              type: 'divider',
              order: 3,
              style: {
                borderColor: '#cfa122',
                maxWidth: '60px',
                borderWidth: '3px',
                margin: '12px 0 24px 0',
              },
            },
            {
              id: 'vision-body',
              type: 'text',
              order: 4,
              content: 'SimplerDevelopment is the warehouse that holds everything. Claude is the driver that reasons over it. MCP is the wiring that connects roughly twenty domains &mdash; so the whole business answers a single question.',
              style: {
                color: '#475569',
                fontFamily: 'Plus Jakarta Sans, sans-serif',
                fontSize: '1.0625rem',
                lineHeight: '1.65',
                maxWidth: '820px',
                margin: '0 0 28px 0',
              },
            },
            {
              id: 'vision-timeline',
              type: 'timeline',
              order: 5,
              steps: [
                {
                  id: 'step-warehouse',
                  title: 'The Warehouse',
                  description: 'SimplerDevelopment stores your site, CRM, brain, content and bookings as one source of truth.',
                },
                {
                  id: 'step-wiring',
                  title: 'The Wiring',
                  description: 'One MCP connector exposes ~20 domains to AI &mdash; securely, with scope guards.',
                },
                {
                  id: 'step-driver',
                  title: 'The Driver',
                  description: 'Claude reads the warehouse and acts: drafts, updates, surfaces, reminds.',
                },
                {
                  id: 'step-ask',
                  title: 'You Just Ask',
                  description: 'Alex asks a question; the OS answers with context and citations.',
                },
              ],
              numberColor: 'rgba(138,109,20,0.8)',
              layout: 'alternating',
              elementStyles: {
                stepTitle: {
                  fontFamily: 'Cormorant Garamond, Georgia, serif',
                  color: '#0a1628',
                },
                stepDescription: {
                  color: '#475569',
                  fontFamily: 'Plus Jakarta Sans, sans-serif',
                },
              },
            },
          ],
        },
      ],
      pageSettings: {
        backgroundColor: '#fafbfd',
        color: '#0a1628',
        fontFamily: 'Plus Jakarta Sans, sans-serif',
      },
    },

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // SLIDE 5 — THE BUILD (DARK)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    {
      id: 'slide-build',
      label: 'The Build',
      blocks: [
        {
          id: 'build-section',
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
              id: 'build-eyebrow',
              type: 'text',
              order: 1,
              content: 'THE BUILD &middot; PHASE ONE',
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
              id: 'build-heading',
              type: 'heading',
              order: 2,
              content: 'A CEO dashboard built around how Alex works.',
              level: 2,
              style: {
                color: '#ffffff',
                fontFamily: 'Cormorant Garamond, Georgia, serif',
                fontSize: '2.5rem',
                fontWeight: '500',
                lineHeight: '1.1',
                margin: '0 0 8px 0',
              },
            },
            {
              id: 'build-divider',
              type: 'divider',
              order: 3,
              style: {
                borderColor: '#cfa122',
                maxWidth: '60px',
                borderWidth: '3px',
                margin: '12px 0 24px 0',
              },
            },
            {
              id: 'build-body',
              type: 'text',
              order: 4,
              content: 'Your custom agentic dashboard pulls QuickBooks, Study, the CRM and the brain through one MCP &mdash; role-based, so Alex sees signal, not noise.',
              style: {
                color: 'rgba(255,255,255,0.82)',
                fontFamily: 'Plus Jakarta Sans, sans-serif',
                fontSize: '1.0625rem',
                lineHeight: '1.65',
                maxWidth: '820px',
                margin: '0 0 28px 0',
              },
            },
            {
              id: 'build-card-grid',
              type: 'card-grid',
              order: 5,
              columns: 3,
              cards: [
                {
                  id: 'build-card-health',
                  title: 'At-a-Glance Health',
                  description: 'QuickBooks revenue, AUM and pipeline in one view.',
                },
                {
                  id: 'build-card-leads',
                  title: 'Leads Going Cold',
                  description: 'Who Alex hasn&rsquo;t touched in a while &mdash; surfaced, not buried.',
                },
                {
                  id: 'build-card-reminders',
                  title: 'Right-Sized Reminders',
                  description: 'Nudges that matter, not an overwhelming task list.',
                },
                {
                  id: 'build-card-content',
                  title: 'Content on Autopilot',
                  description: 'The article engine keeps producing; Alex just approves.',
                },
                {
                  id: 'build-card-blinders',
                  title: 'Blinders by Role',
                  description: 'Alex sees what Alex needs; the team sees theirs.',
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
    },

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // SLIDE 6 — COMPLIANCE (DARK)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    {
      id: 'slide-compliance',
      label: 'Compliance',
      blocks: [
        {
          id: 'compliance-section',
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
              id: 'compliance-eyebrow',
              type: 'text',
              order: 1,
              content: 'BUILT FOR A FIDUCIARY',
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
              id: 'compliance-heading',
              type: 'heading',
              order: 2,
              content: 'Compliance-aware. Tool-respecting.',
              level: 2,
              style: {
                color: '#ffffff',
                fontFamily: 'Cormorant Garamond, Georgia, serif',
                fontSize: '2.5rem',
                fontWeight: '500',
                lineHeight: '1.1',
                margin: '0 0 8px 0',
              },
            },
            {
              id: 'compliance-divider',
              type: 'divider',
              order: 3,
              style: {
                borderColor: '#cfa122',
                maxWidth: '60px',
                borderWidth: '3px',
                margin: '12px 0 24px 0',
              },
            },
            {
              id: 'compliance-body',
              type: 'text',
              order: 4,
              content: 'We design around the systems your RIA mandates, log what gets touched, and give your CCO at Core something they can actually approve.',
              style: {
                color: 'rgba(255,255,255,0.82)',
                fontFamily: 'Plus Jakarta Sans, sans-serif',
                fontSize: '1.0625rem',
                lineHeight: '1.65',
                maxWidth: '820px',
                margin: '0 0 28px 0',
              },
            },
            {
              id: 'compliance-cols',
              type: 'columns',
              order: 5,
              columns: [
                {
                  id: 'comp-col-left',
                  width: '50%',
                  verticalAlign: 'top',
                  padding: 'sm',
                  blocks: [
                    {
                      id: 'comp-card-left',
                      type: 'section',
                      order: 1,
                      backgroundColor: '#16273f',
                      paddingTop: '24px',
                      paddingBottom: '24px',
                      paddingLeft: '26px',
                      paddingRight: '26px',
                      blocks: [
                        {
                          id: 'comp-left-title',
                          type: 'text',
                          order: 1,
                          content: 'INFRASTRUCTURE',
                          style: {
                            color: '#cfa122',
                            fontFamily: 'Plus Jakarta Sans, sans-serif',
                            fontSize: '0.6875rem',
                            fontWeight: '600',
                            letterSpacing: '0.18em',
                            margin: '0 0 16px 0',
                          },
                        },
                        {
                          id: 'comp-left-line1',
                          type: 'text',
                          order: 2,
                          content: 'A dedicated, single-tenant instance &mdash; spun up for your firm alone, never co-mingled.',
                          style: {
                            color: 'rgba(255,255,255,0.82)',
                            fontFamily: 'Plus Jakarta Sans, sans-serif',
                            fontSize: '0.9375rem',
                            lineHeight: '1.6',
                            margin: '0 0 10px 0',
                          },
                        },
                        {
                          id: 'comp-left-line2',
                          type: 'text',
                          order: 3,
                          content: 'Role-based access enforced at the row level.',
                          style: {
                            color: 'rgba(255,255,255,0.82)',
                            fontFamily: 'Plus Jakarta Sans, sans-serif',
                            fontSize: '0.9375rem',
                            lineHeight: '1.6',
                            margin: '0 0 10px 0',
                          },
                        },
                        {
                          id: 'comp-left-line3',
                          type: 'text',
                          order: 4,
                          content: 'SOC&nbsp;2 / ISO 27001-hosted infrastructure.',
                          style: {
                            color: 'rgba(255,255,255,0.82)',
                            fontFamily: 'Plus Jakarta Sans, sans-serif',
                            fontSize: '0.9375rem',
                            lineHeight: '1.6',
                            margin: '0 0 10px 0',
                          },
                        },
                        {
                          id: 'comp-left-line4',
                          type: 'text',
                          order: 5,
                          content: 'Bring-your-own-LLM option for strict mandates.',
                          style: {
                            color: 'rgba(255,255,255,0.82)',
                            fontFamily: 'Plus Jakarta Sans, sans-serif',
                            fontSize: '0.9375rem',
                            lineHeight: '1.6',
                          },
                        },
                      ],
                    },
                  ],
                },
                {
                  id: 'comp-col-right',
                  width: '50%',
                  verticalAlign: 'top',
                  padding: 'sm',
                  blocks: [
                    {
                      id: 'comp-card-right',
                      type: 'section',
                      order: 1,
                      backgroundColor: '#16273f',
                      paddingTop: '24px',
                      paddingBottom: '24px',
                      paddingLeft: '26px',
                      paddingRight: '26px',
                      blocks: [
                        {
                          id: 'comp-right-title',
                          type: 'text',
                          order: 1,
                          content: 'YOUR EXISTING STACK',
                          style: {
                            color: '#cfa122',
                            fontFamily: 'Plus Jakarta Sans, sans-serif',
                            fontSize: '0.6875rem',
                            fontWeight: '600',
                            letterSpacing: '0.18em',
                            margin: '0 0 16px 0',
                          },
                        },
                        {
                          id: 'comp-right-line1',
                          type: 'text',
                          order: 2,
                          content: 'Orion &amp; Fidelity stay exactly where they are.',
                          style: {
                            color: 'rgba(255,255,255,0.82)',
                            fontFamily: 'Plus Jakarta Sans, sans-serif',
                            fontSize: '0.9375rem',
                            lineHeight: '1.6',
                            margin: '0 0 10px 0',
                          },
                        },
                        {
                          id: 'comp-right-line2',
                          type: 'text',
                          order: 3,
                          content: 'Hazel transcripts flow into the brain automatically.',
                          style: {
                            color: 'rgba(255,255,255,0.82)',
                            fontFamily: 'Plus Jakarta Sans, sans-serif',
                            fontSize: '0.9375rem',
                            lineHeight: '1.6',
                            margin: '0 0 10px 0',
                          },
                        },
                        {
                          id: 'comp-right-line3',
                          type: 'text',
                          order: 4,
                          content: 'Wealthbox: keep it or retire it &mdash; your call.',
                          style: {
                            color: 'rgba(255,255,255,0.82)',
                            fontFamily: 'Plus Jakarta Sans, sans-serif',
                            fontSize: '0.9375rem',
                            lineHeight: '1.6',
                            margin: '0 0 10px 0',
                          },
                        },
                        {
                          id: 'comp-right-line4',
                          type: 'text',
                          order: 5,
                          content: 'Core CCO sign-off before anything touches client data.',
                          style: {
                            color: 'rgba(255,255,255,0.82)',
                            fontFamily: 'Plus Jakarta Sans, sans-serif',
                            fontSize: '0.9375rem',
                            lineHeight: '1.6',
                          },
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
        backgroundColor: '#0a1628',
        color: '#ffffff',
        fontFamily: 'Plus Jakarta Sans, sans-serif',
      },
    },

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // SLIDE 7 — THE RETAINER (LIGHT)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    {
      id: 'slide-retainer',
      label: 'The Retainer',
      blocks: [
        {
          id: 'retainer-section',
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
              id: 'retainer-eyebrow',
              type: 'text',
              order: 1,
              content: 'THE PARTNERSHIP &middot; PHASE TWO',
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
              id: 'retainer-heading',
              type: 'heading',
              order: 2,
              content: 'Then keep us on as your fractional CTO.',
              level: 2,
              style: {
                color: '#0a1628',
                fontFamily: 'Cormorant Garamond, Georgia, serif',
                fontSize: '2.5rem',
                fontWeight: '500',
                lineHeight: '1.1',
                margin: '0 0 8px 0',
              },
            },
            {
              id: 'retainer-divider',
              type: 'divider',
              order: 3,
              style: {
                borderColor: '#cfa122',
                maxWidth: '60px',
                borderWidth: '3px',
                margin: '12px 0 24px 0',
              },
            },
            {
              id: 'retainer-body',
              type: 'text',
              order: 4,
              content: 'The build delivers the dashboard. The retainer keeps it alive &mdash; and keeps SimplerDevelopment as your technology steward, not a vendor you call when something breaks.',
              style: {
                color: '#475569',
                fontFamily: 'Plus Jakarta Sans, sans-serif',
                fontSize: '1.0625rem',
                lineHeight: '1.65',
                maxWidth: '820px',
                margin: '0 0 28px 0',
              },
            },
            {
              id: 'retainer-card-grid',
              type: 'card-grid',
              order: 5,
              columns: 3,
              cards: [
                {
                  id: 'ret-card-run',
                  title: 'Run &amp; Maintain',
                  description: 'Keep the OS healthy, secure and current.',
                },
                {
                  id: 'ret-card-extend',
                  title: 'Extend',
                  description: 'New integrations and automations as the firm grows.',
                },
                {
                  id: 'ret-card-advise',
                  title: 'Advise',
                  description: 'An AI and technology partner in the room as you scale.',
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
          ],
        },
      ],
      pageSettings: {
        backgroundColor: '#ffffff',
        color: '#0a1628',
        fontFamily: 'Plus Jakarta Sans, sans-serif',
      },
    },

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // SLIDE 8 — ENGAGEMENT (LIGHT)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    {
      id: 'slide-engagement',
      label: 'Engagement',
      blocks: [
        {
          id: 'engagement-section',
          type: 'section',
          order: 1,
          backgroundColor: '#fafbfd',
          paddingTop: '0px',
          paddingBottom: '0px',
          paddingLeft: '0px',
          paddingRight: '0px',
          maxWidth: '1080px',
          blocks: [
            {
              id: 'engagement-eyebrow',
              type: 'text',
              order: 1,
              content: 'HOW WE ENGAGE',
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
              id: 'engagement-heading',
              type: 'heading',
              order: 2,
              content: 'Your instance. Your build. Your retainer.',
              level: 2,
              style: {
                color: '#0a1628',
                fontFamily: 'Cormorant Garamond, Georgia, serif',
                fontSize: '2.5rem',
                fontWeight: '500',
                lineHeight: '1.1',
                margin: '0 0 8px 0',
              },
            },
            {
              id: 'engagement-divider',
              type: 'divider',
              order: 3,
              style: {
                borderColor: '#cfa122',
                maxWidth: '60px',
                borderWidth: '3px',
                margin: '12px 0 24px 0',
              },
            },
            {
              id: 'engagement-body',
              type: 'text',
              order: 4,
              content: 'Everything runs in a dedicated instance spun up for your firm. Build and ongoing work are billed at $150/hr &mdash; good-faith estimates below, exact line items in the proposal.',
              style: {
                color: '#475569',
                fontFamily: 'Plus Jakarta Sans, sans-serif',
                fontSize: '1.0625rem',
                lineHeight: '1.65',
                maxWidth: '820px',
                margin: '0 0 28px 0',
              },
            },
            {
              id: 'engagement-card-grid',
              type: 'card-grid',
              order: 5,
              columns: 3,
              cards: [
                {
                  id: 'eng-card-instance',
                  title: 'Dedicated Instance',
                  subtitle: 'Stand-up + ~$300/mo',
                  description: 'Your own single-tenant deployment, stood up and managed for you. Approx. $2,250 stand-up, then ~$300/mo platform fee plus ~$30/mo per additional seat.',
                },
                {
                  id: 'eng-card-build',
                  title: 'The Build',
                  subtitle: '~90 hrs @ $150/hr',
                  description: 'Alex&rsquo;s agentic dashboard and integrations &mdash; custom development billed to milestones. Est. $13k&ndash;$15k.',
                },
                {
                  id: 'eng-card-retainer',
                  title: 'Retainer',
                  subtitle: '~15 hrs/mo @ $150/hr',
                  description: 'Fractional CTO: run, extend and advise &mdash; keep the OS healthy and growing. Est. ~$2,250/mo.',
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
                cardSubtitle: {
                  fontFamily: 'Plus Jakarta Sans, sans-serif',
                  color: '#cfa122',
                },
              },
            },
            {
              id: 'engagement-note',
              type: 'text',
              order: 6,
              content: 'Figures are good-faith estimates at $150/hr; final scope and line items live in your proposal.',
              style: {
                color: '#64748b',
                fontFamily: 'Plus Jakarta Sans, sans-serif',
                fontSize: '0.9rem',
                lineHeight: '1.6',
                margin: '24px 0 0 0',
              },
            },
          ],
        },
      ],
      pageSettings: {
        backgroundColor: '#fafbfd',
        color: '#0a1628',
        fontFamily: 'Plus Jakarta Sans, sans-serif',
      },
    },

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // SLIDE 9 — WHAT'S NEXT (DARK)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    {
      id: 'slide-next',
      label: "What's Next",
      blocks: [
        {
          id: 'next-section',
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
              id: 'next-eyebrow',
              type: 'text',
              order: 1,
              content: 'NEXT STEPS',
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
              id: 'next-heading',
              type: 'heading',
              order: 2,
              content: 'Three steps to your agentic OS.',
              level: 2,
              style: {
                color: '#ffffff',
                fontFamily: 'Cormorant Garamond, Georgia, serif',
                fontSize: '2.5rem',
                fontWeight: '500',
                lineHeight: '1.1',
                margin: '0 0 8px 0',
              },
            },
            {
              id: 'next-divider',
              type: 'divider',
              order: 3,
              style: {
                borderColor: '#cfa122',
                maxWidth: '60px',
                borderWidth: '3px',
                margin: '12px 0 24px 0',
              },
            },
            {
              id: 'next-timeline',
              type: 'timeline',
              order: 4,
              steps: [
                {
                  id: 'next-step-cody',
                  title: 'Align with Cody',
                  description: 'Finalize the scope and pricing together.',
                },
                {
                  id: 'next-step-alex',
                  title: 'Present to Alex',
                  description: 'Walk the dashboard vision and get buy-in.',
                },
                {
                  id: 'next-step-kick',
                  title: 'Kick Off the Build',
                  description: 'Stand up the dashboard on the foundation already live.',
                },
              ],
              numberColor: 'rgba(207,161,34,0.55)',
              layout: 'alternating',
              elementStyles: {
                stepTitle: {
                  fontFamily: 'Cormorant Garamond, Georgia, serif',
                  color: '#ffffff',
                },
                stepDescription: {
                  color: 'rgba(255,255,255,0.7)',
                  fontFamily: 'Plus Jakarta Sans, sans-serif',
                },
              },
            },
            {
              id: 'next-spacer',
              type: 'spacer',
              order: 5,
              height: 'md',
            },
            {
              id: 'next-closing',
              type: 'text',
              order: 6,
              content: 'Let&rsquo;s build it.',
              style: {
                color: '#ffffff',
                fontFamily: 'Cormorant Garamond, Georgia, serif',
                fontSize: '1.25rem',
                lineHeight: '1.5',
                margin: '0 0 8px 0',
              },
            },
            {
              id: 'next-attribution',
              type: 'text',
              order: 7,
              content: 'Dan Coyle &mdash; SimplerDevelopment &nbsp;&middot;&nbsp; Cody York &mdash; CY Strategies',
              style: {
                color: '#cfa122',
                fontFamily: 'Plus Jakarta Sans, sans-serif',
                fontSize: '0.875rem',
                fontWeight: '500',
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
    },

  ];
}
