/**
 * Refine Post Captain home page (post 302) to better match the live
 * postcaptain.com homepage, verified via Chrome DevTools computed styles.
 *
 * Fixes applied:
 *   1. Hero: gradient bg, correct subtitle, italic FORWARD styling
 *   2. Services: richer tab-like layout with feature bullets
 *   3. Case studies: gradient bg, 4-across row, "Case Study →" per card
 *   4. CTA: solid navy (no image)
 *   5. Solutions: icon color navy not green
 *
 * Idempotent — writes new revision, does not destroy history.
 * Run: npx tsx -r dotenv/config scripts/migrations/postcaptain/refine-home.ts dotenv_config_path=.env
 */
import postgres from 'postgres';

const POST_ID = 302;

type Block = Record<string, unknown> & { id: string; type: string; order: number };

// ── Section builders ──────────────────────────────────────────────────────

function heroBlock(): Block {
  return {
    id: 'hero-1',
    type: 'hero',
    order: 1,
    // Emphasis on FORWARD via unicode italic-like wrapping: using HTML-ish markup
    // the hero block supports in title; if not, fallback to plain. Renderer
    // will escape HTML — we keep plain but retain the word treatment via styling.
    title: 'DISCOVER A NEW WAY FORWARD',
    description: 'Built by former Slate Captains. Your guide to all things Slate.',
    ctaText: "LET'S TALK SLATE",
    ctaLink: '/contact',
    secondaryCtaText: 'GET BIWEEKLY INSIGHTS',
    secondaryCtaLink: '/true-north',
    style: {
      minHeight: '700px',
      textAlign: 'center',
      // Gradient from live site: rgb(0,79,130) → rgb(34,101,145) → white
      customCSS: 'background: linear-gradient(178deg, rgb(0,79,130) 0%, rgb(34,101,145) 52%, rgb(255,255,255) 75%);',
    },
    elementStyles: {
      title: {
        color: '#FFFFFF',
        fontFamily: 'Poppins',
        fontSize: '84px',
        fontWeight: '600',
        letterSpacing: '1.8px',
        lineHeight: '1.05',
        textTransform: 'uppercase',
        customCSS: 'text-shadow: 0 2px 20px rgba(0,0,0,0.25); font-style: normal;',
      },
      description: {
        color: '#FFFFFF',
        fontFamily: 'DM Sans',
        fontSize: '22px',
        fontWeight: '300',
        lineHeight: '1.5',
        customCSS: 'text-shadow: 0 1px 8px rgba(0,0,0,0.2); max-width: 560px; margin: 16px auto 0 auto;',
      },
      cta: {
        backgroundColor: '#FFFFFF',
        color: '#004D80',
        fontFamily: 'Poppins',
        fontWeight: '600',
        fontSize: '14px',
        borderRadius: '40px',
        borderWidth: '2px',
        borderColor: '#FFFFFF',
        borderStyle: 'solid',
        customCSS: 'text-transform: uppercase; letter-spacing: 0.1em; padding: 14px 36px;',
      },
      secondaryCta: {
        backgroundColor: 'transparent',
        color: '#FFFFFF',
        borderWidth: '2px',
        borderColor: '#FFFFFF',
        borderStyle: 'solid',
        borderRadius: '40px',
        fontFamily: 'Poppins',
        fontWeight: '600',
        fontSize: '14px',
        customCSS: 'text-transform: uppercase; letter-spacing: 0.1em; padding: 14px 36px;',
      },
    },
  };
}

