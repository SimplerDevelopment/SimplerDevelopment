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
 * Resolution: tenant lookup is `clientWebsites.domain = 'magamommy.com'`,
 * falling back to `subdomain = 'magamommy'`. Throws if the tenant isn't
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

const MAGAMOMMY_DOMAIN = 'magamommy.com';
const MAGAMOMMY_SUBDOMAIN = 'magamommy';
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
//
// Composition (top → bottom):
//   1. marquee       Promo bar: "★ NEW DROP EVERY MONDAY ★ …"
//   2. hero          Photoreal lifestyle image (from the latest drop) + headline + 2 CTAs
//   3. bento-grid    Two-card row: "This week's drop" + "Why limited"
//   4. featured-products  Big product showcase (limit 1, single column)
//   5. timeline      How it works — Mon 9AM drop → buy → ship in 48h → next Mon
//   6. metric-cards  4 numbers that prove the model
//   7. accordion     FAQ (4 questions)
//   8. cta           Final gradient push to /shop
//
// The hero's background image comes from the latest weekly-drop product image
// (the lifestyle photo generated by the designer agent). Re-run compose-storefront
// after each drop to refresh the home with the new visual. Falls back to a brand-color
// solid hero when no drop exists yet.

interface LatestDropSummary {
  /** Storefront route of the latest product, e.g. '/shop/real-american-strong-2026-w20' */
  productUrl?: string;
  /** Slogan (used as the hero headline accent) */
  slogan?: string;
  /** Tagline (used as the hero subhead) */
  tagline?: string;
  /** Public URL of the lifestyle product image. */
  heroImageUrl?: string;
}

