import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });

/**
 * Pitch deck: SimplerDevelopment as a platform for CrossCap Advisors.
 *
 * Lives on the SimplerDevelopment client (id 104) so the SD team can present
 * it from sd.com — the deck itself is tailored to Alex Pron / Tasha Shadle /
 * Danielle "Monty" Montgomery and the pain they described in the Apr 16 intro.
 *
 * Narrative beats:
 *   1. Cover         — "One platform. Built around how you actually work."
 *   2. The reality   — fragmented stack, Wealthbox unused, leads in spreadsheets
 *   3. The shift     — one source of truth with role-based access
 *   4. The platform  — Brain + CRM + Scheduling + Content + Site, one cloud
 *   5. Compliance    — plays nicely with Advizon/Fidelity/Hazel; SOC2/ISO infra
 *   6. The plan      — bite-sized 90-day rollout, not boil-the-ocean
 *   7. Why us        — agency + platform, not another HubSpot/Salesforce trap
 *   8. CTA           — what happens next
 */

const CALENDLY = 'https://calendly.com/dancoyle-simplerdevelopment/30min';
const CLIENT_EMAIL = 'simplerdevelopment@simplerdevelopment.com';

// Palette — SD primary blue + warm amber accent + finance-appropriate navy
const C = {
  navy: '#0F1B2E',
  navyDeep: '#0A1422',
  navyMid: '#1A2940',
  blue: '#2563EB',
  blueDeep: '#1D4ED8',
  blueLight: '#DBEAFE',
  amber: '#F59E0B',
  amberLight: '#FEF3C7',
  emerald: '#10B981',
  emeraldLight: '#D1FAE5',
  cream: '#F8FAFC',
  white: '#FFFFFF',
  cardSoft: '#F1F5F9',
  cardLine: '#E2E8F0',
  darkText: '#0F172A',
  bodyText: '#334155',
  mutedText: '#64748B',
  mutedLine: '#94A3B8',
  warnSoft: '#FEE2E2',
  warnText: '#991B1B',
};