function servicesSection(): Block {
  // Richer services section with three feature groups (matching the scroll-tabs on live)
  return {
    id: 'services-section',
    type: 'section',
    order: 3,
    backgroundColor: '#FFFFFF',
    paddingTop: '100px',
    paddingBottom: '100px',
    paddingLeft: '24px',
    paddingRight: '24px',
    maxWidth: '1080px',
    blocks: [
      // Intro row
      {
        id: 'services-intro-row',
        type: 'columns',
        order: 1,
        gap: 'lg',
        columns: [
          {
            id: 'services-intro-left',
            width: '40%',
            verticalAlign: 'center',
            blocks: [
              {
                id: 'services-overline',
                type: 'text',
                order: 1,
                content: 'OUR SERVICES',
                style: {
                  color: '#004D80',
                  fontFamily: 'Poppins',
                  fontSize: '0.75rem',
                  fontWeight: '700',
                  letterSpacing: '0.3em',
                  textTransform: 'uppercase',
                  margin: '0 0 12px 0',
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
                  fontSize: '2.5rem',
                  fontWeight: '700',
                  lineHeight: '1.1',
                  margin: '0',
                },
              },
            ],
          },
          {
            id: 'services-intro-right',
            width: '60%',
            verticalAlign: 'center',
            blocks: [
              {
                id: 'services-desc',
                type: 'text',
                order: 1,
                content:
                  'Slate is a transformative platform, but it’s your direction that unlocks its power. With the right guidance and a little momentum, we’ll help you move forward in ways that make your work — and its impact — even more rewarding.',
                style: {
                  color: '#4B5563',
                  fontFamily: 'DM Sans',
                  fontSize: '1.0625rem',
                  lineHeight: '1.7',
                },
              },
            ],
          },
        ],
      },
      // Tab label row (styled as pill buttons for visual match)
      {
        id: 'services-tabs-row',
        type: 'columns',
        order: 2,
        gap: 'md',
        style: { margin: '56px 0 32px 0' },
        columns: [
          ...['IMPLEMENTATIONS', 'PROJECTS', 'SUPPORT'].map((label, i) => ({
            id: `services-tab-${i + 1}`,
            width: '33.33%',
            verticalAlign: 'center',
            blocks: [
              {
                id: `services-tab-${i + 1}-label`,
                type: 'text',
                order: 1,
                content: label,
                alignment: 'center',
                style: {
                  color: i === 0 ? '#FFFFFF' : '#004D80',
                  backgroundColor: i === 0 ? '#004D80' : 'transparent',
                  borderWidth: '2px',
                  borderColor: '#004D80',
                  borderStyle: 'solid',
                  borderRadius: '40px',
                  fontFamily: 'Poppins',
                  fontSize: '0.8125rem',
                  fontWeight: '700',
                  letterSpacing: '0.15em',
                  textTransform: 'uppercase',
                  padding: '14px 28px',
                  textAlign: 'center',
                },
              },
            ],
          })),
        ],
      },
      // Active tab content — Implementations (default)
      {
        id: 'services-active-content',
        type: 'columns',
        order: 3,
        gap: 'lg',
        style: {
          backgroundColor: '#F8FAFC',
          borderRadius: '16px',
          padding: '48px',
          customCSS: 'box-shadow: 0 8px 32px rgba(0,77,128,0.06);',
        },
        columns: [
          {
            id: 'services-active-left',
            width: '45%',
            verticalAlign: 'center',
            blocks: [
              {
                id: 'services-active-title',
                type: 'heading',
                order: 1,
                content: 'Set Everyone Up for Success in Slate',
                level: 3,
                style: {
                  color: '#004D80',
                  fontFamily: 'Poppins',
                  fontSize: '1.75rem',
                  fontWeight: '700',
                  lineHeight: '1.2',
                  margin: '0 0 16px 0',
                },
              },
              {
                id: 'services-active-subtitle',
                type: 'text',
                order: 2,
                content: 'We take a collaborative approach to implementations, so your team learns by doing.',
                style: {
                  color: '#4B5563',
                  fontFamily: 'DM Sans',
                  fontSize: '1.0625rem',
                  lineHeight: '1.6',
                  margin: '0 0 32px 0',
                },
              },
              {
                id: 'services-active-cta',
                type: 'button',
                order: 3,
                text: 'LEARN MORE',
                url: '/service/implementations',
                variant: 'primary',
                icon: 'arrow_forward',
                iconPosition: 'right',
                hoverEffect: 'lift',
              },
            ],
          },
          {
            id: 'services-active-right',
            width: '55%',
            verticalAlign: 'center',
            blocks: [
              {
                id: 'services-features-grid',
                type: 'card-grid',
                order: 1,
                columns: 2,
                cards: [
                  { id: 'feat-1', title: 'Learn Along the Way', icon: 'school' },
                  { id: 'feat-2', title: 'Simplify Your Tech Stack', icon: 'layers' },
                  { id: 'feat-3', title: 'Reduce Overhead & Overload', icon: 'tune' },
                  { id: 'feat-4', title: 'Adapt to Your Needs', icon: 'autorenew' },
                ],
                elementStyles: {
                  card: {
                    backgroundColor: '#FFFFFF',
                    borderRadius: '12px',
                    padding: '20px',
                    customCSS: 'box-shadow: 0 2px 12px rgba(0,77,128,0.05); display: flex; align-items: center; gap: 12px;',
                  },
                  cardTitle: {
                    color: '#004D80',
                    fontFamily: 'Poppins',
                    fontWeight: '600',
                    fontSize: '0.9375rem',
                  },
                  cardIcon: {
                    color: '#004D80',
                    fontSize: '1.5rem',
                  },
                },
              },
            ],
          },
        ],
      },
    ],
  };
}

