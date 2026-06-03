/**
 * Relayer blog — category "Insights" + 3 seed posts + blog index page.
 *
 * Idempotent: dedupes category by (websiteId, slug); dedupes posts by
 * (websiteId, slug); dedupes postCategories by (postId, categoryId).
 *
 * Run:
 *   npx tsx scripts/migrations/relayer/import-blog.ts
 */
import { T, makePage, upsertPage, WEBSITE_ID, ASSETS } from './_shared';

// ─── helpers ─────────────────────────────────────────────────────────────────

/** Build a full blog-post body as BlockEditorData JSON string. */
function buildPostContent(blocks: unknown[]): string {
  return JSON.stringify({ blocks, version: '1.0' });
}

// ─── post 1 ──────────────────────────────────────────────────────────────────

function buildPost1Body(): unknown[] {
  const p = makePage();
  p.add(p.section('post-body', T.CREAM, 64, [
    p.heading('post-title', 'The post-sale gap: why OEM customer-care programs stall at the dealership', 1, T.INK, 'left', { fontSize: 'clamp(1.75rem,3.5vw,2.75rem)', lineHeight: '1.1', marginBottom: '16px' }),
    p.text('post-byline', 'Relayer Team · 6 min read', T.INK_SOFT, 'left', { fontSize: '0.9375rem', opacity: '0.7', marginBottom: '0' }),
    p.spacer('sp1', 'md'),
    p.text('p1', 'Every OEM invests heavily in post-sale customer-care programs: service reminders, follow-up sequences, loyalty incentives, satisfaction surveys. The design work is rigorous. The intent is clear. And then the program lands at the dealership — and something changes.', T.INK_SOFT),
    p.text('p2', 'The gap between what manufacturers design and what customers actually experience is not a mystery. It is structural. OEMs operate centrally; dealers operate locally. The two share a franchise agreement, a parts supply chain, and a brand — but not an operational system. There is no single layer where program intent becomes store-level execution.', T.INK_SOFT),
    p.heading('h2-blind', 'Why the gap is hard to see', 2, T.INK, 'left', { fontSize: '1.5rem', marginTop: '16px', marginBottom: '8px' }),
    p.text('p3', 'Most OEMs measure the post-sale experience through surveys: CSI scores, NPS, service satisfaction. These instruments are accurate, but they are lagging. By the time a score arrives, the customer interaction that produced it is weeks or months in the past. The service manager has moved on. The advisor who handled the visit may no longer work there. The score tells you what happened; it tells you almost nothing about what to do next.', T.INK_SOFT),
    p.text('p4', 'Worse, survey response rates have fallen. The customers who respond are disproportionately the very satisfied and the very frustrated — which distorts the signal and under-represents the quiet majority who simply drifted away without explanation. Aggregate scores look stable right up until the moment retention metrics start to slide.', T.INK_SOFT),
    p.heading('h2-execution', 'Where execution breaks down', 2, T.INK, 'left', { fontSize: '1.5rem', marginTop: '16px', marginBottom: '8px' }),
    p.text('p5', 'Program execution at the store level is heavily dependent on the general manager and service director in place at a given point in time. High-performing stores build routines around OEM programs. Average stores follow them loosely. Under-performing stores treat them as compliance overhead. None of this is visible to the OEM until the quarterly scorecard comes out — at which point intervention is reactive at best.', T.INK_SOFT),
    p.text('p6', 'The underlying issue is the absence of a shared operational layer. OEM program teams publish guidelines, train dealer staff, and set targets. But the day-to-day workflow — who follows up with which customer, when, through which channel, and what happens if no response comes — lives entirely inside the dealer\'s systems, if it exists at all. The OEM has no visibility into whether the program is running, and the dealer has no structured support for running it consistently.', T.INK_SOFT),
    p.text('p7', 'Closing this gap requires more than better reporting or more frequent training. It requires a shared layer that both the OEM and the dealer operate on — one where program intent is encoded as workflow, execution is visible in real time, and both parties are looking at the same operational picture. That is the architecture that turns a customer-care program from a policy document into a measurable outcome.', T.INK_SOFT),
  ], {}, { maxWidth: '760px', marginLeft: 'auto', marginRight: 'auto' }));
  return p.blocks;
}