export function buildSlides() {
  return [
    // ━━━━━ SLIDE 1: COVER ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    {
      id: 'slide-cover',
      label: 'Cover',
      blocks: [
        {
          id: 'cover-section',
          type: 'section',
          order: 1,
          backgroundColor: C.navy,
          paddingTop: '0px',
          paddingBottom: '0px',
          paddingLeft: '0px',
          paddingRight: '0px',
          maxWidth: '1100px',
          blocks: [
            {
              id: 'cover-eyebrow',
              type: 'text',
              order: 1,
              content: 'SIMPLERDEVELOPMENT &nbsp;&nbsp;/&nbsp;&nbsp; FOR CROSSCAP ADVISORS',
              style: {
                color: C.amber,
                fontFamily: 'Inter',
                fontSize: '0.75rem',
                fontWeight: '600',
                letterSpacing: '0.18em',
                margin: '0 0 28px 0',
              },
            },
            {
              id: 'cover-heading',
              type: 'heading',
              order: 2,
              content: 'One platform.<br/>Built around how you actually work.',
              level: 1,
              style: {
                color: C.white,
                fontFamily: 'Inter',
                fontSize: '3.5rem',
                fontWeight: '800',
                lineHeight: '1.05',
                letterSpacing: '-0.02em',
                margin: '0 0 28px 0',
              },
            },
            {
              id: 'cover-divider',
              type: 'divider',
              order: 3,
              style: {
                borderColor: C.amber,
                maxWidth: '72px',
                borderWidth: '3px',
                margin: '0 0 28px 0',
              },
            },
            {
              id: 'cover-sub',
              type: 'text',
              order: 4,
              content: 'A Company Brain, CRM, scheduling, content, and website &mdash; in one place, with role-based access, that plays nicely with the wealth-management tools you can\'t replace.',
              style: {
                color: 'rgba(255,255,255,0.82)',
                fontFamily: 'Inter',
                fontSize: '1.25rem',
                fontWeight: '400',
                lineHeight: '1.55',
                maxWidth: '780px',
                margin: '0 0 48px 0',
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
                  padding: 'none',
                  blocks: [
                    {
                      id: 'cover-prepared-label',
                      type: 'text',
                      order: 1,
                      content: 'PREPARED FOR',
                      style: {
                        color: 'rgba(255,255,255,0.4)',
                        fontFamily: 'Inter',
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
                      content: 'Alex Pron, Tasha Shadle &amp; Danielle Montgomery<br/><span style="color:rgba(255,255,255,0.55);font-size:0.875rem">Crossover Capital Advisors</span>',
                      style: {
                        color: C.white,
                        fontFamily: 'Inter',
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
                  padding: 'none',
                  blocks: [
                    {
                      id: 'cover-from-label',
                      type: 'text',
                      order: 1,
                      content: 'FROM',
                      style: {
                        color: 'rgba(255,255,255,0.4)',
                        fontFamily: 'Inter',
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
                      content: 'Dan Coyle &amp; Cody York<br/><span style="color:rgba(255,255,255,0.55);font-size:0.875rem">SimplerDevelopment + CY Strategies</span>',
                      style: {
                        color: C.white,
                        fontFamily: 'Inter',
                        fontSize: '0.9375rem',
                        fontWeight: '500',
                        lineHeight: '1.5',
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
        backgroundColor: C.navy,
        color: C.white,
        fontFamily: 'Inter',
      },
    },

    // ━━━━━ SLIDE 2: THE REALITY ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    {
      id: 'slide-reality',
      label: 'The Reality',
      blocks: [
        {
          id: 'reality-section',
          type: 'section',
          order: 1,
          backgroundColor: C.cream,
          paddingTop: '0px',
          paddingBottom: '0px',
          paddingLeft: '0px',
          paddingRight: '0px',
          maxWidth: '1080px',
          blocks: [
            {
              id: 'reality-eyebrow',
              type: 'text',
              order: 1,
              content: 'WHAT YOU TOLD US',
              style: {
                color: C.blue,
                fontFamily: 'Inter',
                fontSize: '0.6875rem',
                fontWeight: '600',
                letterSpacing: '0.15em',
                margin: '0 0 12px 0',
              },
            },
            {
              id: 'reality-heading',
              type: 'heading',
              order: 2,
              content: 'Right now, the stack is fighting the team.',
              level: 2,
              style: {
                color: C.darkText,
                fontFamily: 'Inter',
                fontSize: '2.5rem',
                fontWeight: '800',
                lineHeight: '1.12',
                letterSpacing: '-0.015em',
                margin: '0 0 8px 0',
              },
            },
            {
              id: 'reality-accent',
              type: 'divider',
              order: 3,
              style: {
                borderColor: C.amber,
                maxWidth: '60px',
                borderWidth: '3px',
                margin: '12px 0 24px 0',
              },
            },
            {
              id: 'reality-intro',
              type: 'text',
              order: 4,
              content: 'Hazel records the meeting. Wealthbox holds half the records. Advizon holds the other half. Leads live in Alex\'s spreadsheet, Danielle\'s Airtable, and a few LinkedIn DMs. Tasha pings, Alex follows up when he can, and nobody trusts a single source.',
              style: {
                color: C.bodyText,
                fontFamily: 'Inter',
                fontSize: '1.0625rem',
                lineHeight: '1.65',
                margin: '0 0 36px 0',
                maxWidth: '880px',
              },
            },
            {
              id: 'reality-grid',
              type: 'columns',
              order: 5,
              columns: [
                {
                  id: 'reality-col-1',
                  width: '33.33%',
                  verticalAlign: 'top',
                  padding: 'sm',
                  blocks: [
                    {
                      id: 'reality-card-1',
                      type: 'section',
                      order: 1,
                      backgroundColor: C.white,
                      paddingTop: '24px',
                      paddingBottom: '24px',
                      paddingLeft: '24px',
                      paddingRight: '24px',
                      blocks: [
                        {
                          id: 'r1-icon',
                          type: 'text',
                          order: 1,
                          content: '<span class="material-icons" style="font-size:32px;color:#F59E0B">scatter_plot</span>',
                          style: { margin: '0 0 12px 0' },
                        },
                        {
                          id: 'r1-title',
                          type: 'heading',
                          order: 2,
                          content: 'Fragmented platforms',
                          level: 4,
                          style: { color: C.darkText, fontFamily: 'Inter', fontSize: '1.0625rem', fontWeight: '700', margin: '0 0 8px 0' },
                        },
                        {
                          id: 'r1-body',
                          type: 'text',
                          order: 3,
                          content: 'Hazel, Wealthbox, Advizon, Fidelity, Goldman, Acuity, Mailchimp, SharePoint. Nothing talks to anything. APIs and webhooks become a full-time job nobody owns.',
                          style: { color: C.bodyText, fontFamily: 'Inter', fontSize: '0.875rem', lineHeight: '1.6' },
                        },
                      ],
                    },
                  ],
                },
                {
                  id: 'reality-col-2',
                  width: '33.33%',
                  verticalAlign: 'top',
                  padding: 'sm',
                  blocks: [
                    {
                      id: 'reality-card-2',
                      type: 'section',
                      order: 1,
                      backgroundColor: C.white,
                      paddingTop: '24px',
                      paddingBottom: '24px',
                      paddingLeft: '24px',
                      paddingRight: '24px',
                      blocks: [
                        {
                          id: 'r2-icon',
                          type: 'text',
                          order: 1,
                          content: '<span class="material-icons" style="font-size:32px;color:#F59E0B">visibility_off</span>',
                          style: { margin: '0 0 12px 0' },
                        },
                        {
                          id: 'r2-title',
                          type: 'heading',
                          order: 2,
                          content: 'Tools that go unused',
                          level: 4,
                          style: { color: C.darkText, fontFamily: 'Inter', fontSize: '1.0625rem', fontWeight: '700', margin: '0 0 8px 0' },
                        },
                        {
                          id: 'r2-body',
                          type: 'text',
                          order: 3,
                          content: 'Wealthbox holds the records but half the team never opens it. Hazel pushes tasks into a place no one looks. The best CRM in the world fails when it doesn\'t fit how you work.',
                          style: { color: C.bodyText, fontFamily: 'Inter', fontSize: '0.875rem', lineHeight: '1.6' },
                        },
                      ],
                    },
                  ],
                },
                {
                  id: 'reality-col-3',
                  width: '33.33%',
                  verticalAlign: 'top',
                  padding: 'sm',
                  blocks: [
                    {
                      id: 'reality-card-3',
                      type: 'section',
                      order: 1,
                      backgroundColor: C.white,
                      paddingTop: '24px',
                      paddingBottom: '24px',
                      paddingLeft: '24px',
                      paddingRight: '24px',
                      blocks: [
                        {
                          id: 'r3-icon',
                          type: 'text',
                          order: 1,
                          content: '<span class="material-icons" style="font-size:32px;color:#F59E0B">notifications_active</span>',
                          style: { margin: '0 0 12px 0' },
                        },
                        {
                          id: 'r3-title',
                          type: 'heading',
                          order: 2,
                          content: 'Follow-ups that fall through',
                          level: 4,
                          style: { color: C.darkText, fontFamily: 'Inter', fontSize: '1.0625rem', fontWeight: '700', margin: '0 0 8px 0' },
                        },
                        {
                          id: 'r3-body',
                          type: 'text',
                          order: 3,
                          content: 'Meeting ends, a great follow-up idea surfaces (Phillies tickets, a relevant article), and it dies in a transcript. Alex can\'t catch every thread. An EA can\'t pick up context that lives in his head.',
                          style: { color: C.bodyText, fontFamily: 'Inter', fontSize: '0.875rem', lineHeight: '1.6' },
                        },
                      ],
                    },
                  ],
                },
              ],
              gap: 'md',
              stackOnMobile: true,
            },
            {
              id: 'reality-pullquote-spacer',
              type: 'spacer',
              order: 6,
              height: 'md',
            },
            {
              id: 'reality-pullquote',
              type: 'section',
              order: 7,
              backgroundColor: C.navy,
              paddingTop: '28px',
              paddingBottom: '28px',
              paddingLeft: '36px',
              paddingRight: '36px',
              blocks: [
                {
                  id: 'rpq-text',
                  type: 'text',
                  order: 1,
                  content: '<span style="color:#F59E0B;font-size:2rem;font-weight:700;line-height:1">&ldquo;</span>&nbsp;&nbsp;If we built something that\'s sort of a brain that also created one dashboard with it all in it &mdash; CRM, booking, email &mdash; that would be amazing.',
                  style: {
                    color: 'rgba(255,255,255,0.92)',
                    fontFamily: 'Inter',
                    fontSize: '1.125rem',
                    fontStyle: 'italic',
                    lineHeight: '1.55',
                    margin: '0 0 10px 0',
                  },
                },
                {
                  id: 'rpq-attr',
                  type: 'text',
                  order: 2,
                  content: '&mdash; Danielle Montgomery, Fractional COO',
                  style: {
                    color: C.amber,
                    fontFamily: 'Inter',
                    fontSize: '0.8125rem',
                    fontWeight: '600',
                    letterSpacing: '0.05em',
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
        fontFamily: 'Inter',
      },
    },

    // ━━━━━ SLIDE 3: THE SHIFT ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    {
      id: 'slide-shift',
      label: 'The Shift',
      blocks: [
        {
          id: 'shift-section',
          type: 'section',
          order: 1,
          backgroundColor: C.cream,
          paddingTop: '0px',
          paddingBottom: '0px',
          paddingLeft: '0px',
          paddingRight: '0px',
          maxWidth: '1080px',
          blocks: [
            {
              id: 'shift-eyebrow',
              type: 'text',
              order: 1,
              content: 'THE SHIFT',
              style: {
                color: C.blue,
                fontFamily: 'Inter',
                fontSize: '0.6875rem',
                fontWeight: '600',
                letterSpacing: '0.15em',
                margin: '0 0 12px 0',
              },
            },
            {
              id: 'shift-heading',
              type: 'heading',
              order: 2,
              content: 'One source of truth. Different views for different roles.',
              level: 2,
              style: {
                color: C.darkText,
                fontFamily: 'Inter',
                fontSize: '2.25rem',
                fontWeight: '800',
                lineHeight: '1.15',
                letterSpacing: '-0.015em',
                margin: '0 0 8px 0',
              },
            },
            {
              id: 'shift-accent',
              type: 'divider',
              order: 3,
              style: {
                borderColor: C.amber,
                maxWidth: '60px',
                borderWidth: '3px',
                margin: '12px 0 24px 0',
              },
            },
            {
              id: 'shift-intro',
              type: 'text',
              order: 4,
              content: 'Everyone logs into the same brain. What they see is shaped by who they are &mdash; so Alex isn\'t buried, Tasha sees client work, an EA gets tasks-in-context, and Danielle can drive operational visibility without combing through transcripts.',
              style: {
                color: C.bodyText,
                fontFamily: 'Inter',
                fontSize: '1rem',
                lineHeight: '1.65',
                margin: '0 0 36px 0',
                maxWidth: '880px',
              },
            },
            {
              id: 'shift-roles',
              type: 'columns',
              order: 5,
              columns: [
                {
                  id: 'role-col-1',
                  width: '25%',
                  verticalAlign: 'top',
                  padding: 'xs',
                  blocks: [
                    {
                      id: 'role-1',
                      type: 'section',
                      order: 1,
                      backgroundColor: C.white,
                      paddingTop: '20px',
                      paddingBottom: '20px',
                      paddingLeft: '20px',
                      paddingRight: '20px',
                      blocks: [
                        {
                          id: 'role-1-badge',
                          type: 'text',
                          order: 1,
                          content: '<span class="material-icons" style="font-size:22px;color:#2563EB">person</span>',
                          style: { margin: '0 0 10px 0' },
                        },
                        {
                          id: 'role-1-name',
                          type: 'text',
                          order: 2,
                          content: 'ALEX',
                          style: { color: C.darkText, fontFamily: 'Inter', fontSize: '0.75rem', fontWeight: '700', letterSpacing: '0.1em', margin: '0 0 4px 0' },
                        },
                        {
                          id: 'role-1-role',
                          type: 'text',
                          order: 3,
                          content: 'Visionary / Advisor',
                          style: { color: C.mutedText, fontFamily: 'Inter', fontSize: '0.75rem', margin: '0 0 12px 0' },
                        },
                        {
                          id: 'role-1-sees',
                          type: 'text',
                          order: 4,
                          content: 'Today\'s clients. Today\'s follow-ups. Hot leads. Nothing else.',
                          style: { color: C.bodyText, fontFamily: 'Inter', fontSize: '0.8125rem', lineHeight: '1.55' },
                        },
                      ],
                    },
                  ],
                },
                {
                  id: 'role-col-2',
                  width: '25%',
                  verticalAlign: 'top',
                  padding: 'xs',
                  blocks: [
                    {
                      id: 'role-2',
                      type: 'section',
                      order: 1,
                      backgroundColor: C.white,
                      paddingTop: '20px',
                      paddingBottom: '20px',
                      paddingLeft: '20px',
                      paddingRight: '20px',
                      blocks: [
                        {
                          id: 'role-2-badge',
                          type: 'text',
                          order: 1,
                          content: '<span class="material-icons" style="font-size:22px;color:#10B981">handshake</span>',
                          style: { margin: '0 0 10px 0' },
                        },
                        {
                          id: 'role-2-name',
                          type: 'text',
                          order: 2,
                          content: 'TASHA',
                          style: { color: C.darkText, fontFamily: 'Inter', fontSize: '0.75rem', fontWeight: '700', letterSpacing: '0.1em', margin: '0 0 4px 0' },
                        },
                        {
                          id: 'role-2-role',
                          type: 'text',
                          order: 3,
                          content: 'Wealth Advisor',
                          style: { color: C.mutedText, fontFamily: 'Inter', fontSize: '0.75rem', margin: '0 0 12px 0' },
                        },
                        {
                          id: 'role-2-sees',
                          type: 'text',
                          order: 4,
                          content: 'Her clients, her review cadence, action items pulled from Hazel calls.',
                          style: { color: C.bodyText, fontFamily: 'Inter', fontSize: '0.8125rem', lineHeight: '1.55' },
                        },
                      ],
                    },
                  ],
                },
                {
                  id: 'role-col-3',
                  width: '25%',
                  verticalAlign: 'top',
                  padding: 'xs',
                  blocks: [
                    {
                      id: 'role-3',
                      type: 'section',
                      order: 1,
                      backgroundColor: C.white,
                      paddingTop: '20px',
                      paddingBottom: '20px',
                      paddingLeft: '20px',
                      paddingRight: '20px',
                      blocks: [
                        {
                          id: 'role-3-badge',
                          type: 'text',
                          order: 1,
                          content: '<span class="material-icons" style="font-size:22px;color:#F59E0B">assignment_ind</span>',
                          style: { margin: '0 0 10px 0' },
                        },
                        {
                          id: 'role-3-name',
                          type: 'text',
                          order: 2,
                          content: 'EA (NEXT HIRE)',
                          style: { color: C.darkText, fontFamily: 'Inter', fontSize: '0.75rem', fontWeight: '700', letterSpacing: '0.1em', margin: '0 0 4px 0' },
                        },
                        {
                          id: 'role-3-role',
                          type: 'text',
                          order: 3,
                          content: 'Operations Support',
                          style: { color: C.mutedText, fontFamily: 'Inter', fontSize: '0.75rem', margin: '0 0 12px 0' },
                        },
                        {
                          id: 'role-3-sees',
                          type: 'text',
                          order: 4,
                          content: 'Alex\'s task list with full client context &mdash; not relying on him to brief her.',
                          style: { color: C.bodyText, fontFamily: 'Inter', fontSize: '0.8125rem', lineHeight: '1.55' },
                        },
                      ],
                    },
                  ],
                },
                {
                  id: 'role-col-4',
                  width: '25%',
                  verticalAlign: 'top',
                  padding: 'xs',
                  blocks: [
                    {
                      id: 'role-4',
                      type: 'section',
                      order: 1,
                      backgroundColor: C.white,
                      paddingTop: '20px',
                      paddingBottom: '20px',
                      paddingLeft: '20px',
                      paddingRight: '20px',
                      blocks: [
                        {
                          id: 'role-4-badge',
                          type: 'text',
                          order: 1,
                          content: '<span class="material-icons" style="font-size:22px;color:#1D4ED8">insights</span>',
                          style: { margin: '0 0 10px 0' },
                        },
                        {
                          id: 'role-4-name',
                          type: 'text',
                          order: 2,
                          content: 'DANIELLE',
                          style: { color: C.darkText, fontFamily: 'Inter', fontSize: '0.75rem', fontWeight: '700', letterSpacing: '0.1em', margin: '0 0 4px 0' },
                        },
                        {
                          id: 'role-4-role',
                          type: 'text',
                          order: 3,
                          content: 'Fractional COO',
                          style: { color: C.mutedText, fontFamily: 'Inter', fontSize: '0.75rem', margin: '0 0 12px 0' },
                        },
                        {
                          id: 'role-4-sees',
                          type: 'text',
                          order: 4,
                          content: 'Lead funnel health, where work is stuck, what\'s blocking growth this quarter.',
                          style: { color: C.bodyText, fontFamily: 'Inter', fontSize: '0.8125rem', lineHeight: '1.55' },
                        },
                      ],
                    },
                  ],
                },
              ],
              gap: 'sm',
              stackOnMobile: true,
            },
          ],
        },
      ],
      pageSettings: {
        backgroundColor: C.cream,
        color: C.darkText,
        fontFamily: 'Inter',
      },
    },

    // ━━━━━ SLIDE 4: THE PLATFORM ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    {
      id: 'slide-platform',
      label: 'The Platform',
      blocks: [
        {
          id: 'platform-section',
          type: 'section',
          order: 1,
          backgroundColor: C.cream,
          paddingTop: '0px',
          paddingBottom: '0px',
          paddingLeft: '0px',
          paddingRight: '0px',
          maxWidth: '1100px',
          blocks: [
            {
              id: 'plat-eyebrow',
              type: 'text',
              order: 1,
              content: 'THE PLATFORM',
              style: {
                color: C.blue,
                fontFamily: 'Inter',
                fontSize: '0.6875rem',
                fontWeight: '600',
                letterSpacing: '0.15em',
                margin: '0 0 12px 0',
              },
            },
            {
              id: 'plat-heading',
              type: 'heading',
              order: 2,
              content: 'What SimplerDevelopment is.',
              level: 2,
              style: {
                color: C.darkText,
                fontFamily: 'Inter',
                fontSize: '2.5rem',
                fontWeight: '800',
                lineHeight: '1.1',
                letterSpacing: '-0.015em',
                margin: '0 0 8px 0',
              },
            },
            {
              id: 'plat-accent',
              type: 'divider',
              order: 3,
              style: {
                borderColor: C.amber,
                maxWidth: '60px',
                borderWidth: '3px',
                margin: '12px 0 24px 0',
              },
            },
            {
              id: 'plat-intro',
              type: 'text',
              order: 4,
              content: 'Six tools you already pay for, rebuilt into one cloud-hosted workspace. Add only the modules you want. Turn off what you don\'t. No new account creation, no API-key safari.',
              style: {
                color: C.bodyText,
                fontFamily: 'Inter',
                fontSize: '1.0625rem',
                lineHeight: '1.65',
                margin: '0 0 36px 0',
                maxWidth: '880px',
              },
            },
            // Row 1 of modules
            {
              id: 'plat-row-1',
              type: 'columns',
              order: 5,
              columns: [
                {
                  id: 'mod-col-1',
                  width: '33.33%',
                  verticalAlign: 'top',
                  padding: 'xs',
                  blocks: [
                    {
                      id: 'mod-1',
                      type: 'section',
                      order: 1,
                      backgroundColor: C.white,
                      paddingTop: '22px',
                      paddingBottom: '22px',
                      paddingLeft: '22px',
                      paddingRight: '22px',
                      blocks: [
                        {
                          id: 'mod-1-icon',
                          type: 'text',
                          order: 1,
                          content: '<span class="material-icons" style="font-size:26px;color:#2563EB">psychology</span>',
                          style: { margin: '0 0 10px 0' },
                        },
                        {
                          id: 'mod-1-title',
                          type: 'heading',
                          order: 2,
                          content: 'Company Brain',
                          level: 4,
                          style: { color: C.darkText, fontFamily: 'Inter', fontSize: '1rem', fontWeight: '700', margin: '0 0 6px 0' },
                        },
                        {
                          id: 'mod-1-body',
                          type: 'text',
                          order: 3,
                          content: 'Searchable, role-aware memory of every meeting, note, client, and decision. Hazel transcripts in, action items and context out.',
                          style: { color: C.bodyText, fontFamily: 'Inter', fontSize: '0.8125rem', lineHeight: '1.6' },
                        },
                      ],
                    },
                  ],
                },
                {
                  id: 'mod-col-2',
                  width: '33.33%',
                  verticalAlign: 'top',
                  padding: 'xs',
                  blocks: [
                    {
                      id: 'mod-2',
                      type: 'section',
                      order: 1,
                      backgroundColor: C.white,
                      paddingTop: '22px',
                      paddingBottom: '22px',
                      paddingLeft: '22px',
                      paddingRight: '22px',
                      blocks: [
                        {
                          id: 'mod-2-icon',
                          type: 'text',
                          order: 1,
                          content: '<span class="material-icons" style="font-size:26px;color:#2563EB">contacts</span>',
                          style: { margin: '0 0 10px 0' },
                        },
                        {
                          id: 'mod-2-title',
                          type: 'heading',
                          order: 2,
                          content: 'CRM &amp; Lead Pipeline',
                          level: 4,
                          style: { color: C.darkText, fontFamily: 'Inter', fontSize: '1rem', fontWeight: '700', margin: '0 0 6px 0' },
                        },
                        {
                          id: 'mod-2-body',
                          type: 'text',
                          order: 3,
                          content: 'Replaces the spreadsheet, the Airtable, and the LinkedIn-DMs-as-CRM. Pipeline stages, deal scoring, AI-suggested next steps.',
                          style: { color: C.bodyText, fontFamily: 'Inter', fontSize: '0.8125rem', lineHeight: '1.6' },
                        },
                      ],
                    },
                  ],
                },
                {
                  id: 'mod-col-3',
                  width: '33.33%',
                  verticalAlign: 'top',
                  padding: 'xs',
                  blocks: [
                    {
                      id: 'mod-3',
                      type: 'section',
                      order: 1,
                      backgroundColor: C.white,
                      paddingTop: '22px',
                      paddingBottom: '22px',
                      paddingLeft: '22px',
                      paddingRight: '22px',
                      blocks: [
                        {
                          id: 'mod-3-icon',
                          type: 'text',
                          order: 1,
                          content: '<span class="material-icons" style="font-size:26px;color:#2563EB">event_available</span>',
                          style: { margin: '0 0 10px 0' },
                        },
                        {
                          id: 'mod-3-title',
                          type: 'heading',
                          order: 2,
                          content: 'Booking &amp; Scheduling',
                          level: 4,
                          style: { color: C.darkText, fontFamily: 'Inter', fontSize: '1rem', fontWeight: '700', margin: '0 0 6px 0' },
                        },
                        {
                          id: 'mod-3-body',
                          type: 'text',
                          order: 3,
                          content: 'Branded booking pages tied to Google Calendar &amp; Zoom. Replaces Calendly &amp; Acuity. New bookings auto-create CRM records.',
                          style: { color: C.bodyText, fontFamily: 'Inter', fontSize: '0.8125rem', lineHeight: '1.6' },
                        },
                      ],
                    },
                  ],
                },
              ],
              gap: 'sm',
              stackOnMobile: true,
            },
            {
              id: 'plat-row-spacer',
              type: 'spacer',
              order: 6,
              height: 'sm',
            },
            // Row 2 of modules
            {
              id: 'plat-row-2',
              type: 'columns',
              order: 7,
              columns: [
                {
                  id: 'mod-col-4',
                  width: '33.33%',
                  verticalAlign: 'top',
                  padding: 'xs',
                  blocks: [
                    {
                      id: 'mod-4',
                      type: 'section',
                      order: 1,
                      backgroundColor: C.white,
                      paddingTop: '22px',
                      paddingBottom: '22px',
                      paddingLeft: '22px',
                      paddingRight: '22px',
                      blocks: [
                        {
                          id: 'mod-4-icon',
                          type: 'text',
                          order: 1,
                          content: '<span class="material-icons" style="font-size:26px;color:#2563EB">campaign</span>',
                          style: { margin: '0 0 10px 0' },
                        },
                        {
                          id: 'mod-4-title',
                          type: 'heading',
                          order: 2,
                          content: 'Content &amp; Email',
                          level: 4,
                          style: { color: C.darkText, fontFamily: 'Inter', fontSize: '1rem', fontWeight: '700', margin: '0 0 6px 0' },
                        },
                        {
                          id: 'mod-4-body',
                          type: 'text',
                          order: 3,
                          content: 'Newsletter, drip campaigns, lead-magnet automation. Replaces Mailchimp. Knows which contact opened what &mdash; and pushes that back into the CRM.',
                          style: { color: C.bodyText, fontFamily: 'Inter', fontSize: '0.8125rem', lineHeight: '1.6' },
                        },
                      ],
                    },
                  ],
                },
                {
                  id: 'mod-col-5',
                  width: '33.33%',
                  verticalAlign: 'top',
                  padding: 'xs',
                  blocks: [
                    {
                      id: 'mod-5',
                      type: 'section',
                      order: 1,
                      backgroundColor: C.white,
                      paddingTop: '22px',
                      paddingBottom: '22px',
                      paddingLeft: '22px',
                      paddingRight: '22px',
                      blocks: [
                        {
                          id: 'mod-5-icon',
                          type: 'text',
                          order: 1,
                          content: '<span class="material-icons" style="font-size:26px;color:#2563EB">smart_toy</span>',
                          style: { margin: '0 0 10px 0' },
                        },
                        {
                          id: 'mod-5-title',
                          type: 'heading',
                          order: 2,
                          content: 'Automations',
                          level: 4,
                          style: { color: C.darkText, fontFamily: 'Inter', fontSize: '1rem', fontWeight: '700', margin: '0 0 6px 0' },
                        },
                        {
                          id: 'mod-5-body',
                          type: 'text',
                          order: 3,
                          content: 'Rule-based and AI-driven. New lead from LinkedIn ad &rarr; CRM &rarr; nurture sequence &rarr; meeting booked &rarr; Hazel summary &rarr; brain &rarr; follow-up draft.',
                          style: { color: C.bodyText, fontFamily: 'Inter', fontSize: '0.8125rem', lineHeight: '1.6' },
                        },
                      ],
                    },
                  ],
                },
                {
                  id: 'mod-col-6',
                  width: '33.33%',
                  verticalAlign: 'top',
                  padding: 'xs',
                  blocks: [
                    {
                      id: 'mod-6',
                      type: 'section',
                      order: 1,
                      backgroundColor: C.white,
                      paddingTop: '22px',
                      paddingBottom: '22px',
                      paddingLeft: '22px',
                      paddingRight: '22px',
                      blocks: [
                        {
                          id: 'mod-6-icon',
                          type: 'text',
                          order: 1,
                          content: '<span class="material-icons" style="font-size:26px;color:#2563EB">language</span>',
                          style: { margin: '0 0 10px 0' },
                        },
                        {
                          id: 'mod-6-title',
                          type: 'heading',
                          order: 2,
                          content: 'Website &amp; Lead Magnets',
                          level: 4,
                          style: { color: C.darkText, fontFamily: 'Inter', fontSize: '1rem', fontWeight: '700', margin: '0 0 6px 0' },
                        },
                        {
                          id: 'mod-6-body',
                          type: 'text',
                          order: 3,
                          content: 'crosscapadvisors.com rebuilt on the same platform &mdash; with positioning Cody refined, and forms that drop directly into the CRM. WordPress goes away.',
                          style: { color: C.bodyText, fontFamily: 'Inter', fontSize: '0.8125rem', lineHeight: '1.6' },
                        },
                      ],
                    },
                  ],
                },
              ],
              gap: 'sm',
              stackOnMobile: true,
            },
          ],
        },
      ],
      pageSettings: {
        backgroundColor: C.cream,
        color: C.darkText,
        fontFamily: 'Inter',
      },
    },

    // ━━━━━ SLIDE 5: COMPLIANCE & INTEGRATION ━━━━━━━━━━━━━━━━━━━━━━━━━━━
    {
      id: 'slide-compliance',
      label: 'Compliance',
      blocks: [
        {
          id: 'comp-section',
          type: 'section',
          order: 1,
          backgroundColor: C.navy,
          paddingTop: '0px',
          paddingBottom: '0px',
          paddingLeft: '0px',
          paddingRight: '0px',
          maxWidth: '1080px',
          blocks: [
            {
              id: 'comp-eyebrow',
              type: 'text',
              order: 1,
              content: 'BUILT FOR WEALTH MANAGEMENT',
              style: {
                color: C.amber,
                fontFamily: 'Inter',
                fontSize: '0.6875rem',
                fontWeight: '600',
                letterSpacing: '0.15em',
                margin: '0 0 12px 0',
              },
            },
            {
              id: 'comp-heading',
              type: 'heading',
              order: 2,
              content: 'Compliance-aware. Tool-respecting.',
              level: 2,
              style: {
                color: C.white,
                fontFamily: 'Inter',
                fontSize: '2.25rem',
                fontWeight: '800',
                lineHeight: '1.15',
                letterSpacing: '-0.015em',
                margin: '0 0 8px 0',
              },
            },
            {
              id: 'comp-accent',
              type: 'divider',
              order: 3,
              style: {
                borderColor: C.amber,
                maxWidth: '60px',
                borderWidth: '3px',
                margin: '12px 0 24px 0',
              },
            },
            {
              id: 'comp-intro',
              type: 'text',
              order: 4,
              content: 'We don\'t pretend Advizon, Fidelity, or your RIA\'s compliance review will go away. We design around them, log what gets touched, and give your CCO at Core something they can actually approve.',
              style: {
                color: 'rgba(255,255,255,0.82)',
                fontFamily: 'Inter',
                fontSize: '1rem',
                lineHeight: '1.65',
                margin: '0 0 32px 0',
                maxWidth: '880px',
              },
            },
            {
              id: 'comp-grid',
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
                      backgroundColor: C.navyMid,
                      paddingTop: '24px',
                      paddingBottom: '24px',
                      paddingLeft: '26px',
                      paddingRight: '26px',
                      blocks: [
                        {
                          id: 'comp-l-title',
                          type: 'text',
                          order: 1,
                          content: '<span class="material-icons" style="font-size:20px;color:#10B981;vertical-align:middle">verified_user</span>&nbsp;&nbsp;<span style="vertical-align:middle">INFRASTRUCTURE</span>',
                          style: { color: C.white, fontFamily: 'Inter', fontSize: '0.75rem', fontWeight: '700', letterSpacing: '0.1em', margin: '0 0 18px 0' },
                        },
                        {
                          id: 'comp-l-1',
                          type: 'text',
                          order: 2,
                          content: '<strong style="color:#fff">Cloud-hosted on SOC 2 / ISO 27001 providers.</strong><br/><span style="color:rgba(255,255,255,0.7)">Compliance heavy lifting handled by AWS / Vercel / Postgres providers &mdash; we inherit their posture and add audit trails on top.</span>',
                          style: { color: 'rgba(255,255,255,0.85)', fontFamily: 'Inter', fontSize: '0.875rem', lineHeight: '1.65', margin: '0 0 14px 0', paddingBottom: '14px', borderBottom: '1px solid rgba(255,255,255,0.1)' },
                        },
                        {
                          id: 'comp-l-2',
                          type: 'text',
                          order: 3,
                          content: '<strong style="color:#fff">Role-based access control.</strong><br/><span style="color:rgba(255,255,255,0.7)">Tasha never sees Alex\'s lead pipeline. The EA never sees salary data. The brain enforces it at the row level.</span>',
                          style: { color: 'rgba(255,255,255,0.85)', fontFamily: 'Inter', fontSize: '0.875rem', lineHeight: '1.65', margin: '0 0 14px 0', paddingBottom: '14px', borderBottom: '1px solid rgba(255,255,255,0.1)' },
                        },
                        {
                          id: 'comp-l-3',
                          type: 'text',
                          order: 4,
                          content: '<strong style="color:#fff">BYO LLM option.</strong><br/><span style="color:rgba(255,255,255,0.7)">If your RIA insists on no-third-party-AI, we can run an on-prem or Anthropic Enterprise model so no client data ever leaves an approved boundary.</span>',
                          style: { color: 'rgba(255,255,255,0.85)', fontFamily: 'Inter', fontSize: '0.875rem', lineHeight: '1.65' },
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
                      backgroundColor: C.navyMid,
                      paddingTop: '24px',
                      paddingBottom: '24px',
                      paddingLeft: '26px',
                      paddingRight: '26px',
                      blocks: [
                        {
                          id: 'comp-r-title',
                          type: 'text',
                          order: 1,
                          content: '<span class="material-icons" style="font-size:20px;color:#F59E0B;vertical-align:middle">hub</span>&nbsp;&nbsp;<span style="vertical-align:middle">YOUR EXISTING STACK</span>',
                          style: { color: C.white, fontFamily: 'Inter', fontSize: '0.75rem', fontWeight: '700', letterSpacing: '0.1em', margin: '0 0 18px 0' },
                        },
                        {
                          id: 'comp-r-1',
                          type: 'text',
                          order: 2,
                          content: '<strong style="color:#fff">Advizon &amp; Fidelity stay where they are.</strong><br/><span style="color:rgba(255,255,255,0.7)">We don\'t replace systems your RIA mandates &mdash; we surface what matters in the brain, and link out for the rest.</span>',
                          style: { color: 'rgba(255,255,255,0.85)', fontFamily: 'Inter', fontSize: '0.875rem', lineHeight: '1.65', margin: '0 0 14px 0', paddingBottom: '14px', borderBottom: '1px solid rgba(255,255,255,0.1)' },
                        },
                        {
                          id: 'comp-r-2',
                          type: 'text',
                          order: 3,
                          content: '<strong style="color:#fff">Hazel becomes useful.</strong><br/><span style="color:rgba(255,255,255,0.7)">Transcripts flow into the brain. Action items get assigned with client context. Tasks land where the team already looks.</span>',
                          style: { color: 'rgba(255,255,255,0.85)', fontFamily: 'Inter', fontSize: '0.875rem', lineHeight: '1.65', margin: '0 0 14px 0', paddingBottom: '14px', borderBottom: '1px solid rgba(255,255,255,0.1)' },
                        },
                        {
                          id: 'comp-r-3',
                          type: 'text',
                          order: 4,
                          content: '<strong style="color:#fff">Wealthbox: keep or retire.</strong><br/><span style="color:rgba(255,255,255,0.7)">If half the team won\'t use it, replace it. If contracts say otherwise, sync it. Either path works &mdash; the choice is yours.</span>',
                          style: { color: 'rgba(255,255,255,0.85)', fontFamily: 'Inter', fontSize: '0.875rem', lineHeight: '1.65' },
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
        backgroundColor: C.navy,
        color: C.white,
        fontFamily: 'Inter',
      },
    },

    // ━━━━━ SLIDE 6: THE PLAN (90 days) ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    {
      id: 'slide-plan',
      label: 'The Plan',
      blocks: [
        {
          id: 'plan-section',
          type: 'section',
          order: 1,
          backgroundColor: C.cream,
          paddingTop: '0px',
          paddingBottom: '0px',
          paddingLeft: '0px',
          paddingRight: '0px',
          maxWidth: '1080px',
          blocks: [
            {
              id: 'plan-eyebrow',
              type: 'text',
              order: 1,
              content: 'HOW WE\'D START',
              style: {
                color: C.blue,
                fontFamily: 'Inter',
                fontSize: '0.6875rem',
                fontWeight: '600',
                letterSpacing: '0.15em',
                margin: '0 0 12px 0',
              },
            },
            {
              id: 'plan-heading',
              type: 'heading',
              order: 2,
              content: 'Bite-sized. Not boil-the-ocean.',
              level: 2,
              style: {
                color: C.darkText,
                fontFamily: 'Inter',
                fontSize: '2.5rem',
                fontWeight: '800',
                lineHeight: '1.1',
                letterSpacing: '-0.015em',
                margin: '0 0 8px 0',
              },
            },
            {
              id: 'plan-accent',
              type: 'divider',
              order: 3,
              style: {
                borderColor: C.amber,
                maxWidth: '60px',
                borderWidth: '3px',
                margin: '12px 0 24px 0',
              },
            },
            {
              id: 'plan-intro',
              type: 'text',
              order: 4,
              content: 'You don\'t have to flip a switch on everything. Start with the brain and lead pipeline &mdash; the two pain points doing the most damage. Earn the right to keep going.',
              style: {
                color: C.bodyText,
                fontFamily: 'Inter',
                fontSize: '1rem',
                lineHeight: '1.65',
                margin: '0 0 36px 0',
                maxWidth: '880px',
              },
            },
            // Phase 1
            {
              id: 'phase-1',
              type: 'section',
              order: 5,
              backgroundColor: C.white,
              paddingTop: '24px',
              paddingBottom: '24px',
              paddingLeft: '28px',
              paddingRight: '28px',
              blocks: [
                {
                  id: 'p1-cols',
                  type: 'columns',
                  order: 1,
                  columns: [
                    {
                      id: 'p1-badge-col',
                      width: '90px',
                      verticalAlign: 'top',
                      padding: 'none',
                      blocks: [
                        {
                          id: 'p1-badge',
                          type: 'text',
                          order: 1,
                          content: '01',
                          alignment: 'center',
                          style: {
                            backgroundColor: C.blue,
                            color: C.white,
                            fontFamily: 'Inter',
                            fontSize: '1.25rem',
                            fontWeight: '800',
                            width: '60px',
                            height: '60px',
                            lineHeight: '60px',
                            borderRadius: '50%',
                            textAlign: 'center',
                          },
                        },
                      ],
                    },
                    {
                      id: 'p1-text-col',
                      width: 'auto',
                      verticalAlign: 'top',
                      padding: 'none',
                      blocks: [
                        {
                          id: 'p1-period',
                          type: 'text',
                          order: 1,
                          content: 'WEEKS 1–4',
                          style: { color: C.blue, fontFamily: 'Inter', fontSize: '0.6875rem', fontWeight: '700', letterSpacing: '0.12em', margin: '0 0 4px 0' },
                        },
                        {
                          id: 'p1-title',
                          type: 'heading',
                          order: 2,
                          content: 'Stand up the Company Brain',
                          level: 4,
                          style: { color: C.darkText, fontFamily: 'Inter', fontSize: '1.25rem', fontWeight: '700', margin: '0 0 8px 0' },
                        },
                        {
                          id: 'p1-body',
                          type: 'text',
                          order: 3,
                          content: 'Ingest Hazel transcripts, Google Drive client folders, and Wealthbox notes. Set up role-based access: Alex / Tasha / EA / Danielle. Result: one place to ask "what did we agree to with this client?" and get a real answer with citations.',
                          style: { color: C.bodyText, fontFamily: 'Inter', fontSize: '0.9375rem', lineHeight: '1.65' },
                        },
                      ],
                    },
                  ],
                  gap: 'md',
                  stackOnMobile: false,
                },
              ],
            },
            { id: 'plan-spacer-1', type: 'spacer', order: 6, height: 'xs' },
            // Phase 2
            {
              id: 'phase-2',
              type: 'section',
              order: 7,
              backgroundColor: C.white,
              paddingTop: '24px',
              paddingBottom: '24px',
              paddingLeft: '28px',
              paddingRight: '28px',
              blocks: [
                {
                  id: 'p2-cols',
                  type: 'columns',
                  order: 1,
                  columns: [
                    {
                      id: 'p2-badge-col',
                      width: '90px',
                      verticalAlign: 'top',
                      padding: 'none',
                      blocks: [
                        {
                          id: 'p2-badge',
                          type: 'text',
                          order: 1,
                          content: '02',
                          alignment: 'center',
                          style: {
                            backgroundColor: C.emerald,
                            color: C.white,
                            fontFamily: 'Inter',
                            fontSize: '1.25rem',
                            fontWeight: '800',
                            width: '60px',
                            height: '60px',
                            lineHeight: '60px',
                            borderRadius: '50%',
                            textAlign: 'center',
                          },
                        },
                      ],
                    },
                    {
                      id: 'p2-text-col',
                      width: 'auto',
                      verticalAlign: 'top',
                      padding: 'none',
                      blocks: [
                        {
                          id: 'p2-period',
                          type: 'text',
                          order: 1,
                          content: 'WEEKS 5–8',
                          style: { color: C.emerald, fontFamily: 'Inter', fontSize: '0.6875rem', fontWeight: '700', letterSpacing: '0.12em', margin: '0 0 4px 0' },
                        },
                        {
                          id: 'p2-title',
                          type: 'heading',
                          order: 2,
                          content: 'Lead pipeline + meeting follow-ups',
                          level: 4,
                          style: { color: C.darkText, fontFamily: 'Inter', fontSize: '1.25rem', fontWeight: '700', margin: '0 0 8px 0' },
                        },
                        {
                          id: 'p2-body',
                          type: 'text',
                          order: 3,
                          content: 'Migrate Alex\'s spreadsheet and Danielle\'s Airtable into the CRM. Wire LinkedIn ads, the website form, and Mailchimp opt-ins into a single funnel. After every Hazel call, the brain drafts a contextual follow-up &mdash; ready for the EA to refine and send.',
                          style: { color: C.bodyText, fontFamily: 'Inter', fontSize: '0.9375rem', lineHeight: '1.65' },
                        },
                      ],
                    },
                  ],
                  gap: 'md',
                  stackOnMobile: false,
                },
              ],
            },
            { id: 'plan-spacer-2', type: 'spacer', order: 8, height: 'xs' },
            // Phase 3
            {
              id: 'phase-3',
              type: 'section',
              order: 9,
              backgroundColor: C.white,
              paddingTop: '24px',
              paddingBottom: '24px',
              paddingLeft: '28px',
              paddingRight: '28px',
              blocks: [
                {
                  id: 'p3-cols',
                  type: 'columns',
                  order: 1,
                  columns: [
                    {
                      id: 'p3-badge-col',
                      width: '90px',
                      verticalAlign: 'top',
                      padding: 'none',
                      blocks: [
                        {
                          id: 'p3-badge',
                          type: 'text',
                          order: 1,
                          content: '03',
                          alignment: 'center',
                          style: {
                            backgroundColor: C.amber,
                            color: C.white,
                            fontFamily: 'Inter',
                            fontSize: '1.25rem',
                            fontWeight: '800',
                            width: '60px',
                            height: '60px',
                            lineHeight: '60px',
                            borderRadius: '50%',
                            textAlign: 'center',
                          },
                        },
                      ],
                    },
                    {
                      id: 'p3-text-col',
                      width: 'auto',
                      verticalAlign: 'top',
                      padding: 'none',
                      blocks: [
                        {
                          id: 'p3-period',
                          type: 'text',
                          order: 1,
                          content: 'WEEKS 9–12',
                          style: { color: C.amber, fontFamily: 'Inter', fontSize: '0.6875rem', fontWeight: '700', letterSpacing: '0.12em', margin: '0 0 4px 0' },
                        },
                        {
                          id: 'p3-title',
                          type: 'heading',
                          order: 2,
                          content: 'Website + content engine',
                          level: 4,
                          style: { color: C.darkText, fontFamily: 'Inter', fontSize: '1.25rem', fontWeight: '700', margin: '0 0 8px 0' },
                        },
                        {
                          id: 'p3-body',
                          type: 'text',
                          order: 3,
                          content: 'Rebuild crosscapadvisors.com on the platform with the positioning Cody refined &mdash; new nav, new messaging, lead magnets that flow directly into the CRM. The brain spots referral-side content trends (lawyer pain points, divorce-crypto cases) and surfaces them as draft posts for the team to approve.',
                          style: { color: C.bodyText, fontFamily: 'Inter', fontSize: '0.9375rem', lineHeight: '1.65' },
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
        fontFamily: 'Inter',
      },
    },

    // ━━━━━ SLIDE 7: WHY US ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    {
      id: 'slide-why',
      label: 'Why Us',
      blocks: [
        {
          id: 'why-section',
          type: 'section',
          order: 1,
          backgroundColor: C.cream,
          paddingTop: '0px',
          paddingBottom: '0px',
          paddingLeft: '0px',
          paddingRight: '0px',
          maxWidth: '1080px',
          blocks: [
            {
              id: 'why-eyebrow',
              type: 'text',
              order: 1,
              content: 'WHY THIS, NOT THAT',
              style: {
                color: C.blue,
                fontFamily: 'Inter',
                fontSize: '0.6875rem',
                fontWeight: '600',
                letterSpacing: '0.15em',
                margin: '0 0 12px 0',
              },
            },
            {
              id: 'why-heading',
              type: 'heading',
              order: 2,
              content: 'An agency with a platform &mdash; not just another SaaS bill.',
              level: 2,
              style: {
                color: C.darkText,
                fontFamily: 'Inter',
                fontSize: '2.25rem',
                fontWeight: '800',
                lineHeight: '1.15',
                letterSpacing: '-0.015em',
                margin: '0 0 8px 0',
              },
            },
            {
              id: 'why-accent',
              type: 'divider',
              order: 3,
              style: {
                borderColor: C.amber,
                maxWidth: '60px',
                borderWidth: '3px',
                margin: '12px 0 24px 0',
              },
            },
            {
              id: 'why-intro',
              type: 'text',
              order: 4,
              content: 'Salesforce will sell you a license and an admin. HubSpot will sell you a contract that doubles in year two. A custom dev shop will quote you $50k and disappear after phase one. SimplerDevelopment is the platform <em>and</em> the team that tunes it to you.',
              style: {
                color: C.bodyText,
                fontFamily: 'Inter',
                fontSize: '1rem',
                lineHeight: '1.65',
                margin: '0 0 36px 0',
                maxWidth: '880px',
              },
            },
            {
              id: 'why-table',
              type: 'columns',
              order: 5,
              columns: [
                {
                  id: 'why-good-col',
                  width: '58%',
                  verticalAlign: 'top',
                  padding: 'sm',
                  blocks: [
                    {
                      id: 'why-good-card',
                      type: 'section',
                      order: 1,
                      backgroundColor: C.blueLight,
                      paddingTop: '26px',
                      paddingBottom: '26px',
                      paddingLeft: '28px',
                      paddingRight: '28px',
                      blocks: [
                        {
                          id: 'wg-title',
                          type: 'text',
                          order: 1,
                          content: 'WHAT YOU GET',
                          style: { color: C.blueDeep, fontFamily: 'Inter', fontSize: '0.6875rem', letterSpacing: '0.12em', fontWeight: '700', margin: '0 0 18px 0' },
                        },
                        {
                          id: 'wg-1',
                          type: 'text',
                          order: 2,
                          content: '<span style="color:#10B981;font-weight:700">+</span>&nbsp;&nbsp;<strong>One platform, one bill, one team.</strong> No re-integrating with every vendor change.',
                          style: { color: C.darkText, fontFamily: 'Inter', fontSize: '0.9375rem', lineHeight: '1.6', margin: '0 0 12px 0', paddingBottom: '12px', borderBottom: '1px solid rgba(37,99,235,0.15)' },
                        },
                        {
                          id: 'wg-2',
                          type: 'text',
                          order: 3,
                          content: '<span style="color:#10B981;font-weight:700">+</span>&nbsp;&nbsp;<strong>Built for you, not for your industry "average."</strong> We tune the CRM, brain, and automations to CrossCap\'s actual workflow.',
                          style: { color: C.darkText, fontFamily: 'Inter', fontSize: '0.9375rem', lineHeight: '1.6', margin: '0 0 12px 0', paddingBottom: '12px', borderBottom: '1px solid rgba(37,99,235,0.15)' },
                        },
                        {
                          id: 'wg-3',
                          type: 'text',
                          order: 4,
                          content: '<span style="color:#10B981;font-weight:700">+</span>&nbsp;&nbsp;<strong>An actual human on call.</strong> Cody for strategy &amp; positioning. Dan for the build. No support-ticket queue.',
                          style: { color: C.darkText, fontFamily: 'Inter', fontSize: '0.9375rem', lineHeight: '1.6', margin: '0 0 12px 0', paddingBottom: '12px', borderBottom: '1px solid rgba(37,99,235,0.15)' },
                        },
                        {
                          id: 'wg-4',
                          type: 'text',
                          order: 5,
                          content: '<span style="color:#10B981;font-weight:700">+</span>&nbsp;&nbsp;<strong>You own your data and your roadmap.</strong> No lock-in tax. If we part ways, you get a clean export.',
                          style: { color: C.darkText, fontFamily: 'Inter', fontSize: '0.9375rem', lineHeight: '1.6' },
                        },
                      ],
                    },
                  ],
                },
                {
                  id: 'why-bad-col',
                  width: '42%',
                  verticalAlign: 'top',
                  padding: 'sm',
                  blocks: [
                    {
                      id: 'why-bad-card',
                      type: 'section',
                      order: 1,
                      backgroundColor: C.warnSoft,
                      paddingTop: '26px',
                      paddingBottom: '26px',
                      paddingLeft: '28px',
                      paddingRight: '28px',
                      blocks: [
                        {
                          id: 'wb-title',
                          type: 'text',
                          order: 1,
                          content: 'WHAT YOU AVOID',
                          style: { color: C.warnText, fontFamily: 'Inter', fontSize: '0.6875rem', letterSpacing: '0.12em', fontWeight: '700', margin: '0 0 18px 0' },
                        },
                        {
                          id: 'wb-1',
                          type: 'text',
                          order: 2,
                          content: '<span style="color:#DC2626;font-weight:700">&times;</span>&nbsp;&nbsp;Salesforce-style consultants and broken custom objects.',
                          style: { color: C.darkText, fontFamily: 'Inter', fontSize: '0.875rem', lineHeight: '1.55', margin: '0 0 12px 0', paddingBottom: '12px', borderBottom: '1px solid rgba(220,38,38,0.15)' },
                        },
                        {
                          id: 'wb-2',
                          type: 'text',
                          order: 3,
                          content: '<span style="color:#DC2626;font-weight:700">&times;</span>&nbsp;&nbsp;HubSpot\'s "starter price" trap and year-two renewal shock.',
                          style: { color: C.darkText, fontFamily: 'Inter', fontSize: '0.875rem', lineHeight: '1.55', margin: '0 0 12px 0', paddingBottom: '12px', borderBottom: '1px solid rgba(220,38,38,0.15)' },
                        },
                        {
                          id: 'wb-3',
                          type: 'text',
                          order: 4,
                          content: '<span style="color:#DC2626;font-weight:700">&times;</span>&nbsp;&nbsp;$50k custom builds that need a $100k phase two.',
                          style: { color: C.darkText, fontFamily: 'Inter', fontSize: '0.875rem', lineHeight: '1.55', margin: '0 0 12px 0', paddingBottom: '12px', borderBottom: '1px solid rgba(220,38,38,0.15)' },
                        },
                        {
                          id: 'wb-4',
                          type: 'text',
                          order: 5,
                          content: '<span style="color:#DC2626;font-weight:700">&times;</span>&nbsp;&nbsp;Tool sprawl. Account creation. API key safaris.',
                          style: { color: C.darkText, fontFamily: 'Inter', fontSize: '0.875rem', lineHeight: '1.55' },
                        },
                      ],
                    },
                  ],
                },
              ],
              gap: 'md',
              stackOnMobile: true,
            },
            { id: 'why-spacer', type: 'spacer', order: 6, height: 'md' },
            {
              id: 'why-proof',
              type: 'section',
              order: 7,
              backgroundColor: C.white,
              paddingTop: '20px',
              paddingBottom: '20px',
              paddingLeft: '24px',
              paddingRight: '24px',
              blocks: [
                {
                  id: 'proof-eyebrow',
                  type: 'text',
                  order: 1,
                  content: 'RECENT WORK',
                  style: { color: C.mutedText, fontFamily: 'Inter', fontSize: '0.6875rem', fontWeight: '700', letterSpacing: '0.12em', margin: '0 0 12px 0' },
                },
                {
                  id: 'proof-line',
                  type: 'text',
                  order: 2,
                  content: '<strong style="color:#0F172A">CY Strategies</strong> &middot; <strong style="color:#0F172A">Post Captain Consulting</strong> &middot; <strong style="color:#0F172A">Palizzi Social Club</strong> &middot; <strong style="color:#0F172A">Center for Audit Quality</strong> &middot; <strong style="color:#0F172A">Nora Anger LPC</strong> &middot; <strong style="color:#0F172A">Ellipsis Health</strong>',
                  style: { color: C.bodyText, fontFamily: 'Inter', fontSize: '0.9375rem', lineHeight: '1.7' },
                },
              ],
            },
          ],
        },
      ],
      pageSettings: {
        backgroundColor: C.cream,
        color: C.darkText,
        fontFamily: 'Inter',
      },
    },

    // ━━━━━ SLIDE 8: WHAT'S NEXT / CTA ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    {
      id: 'slide-cta',
      label: "What's Next",
      blocks: [
        {
          id: 'cta-section',
          type: 'section',
          order: 1,
          backgroundColor: C.navy,
          paddingTop: '0px',
          paddingBottom: '0px',
          paddingLeft: '0px',
          paddingRight: '0px',
          maxWidth: '900px',
          blocks: [
            {
              id: 'cta-eyebrow',
              type: 'text',
              order: 1,
              content: "WHAT'S NEXT",
              style: {
                color: C.amber,
                fontFamily: 'Inter',
                fontSize: '0.6875rem',
                fontWeight: '600',
                letterSpacing: '0.15em',
                margin: '0 0 12px 0',
              },
            },
            {
              id: 'cta-heading',
              type: 'heading',
              order: 2,
              content: 'A 30-minute scoping call.',
              level: 2,
              style: {
                color: C.white,
                fontFamily: 'Inter',
                fontSize: '2.75rem',
                fontWeight: '800',
                lineHeight: '1.1',
                letterSpacing: '-0.015em',
                margin: '0 0 8px 0',
              },
            },
            {
              id: 'cta-accent',
              type: 'divider',
              order: 3,
              style: {
                borderColor: C.amber,
                maxWidth: '60px',
                borderWidth: '3px',
                margin: '12px 0 24px 0',
              },
            },
            {
              id: 'cta-body',
              type: 'text',
              order: 4,
              content: 'We\'ll narrow the wish list to the two or three things worth solving first, sketch a rough scope and price, and figure out whether the Core compliance team needs to be in the next conversation. No deck-fatigue. No "let me get you a proposal in two weeks."',
              style: {
                color: 'rgba(255,255,255,0.85)',
                fontFamily: 'Inter',
                fontSize: '1.0625rem',
                lineHeight: '1.65',
                margin: '0 0 36px 0',
                maxWidth: '780px',
              },
            },
            {
              id: 'cta-checklist',
              type: 'section',
              order: 5,
              backgroundColor: C.navyMid,
              paddingTop: '24px',
              paddingBottom: '24px',
              paddingLeft: '28px',
              paddingRight: '28px',
              blocks: [
                {
                  id: 'check-label',
                  type: 'text',
                  order: 1,
                  content: 'WHAT WE\'LL LEAVE WITH',
                  style: { color: C.amber, fontFamily: 'Inter', fontSize: '0.6875rem', fontWeight: '700', letterSpacing: '0.12em', margin: '0 0 16px 0' },
                },
                {
                  id: 'check-1',
                  type: 'text',
                  order: 2,
                  content: '<span class="material-icons" style="font-size:18px;color:#10B981;vertical-align:middle">check_circle</span>&nbsp;&nbsp;<span style="vertical-align:middle;color:#fff">The top 2&ndash;3 problems we\'ll attack first</span>',
                  style: { color: 'rgba(255,255,255,0.9)', fontFamily: 'Inter', fontSize: '0.9375rem', margin: '0 0 10px 0' },
                },
                {
                  id: 'check-2',
                  type: 'text',
                  order: 3,
                  content: '<span class="material-icons" style="font-size:18px;color:#10B981;vertical-align:middle">check_circle</span>&nbsp;&nbsp;<span style="vertical-align:middle;color:#fff">A rough phase-one scope, timeline, and price band</span>',
                  style: { color: 'rgba(255,255,255,0.9)', fontFamily: 'Inter', fontSize: '0.9375rem', margin: '0 0 10px 0' },
                },
                {
                  id: 'check-3',
                  type: 'text',
                  order: 4,
                  content: '<span class="material-icons" style="font-size:18px;color:#10B981;vertical-align:middle">check_circle</span>&nbsp;&nbsp;<span style="vertical-align:middle;color:#fff">A clear answer on compliance &mdash; including whether we loop in Core</span>',
                  style: { color: 'rgba(255,255,255,0.9)', fontFamily: 'Inter', fontSize: '0.9375rem', margin: '0 0 10px 0' },
                },
                {
                  id: 'check-4',
                  type: 'text',
                  order: 5,
                  content: '<span class="material-icons" style="font-size:18px;color:#10B981;vertical-align:middle">check_circle</span>&nbsp;&nbsp;<span style="vertical-align:middle;color:#fff">A no &mdash; if it doesn\'t fit, you\'ll know fast</span>',
                  style: { color: 'rgba(255,255,255,0.9)', fontFamily: 'Inter', fontSize: '0.9375rem' },
                },
              ],
            },
            { id: 'cta-button-spacer', type: 'spacer', order: 6, height: 'md' },
            {
              id: 'cta-button',
              type: 'button',
              order: 7,
              text: 'Schedule the scoping call',
              url: CALENDLY,
              variant: 'primary',
              alignment: 'left',
              size: 'lg',
              openInNewTab: true,
              icon: 'arrow_forward',
              iconPosition: 'right',
              hoverEffect: 'lift',
            },
            { id: 'cta-button-after-spacer', type: 'spacer', order: 8, height: 'sm' },
            {
              id: 'cta-foot',
              type: 'text',
              order: 9,
              content: 'Or just reply to Cody. We\'re close enough that ceremony is overkill.',
              style: {
                color: 'rgba(255,255,255,0.55)',
                fontFamily: 'Inter',
                fontSize: '0.8125rem',
                fontStyle: 'italic',
              },
            },
          ],
        },
      ],
      pageSettings: {
        backgroundColor: C.navy,
        color: C.white,
        fontFamily: 'Inter',
      },
    },
  ];
}

async function createPitchDeck() {
  const { db } = await import('../../../lib/db');
  const { pitchDecks } = await import('../../../lib/db/schema/tools');
  const { clients } = await import('../../../lib/db/schema/sites');
  const { users } = await import('../../../lib/db/schema/auth');
  const { eq, and } = await import('drizzle-orm');

  const [user] = await db.select().from(users).where(eq(users.email, CLIENT_EMAIL)).limit(1);
  if (!user) {
    console.error(`SimplerDevelopment user (${CLIENT_EMAIL}) not found.`);
    process.exit(1);
  }
  const [client] = await db.select().from(clients).where(eq(clients.userId, user.id)).limit(1);
  if (!client) {
    console.error(`SimplerDevelopment client for user ${user.id} not found.`);
    process.exit(1);
  }

  const slug = 'crosscap-platform-pitch';
  const title = 'SimplerDevelopment for CrossCap Advisors';

  const slides = buildSlides();
  const theme = {
    primaryColor: C.blue,
    accentColor: C.amber,
    backgroundColor: C.cream,
    textColor: C.darkText,
    headingFont: 'Inter',
    bodyFont: 'Inter',
  };

  const existing = await db.select().from(pitchDecks)
    .where(and(eq(pitchDecks.clientId, client.id), eq(pitchDecks.slug, slug)))
    .limit(1);

  if (existing.length > 0) {
    await db.update(pitchDecks)
      .set({
        title,
        description: 'Pitch deck for Crossover Capital Advisors — positioning SimplerDevelopment as the consolidating platform (Company Brain + CRM + Booking + Content + Website) for their fragmented wealth-management stack.',
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
      description: 'Pitch deck for Crossover Capital Advisors — positioning SimplerDevelopment as the consolidating platform (Company Brain + CRM + Booking + Content + Website) for their fragmented wealth-management stack.',
      status: 'published',
      slides: slides as any,
      theme,
      formatVersion: 2,
    }).returning();
    console.log(`Pitch deck created: ID ${deck.id}`);
  }

  console.log(`\nView at: https://simplerdevelopment.com/pitch-deck/${slug}`);
  console.log('\n=== PITCH DECK CREATION COMPLETE ===');
  process.exit(0);
}

// Only run when invoked directly (not when imported by sibling scripts).
const isMain =
  typeof require !== 'undefined' && typeof module !== 'undefined' && require.main === module;
if (isMain || process.argv[1]?.endsWith('create-pitch-deck.ts')) {
  createPitchDeck().catch(err => { console.error(err); process.exit(1); });
}