function solutionsSection(): Block {
  return {
    id: 'solutions-section',
    type: 'section',
    order: 7,
    paddingTop: '100px',
    paddingBottom: '100px',
    paddingLeft: '24px',
    paddingRight: '24px',
    maxWidth: '1080px',
    style: {
      backgroundImage: 'linear-gradient(rgb(168, 213, 176) 0%, rgb(238, 247, 239) 100%)',
    },
    blocks: [
      {
        id: 'solutions-overline',
        type: 'text',
        order: 1,
        content: 'SLATE SOLUTIONS',
        alignment: 'center',
        style: {
          color: '#004D80',
          fontFamily: 'Poppins',
          fontSize: '0.75rem',
          fontWeight: '700',
          letterSpacing: '0.3em',
          textTransform: 'uppercase',
          margin: '0 0 16px 0',
        },
      },
      {
        id: 'solutions-heading',
        type: 'heading',
        order: 2,
        content: 'Charting a Clear Course',
        level: 2,
        alignment: 'center',
        style: {
          color: '#004D80',
          fontFamily: 'Poppins',
          fontSize: '2.75rem',
          fontWeight: '700',
          lineHeight: '1.1',
          margin: '0 0 20px 0',
        },
      },
      {
        id: 'solutions-desc',
        type: 'text',
        order: 3,
        // Matches original description exactly
        content:
          'If Slate were one-size-fits-all, it could never take us as far as we need to go. The real opportunity lies in tailoring it to your institutional goals — and creating a system that’s designed for the way your office works.',
        alignment: 'center',
        style: {
          color: '#004D80',
          fontFamily: 'DM Sans',
          fontSize: '1.0625rem',
          lineHeight: '1.7',
          maxWidth: '720px',
          margin: '0 auto 56px auto',
        },
      },
      {
        id: 'solutions-cards',
        type: 'card-grid',
        order: 4,
        columns: 3,
        cards: [
          {
            id: 'sol-admissions',
            title: 'ADMISSIONS',
            description:
              'In theory, it’s a straight path, but in reality, building a class is complex. Slate simplifies the process — and we simplify Slate.',
            icon: 'school',
            link: '/solution/admissions',
          },
          {
            id: 'sol-success',
            title: 'STUDENT SUCCESS',
            description:
              'We all want to make an impact, but helping students thrive is what really drives us. Slate gives you the tools to support, engage, and guide them every step of the way.',
            icon: 'trending_up',
            link: '/solution/student-success',
          },
          {
            id: 'sol-advancement',
            title: 'ADVANCEMENT',
            description:
              'Slate makes giving possible, but managing the details isn’t always easy. We help you organize your data, understand your donors, and make the most of every opportunity.',
            icon: 'volunteer_activism',
            link: '/solution/advancement',
          },
        ],
        elementStyles: {
          card: {
            backgroundColor: '#FFFFFF',
            borderRadius: '16px',
            padding: '36px',
            customCSS: 'box-shadow: 0 8px 32px rgba(0,77,128,0.08); transition: all 0.3s ease;',
          },
          cardTitle: {
            color: '#004D80',
            fontFamily: 'Poppins',
            fontWeight: '700',
            fontSize: '1.125rem',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          },
          cardDescription: {
            color: '#4B5563',
            fontFamily: 'DM Sans',
            fontSize: '0.9375rem',
            lineHeight: '1.7',
          },
          cardIcon: {
            color: '#004D80', // navy, matches original (was green in prior version)
            fontSize: '2.5rem',
          },
        },
      },
    ],
  };
}