// ─── post 2 ──────────────────────────────────────────────────────────────────

function buildPost2Body(): unknown[] {
  const p = makePage();
  p.add(p.section('post-body', T.CREAM, 64, [
    p.heading('post-title', 'From survey scores to operating signals: measuring customer care that actually moves', 1, T.INK, 'left', { fontSize: 'clamp(1.75rem,3.5vw,2.75rem)', lineHeight: '1.1', marginBottom: '16px' }),
    p.text('post-byline', 'Relayer Team · 7 min read', T.INK_SOFT, 'left', { fontSize: '0.9375rem', opacity: '0.7', marginBottom: '0' }),
    p.spacer('sp1', 'md'),
    p.text('p1', 'Survey scores are not useless. They confirm what customers experienced, anchor brand standards, and provide a consistent benchmark across a large dealer network. The problem is not the score itself — the problem is treating the score as an operating instrument when it is actually a historical record.', T.INK_SOFT),
    p.text('p2', 'By the time a CSI report reaches a regional manager\'s desk, the visits it reflects are 30 to 90 days old. The advisor involved may have changed roles. The service director who was supposed to review the case likely never saw it. The customer who rated the experience a 6 out of 10 has already made a decision about where to service their vehicle next — and the OEM had no window to intervene.', T.INK_SOFT),
    p.heading('h2-lagging', 'The anatomy of a lagging indicator', 2, T.INK, 'left', { fontSize: '1.5rem', marginTop: '16px', marginBottom: '8px' }),
    p.text('p3', 'Lagging indicators measure outcomes after the fact. They are essential for accountability — for understanding whether a program delivered on its promise over a quarter or a year. But accountability alone does not change behavior at the store level in the moment that matters: the week after a service visit, when follow-up from the dealer can still shift a neutral customer toward loyalty, or a frustrated customer toward resolution.', T.INK_SOFT),
    p.text('p4', 'The gap in measurement is not a technology problem. Most OEMs have sophisticated data infrastructure. The gap is architectural: survey data flows from the dealer network back to the OEM, but almost nothing flows the other direction in operational time. There is no mechanism for the OEM to see what is happening at a store this week and act on it before the score is set.', T.INK_SOFT),
    p.heading('h2-signals', 'What operating signals look like', 2, T.INK, 'left', { fontSize: '1.5rem', marginTop: '16px', marginBottom: '8px' }),
    p.text('p5', 'An operating signal is information that arrives early enough to act on. In a post-sale context, that means: which customers in the current service cycle have not received a follow-up? Which stores are running at below-threshold engagement rates this week, not last quarter? Which advisors have open cases with no logged activity? These are not survey questions — they are workflow states, and they are available in near real time if the system is designed to surface them.', T.INK_SOFT),
    p.text('p6', 'OEMs that "see first, move first" have shifted from measuring outcomes to monitoring execution. Their regional teams do not wait for a quarterly scorecard to identify an underperforming store; they have a live view of whether stores are following up with customers in the program window. Intervention becomes proactive rather than corrective, and the cost of bringing an underperforming store up is dramatically lower than the cost of recovering a churned customer.', T.INK_SOFT),
    p.text('p7', 'The transition from survey-driven measurement to signal-driven operations does not require abandoning the survey. It requires layering a real-time operational view on top of it — so that the score confirms what the signals already told you, rather than arriving as a surprise. That is the measurement architecture that closes the loop between what OEMs design and what dealer networks actually deliver.', T.INK_SOFT),
  ], {}, { maxWidth: '760px', marginLeft: 'auto', marginRight: 'auto' }));
  return p.blocks;
}

