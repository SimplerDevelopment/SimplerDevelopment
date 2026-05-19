/**
 * Compose the four public-facing pages for the Magamommy storefront.
 *
 * Magamommy is an autonomous merch shop — one new shirt drop every Monday.
 * `scripts/magamommy/bootstrap-tenant.ts` provisions the tenant; this script
 * builds the *storefront* on top of that: a home that features the current
 * week's drop, a shop that lists every drop, and the usual about / contact
 * pages a real store needs to look like a real store.
 *
 * Pages composed (idempotent — `SELECT WHERE websiteId AND slug LIMIT 1`):
 *
 *   1. home     (postType=page, used as the site home via slug='home')
 *      hero → product-grid(weekly-drops, limit=1, newest) → columns
 *      (three "why magamommy" tiles) → cta (newsletter) → cta (see drop)
 *
 *   2. shop     (postType=page)
 *      hero strip → product-grid(weekly-drops, perPage=24, newest)
 *
 *   3. about    (postType=page)
 *      hero → columns (brand story + "our promise" bullets)
 *
 *   4. contact  (postType=page)
 *      hero → text (mailto fallback — no contact-form block exists yet)
 *
 * Brand colors / fonts come from the website's brandingProfile (linked in
 * bootstrap-tenant.ts). Block-level `style.backgroundColor` etc. is left
 * unset wherever the brand should win.
 *
 * Resolution: tenant lookup is `clients.company = 'Magamommy'` → most-recent
 * `clientWebsites` row for that client. Throws if the tenant isn't
 * bootstrapped yet (run `scripts/magamommy/bootstrap-tenant.ts` first).
 *
 * Idempotence: each page is upserted by (websiteId, slug). If a page already
 * exists with non-empty content, it is PRESERVED — manual edits are not
 * stomped. Pass `--force` to overwrite. Pages with empty content (e.g. a
 * placeholder created in the editor) are always refreshed.
 *
 * Home-page wiring: the public renderer resolves the home page by
 * `slug === 'home'` (see `lib/actions/client-sites.ts → getClientHomePage`).
 * There is no `clientWebsites.homePostId` column to set — the slug IS the
 * pointer. We rely on that convention here.
 *
 * Safety: prints the target DATABASE_URL up front and refuses to run against
 * the known production proxies unless ALLOW_PROD=1 (mirrors the bootstrap
 * script and `scripts/verify-db-target.ts`).
 *
 * Usage:
 *   bun scripts/magamommy/compose-storefront.ts            # skip pages w/ content
 *   bun scripts/magamommy/compose-storefront.ts --force    # always overwrite
 *   ALLOW_PROD=1 bun scripts/magamommy/compose-storefront.ts --force  # prod
 */

import * as dotenv from 'dotenv';

dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local' });

const PROD_INDICATORS = [
  'tramway.proxy.rlwy.net:43167',
  'metro.proxy.rlwy.net:25565',
];

const MAGAMOMMY_COMPANY = 'Magamommy';
const CATEGORY_SLUG = 'weekly-drops';
const CONTACT_EMAIL = 'contact@magamommy.com';

// Brand palette — mirrored from bootstrap-tenant.ts. Used only for hero
// background hints; the brandingProfile FK on clientWebsites is the source
// of truth for global colors/fonts.
const RED = '#B22234';
const BLUE = '#3C3B6E';
const WHITE = '#FFFFFF';

function verifyDbTarget(): void {
  const url = process.env.DATABASE_URL ?? '';
  if (!url) {
    console.error('[compose-storefront] DATABASE_URL is not set.');
    process.exit(1);
  }
  const hitProd =
    PROD_INDICATORS.some((p) => url.includes(p)) ||
    process.env.RAILWAY_ENVIRONMENT_NAME === 'production';
  const override = process.env.ALLOW_PROD === '1';
  const redacted = url.replace(/:\/\/[^@]*@/, '://[REDACTED]@');
  console.log(`[compose-storefront] DATABASE_URL → ${redacted}`);
  if (hitProd && !override) {
    console.error('');
    console.error('  REFUSING to run compose against production.');
    console.error('  Re-run with ALLOW_PROD=1 if this is truly intentional.');
    console.error('');
    process.exit(1);
  }
  if (hitProd) {
    console.log('[compose-storefront] prod override active via ALLOW_PROD=1');
  }
}