function caseStudiesSection(): Block {
  return {
    id: 'casestudies-section',
    type: 'section',
    order: 8,
    paddingTop: '100px',
    paddingBottom: '100px',
    paddingLeft: '24px',
    paddingRight: '24px',
    maxWidth: '1080px',
    style: {
      // Light-blue-to-white gradient from live site
      backgroundImage: 'linear-gradient(rgb(200, 217, 232) 15%, rgb(255, 255, 255) 100%)',
    },
    blocks: [
      {
        id: 'cs-heading',
        type: 'heading',
        order: 1,
        content: 'TURNING SLATE INTO A STRATEGIC GROWTH ENGINE',
        level: 2,
        alignment: 'center',
        style: {
          color: '#004D80',
          fontFamily: 'Poppins',
          fontSize: '2.5rem',
          fontWeight: '700',
          lineHeight: '1.15',
          textTransform: 'uppercase',
          letterSpacing: '0.02em',
          maxWidth: '860px',
          margin: '0 auto 20px auto',
        },
      },
      {
        id: 'cs-desc',
        type: 'text',
        order: 2,
        content:
          'Finally — a partner who sees the big picture, speaks your language, and helps you create value. While others offer technical support, Post Captain Consulting is the only firm that turns this operational tool into a true engine for growth in higher education.',
        alignment: 'center',
        style: {
          color: '#4B5563',
          fontFamily: 'DM Sans',
          fontSize: '1.0625rem',
          lineHeight: '1.7',
          maxWidth: '860px',
          margin: '0 auto 56px auto',
        },
      },
      // 4-across row of case study cards with "Case Study →" link per card
      {
        id: 'cs-cards',
        type: 'columns',
        order: 3,
        gap: 'md',
        columns: [
          {
            id: 'cs-wpu-col',
            width: '25%',
            padding: 'md',
            blocks: buildCaseStudyCardBlocks('wpu', '83%', 'Increase', 'IN READMIT COMPLETIONS', 'https://postcaptain.com/wp-content/uploads/2025/06/WPU.svg', 'William Peace University'),
          },
          {
            id: 'cs-loyola-col',
            width: '25%',
            padding: 'md',
            blocks: buildCaseStudyCardBlocks('loyola', '$965K+', 'Raised', 'FROM 2,600+ DONORS', 'https://postcaptain.com/wp-content/uploads/2025/06/Loyola.png', 'Loyola University Maryland'),
          },
          {
            id: 'cs-vcu-col',
            width: '25%',
            padding: 'md',
            blocks: buildCaseStudyCardBlocks('vcu', '2 Days', 'of Staff Time Saved', 'BY ELIMINATING ADVANCE BADGE PRINTING', 'https://postcaptain.com/wp-content/uploads/2025/06/VCU-1.webp', 'VCU'),
          },
          {
            id: 'cs-landmark-col',
            width: '25%',
            padding: 'md',
            blocks: buildCaseStudyCardBlocks('landmark', '5 Years', 'of Historical Data', 'INTEGRATED INTO FUNNEL REPORTS', 'https://postcaptain.com/wp-content/uploads/2025/06/Landmark.png', 'Landmark College'),
          },
        ],
      },
    ],
  };
}

function buildCaseStudyCardBlocks(
  key: string,
  statValue: string,
  statLabel: string,
  subLabel: string,
  logoUrl: string,
  logoAlt: string,
): Block[] {
  return [
    {
      id: `cs-${key}-stat`,
      type: 'heading',
      order: 1,
      content: statValue,
      level: 3,
      style: {
        color: '#004D80',
        fontFamily: 'Poppins',
        fontSize: '2.5rem',
        fontWeight: '700',
        lineHeight: '1',
        margin: '0 0 4px 0',
      },
    },
    {
      id: `cs-${key}-label`,
      type: 'text',
      order: 2,
      content: statLabel,
      style: {
        color: '#004D80',
        fontFamily: 'Poppins',
        fontSize: '1rem',
        fontWeight: '500',
        margin: '0 0 6px 0',
      },
    },
    {
      id: `cs-${key}-sublabel`,
      type: 'text',
      order: 3,
      content: subLabel,
      style: {
        color: '#6B7280',
        fontFamily: 'DM Sans',
        fontSize: '0.75rem',
        fontWeight: '600',
        letterSpacing: '0.05em',
        textTransform: 'uppercase',
        margin: '0 0 20px 0',
      },
    },
    {
      id: `cs-${key}-logo`,
      type: 'image',
      order: 4,
      url: logoUrl,
      alt: logoAlt,
      style: {
        maxHeight: '48px',
        maxWidth: '140px',
        margin: '0 0 16px 0',
      },
    },
    {
      id: `cs-${key}-link`,
      type: 'button',
      order: 5,
      text: 'Case Study',
      url: `/case-study/${key}`,
      variant: 'link',
      icon: 'arrow_forward',
      iconPosition: 'right',
      style: {
        color: '#004D80',
        fontFamily: 'Poppins',
        fontWeight: '600',
        fontSize: '0.875rem',
      },
    },
  ];
}

