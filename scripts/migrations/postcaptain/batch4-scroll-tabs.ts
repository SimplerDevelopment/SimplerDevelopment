/**
 * Batch 4 — replace the inline service-detail panels with a single
 * `sticky-scroll-tabs` block.
 *
 * Live's home page uses a `wp-block-postcaptain-scroll-tabs` that sticks the
 * tab pill row to the top while three panels (Implementations / Projects /
 * Support) cross-fade as the user scrolls. We just shipped that universal
 * block, now we restructure post 302 to use it.
 *
 * Plan:
 *  1. Inside `services-section`, drop the existing `services-tabs-row`
 *     (card-grid) and the existing `services-active-panel` (which holds
 *     only the Implementations panel).
 *  2. Inside `service-cards-section`, drop the inline Projects / Support
 *     panels (svc-projects-panel, svc-support-panel).
 *  3. Insert a single `sticky-scroll-tabs` block in `services-section`
 *     after the intro row. The block holds three panels (Implementations,
 *     Projects, Support) — each panel reuses the same heading + sub-text +
 *     bullet list + Learn More button structure.
 *
 * Idempotent — only runs the swap if the block doesn't already exist.
 *
 * Run with:
 *   bun -r dotenv/config scripts/migrations/postcaptain/batch4-scroll-tabs.ts dotenv_config_path=.env.local
 */
import 'dotenv/config';
import { db } from '@/lib/db';
import { posts } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

type Block = Record<string, unknown> & {
  id?: string;
  type?: string;
  blocks?: Block[];
  columns?: Array<Record<string, unknown> & { blocks?: Block[] }>;
};

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
    if (Array.isArray(b.columns)) {
      for (const col of b.columns ?? []) {
        if (Array.isArray(col?.blocks)) {
          const r = findBlockById(col.blocks as Block[], id);
          if (r) return r;
        }
      }
    }
  }
  return null;
}