// ── Block-JSON helpers ───────────────────────────────────────────────────────
// Every block needs a stable `id`. We use a deterministic counter rather than
// uuid so a re-run with `--force` produces byte-identical content (helpful
// for diffing in `posts_revisions`).

function makeIdFactory(prefix: string): () => string {
  let n = 0;
  return () => `${prefix}-${++n}`;
}

interface BlockEditorData {
  version: '1.0';
  blocks: Array<Record<string, unknown>>;
}

function wrap(blocks: Array<Record<string, unknown>>): string {
  const data: BlockEditorData = { version: '1.0', blocks };
  return JSON.stringify(data);
}

// ── Home page ────────────────────────────────────────────────────────────────

function buildHomeContent(): string {
  const id = makeIdFactory('mm-home');

  // Hero — full-width, brand palette via inline style. Brand profile still
  // wins for buttons/typography because we leave preset/font unset.
  const hero = {
    id: id(),
    type: 'hero',
    order: 0,
    title: 'Heat from the headlines, printed on a tee.',
    subtitle: 'New drop every Monday.',
    description:
      'Magamommy turns the week\'s loudest political moment into a wearable. Limited quantities. Gone when they\'re gone.',
    ctaText: 'Shop this week\'s drop',
    ctaLink: '/shop',
    secondaryCtaText: 'Browse the archive',
    secondaryCtaLink: '/shop',
    style: {
      backgroundColor: RED,
      color: WHITE,
      paddingTop: '120px',
      paddingBottom: '120px',
    },
  };

  // Latest drop — featured-products has no category filter (registry: only
  // title/description/limit/columns/showPrice/showBadge/badgeText/buttonText).
  // product-grid carries categorySlug + sort, so we use it for the "current
  // week" feature with limit=1.
  const currentDrop = {
    id: id(),
    type: 'product-grid',
    order: 1,
    title: 'This week\'s drop',
    description: 'Fresh off the press. Limited run.',
    categorySlug: CATEGORY_SLUG,
    sort: 'newest',
    limit: 1,
    columns: 2,
    showPrice: true,
    showDescription: false,
    showCategory: false,
    buttonText: 'Get it before it\'s gone',
    style: {
      paddingTop: '64px',
      paddingBottom: '64px',
    },
  };

  // Three-up "Why Magamommy" — columns block, three columns with a heading
  // + text in each. Material Icons live in the heading content as inline
  // <span class="material-icons"> when we want the visual; for the bullet
  // row we keep it copy-only (the icons row is just a label).
  const whyColumns = {
    id: id(),
    type: 'columns',
    order: 2,
    gap: 'md',
    stackOnMobile: true,
    columns: [
      {
        id: id(),
        width: '33.333%',
        verticalAlign: 'top',
        padding: 'md',
        blocks: [
          {
            id: id(),
            type: 'heading',
            order: 0,
            content: 'Weekly drops',
            level: 3,
            alignment: 'center',
          },
          {
            id: id(),
            type: 'text',
            order: 1,
            content:
              'Every Monday morning. New design, new statement, new shirt — pulled from the headlines that week.',
            alignment: 'center',
            size: 'base',
          },
        ],
      },
      {
        id: id(),
        width: '33.333%',
        verticalAlign: 'top',
        padding: 'md',
        blocks: [
          {
            id: id(),
            type: 'heading',
            order: 0,
            content: 'Patriot-grade cotton',
            level: 3,
            alignment: 'center',
          },
          {
            id: id(),
            type: 'text',
            order: 1,
            content:
              'Heavyweight 6 oz combed-ring-spun cotton. Built to last longer than the news cycle that inspired it.',
            alignment: 'center',
            size: 'base',
          },
        ],
      },
      {
        id: id(),
        width: '33.333%',
        verticalAlign: 'top',
        padding: 'md',
        blocks: [
          {
            id: id(),
            type: 'heading',
            order: 0,
            content: 'Made in the USA*',
            level: 3,
            alignment: 'center',
          },
          {
            id: id(),
            type: 'text',
            order: 1,
            content:
              '*Printed in the USA on responsibly-sourced blanks. Shipped from our Pennsylvania warehouse.',
            alignment: 'center',
            size: 'base',
          },
        ],
      },
    ],
    style: {
      paddingTop: '80px',
      paddingBottom: '80px',
      backgroundColor: '#F8F8F8',
    },
  };

  // Newsletter signup — no email-signup / newsletter block exists in the
  // registry. Fall back to a cta block with a mailto: that pre-fills the
  // subject line. When a real signup block lands we'll swap this out.
  const newsletter = {
    id: id(),
    type: 'cta',
    order: 3,
    title: 'Never miss a Monday.',
    description:
      'Drop notifications, restock alerts, and the occasional behind-the-scenes story. No spam — promise.',
    primaryButtonText: 'Email me the drops',
    primaryButtonUrl: `mailto:${CONTACT_EMAIL}?subject=Subscribe%20me%20to%20drop%20alerts`,
    backgroundStyle: 'solid',
    style: {
      backgroundColor: BLUE,
      color: WHITE,
    },
  };

  // Footer CTA — link to /shop. The "/shop/<slug>" deep link doesn't
  // resolve until a drop ships (the slug is per-product); /shop itself is
  // safe and shows the latest drop at the top of the grid.
  const footerCta = {
    id: id(),
    type: 'cta',
    order: 4,
    title: 'See this week\'s drop',
    description: 'Right now, on the shop page.',
    primaryButtonText: 'Shop the drop',
    primaryButtonUrl: '/shop',
    backgroundStyle: 'gradient',
  };

  return wrap([hero, currentDrop, whyColumns, newsletter, footerCta]);
}

