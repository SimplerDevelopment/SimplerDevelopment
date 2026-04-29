/**
 * Batch 1 of postcaptain replication tightening.
 *
 * Pure JSON edit on post 302 (postcaptain home page) to close visual gaps
 * against https://postcaptain.com/. Idempotent — safe to re-run.
 *
 * Changes:
 *  1. Footer: navy -> WHITE bg with dark text + "CONSIDER IT DONE" CTA, prune
 *     "Why Post Captain"-shaped link group to match live (the live footer has
 *     Services / Solutions / Why Post Captain columns).
 *  2. Services intro: scrap the wide blob "Set Everyone Up" card and replace
 *     with the live tab-style layout — 2-col header (eyebrow + title left,
 *     description right), then row of 3 service tabs (IMPLEMENTATIONS active
 *     style), then a single big detail panel for the active tab.
 *  3. Services tabs body: use a 3-card stacked services-detail block — heading
 *     + subhead + 3 bullets + LEARN MORE per tab.
 *  4. Solutions: subhead -> live copy "If Slate were one-size-fits-all..." +
 *     icon container -> rounded-square chip not pill circle (handled via the
 *     existing customCSS .charting-icons rule).
 *  5. Stats heading: uppercase to match live "TURNING SLATE INTO A STRATEGIC
 *     GROWTH ENGINE".
 *
 * Run:
 *   npx tsx -r dotenv/config scripts/migrations/postcaptain/batch1-tighten.ts dotenv_config_path=.env
 */
import { db } from '@/lib/db';
import { posts } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

type Block = Record<string, unknown> & { id?: string; type?: string; blocks?: Block[]; columns?: unknown };

interface PostContent {
  blocks: Block[];
  version?: string;
}

function findBlockById(blocks: Block[], id: string): Block | null {
  for (const b of blocks) {
    if (b.id === id) return b;
    if (Array.isArray(b.blocks)) {
      const r = findBlockById(b.blocks, id);
      if (r) return r;
    }
    if (Array.isArray((b as { columns?: { blocks?: Block[] }[] }).columns)) {
      for (const col of (b as { columns?: { blocks?: Block[] }[] }).columns ?? []) {
        if (Array.isArray(col?.blocks)) {
          const r = findBlockById(col.blocks, id);
          if (r) return r;
        }
      }
    }
  }
  return null;
}