// ─── post 3 ──────────────────────────────────────────────────────────────────

function buildPost3Body(): unknown[] {
  const p = makePage();
  p.add(p.section('post-body', T.CREAM, 64, [
    p.heading('post-title', 'What a shared OEM–dealer operational layer looks like in practice', 1, T.INK, 'left', { fontSize: 'clamp(1.75rem,3.5vw,2.75rem)', lineHeight: '1.1', marginBottom: '16px' }),
    p.text('post-byline', 'Relayer Team · 8 min read', T.INK_SOFT, 'left', { fontSize: '0.9375rem', opacity: '0.7', marginBottom: '0' }),
    p.spacer('sp1', 'md'),
    p.text('p1', 'The concept of a "shared operational layer" between an OEM and its dealer network sounds abstract until you walk through what it changes day to day. This is that walkthrough — concrete, grounded in how the system actually behaves, and honest about what it asks of both sides.', T.INK_SOFT),
    p.text('p2', 'At its simplest, a shared layer is one system that both the OEM program team and the dealer service team operate on simultaneously. The OEM can see what is happening at the store level without waiting for a report. The dealer has structured, AI-assisted workflows that make executing the program easier than not executing it. Both parties are looking at the same customer record, the same activity log, and the same performance picture.', T.INK_SOFT),
    p.heading('h2-workflows', 'AI-powered workflows at the store level', 2, T.INK, 'left', { fontSize: '1.5rem', marginTop: '16px', marginBottom: '8px' }),
    p.text('p3', 'For a dealer service team, the shared layer surfaces as a work queue: customers who are due for follow-up, with suggested outreach content pre-drafted based on their service history and the program parameters the OEM has set. The advisor does not need to remember who to call or what to say — the system queues the right action at the right time and logs what happened when the advisor completes it.', T.INK_SOFT),
    p.text('p4', 'AI handling the drafting and sequencing removes the two biggest friction points in dealer-level program execution: remembering and composing. Most service advisors are managing 15 to 30 active repair orders at any given time. Adding a manual outreach workflow on top of that does not work at scale. Automating the queue and the first draft changes the math entirely — execution becomes the path of least resistance.', T.INK_SOFT),
    p.heading('h2-visibility', 'OEM visibility without a report cadence', 2, T.INK, 'left', { fontSize: '1.5rem', marginTop: '16px', marginBottom: '8px' }),
    p.text('p5', 'From the OEM\'s side, the shared layer means regional performance is not a lagging snapshot — it is a live view. Program managers can see which stores are in the engagement window for the current week, which have active follow-up running, and which have gone quiet. Stores that are trending down get flagged before the quarterly score confirms the problem.', T.INK_SOFT),
    p.text('p6', 'This changes the nature of the regional manager\'s job. Instead of arriving at a monthly dealer review armed with last quarter\'s scores and a list of items to address, the RM arrives having already seen the store\'s execution data in real time — able to ask specific questions, recognize specific wins, and address specific gaps. The conversation shifts from reporting to operating.', T.INK_SOFT),
    p.text('p7', 'Network-wide, the shared layer makes execution patterns visible at scale. OEMs can see which program elements are working across the network and which are generating friction. Iteration cycles shrink from quarters to weeks. The programs that land at the top of the network stay there longer because the OEM can see what they are doing and help the rest of the network replicate it.', T.INK_SOFT),
  ], {}, { maxWidth: '760px', marginLeft: 'auto', marginRight: 'auto' }));
  return p.blocks;
}

// ─── blog index page ─────────────────────────────────────────────────────────