// ── Shop page ────────────────────────────────────────────────────────────────
//
// IMPORTANT: the public site renderer at
// `app/sites/[domain]/[[...slug]]/page.tsx` short-circuits `pageSlug === 'shop'`
// and renders the built-in <ShopPage> component INSTEAD of the post's blocks.
// We still author this page (so it shows up in the portal page list, search,
// nav, sitemap, etc.) but on the live site the blocks below will NOT render
// unless that hardcoded branch is later removed. Keep the block JSON well
// formed so it's a no-op fallback rather than a footgun.

function buildShopContent(): string {
  const id = makeIdFactory('mm-shop');

  const hero = {
    id: id(),
    type: 'hero',
    order: 0,
    title: 'Every Monday. A new statement.',
    subtitle: 'The archive',
    description:
      'Every drop we\'ve shipped since launch. Newest first. Sold-out drops stay listed as part of the record.',
    style: {
      backgroundColor: BLUE,
      color: WHITE,
      paddingTop: '80px',
      paddingBottom: '80px',
    },
  };

  const grid = {
    id: id(),
    type: 'product-grid',
    order: 1,
    categorySlug: CATEGORY_SLUG,
    sort: 'newest',
    // Registry exposes `limit`; we set it to 24 to match the spec's perPage
    // intent. There's no `perPage`/`pagination` field on ProductGridBlock —
    // pagination, if needed, will be added at the renderer level later.
    limit: 24,
    columns: 3,
    showPrice: true,
    showDescription: false,
    showCategory: false,
    buttonText: 'View drop',
    style: {
      paddingTop: '64px',
      paddingBottom: '96px',
    },
  };

  return wrap([hero, grid]);
}

// ── About page ───────────────────────────────────────────────────────────────