function buildHomeContent(latestDrop: LatestDropSummary): string {
  const id = makeIdFactory('mm-home');

  // 1. Top promo marquee — single inline scroller of slogans/promises. Brand
  // colors via inline style; brandingProfile typography still wins.
  const promoItems = [
    'NEW DROP EVERY MONDAY 9 AM ET',
    'LIMITED TO 100 SHIRTS PER DROP',
    'HEAVYWEIGHT 6 OZ COTTON',
    'FREE U.S. SHIPPING OVER $50',
    'PRINTED IN PENNSYLVANIA',
    'SHIPS WITHIN 48 HOURS',
  ];
  const marquee = {
    id: id(),
    type: 'marquee',
    order: 0,
    items: promoItems.map((text) => ({
      id: id(),
      type: 'text',
      content: text,
    })),
    speed: 60,
    direction: 'left',
    pauseOnHover: true,
    autoFill: true,
    gap: '48px',
    style: {
      backgroundColor: BLUE,
      color: WHITE,
      paddingTop: '14px',
      paddingBottom: '14px',
      fontSize: '13px',
      fontWeight: '700',
      letterSpacing: '0.12em',
    },
  };

  // 2. Hero — uses the latest drop's lifestyle photo as the background image
  // with a dark overlay for legibility. When no drop exists (pre-bootstrap or
  // pre-first-drop) we fall back to a flat brand-red hero so the page still
  // reads as a real storefront, just without the photo.
  const heroHeadline = latestDrop.slogan
    ? `This week: ${latestDrop.slogan}.`
    : 'Heat from the headlines, printed on a tee.';
  const heroDescription = latestDrop.tagline
    ?? 'Magamommy turns the week\'s loudest political moment into a wearable. Limited quantities. Gone when they\'re gone.';
  const heroCtaLink = latestDrop.productUrl ?? '/shop';
  const heroBaseStyle: Record<string, string> = {
    color: WHITE,
    paddingTop: '160px',
    paddingBottom: '160px',
    textShadow: '0 2px 24px rgba(0,0,0,0.55)',
  };
  if (!latestDrop.heroImageUrl) {
    heroBaseStyle.backgroundColor = RED;
  }
  const hero = {
    id: id(),
    type: 'hero',
    order: 1,
    title: heroHeadline,
    subtitle: 'NEW DROP — MONDAY 9 AM ET',
    description: heroDescription,
    ctaText: latestDrop.slogan ? 'Get it before it\'s gone' : 'Shop this week\'s drop',
    ctaLink: heroCtaLink,
    secondaryCtaText: 'Browse the archive',
    secondaryCtaLink: '/shop',
    backgroundImage: latestDrop.heroImageUrl,
    style: heroBaseStyle,
  };

  // 3. Bento grid — asymmetric 2-card row. Left card is the "what" (this
  // week's drop, urgent), right card is the "why" (the model). Lead/items
  // map directly onto BentoCard.
  const bento = {
    id: id(),
    type: 'bento-grid',
    order: 2,
    overline: 'This week, in cotton',
    title: 'Wear what everyone is talking about.',
    subtitle: 'One shirt. One slogan. Seven days only.',
    cards: [
      {
        id: id(),
        title: latestDrop.slogan ?? 'Fresh off the press.',
        lead: latestDrop.tagline
          ?? 'A brand-new design, printed Monday morning, pulled from the loudest political story of the week.',
        items: [
          'Heavyweight 6 oz cotton tee',
          'Sizes S–XXL, three colorways',
          'Ships within 48 hours',
          latestDrop.heroImageUrl
            ? 'Featured in this week\'s lookbook'
            : 'First drop arriving Monday',
        ],
        link: heroCtaLink,
        linkText: 'See the drop →',
        variant: 'dark',
        span: 7,
      },
      {
        id: id(),
        title: 'Why limited?',
        lead: 'Because relevance has a shelf life. Last week\'s outrage is this week\'s lookbook.',
        items: [
          'Drops Monday 9 AM ET',
          'Capped at 100 per week',
          'Retired Sunday 11:59 PM',
          'Never restocked',
        ],
        variant: 'light',
        span: 5,
      },
    ],
    darkBg: BLUE,
    lightBorder: '#E2E2E2',
    style: {
      paddingTop: '96px',
      paddingBottom: '96px',
      backgroundColor: '#F7F4ED',
    },
  };

  // 4. Big single-product featured row. featured-products doesn't filter
  // by category (registry caveat), so we use product-grid with limit=1
  // and one big column for a hero-product treatment.
  const featuredDrop = {
    id: id(),
    type: 'product-grid',
    order: 3,
    title: 'Buy this week\'s drop',
    description: 'Shown below at full retail. Hits the front porch within 2 business days.',
    categorySlug: CATEGORY_SLUG,
    sort: 'newest',
    limit: 1,
    columns: 1,
    showPrice: true,
    showDescription: true,
    showCategory: false,
    buttonText: 'Add to cart',
    style: {
      paddingTop: '96px',
      paddingBottom: '96px',
    },
  };

  // 5. Timeline — how it works. Layout='left' (vertical), big numbered
  // milestones, our brand red for the line + numbers so it ties into the
  // hero color.
  const timeline = {
    id: id(),
    type: 'timeline',
    order: 4,
    overline: 'How a drop works',
    title: 'From the headlines to your front porch in 6 days.',
    subtitle: 'Same rhythm every single week — predictable, limited, gone.',
    steps: [
      {
        id: id(),
        title: 'Monday 9 AM ET — Drop',
        number: '01',
        description:
          'A new shirt design lands in the shop. Pulled from the past seven days of political news. 100 units. Three colorways. Sizes S–XXL.',
      },
      {
        id: id(),
        title: 'Monday – Saturday — Sells through',
        number: '02',
        description:
          'You order. We print to-order on heavyweight cotton in Pennsylvania, then ship within 48 hours. Tracking lands in your inbox the same day.',
      },
      {
        id: id(),
        title: 'Sunday 11:59 PM — Retired',
        number: '03',
        description:
          'The drop closes. The page stays up as part of the archive. The shirt itself is never reprinted — what\'s out there is all there is.',
      },
      {
        id: id(),
        title: 'Next Monday — Repeat',
        number: '04',
        description:
          'Fresh news cycle, fresh design, fresh tee. Subscribe to the drop list and we\'ll email you the moment it goes live.',
      },
    ],
    lineColor: RED,
    numberColor: RED,
    nodeColor: WHITE,
    layout: 'left',
    style: {
      paddingTop: '96px',
      paddingBottom: '96px',
      backgroundColor: WHITE,
    },
  };

  // 6. Metric cards — proof points. 4 numbers, 4 columns, accent red.
  const metrics = {
    id: id(),
    type: 'metric-cards',
    order: 5,
    overline: 'The format',
    title: 'A shop that runs on a metronome.',
    description:
      'Every number on this page is a constraint on purpose. Constraints are what make the drop feel like a drop.',
    columns: 4,
    accentColor: RED,
    metrics: [
      { id: id(), value: '1', label: 'NEW SHIRT EVERY WEEK', institution: 'Monday morning, no exceptions' },
      { id: id(), value: '100', label: 'UNITS PER DROP', institution: 'Capped on purpose' },
      { id: id(), value: '48h', label: 'SHIP TIME', institution: 'From order to porch' },
      { id: id(), value: '0', label: 'RESTOCKS', institution: 'Never. Ever.' },
    ],
    style: {
      paddingTop: '88px',
      paddingBottom: '88px',
      backgroundColor: '#0E0E0E',
      color: WHITE,
    },
  };

  // 7. FAQ accordion.
  const faq = {
    id: id(),
    type: 'accordion',
    order: 6,
    title: 'The fine print, but louder.',
    items: [
      {
        id: id(),
        title: 'How do I know when a new drop is live?',
        content:
          'Every Monday at 9 AM ET. Hit "Email me the drops" at the bottom and we\'ll send you the link the moment it goes live — usually before our own site cache catches up.',
      },
      {
        id: id(),
        title: 'What if my size sells out?',
        content:
          'It\'s gone for that drop, and we won\'t reprint it. We size up generously and over-stock the middle (M / L / XL) to spread out the run, but the only way to lock in your size is to grab it Monday.',
      },
      {
        id: id(),
        title: 'Where do you ship?',
        content:
          'Anywhere in the United States, with free shipping over $50. Canada and Mexico via flat-rate. International beyond that is case-by-case — email us before you check out and we\'ll work it out.',
      },
      {
        id: id(),
        title: 'Are returns a thing?',
        content:
          'Unworn, unwashed shirts can come back within 14 days for a swap or refund minus the return shipping. If we screwed up — wrong size shipped, print defect, fabric flaw — we eat it, and we eat it fast.',
      },
    ],
    style: {
      paddingTop: '96px',
      paddingBottom: '96px',
      backgroundColor: WHITE,
    },
  };

  // 8. Big closing CTA — gradient bg, primary push to the latest drop.
  const closing = {
    id: id(),
    type: 'cta',
    order: 7,
    title: 'See this week\'s drop.',
    description:
      'Sunday at midnight it\'s gone. Next Monday a new one takes its place. That\'s the whole bit.',
    primaryButtonText: latestDrop.slogan ? `Shop "${latestDrop.slogan}"` : 'Shop the drop',
    primaryButtonUrl: heroCtaLink,
    secondaryButtonText: 'Email me future drops',
    secondaryButtonUrl: `mailto:${CONTACT_EMAIL}?subject=Subscribe%20me%20to%20drop%20alerts`,
    backgroundStyle: 'gradient',
    style: {
      color: WHITE,
      paddingTop: '112px',
      paddingBottom: '112px',
      backgroundGradient: `linear-gradient(135deg, ${RED} 0%, ${BLUE} 100%)`,
    },
  };

  return wrap([marquee, hero, bento, featuredDrop, timeline, metrics, faq, closing]);
}