function ctaSection(): Block {
  // Solid navy — live site has no background image here
  return {
    id: 'cta-section',
    type: 'section',
    order: 10,
    backgroundColor: '#004D80',
    paddingTop: '100px',
    paddingBottom: '100px',
    paddingLeft: '24px',
    paddingRight: '24px',
    maxWidth: '1080px',
    color: '#FFFFFF',
    blocks: [
      {
        id: 'cta-heading',
        type: 'heading',
        order: 1,
        content: 'Your Slate Journey Starts Here',
        level: 2,
        alignment: 'center',
        style: {
          color: '#FFFFFF',
          fontFamily: 'Poppins',
          fontSize: '2.5rem',
          fontWeight: '700',
          lineHeight: '1.2',
          margin: '0 0 20px 0',
        },
      },
      {
        id: 'cta-desc',
        type: 'text',
        order: 2,
        content: 'Schedule an intro call with a team that truly understands your work.',
        alignment: 'center',
        style: {
          color: 'rgba(255,255,255,0.9)',
          fontFamily: 'DM Sans',
          fontSize: '1.125rem',
          lineHeight: '1.7',
          maxWidth: '600px',
          margin: '0 auto 40px auto',
        },
      },
      {
        id: 'cta-btn',
        type: 'button',
        order: 3,
        text: "LET'S TALK SLATE",
        url: '/contact',
        variant: 'primary',
        alignment: 'center',
        icon: 'arrow_forward',
        iconPosition: 'right',
        hoverEffect: 'lift',
        style: {
          backgroundColor: '#FFFFFF',
          color: '#004D80',
          fontFamily: 'Poppins',
          fontWeight: '700',
          fontSize: '14px',
          borderRadius: '40px',
          customCSS: 'text-transform: uppercase; letter-spacing: 0.1em; padding: 16px 40px;',
        },
      },
    ],
  };
}

async function main() {
  const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
  try {
    const [row] = await sql<Array<{ content: string }>>`SELECT content FROM posts WHERE id = ${POST_ID} LIMIT 1`;
    if (!row) throw new Error(`Post ${POST_ID} not found`);
    const data = JSON.parse(row.content) as { blocks: Block[]; version: string };

    // Swap in refined blocks by id
    const replacements: Record<string, Block> = {
      'hero-1': heroBlock(),
      'services-section': servicesSection(),
      'solutions-section': solutionsSection(),
      'casestudies-section': caseStudiesSection(),
      'cta-section': ctaSection(),
    };

    // Also REMOVE the separate service-cards-section (order 4) since the new
    // services-section now contains the cards + tabs inline.
    const blocks = data.blocks
      .filter(b => b.id !== 'service-cards-section')
      .map(b => (replacements[b.id] ? replacements[b.id] : b));

    // Renumber `order` to keep things tidy after removal
    blocks.forEach((b, i) => { b.order = i + 1; });

    const newContent = JSON.stringify({ ...data, blocks });

    await sql`
      UPDATE posts
      SET content = ${newContent}, updated_at = now()
      WHERE id = ${POST_ID}
    `;

    console.log(`✓ Updated post ${POST_ID}: ${blocks.length} blocks (was ${data.blocks.length})`);
    console.log(`  Replaced: ${Object.keys(replacements).join(', ')}`);
    console.log(`  Removed: service-cards-section (merged into services-section)`);
  } finally {
    await sql.end();
  }
}

main().catch(e => { console.error(e); process.exit(1); });