function buildAboutContent(): string {
  const id = makeIdFactory('mm-about');

  const hero = {
    id: id(),
    type: 'hero',
    order: 0,
    title: 'Magamommy',
    subtitle: 'A mom, a heat press, and a strong opinion.',
    style: {
      backgroundColor: RED,
      color: WHITE,
      paddingTop: '96px',
      paddingBottom: '96px',
    },
  };

  // Two-column copy: story on the left, promise bullets on the right.
  const body = {
    id: id(),
    type: 'columns',
    order: 1,
    gap: 'lg',
    stackOnMobile: true,
    columns: [
      {
        id: id(),
        width: '60%',
        verticalAlign: 'top',
        padding: 'lg',
        blocks: [
          {
            id: id(),
            type: 'heading',
            order: 0,
            content: 'The story',
            level: 2,
            alignment: 'left',
          },
          {
            id: id(),
            type: 'text',
            order: 1,
            content:
              'Magamommy started in a Pennsylvania garage, between school pickup and dinner. The news kept getting louder; the merch on the rack kept getting blander. So we made our own — a heavyweight cotton tee, printed on Sunday night, ready to ship Monday morning, reacting to whatever the country was actually yelling about that week.',
            alignment: 'left',
            size: 'lg',
          },
          {
            id: id(),
            type: 'text',
            order: 2,
            content:
              'Every drop is a one-week run. Once it\'s gone, it\'s gone — and the next Monday a new one takes its place. We\'re not trying to be mean. We\'re trying to be funny, fast, and on the record. If a shirt makes you laugh out loud at the headline it\'s reacting to, we did our job.',
            alignment: 'left',
            size: 'base',
          },
          {
            id: id(),
            type: 'text',
            order: 3,
            content:
              'Made by a mom. Worn by patriots. Argued about in the comments.',
            alignment: 'left',
            size: 'base',
          },
        ],
      },
      {
        id: id(),
        width: '40%',
        verticalAlign: 'top',
        padding: 'lg',
        backgroundColor: '#F8F8F8',
        blocks: [
          {
            id: id(),
            type: 'heading',
            order: 0,
            content: 'Our promise',
            level: 3,
            alignment: 'left',
          },
          {
            id: id(),
            type: 'text',
            order: 1,
            // Bullet list as plain text — neither the schema nor the
            // renderer has a dedicated bullet-list block; we keep the
            // visual structure with hyphens and let typography do the work.
            content:
              '— Fast shipping: in-stock drops leave within 48 hours.\n— Quality cotton: 6 oz heavyweight, pre-shrunk, never see-through.\n— US-printed: every shirt heat-pressed in Pennsylvania.\n— Limited drops: one week, one design, then retired forever.',
            alignment: 'left',
            size: 'base',
          },
        ],
      },
    ],
    style: {
      paddingTop: '64px',
      paddingBottom: '64px',
    },
  };

  return wrap([hero, body]);
}

// ── Contact page ─────────────────────────────────────────────────────────────

function buildContactContent(): string {
  const id = makeIdFactory('mm-contact');

  const hero = {
    id: id(),
    type: 'hero',
    order: 0,
    title: 'Get in touch',
    subtitle: 'Wholesale, press, complaints, compliments.',
    style: {
      backgroundColor: BLUE,
      color: WHITE,
      paddingTop: '96px',
      paddingBottom: '96px',
    },
  };

  // No contact-form / form block exists in the registry yet. Fall back to a
  // text block with a mailto: link and a cta with the same address as the
  // big button. When a real form block lands we'll swap the text block out.
  const intro = {
    id: id(),
    type: 'text',
    order: 1,
    content: `Easiest way to reach us: <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>. We read every message and answer within one business day.`,
    alignment: 'center',
    size: 'lg',
    style: {
      paddingTop: '64px',
      paddingBottom: '32px',
    },
  };

  const cta = {
    id: id(),
    type: 'cta',
    order: 2,
    title: 'Email Magamommy',
    description: 'Wholesale, press, custom orders, and the occasional fan mail.',
    primaryButtonText: CONTACT_EMAIL,
    primaryButtonUrl: `mailto:${CONTACT_EMAIL}`,
    backgroundStyle: 'solid',
    style: {
      backgroundColor: '#F8F8F8',
    },
  };

  return wrap([hero, intro, cta]);
}

// ── Page upsert ──────────────────────────────────────────────────────────────

interface PageSpec {
  slug: string;
  title: string;
  seoTitle: string;
  seoDescription: string;
  content: string;
}