function buildBlogIndex(): unknown[] {
  const p = makePage();

  // hero — forest
  p.add(p.hero({
    id: 'blog-hero',
    subtitle: 'INSIGHTS',
    title: 'Insights from the shared layer',
    description: 'Perspectives on closing the post-sale gap between manufacturers and dealer networks.',
    minHeight: '52vh',
  }));

  // post cards — CREAM section
  const postCards = [
    {
      slug: 'post-sale-gap',
      title: 'The post-sale gap: why OEM customer-care programs stall at the dealership',
      excerpt: 'Manufacturers design great customer-care programs. Then they hit the dealership. Here\'s where the gap opens — and what closes it.',
      readTime: '6 min read',
    },
    {
      slug: 'survey-scores-to-operating-signals',
      title: 'From survey scores to operating signals: measuring customer care that actually moves',
      excerpt: 'CSI and survey scores tell you what already happened. Operating signals tell you what to do next.',
      readTime: '7 min read',
    },
    {
      slug: 'shared-operational-layer-in-practice',
      title: 'What a shared OEM–dealer operational layer looks like in practice',
      excerpt: 'A practical walkthrough of the shared layer: one system, consistent execution, measurable outcomes.',
      readTime: '8 min read',
    },
  ];

  const cardGrid = {
    id: 'blog-list',
    type: 'card-grid',
    order: p.ord(),
    columns: 3,
    cards: postCards.map((post, i) => ({
      id: `blog-card-${i}`,
      title: post.title,
      description: post.excerpt,
      badge: post.readTime,
      link: `/blog/${post.slug}`,
      linkText: 'Read post',
    })),
    elementStyles: {
      card: {
        backgroundColor: T.WHITE,
        borderRadius: '20px',
        borderWidth: '1px',
        borderColor: 'rgba(3,41,22,0.10)',
        borderStyle: 'solid',
        customCSS: 'box-shadow:0 14px 40px rgba(3,41,22,0.06); display:flex; flex-direction:column; justify-content:space-between;',
      },
      cardTitle: { color: T.INK, fontFamily: T.HEAD, fontWeight: '600', fontSize: '1.125rem', lineHeight: '1.3' },
      cardDescription: { color: T.INK_SOFT, fontFamily: T.BODY, fontSize: '0.9375rem', lineHeight: '1.6' },
      cardBadge: { color: T.MINT_D, fontFamily: T.BODY, fontWeight: '600', fontSize: '0.8125rem', letterSpacing: '0.05em' },
      cardLink: { color: T.INK, fontFamily: T.BODY, fontWeight: '600', fontSize: '0.9375rem' },
    },
  };

  p.add(p.section('blog-posts-section', T.CREAM, 80, [
    p.heading('blog-posts-heading', 'All posts', 2, T.INK, 'left'),
    p.spacer('blog-sp', 'md'),
    cardGrid,
  ]));

  // CTA
  p.add(p.ctaBlock({
    id: 'blog-cta',
    title: 'See the shared layer in action',
    description: 'Schedule a product briefing and walk through how Relayer closes the post-sale gap for OEMs.',
    primaryButtonText: 'Request a briefing',
    primaryButtonUrl: '/contact',
  }));

  return p.blocks;
}

// ─── main ─────────────────────────────────────────────────────────────────────