const PANEL_TEXT_STYLE = {
  heading: {
    color: '#0A3A5C',
    fontFamily: 'Poppins',
    fontSize: '2.25rem',
    fontWeight: '700',
    lineHeight: '1.2',
    margin: '0 0 16px',
    letterSpacing: '-0.01em',
  },
  sub: {
    color: '#4B5563',
    fontFamily: 'DM Sans',
    fontSize: '1rem',
    lineHeight: '1.65',
    margin: '0 0 24px',
  },
  btn: {
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
  bullets: {
    color: '#0A3A5C',
    fontFamily: 'DM Sans',
    fontSize: '1rem',
    lineHeight: '1.65',
    margin: '0',
  },
};

function buildPanelContent(args: {
  prefix: string;
  heading: string;
  sub: string;
  btnUrl: string;
  bullets: string[];
}): Block[] {
  const { prefix, heading, sub, btnUrl, bullets } = args;
  return [
    {
      id: `${prefix}-cols`,
      type: 'columns',
      order: 1,
      gap: 'lg',
      columns: [
        {
          id: `${prefix}-text-col`,
          width: '60%',
          verticalAlign: 'center',
          blocks: [
            {
              id: `${prefix}-heading`,
              type: 'heading',
              order: 1,
              content: heading,
              level: 3,
              style: PANEL_TEXT_STYLE.heading,
            },
            {
              id: `${prefix}-sub`,
              type: 'text',
              order: 2,
              content: sub,
              style: PANEL_TEXT_STYLE.sub,
            },
            {
              id: `${prefix}-btn`,
              type: 'button',
              order: 3,
              text: 'LEARN MORE',
              url: btnUrl,
              variant: 'outline',
              icon: 'arrow_forward',
              iconPosition: 'right',
              hoverEffect: 'lift',
              style: PANEL_TEXT_STYLE.btn,
            },
          ],
        },
        {
          id: `${prefix}-bullets-col`,
          width: '40%',
          verticalAlign: 'center',
          blocks: [
            {
              id: `${prefix}-list`,
              type: 'text',
              order: 1,
              content:
                '<ul class="seu-list">' +
                bullets.map((b) => `<li>${b}</li>`).join('') +
                '</ul>',
              style: PANEL_TEXT_STYLE.bullets,
            },
          ],
        },
      ],
    },
  ];
}

async function main() {
  const [post] = await db.select().from(posts).where(eq(posts.id, 302));
  if (!post) throw new Error('post 302 not found');
  const parsed = JSON.parse(post.content) as PostContent;
  const blocks = parsed.blocks;

  // Idempotency: if scroll-tabs block already exists, skip.
  if (findBlockById(blocks, 'svc-scroll-tabs')) {
    console.log('  scroll-tabs block already present — skipping content swap');
  } else {
    const servicesSection = findBlockById(blocks, 'services-section');
    const serviceCardsSection = findBlockById(blocks, 'service-cards-section');
    if (!servicesSection || !Array.isArray(servicesSection.blocks)) {
      throw new Error('services-section not found or malformed');
    }

    // Strip out old layout: services-tabs-row (card-grid pills) + services-active-panel
    servicesSection.blocks = servicesSection.blocks.filter(
      (b) => b.id !== 'services-tabs-row' && b.id !== 'services-active-panel',
    );

    // Build the new sticky-scroll-tabs block
    const scrollTabs: Block = {
      id: 'svc-scroll-tabs',
      type: 'sticky-scroll-tabs',
      order: 2,
      stickyTopOffset: 80,
      panelMinHeight: '60vh',
      activeTabBackground: '#A4D2A1',
      activeTabColor: '#0A3A5C',
      inactiveTabBackground: '#EAF3EC',
      inactiveTabColor: '#0A3A5C',
      panels: [
        {
          id: 'panel-impl',
          label: 'Implementations',
          icon: 'rocket_launch',
          blocks: buildPanelContent({
            prefix: 'panel-impl',
            heading: 'Set Everyone Up for Success in Slate',
            sub: 'We take a collaborative approach to implementations, so your team learns by doing.',
            btnUrl: '/service/implementations',
            bullets: [
              'Learn Along the Way',
              'Simplify Your Tech Stack',
              'Reduce Overhead &amp; Overload',
            ],
          }),
        },
        {
          id: 'panel-projects',
          label: 'Projects',
          icon: 'conversion_path',
          blocks: buildPanelContent({
            prefix: 'panel-projects',
            heading: 'Ensure Smooth Execution in Slate',
            sub: 'Bring big ideas to life, while we handle the heavy lifting.',
            btnUrl: '/service/projects',
            bullets: [
              'Receive Complete Solutions',
              'Keep It Instance-Specific',
              'Save Time &amp; Accelerate Results',
            ],
          }),
        },
        {
          id: 'panel-support',
          label: 'Support',
          icon: 'handshake',
          blocks: buildPanelContent({
            prefix: 'panel-support',
            heading: 'Access Our Slate Captain Services',
            sub: 'Get expert support on demand, without the bots or ticket queues.',
            btnUrl: '/service/support',
            bullets: ['Ask a Real Human', 'Adapt to Your Needs', 'Feel Seen &amp; Heard'],
          }),
        },
      ],
      elementStyles: {
        panel: {
          background: '#F4FAF5',
          borderRadius: '16px',
          border: '2px solid #CCE1D0',
          padding: '36px 40px',
        },
        activePanel: {
          boxShadow: '0 8px 24px rgba(10, 58, 92, 0.06)',
        },
      },
    };
    servicesSection.blocks.push(scrollTabs);

    // Strip out the now-orphan service-cards-section panels (Projects/Support)
    if (serviceCardsSection && Array.isArray(serviceCardsSection.blocks)) {
      serviceCardsSection.blocks = serviceCardsSection.blocks.filter(
        (b) => b.id !== 'svc-projects-panel' && b.id !== 'svc-support-panel',
      );
    }
  }

  // Update CSS — neutralize the old sticky-tabs hack from batch3 (the old
  // tabs-row no longer exists), and add scoped styles for the new block to
  // match live's typography.
  let css = post.customCss ?? '';
  const NEW_MARKER = '/* svc-scroll-tabs-styles — typography for the new sticky-scroll-tabs block */';
  if (!css.includes(NEW_MARKER)) {
    css += `

${NEW_MARKER}
.block-content [data-block-id="svc-scroll-tabs"] .ssct-header {
  margin-bottom: 24px !important;
}
.block-content [data-block-id="svc-scroll-tabs"] .ssct-tabs-wrap {
  margin: 0 0 16px !important;
  padding: 12px 0 !important;
}
.block-content [data-block-id="svc-scroll-tabs"] .ssct-tabs {
  max-width: 100% !important;
}
.block-content [data-block-id="svc-scroll-tabs"] .ssct-tab {
  height: 76px;
  font-family: 'Poppins', system-ui, sans-serif !important;
  letter-spacing: 0.08em !important;
}
.block-content [data-block-id="svc-scroll-tabs"] .ssct-tab .ssct-tab-icon {
  font-family: 'Material Icons' !important;
  font-feature-settings: 'liga' !important;
  font-size: 1.6rem !important;
}
.block-content [data-block-id="svc-scroll-tabs"] .ssct-panel {
  margin-bottom: 24px;
}
/* /svc-scroll-tabs-styles */`;
  }

  await db
    .update(posts)
    .set({ content: JSON.stringify(parsed), customCss: css, updatedAt: new Date() })
    .where(eq(posts.id, 302));

  console.log('post 302 batch4 applied.');
  console.log('  scroll-tabs block present ->', !!findBlockById(blocks, 'svc-scroll-tabs'));
  console.log('  scroll-tabs CSS         ->', css.includes(NEW_MARKER));
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