async function main() {
  const [post] = await db.select().from(posts).where(eq(posts.id, 302));
  if (!post) throw new Error('post 302 not found');
  const parsed = JSON.parse(post.content) as PostContent;
  const blocks = parsed.blocks;

  // -------- 1. FOOTER --------
  const footer = blocks.find((b) => b.id === 'footer-1');
  if (footer) {
    Object.assign(footer, {
      tagline:
        'Need a deep dive into your Slate setup? A smooth implementation? A custom-built portal that actually makes life easier?',
      backgroundColor: '#FFFFFF',
      textColor: '#3D4A57',
      accentColor: '#0A3A5C',
      ctaText: 'CONSIDER IT DONE',
      ctaUrl: '/contact',
      copyright: 'Copyright © 2026 Post Captain Consulting | All Rights Reserved',
      style: {
        backgroundColor: '#FFFFFF',
        color: '#3D4A57',
      },
      linkGroups: [
        {
          label: 'Our Services',
          links: [
            { label: 'Audits', href: '/service/audits' },
            { label: 'Implementations', href: '/service/implementations' },
            { label: 'Portals', href: '/service/portals' },
            { label: 'Support', href: '/service/support' },
            { label: 'Projects', href: '/service/projects' },
          ],
        },
        {
          label: 'Slate Solutions',
          links: [
            { label: 'Admissions', href: '/solution/admissions' },
            { label: 'Student Success', href: '/solution/student-success' },
            { label: 'Advancement', href: '/solution/advancement' },
          ],
        },
        {
          label: 'Why Post Captain',
          links: [
            { label: 'About', href: '/why-post-captain' },
            { label: 'Mission', href: '/why-post-captain#mission' },
            { label: 'Values', href: '/why-post-captain#values' },
            { label: 'Team', href: '/why-post-captain#team' },
          ],
        },
      ],
    });
  }

  // -------- 2. SERVICES INTRO RESTRUCTURE --------
  // The live page shows a 2-col header (eyebrow+title left, description right)
  // and below that, a row of 3 large rounded service tabs (active = mint green).
  // Then a single detail panel for the ACTIVE tab.
  // We model the 3 tabs as a card-grid (`services-tabs-row`) that links to
  // /service/* and the detail panel as the existing set-everyone-up-card moved
  // to its own row below the tab buttons.
  const servicesSection = blocks.find((b) => b.id === 'services-section');
  if (servicesSection) {
    servicesSection.paddingTop = '64px';
    servicesSection.paddingBottom = '24px';
    servicesSection.maxWidth = '1190px';
    servicesSection.blocks = [
      {
        id: 'services-intro-row',
        type: 'columns',
        order: 1,
        gap: 'lg',
        columns: [
          {
            id: 'services-intro-left',
            width: '50%',
            verticalAlign: 'start',
            blocks: [
              {
                id: 'services-overline',
                type: 'text',
                order: 1,
                content: 'OUR SERVICES',
                style: {
                  color: '#5BA573',
                  fontFamily: 'Poppins',
                  fontSize: '0.8125rem',
                  fontWeight: '700',
                  letterSpacing: '0.3em',
                  textTransform: 'uppercase',
                  margin: '0 0 14px 0',
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
                  fontSize: '3rem',
                  fontWeight: '700',
                  margin: '0',
                  lineHeight: '1.1',
                  letterSpacing: '-0.02em',
                },
              },
            ],
          },
          {
            id: 'services-intro-right',
            width: '50%',
            verticalAlign: 'center',
            blocks: [
              {
                id: 'services-desc',
                type: 'text',
                order: 1,
                content:
                  "Slate is a transformative platform, but it's your direction that unlocks its power. With the right guidance and a little momentum, we'll help you move forward in ways that make your work—and its impact—even more rewarding.",
                style: {
                  color: '#3D4A57',
                  fontFamily: 'DM Sans',
                  fontSize: '1.125rem',
                  lineHeight: '1.65',
                  margin: '0',
                },
              },
            ],
          },
        ],
      },
      {
        id: 'services-tabs-row',
        type: 'card-grid',
        order: 2,
        columns: 3,
        cards: [
          {
            id: 'tab-impl',
            title: 'IMPLEMENTATIONS',
            description: '',
            icon: 'rocket_launch',
            link: '/service/implementations',
          },
          {
            id: 'tab-projects',
            title: 'PROJECTS',
            description: '',
            icon: 'conversion_path',
            link: '/service/projects',
          },
          {
            id: 'tab-support',
            title: 'SUPPORT',
            description: '',
            icon: 'handshake',
            link: '/service/support',
          },
        ],
        elementStyles: {
          card: {
            backgroundColor: '#EAF3EC',
            borderRadius: '999px',
            borderWidth: '0',
            padding: '20px 28px',
            customCSS:
              'box-shadow: 0 1px 3px rgba(0,77,128,0.04); transition: all 0.2s ease; display: flex; flex-direction: row; align-items: center; gap: 12px; min-height: 0; height: 76px',
          },
          cardTitle: {
            color: '#0A3A5C',
            fontFamily: 'Poppins',
            fontSize: '1rem',
            fontWeight: '700',
            letterSpacing: '0.08em',
            margin: '0',
            customCSS: 'flex: 1; text-align: center',
          },
          cardIcon: {
            color: '#0A3A5C',
            fontSize: '1.6rem',
            customCSS: 'margin: 0; flex: 0 0 auto',
          },
          cardLink: {
            customCSS: 'display: none',
          },
          cardDescription: {
            customCSS: 'display: none',
          },
        },
      },
      // Active panel for IMPLEMENTATIONS — shown below the tab row, like the live.
      {
        id: 'services-active-panel',
        type: 'section',
        order: 3,
        backgroundColor: '#FFFFFF',
        paddingTop: '40px',
        paddingBottom: '32px',
        paddingLeft: '0',
        paddingRight: '0',
        blocks: [
          {
            id: 'active-panel-cols',
            type: 'columns',
            order: 1,
            gap: 'lg',
            columns: [
              {
                id: 'active-panel-text',
                width: '60%',
                verticalAlign: 'center',
                blocks: [
                  {
                    id: 'active-panel-heading',
                    type: 'heading',
                    order: 1,
                    content: 'Set Everyone Up for Success in Slate',
                    level: 3,
                    style: {
                      color: '#0A3A5C',
                      fontFamily: 'Poppins',
                      fontSize: '2.25rem',
                      fontWeight: '700',
                      lineHeight: '1.2',
                      margin: '0 0 16px',
                      letterSpacing: '-0.01em',
                    },
                  },
                  {
                    id: 'active-panel-sub',
                    type: 'text',
                    order: 2,
                    content:
                      'We take a collaborative approach to implementations, so your team learns by doing.',
                    style: {
                      color: '#4B5563',
                      fontFamily: 'DM Sans',
                      fontSize: '1rem',
                      lineHeight: '1.65',
                      margin: '0 0 24px',
                    },
                  },
                  {
                    id: 'active-panel-btn',
                    type: 'button',
                    order: 3,
                    text: 'LEARN MORE',
                    url: '/service/implementations',
                    variant: 'outline',
                    icon: 'arrow_forward',
                    iconPosition: 'right',
                    hoverEffect: 'lift',
                    style: {
                      color: '#0A3A5C',
                      borderColor: '#0A3A5C',
                      borderWidth: '0',
                      borderRadius: '0',
                      backgroundColor: 'transparent',
                      fontFamily: 'Poppins',
                      fontWeight: '700',
                      fontSize: '14px',
                      padding: '0',
                      letterSpacing: '0.04em',
                    },
                  },
                ],
              },
              {
                id: 'active-panel-bullets',
                width: '40%',
                verticalAlign: 'center',
                blocks: [
                  {
                    id: 'active-panel-bullet-list',
                    type: 'text',
                    order: 1,
                    content:
                      '<ul class="seu-list"><li>Learn Along the Way</li><li>Simplify Your Tech Stack</li><li>Reduce Overhead &amp; Overload</li></ul>',
                    style: {
                      color: '#0A3A5C',
                      fontFamily: 'DM Sans',
                      fontSize: '1rem',
                      lineHeight: '1.65',
                      margin: '0',
                    },
                  },
                ],
              },
            ],
          },
        ],
      },
    ];
  }

  // -------- 3. SERVICES "CARDS" SECTION (the 3 sub-detail panels) --------
  // Live shows them as scroll-tabs, one per viewport. We render a stacked layout
  // — Projects then Support panels matching the active-panel structure above.
  const cardsSection = blocks.find((b) => b.id === 'service-cards-section');
  if (cardsSection) {
    cardsSection.paddingTop = '0';
    cardsSection.paddingBottom = '64px';
    cardsSection.maxWidth = '1190px';
    cardsSection.blocks = [
      // PROJECTS detail panel
      {
        id: 'svc-projects-panel',
        type: 'columns',
        order: 1,
        gap: 'lg',
        columns: [
          {
            id: 'svc-projects-text',
            width: '60%',
            verticalAlign: 'center',
            blocks: [
              {
                id: 'svc-projects-heading',
                type: 'heading',
                order: 1,
                content: 'Ensure Smooth Execution in Slate',
                level: 3,
                style: {
                  color: '#0A3A5C',
                  fontFamily: 'Poppins',
                  fontSize: '2.25rem',
                  fontWeight: '700',
                  lineHeight: '1.2',
                  margin: '0 0 16px',
                  letterSpacing: '-0.01em',
                },
              },
              {
                id: 'svc-projects-sub',
                type: 'text',
                order: 2,
                content: 'Bring big ideas to life, while we handle the heavy lifting.',
                style: {
                  color: '#4B5563',
                  fontFamily: 'DM Sans',
                  fontSize: '1rem',
                  lineHeight: '1.65',
                  margin: '0 0 24px',
                },
              },
              {
                id: 'svc-projects-btn',
                type: 'button',
                order: 3,
                text: 'LEARN MORE',
                url: '/service/projects',
                variant: 'outline',
                icon: 'arrow_forward',
                iconPosition: 'right',
                style: {
                  color: '#0A3A5C',
                  borderWidth: '0',
                  backgroundColor: 'transparent',
                  fontFamily: 'Poppins',
                  fontWeight: '700',
                  fontSize: '14px',
                  padding: '0',
                  letterSpacing: '0.04em',
                  borderRadius: '0',
                },
              },
            ],
          },
          {
            id: 'svc-projects-bullets',
            width: '40%',
            verticalAlign: 'center',
            blocks: [
              {
                id: 'svc-projects-list',
                type: 'text',
                order: 1,
                content:
                  '<ul class="seu-list"><li>Receive Complete Solutions</li><li>Keep It Instance-Specific</li><li>Save Time &amp; Accelerate Results</li></ul>',
                style: {
                  color: '#0A3A5C',
                  fontFamily: 'DM Sans',
                  fontSize: '1rem',
                  lineHeight: '1.65',
                  margin: '0',
                },
              },
            ],
          },
        ],
      },
      // SUPPORT detail panel
      {
        id: 'svc-support-panel',
        type: 'columns',
        order: 2,
        gap: 'lg',
        style: {
          margin: '40px 0 0 0',
        },
        columns: [
          {
            id: 'svc-support-text',
            width: '60%',
            verticalAlign: 'center',
            blocks: [
              {
                id: 'svc-support-heading',
                type: 'heading',
                order: 1,
                content: 'Access Our Slate Captain Services',
                level: 3,
                style: {
                  color: '#0A3A5C',
                  fontFamily: 'Poppins',
                  fontSize: '2.25rem',
                  fontWeight: '700',
                  lineHeight: '1.2',
                  margin: '0 0 16px',
                  letterSpacing: '-0.01em',
                },
              },
              {
                id: 'svc-support-sub',
                type: 'text',
                order: 2,
                content: 'Get expert support on demand, without the bots or ticket queues.',
                style: {
                  color: '#4B5563',
                  fontFamily: 'DM Sans',
                  fontSize: '1rem',
                  lineHeight: '1.65',
                  margin: '0 0 24px',
                },
              },
              {
                id: 'svc-support-btn',
                type: 'button',
                order: 3,
                text: 'LEARN MORE',
                url: '/service/support',
                variant: 'outline',
                icon: 'arrow_forward',
                iconPosition: 'right',
                style: {
                  color: '#0A3A5C',
                  borderWidth: '0',
                  backgroundColor: 'transparent',
                  fontFamily: 'Poppins',
                  fontWeight: '700',
                  fontSize: '14px',
                  padding: '0',
                  letterSpacing: '0.04em',
                  borderRadius: '0',
                },
              },
            ],
          },
          {
            id: 'svc-support-bullets',
            width: '40%',
            verticalAlign: 'center',
            blocks: [
              {
                id: 'svc-support-list',
                type: 'text',
                order: 1,
                content:
                  '<ul class="seu-list"><li>Ask a Real Human</li><li>Adapt to Your Needs</li><li>Feel Seen &amp; Heard</li></ul>',
                style: {
                  color: '#0A3A5C',
                  fontFamily: 'DM Sans',
                  fontSize: '1rem',
                  lineHeight: '1.65',
                  margin: '0',
                },
              },
            ],
          },
        ],
      },
    ];
  }

  // -------- 4. SOLUTIONS COPY --------
  const solutionsDesc = findBlockById(blocks, 'solutions-desc');
  if (solutionsDesc) {
    (solutionsDesc as { content: string }).content =
      "If Slate were one-size-fits-all, it could never take us as far as we need to go. The real opportunity lies in tailoring it to your institutional goals—and creating a system that's designed for the way your office works.";
  }

  // -------- 5. STATS HEADING UPPERCASE --------
  const csHeading = findBlockById(blocks, 'cs-heading');
  if (csHeading) {
    const s = (csHeading as { style?: Record<string, string> }).style ?? {};
    s.textTransform = 'uppercase';
    s.letterSpacing = '-0.005em';
    (csHeading as { style: Record<string, string> }).style = s;
  }

  await db
    .update(posts)
    .set({ content: JSON.stringify(parsed), updatedAt: new Date() })
    .where(eq(posts.id, 302));

  console.log('post 302 updated.');
  console.log('  footer ->', !!footer);
  console.log('  servicesSection ->', !!servicesSection);
  console.log('  cardsSection ->', !!cardsSection);
  console.log('  solutionsDesc ->', !!solutionsDesc);
  console.log('  csHeading ->', !!csHeading);
  process.exit(0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