async function main() {
  if (!WEBSITE_ID) {
    console.error('WEBSITE_ID not resolved — run setup-client.ts first.');
    process.exit(1);
  }

  const { db } = await import('../../../lib/db');
  const { eq, and } = await import('drizzle-orm');
  const { categories, posts, postCategories } = await import('../../../lib/db/schema');

  // ── 1. Category ────────────────────────────────────────────────────────────
  const existingCat = await db
    .select()
    .from(categories)
    .where(and(eq(categories.websiteId, WEBSITE_ID), eq(categories.slug, 'insights')))
    .limit(1);

  let categoryId: number;
  if (existingCat.length > 0) {
    categoryId = existingCat[0].id;
    console.log(`[category] Already exists "insights" id=${categoryId}`);
  } else {
    const [newCat] = await db.insert(categories).values({
      name: 'Insights',
      slug: 'insights',
      websiteId: WEBSITE_ID,
    }).returning();
    categoryId = newCat.id;
    console.log(`[category] Created "insights" id=${categoryId}`);
  }

  // ── 2. Blog posts ──────────────────────────────────────────────────────────
  const postDefs = [
    {
      title: 'The post-sale gap: why OEM customer-care programs stall at the dealership',
      slug: 'post-sale-gap',
      excerpt: 'Manufacturers design great customer-care programs. Then they hit the dealership. Here\'s where the gap opens — and what closes it.',
      seoTitle: 'The Post-Sale Gap | Relayer Insights',
      seoDescription: 'Why OEM customer-care programs stall at the dealership — and what a shared operational layer does to close the gap.',
      buildBody: buildPost1Body,
    },
    {
      title: 'From survey scores to operating signals: measuring customer care that actually moves',
      slug: 'survey-scores-to-operating-signals',
      excerpt: 'CSI and survey scores tell you what already happened. Operating signals tell you what to do next.',
      seoTitle: 'Survey Scores to Operating Signals | Relayer Insights',
      seoDescription: 'Why CSI scores are lagging indicators and what real-time operating signals look like for OEM and dealer customer care.',
      buildBody: buildPost2Body,
    },
    {
      title: 'What a shared OEM–dealer operational layer looks like in practice',
      slug: 'shared-operational-layer-in-practice',
      excerpt: 'A practical walkthrough of the shared layer: one system, consistent execution, measurable outcomes.',
      seoTitle: 'The Shared OEM–Dealer Operational Layer | Relayer Insights',
      seoDescription: 'A concrete walkthrough of AI-powered workflows, shared visibility, and network-wide execution for OEMs and dealer networks.',
      buildBody: buildPost3Body,
    },
  ];

  const postIds: number[] = [];

  for (const def of postDefs) {
    const existing = await db
      .select()
      .from(posts)
      .where(and(eq(posts.websiteId, WEBSITE_ID), eq(posts.slug, def.slug)))
      .limit(1);

    let postId: number;
    const contentBody = buildPostContent(def.buildBody());
    const values = {
      title: def.title,
      slug: def.slug,
      postType: 'blog' as const,
      content: contentBody,
      excerpt: def.excerpt,
      coverImage: ASSETS.og,
      published: false,
      websiteId: WEBSITE_ID,
      seoTitle: def.seoTitle,
      seoDescription: def.seoDescription,
      ogImage: ASSETS.og,
    };

    if (existing.length > 0) {
      postId = existing[0].id;
      await db.update(posts).set({ ...values, updatedAt: new Date() }).where(eq(posts.id, postId));
      console.log(`[post] Updated "${def.slug}" id=${postId}`);
    } else {
      const [created] = await db.insert(posts).values(values).returning();
      postId = created.id;
      console.log(`[post] Created "${def.slug}" id=${postId}`);
    }

    // link to category (dedupe)
    const existingLink = await db
      .select()
      .from(postCategories)
      .where(and(eq(postCategories.postId, postId), eq(postCategories.categoryId, categoryId)))
      .limit(1);

    if (existingLink.length === 0) {
      await db.insert(postCategories).values({ postId, categoryId });
      console.log(`[postCategory] Linked post ${postId} → category ${categoryId}`);
    } else {
      console.log(`[postCategory] Already linked post ${postId} → category ${categoryId}`);
    }

    postIds.push(postId);
  }

  // ── 3. Blog index page ─────────────────────────────────────────────────────
  const blogIndexBlocks = buildBlogIndex();
  const blogIndexId = await upsertPage(
    {
      slug: 'blog',
      title: 'Blog',
      postType: 'page',
      seoTitle: 'Relayer Insights',
      seoDescription: 'Perspectives on OEM and dealer customer care.',
    },
    blogIndexBlocks,
  );

  console.log('');
  console.log('Done.');
  console.log(`  category id : ${categoryId}`);
  console.log(`  post ids    : ${postIds.join(', ')}`);
  console.log(`  blog index id: ${blogIndexId}`);
  console.log('  listing approach: card-grid (3 cards linking to /blog/<slug>)');
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