/**
 * Looks up the newest active product in the magamommy weekly-drops category
 * and returns the data the home-page hero needs to feature it. Returns an
 * empty summary if no drop has shipped yet — the hero falls back gracefully.
 */
async function fetchLatestDrop(websiteId: number): Promise<LatestDropSummary> {
  const { db } = await import('../../lib/db');
  const { products, productCategories, productImages } = await import('../../lib/db/schema/store');
  const { and, eq, desc } = await import('drizzle-orm');

  // Select only the columns we actually need. `select()` would pull every
  // column in the products schema, including ones added by later migrations
  // that may not exist on every environment (e.g. shipping's length_in/
  // width_in/height_in). Keeping the projection narrow makes this query
  // tolerant of migration drift across local/staging/prod.
  const [category] = await db
    .select({ id: productCategories.id })
    .from(productCategories)
    .where(and(eq(productCategories.websiteId, websiteId), eq(productCategories.slug, CATEGORY_SLUG)))
    .limit(1);
  if (!category) return {};

  const [latest] = await db
    .select({
      id: products.id,
      slug: products.slug,
      name: products.name,
      shortDescription: products.shortDescription,
    })
    .from(products)
    .where(and(
      eq(products.websiteId, websiteId),
      eq(products.categoryId, category.id),
      eq(products.status, 'active'),
    ))
    .orderBy(desc(products.createdAt))
    .limit(1);
  if (!latest) return {};

  const [image] = await db
    .select({ url: productImages.url })
    .from(productImages)
    .where(eq(productImages.productId, latest.id))
    .orderBy(productImages.order)
    .limit(1);

  return {
    productUrl: `/shop/${latest.slug}`,
    slogan: latest.name,
    tagline: latest.shortDescription ?? undefined,
    heroImageUrl: image?.url ?? undefined,
  };
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
  const { clientWebsites } = await import('../../lib/db/schema/sites');
  const { posts } = await import('../../lib/db/schema/cms');
  const { eq, and } = await import('drizzle-orm');

  // ── Resolve magamommy websiteId ────────────────────────────────────────────
  let [website] = await db
    .select()
    .from(clientWebsites)
    .where(eq(clientWebsites.domain, MAGAMOMMY_DOMAIN))
    .limit(1);
  if (!website) {
    [website] = await db
      .select()
      .from(clientWebsites)
      .where(eq(clientWebsites.subdomain, MAGAMOMMY_SUBDOMAIN))
      .limit(1);
  }
  if (!website) {
    throw new Error(
      `Magamommy website not found. Run \`bun scripts/magamommy/bootstrap-tenant.ts\` first.`,
    );
  }

  console.log(
    `[compose-storefront] tenant: client #${website.clientId} → website #${website.id} (${website.domain ?? website.subdomain})`,
  );

  // Resolve the latest weekly drop so the home hero can feature it. Empty
  // summary if no drop has shipped yet — buildHomeContent falls back to a
  // flat brand-red hero.
  const latestDrop = await fetchLatestDrop(website.id);
  if (latestDrop.heroImageUrl) {
    console.log(
      `[compose-storefront] hero will feature latest drop: "${latestDrop.slogan}" (${latestDrop.productUrl})`,
    );
  } else {
    console.log('[compose-storefront] no published drop yet — hero falling back to brand-color background');
  }

  const pageSpecs: PageSpec[] = [
    {
      slug: 'home',
      title: 'Magamommy — A new shirt every Monday',
      seoTitle: 'Magamommy | Heat from the headlines, printed on a tee',
      seoDescription:
        'A new political-merch drop every Monday. Heavyweight cotton, US-printed, limited runs. Magamommy.',
      content: buildHomeContent(latestDrop),
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

if ((import.meta as unknown as { main?: boolean }).main === true) {
  main().catch((err) => {
    console.error('[compose-storefront] failed:', err);
    process.exit(1);
  });
}
