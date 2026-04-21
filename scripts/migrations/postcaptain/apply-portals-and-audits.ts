import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });

/**
 * Modernize Block 4 (Portals preview, raw columns) as featured-content
 * and Block 5 (Audits, raw columns + dark bg) as a dark-variant services-grid.
 *
 * Identifies target blocks by their background color (#A5C3E6 for portals, #004D80
 * for audits) rather than index, so re-runs remain idempotent.
 */

type AnyBlock = Record<string, unknown> & {
  id: string;
  type: string;
  backgroundColor?: string;
  blocks?: AnyBlock[];
};

async function main() {
  const { db } = await import('../../../lib/db');
  const { posts } = await import('../../../lib/db/schema');
  const { eq } = await import('drizzle-orm');

  const [post] = await db.select().from(posts).where(eq(posts.id, 302));
  if (!post) {
    console.log('Post 302 not found');
    process.exit(1);
  }
  const parsed = typeof post.content === 'string' ? JSON.parse(post.content) : post.content;
  const blocks: AnyBlock[] = parsed.blocks || [];

  // ──────────────────────────────────────────────────────────────────────────
  // Block 4: Portals preview — #A5C3E6 section with raw columns → featured-content
  // ──────────────────────────────────────────────────────────────────────────
  const portalsIdx = blocks.findIndex((b) => {
    if (b.type !== 'section') return false;
    if (b.backgroundColor !== '#A5C3E6') return false;
    const nested = (b.blocks as AnyBlock[]) || [];
    const hasModern = nested.some((n) => ['featured-content', 'card-grid', 'services-grid'].includes(n.type));
    return !hasModern;
  });

  if (portalsIdx !== -1) {
    const section = blocks[portalsIdx];
    section.blocks = [
      {
        id: `portals-featured-${Date.now()}`,
        type: 'featured-content',
        order: 1,
        title: "See What's Possible in Slate",
        description: 'Discover the portal experiences you can build — whether it\'s a polished admissions funnel, a donor-facing hub, or a student success dashboard. Every portal is designed to feel native in Slate.',
        imageUrl: 'https://postcaptain.com/wp-content/uploads/2024/05/portals-preview.png',
        imagePosition: 'right',
        buttonText: 'EXPLORE PORTALS',
        buttonUrl: '/portals',
        elementStyles: {
          title: {
            color: '#1F2937',
            fontFamily: 'Poppins',
            fontWeight: '700',
            fontSize: '42px',
            lineHeight: '1.15',
          },
          description: {
            color: '#1F2937',
            fontSize: '18px',
            lineHeight: '1.6',
          },
          button: {
            backgroundColor: '#004D80',
            color: '#FFFFFF',
            fontWeight: '600',
            fontSize: '14px',
            borderRadius: '8px',
            customCSS: 'text-transform: uppercase; letter-spacing: 0.05em; padding: 14px 28px',
          },
        },
      },
    ];
    console.log(`✓ Replaced Block ${portalsIdx} (Portals) with featured-content`);
  } else {
    console.log('→ Portals section already modernized, skipping');
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Block 5: Audits — dark #004D80 section with text + heading + columns → services-grid with dark variant
  // ──────────────────────────────────────────────────────────────────────────
  const auditsIdx = blocks.findIndex((b) => {
    if (b.type !== 'section') return false;
    if (b.backgroundColor !== '#004D80') return false;
    const nested = (b.blocks as AnyBlock[]) || [];
    // We're looking specifically for the audits section — it has a text child with "AUDITS"
    const hasAuditsText = nested.some((n) => {
      const c = n.content as string | undefined;
      return typeof c === 'string' && /^AUDITS$/.test(c.trim());
    });
    const hasModern = nested.some((n) => ['services-grid', 'card-grid', 'featured-content'].includes(n.type));
    return hasAuditsText && !hasModern;
  });

  if (auditsIdx !== -1) {
    const section = blocks[auditsIdx];
    section.blocks = [
      {
        id: `audits-services-${Date.now()}`,
        type: 'services-grid',
        order: 1,
        overline: 'AUDITS',
        title: 'Get More from Your Slate Instance',
        description: 'Uncover solutions and discover what Slate can do for you with a focused audit — targeted, database-level, or organization-wide.',
        columns: 3,
        accentColor: '#A5C3E6',
        services: [
          {
            id: 'audit-targeted',
            title: 'Targeted Audit',
            description: 'Zero in on a specific workflow — admissions pipeline, donor portal, or reporting stack — and surface the highest-impact fixes.',
            icon: 'center_focus_strong',
            link: '/service/audits#targeted',
            linkText: 'Learn More',
          },
          {
            id: 'audit-database',
            title: 'Database Audit',
            description: 'Review configurations, field integrity, and query health to ensure your Slate foundation is clean and scalable.',
            icon: 'storage',
            link: '/service/audits#database',
            linkText: 'Learn More',
          },
          {
            id: 'audit-org',
            title: 'Organization & Governance',
            description: 'Assess how teams share Slate — permissions, stewardship, change management — so that growth doesn\'t break ownership.',
            icon: 'account_tree',
            link: '/service/audits#governance',
            linkText: 'Learn More',
          },
        ],
        // Dark-card variant: translucent white card bg on the dark navy section,
        // light text, and a bright accent link color.
        elementStyles: {
          overline: {
            color: '#A5C3E6',
          },
          title: {
            color: '#FFFFFF',
            fontFamily: 'Poppins',
            fontWeight: '700',
          },
          description: {
            color: '#DBE8F3',
          },
          card: {
            backgroundColor: 'rgba(255,255,255,0.06)',
            borderColor: 'rgba(255,255,255,0.18)',
            customCSS: 'backdrop-filter: blur(6px)',
          },
          serviceTitle: {
            color: '#FFFFFF',
          },
          serviceDescription: {
            color: '#DBE8F3',
          },
          serviceIcon: {
            color: '#A5C3E6',
          },
          serviceLink: {
            color: '#FFFFFF',
          },
        },
      },
      {
        id: `audits-cta-btn-${Date.now()}`,
        type: 'button',
        order: 2,
        text: 'LEARN MORE ABOUT AUDITS',
        url: '/service/audits',
        variant: 'outline',
        alignment: 'center',
        icon: 'arrow_forward',
        iconPosition: 'right',
        hoverEffect: 'lift',
        style: {
          color: '#FFFFFF',
          borderColor: '#FFFFFF',
          borderWidth: '2px',
          borderStyle: 'solid',
          borderRadius: '8px',
          fontWeight: '600',
          customCSS: 'text-transform: uppercase; letter-spacing: 0.05em; padding: 14px 36px; margin-top: 32px',
        },
      },
    ];
    console.log(`✓ Replaced Block ${auditsIdx} (Audits) contents with dark-variant services-grid`);
  } else {
    console.log('→ Audits section already modernized or not found, skipping');
  }

  const newContent = JSON.stringify({ ...parsed, blocks });
  await db.update(posts).set({ content: newContent, updatedAt: new Date() }).where(eq(posts.id, 302));
  console.log('\n✓ Post 302 saved');
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