async function main(): Promise<void> {
  verifyDbTarget();

  const force = process.argv.includes('--force');
  if (force) console.log('[compose-storefront] --force: existing content WILL be overwritten');

  const { db } = await import('../../lib/db');
  const { clients, clientWebsites } = await import('../../lib/db/schema/sites');
  const { posts } = await import('../../lib/db/schema/cms');
  const { eq, and, desc } = await import('drizzle-orm');

  // ── Resolve magamommy websiteId ────────────────────────────────────────────
  // company is varchar(255) NULL-able so we filter explicitly. There should
  // be exactly one Magamommy client row; if multiple exist (e.g. dev seed
  // collision), prefer the most recent.
  const [client] = await db
    .select()
    .from(clients)
    .where(eq(clients.company, MAGAMOMMY_COMPANY))
    .orderBy(desc(clients.createdAt))
    .limit(1);
  if (!client) {
    throw new Error(
      `Magamommy tenant not found. Run \`bun scripts/magamommy/bootstrap-tenant.ts\` first.`,
    );
  }

  const [website] = await db
    .select()
    .from(clientWebsites)
    .where(eq(clientWebsites.clientId, client.id))
    .orderBy(desc(clientWebsites.createdAt))
    .limit(1);
  if (!website) {
    throw new Error(
      `Magamommy client #${client.id} has no clientWebsites row. Re-run bootstrap-tenant.ts.`,
    );
  }

  console.log(
    `[compose-storefront] tenant: client #${client.id} (${client.company}) → website #${website.id} (${website.domain ?? website.subdomain})`,
  );

  const pageSpecs: PageSpec[] = [
    {
      slug: 'home',
      title: 'Magamommy — A new shirt every Monday',
      seoTitle: 'Magamommy | Heat from the headlines, printed on a tee',
      seoDescription:
        'A new political-merch drop every Monday. Heavyweight cotton, US-printed, limited runs. Magamommy.',
      content: buildHomeContent(),
    },
    {
      slug: 'shop',
      title: 'Shop — Every drop, newest first',
      seoTitle: 'Shop Magamommy | Every weekly drop',
      seoDescription:
        'Every Magamommy drop, newest first. Sold-out drops stay listed as part of the record.',
      content: buildShopContent(),
    },
    {
      slug: 'about',
      title: 'About Magamommy',
      seoTitle: 'About Magamommy | A mom, a heat press, a strong opinion',
      seoDescription:
        'Magamommy turns the week\'s loudest political moment into a heavyweight cotton tee. Made by a mom in Pennsylvania.',
      content: buildAboutContent(),
    },
    {
      slug: 'contact',
      title: 'Contact Magamommy',
      seoTitle: 'Contact Magamommy | Wholesale, press, custom orders',
      seoDescription: `Reach Magamommy at ${CONTACT_EMAIL}. Wholesale, press, and custom orders welcome.`,
      content: buildContactContent(),
    },
  ];

  for (const spec of pageSpecs) {
    const [existing] = await db
      .select()
      .from(posts)
      .where(and(eq(posts.websiteId, website.id), eq(posts.slug, spec.slug)))
      .limit(1);

    if (!existing) {
      const [created] = await db
        .insert(posts)
        .values({
          websiteId: website.id,
          title: spec.title,
          slug: spec.slug,
          postType: 'page',
          content: spec.content,
          published: true,
          publishedAt: new Date(),
          seoTitle: spec.seoTitle,
          seoDescription: spec.seoDescription,
          noIndex: false,
        })
        .returning();
      console.log(`  ${spec.slug.padEnd(8)} created id=${created.id}`);
      continue;
    }

    // Idempotence policy: empty existing content is always refreshed (it's a
    // placeholder); non-empty content is preserved unless --force is set.
    const isEmpty =
      !existing.content || existing.content.trim() === '' || existing.content.trim() === '{}';

    if (!isEmpty && !force) {
      console.log(
        `  ${spec.slug.padEnd(8)} skipping (already authored — pass --force to overwrite) id=${existing.id}`,
      );
      continue;
    }

    await db
      .update(posts)
      .set({
        title: spec.title,
        content: spec.content,
        postType: 'page',
        published: true,
        publishedAt: existing.publishedAt ?? new Date(),
        seoTitle: spec.seoTitle,
        seoDescription: spec.seoDescription,
        noIndex: false,
        updatedAt: new Date(),
      })
      .where(eq(posts.id, existing.id));
    console.log(
      `  ${spec.slug.padEnd(8)} ${isEmpty ? 'refreshed (was empty)' : 'overwrote (--force)'} id=${existing.id}`,
    );
  }

  console.log('');
  console.log('Magamommy storefront compose complete.');
  console.log(`  Website:  #${website.id} ${website.subdomain ?? ''}.simplerdevelopment.com (custom: ${website.domain ?? '—'})`);
  console.log('  Home page resolved by slug=\'home\' via getClientHomePage().');
  console.log('');

  process.exit(0);
}

// Run when invoked directly (matches sibling scripts that use `bun scripts/...`).
declare const require: { main?: unknown } | undefined;
const isDirectRun =
  (typeof require !== 'undefined' && typeof module !== 'undefined' && require.main === module) ||
  // bun-specific: import.meta.main is true when the file is the entrypoint.
  // Cast through unknown to keep TS happy without pulling @types/bun.
  ((import.meta as unknown as { main?: boolean }).main === true);

if (isDirectRun) {
  main().catch((err) => {
    console.error('[compose-storefront] failed:', err);
    process.exit(1);
  });
}
