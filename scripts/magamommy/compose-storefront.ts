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

// Brand palette — MAGA / Old Glory standard, mirrored from bootstrap-tenant.ts.
// Used only for inline block background/style hints; the brandingProfile FK on
// clientWebsites is the source of truth for global colors/fonts.
const RED = '#BF0A30';   // bold flag-standard red
const BLUE = '#002868';  // deep navy (cleaner than 3C3B6E for big fields)
const NAVY_SOFT = '#1B2854';  // softened navy — used to replace pure black on dark sections so the page reads warmer/more feminine while staying patriotic
const WHITE = '#FFFFFF';
const CREAM = '#F7F4ED'; // off-white field for warm sections
const GOLD = '#D9A21B';  // warm gold accent — alongside red/white/blue for a more feminine touch
const ROSE = '#D87A8A';  // dusty rose pink accent — used VERY sparingly (one or two spots) so it doesn't drift away from the patriotic palette
const SCRIPT_FONT = '"Caveat", "Allison", "Brush Script MT", cursive';  // handwritten script accent — script-tagged accents like "hey mama ♡" / "xoxo magamommy"

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
  /** Product price in cents — drives the hero trust-strip + sticker chip. */
  priceCents?: number;
}

function buildHomeContent(latestDrop: LatestDropSummary): string {
  const id = makeIdFactory('mm-home');

  // Load the Caveat handwritten script font alongside the brand fonts so
  // the "hey mama ♡" / "xoxo, magamommy ♡" script accents render properly.
  // Caveat isn't in the brandingProfile (only two font slots there), so we
  // pull it via CSS @import inside a <style> tag. @import works reliably
  // when the parent <style> is injected via innerHTML (unlike a bare <link>
  // which may not trigger a fetch in some browsers under that path). Belt-
  // and-suspenders: we also include the <link> for browsers that do honor
  // the dynamic link. Zero-height block — only its declarations matter.
  const fontLoader = {
    id: id(),
    type: 'html-render',
    order: 0,
    html: `
<style>
  @import url("https://fonts.googleapis.com/css2?family=Caveat:wght@500;700&display=swap");
  :root { --mm-script: ${SCRIPT_FONT}; }
  .mm-script { font-family: ${SCRIPT_FONT} !important; }
</style>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Caveat:wght@500;700&display=swap" />`,
  };

  // Section banner factory — a tilted "★ ★ ★ LABEL ★ ★ ★" stamp chip used
  // to give each section a fair-flyer header treatment. Returns an
  // html-render block ready to drop into the wrap() array.
  const sectionBanner = (label: string, opts: { bg?: string; fg?: string; topPad?: number; bottomPad?: number } = {}) => {
    const bg = opts.bg ?? BLUE;
    const fg = opts.fg ?? WHITE;
    return {
      id: id(),
      type: 'html-render',
      order: 0,
      html: `
<div style="background:${fg};text-align:center;padding-top:${opts.topPad ?? 48}px;padding-bottom:${opts.bottomPad ?? 12}px;">
  <div style="display:inline-block;background:${bg};color:${fg};padding:14px 32px;font-family:'Alfa Slab One',serif;font-weight:400;font-size:14px;letter-spacing:0.24em;text-transform:uppercase;border:4px solid ${bg};box-shadow:8px 8px 0 ${RED};transform:rotate(-1.5deg);">★ ★ ★ ${label} ★ ★ ★</div>
</div>`,
    };
  };

  // 1. Top promo marquee — 4th-of-July fair-flyer style with star separators
  // between every claim. Brand red field, white slab-stencil-feeling type.
  const promoClaims = [
    '★ MADE BY MAMA, FOR MAMA ★',
    '★ FAITH ★ FAMILY ★ FREEDOM ★',
    '★ HEAVYWEIGHT 6 OZ COTTON ★',
    '★ FREE U.S. SHIPPING OVER $50 ★',
    '★ PRINTED IN PENNSYLVANIA ★',
    '★ SHIPS WITHIN 48 HOURS ★',
  ];
  const marquee = {
    id: id(),
    type: 'marquee',
    order: 0,
    items: promoClaims.map((text) => ({
      id: id(),
      type: 'text',
      content: text,
    })),
    speed: 70,
    direction: 'left',
    pauseOnHover: true,
    autoFill: true,
    gap: '64px',
    style: {
      backgroundColor: RED,
      color: WHITE,
      paddingTop: '16px',
      paddingBottom: '16px',
      fontSize: '14px',
      fontWeight: '800',
      letterSpacing: '0.18em',
      textTransform: 'uppercase',
      borderTopWidth: '3px',
      borderTopColor: BLUE,
      borderTopStyle: 'solid',
      borderBottomWidth: '3px',
      borderBottomColor: BLUE,
      borderBottomStyle: 'solid',
    },
  };

  // 2. Hero — two-column flyer layout.
  //   LEFT (55%, deep navy): drop stamp → slogan-as-headline → tagline → price
  //   strip → big primary CTA + secondary link.
  //   RIGHT (45%, edge-to-edge photo): lifestyle photo with a tilted red
  //   "NEW DROP!" sticker top-left and a navy "$29 · ONLY 100 MADE" chip
  //   bottom-right. Both overlays absolutely positioned inside a single
  //   html-render block so layering Just Works without per-block z-index dance.
  //
  // Slogan-as-headline: dropping the "This week:" prefix — it competed with
  // the eyebrow stamp for the same info and made the headline wordy. The
  // slogan IS the hero. Trim trailing terminator so "...Carry On." doesn't
  // become "...Carry On.." when we add styling-period later.
  const cleanSlogan = latestDrop.slogan?.replace(/[.!?]+\s*$/, '');
  const heroHeadline = cleanSlogan ?? 'Faith. Family. Freedom. Fabric.';
  const heroTagline = latestDrop.tagline
    ?? 'Patriotic apparel for the suburban Republican mama. Made by mama. For mama.';
  const heroCtaLink = latestDrop.productUrl ?? '/shop';
  // Render price as a clean dollar string — "24" not "24.00" when whole.
  const heroPriceLabel = latestDrop.priceCents != null
    ? '$' + (latestDrop.priceCents % 100 === 0
        ? String(latestDrop.priceCents / 100)
        : (latestDrop.priceCents / 100).toFixed(2))
    : '$29';

  // Right-column content. Lifestyle photo path uses a single html-render
  // with absolutely-positioned overlays (NEW! sticker + price chip). Fallback
  // path (no drop yet) renders a flat brand-red panel with the wordmark.
  const heroRightBlocks: Array<Record<string, unknown>> = latestDrop.heroImageUrl
    ? [{
        id: id(),
        type: 'html-render',
        order: 0,
        html: `
<div style="position:relative;width:100%;height:100%;min-height:540px;background:${WHITE};overflow:hidden;">
  <img src="${latestDrop.heroImageUrl}" alt="${(cleanSlogan ?? 'Magamommy weekly drop').replace(/"/g, '&quot;')}" style="display:block;width:100%;height:100%;min-height:540px;object-fit:cover;object-position:center 18%;"/>

  <!-- "NEW DROP!" tilted sticker — top-left -->
  <div style="position:absolute;top:28px;left:28px;width:148px;height:148px;background:${RED};color:${WHITE};border:6px solid ${WHITE};border-radius:50%;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;transform:rotate(-14deg);box-shadow:0 8px 24px rgba(0,0,0,0.35);font-family:'Alfa Slab One',serif;text-transform:uppercase;line-height:1;">
    <div style="font-size:11px;letter-spacing:0.24em;opacity:0.92;">★ Mama ★</div>
    <div style="font-size:34px;margin-top:6px;letter-spacing:-0.01em;">PICK!</div>
    <div style="font-size:10px;letter-spacing:0.2em;margin-top:6px;">Featured</div>
  </div>

  <!-- Price + scarcity chip — bottom-right -->
  <div style="position:absolute;bottom:24px;right:24px;background:${BLUE};color:${WHITE};padding:14px 22px;border:4px solid ${WHITE};box-shadow:0 6px 18px rgba(0,0,0,0.3);transform:rotate(2deg);font-family:'Alfa Slab One',serif;text-transform:uppercase;line-height:1.05;">
    <div style="font-size:11px;letter-spacing:0.2em;opacity:0.9;">Only 100 Made</div>
    <div style="font-size:30px;margin-top:6px;letter-spacing:-0.01em;">${heroPriceLabel}</div>
  </div>
</div>`,
      }]
    : [{
        id: id(),
        type: 'heading',
        order: 0,
        content: 'MAGA-<br/>MOMMY',
        level: 1,
        alignment: 'center',
        style: {
          color: WHITE,
          fontSize: '96px',
          fontWeight: '900',
          letterSpacing: '-0.04em',
          lineHeight: '0.95',
          margin: '0',
        },
      }];

  const hero = {
    id: id(),
    type: 'columns',
    order: 1,
    gap: 'none',
    stackOnMobile: true,
    columns: [
      // Left — text + CTAs over deep navy
      {
        id: id(),
        width: '55%',
        verticalAlign: 'center',
        padding: 'lg',
        backgroundColor: BLUE,
        blocks: [
          // Script accent + drop stamp. Caveat script "hey mama ♡" reads as
          // a personal greeting; the stamp underneath keeps the patriotic
          // poster framing.
          {
            id: id(),
            type: 'html-render',
            order: 0,
            html: `
<div class="mm-script" style="font-family:${SCRIPT_FONT};font-size:56px;color:${GOLD};line-height:0.95;letter-spacing:0.02em;margin:0 0 18px 0;text-shadow:1px 1px 0 rgba(0,0,0,0.25);font-weight:700;">hey mama &#x2661;</div>
<div style="display:inline-block;background:${RED};color:${WHITE};padding:12px 24px;font-family:'Alfa Slab One',serif;font-weight:400;font-size:14px;letter-spacing:0.24em;text-transform:uppercase;border:4px solid ${WHITE};border-radius:10px;box-shadow:8px 8px 0 rgba(255,255,255,0.18);margin-bottom:28px;">★ ★ ★ Magamommy Featured ★ ★ ★</div>`,
          },

          // Slogan-as-headline. ~Alfa Slab One when the font loads; falls
          // back to Ultra / Georgia / serif weight 900 in the meantime.
          {
            id: id(),
            type: 'heading',
            order: 1,
            content: heroHeadline,
            level: 1,
            alignment: 'left',
            style: {
              color: WHITE,
              fontFamily: '"Alfa Slab One", "Ultra", "Georgia", serif',
              fontSize: '88px',
              fontWeight: '900',
              letterSpacing: '-0.015em',
              lineHeight: '0.95',
              margin: '0 0 28px 0',
              textTransform: 'uppercase',
            },
          },

          // Big confident tagline (was tiny). Yellow-cream pull-color and
          // ~24px sits between the headline and the CTA strip and reads
          // like a magazine deck.
          {
            id: id(),
            type: 'text',
            order: 2,
            content: heroTagline,
            size: 'lg',
            alignment: 'left',
            style: {
              color: WHITE,
              fontSize: '24px',
              fontWeight: '500',
              lineHeight: '1.35',
              maxWidth: '540px',
              margin: '0 0 36px 0',
              opacity: '0.95',
            },
          },

          // Price + ship strip — quick scannable trust signals before the CTA.
          {
            id: id(),
            type: 'html-render',
            order: 3,
            html: `<div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap;margin-bottom:36px;color:${WHITE};font-family:'Alfa Slab One',serif;text-transform:uppercase;font-size:14px;letter-spacing:0.18em;"><span style="display:inline-flex;align-items:center;gap:8px;background:rgba(255,255,255,0.08);border:2px solid rgba(255,255,255,0.4);padding:8px 14px;border-radius:999px;">★ ${heroPriceLabel}</span><span style="display:inline-flex;align-items:center;gap:8px;background:rgba(255,255,255,0.08);border:2px solid rgba(255,255,255,0.4);padding:8px 14px;border-radius:999px;">★ Free US shipping $50+</span><span style="display:inline-flex;align-items:center;gap:8px;background:rgba(255,255,255,0.08);border:2px solid rgba(255,255,255,0.4);padding:8px 14px;border-radius:999px;">★ Ships in 48h</span></div>`,
          },

          // Single hero CTA — outsize, brand red, "buy now" intent.
          {
            id: id(),
            type: 'button',
            order: 4,
            text: latestDrop.slogan ? `Shop "${cleanSlogan}" →` : 'Shop the collection',
            url: heroCtaLink,
            variant: 'primary',
            size: 'lg',
            alignment: 'left',
            style: {
              backgroundColor: RED,
              color: WHITE,
              fontSize: '20px',
              fontWeight: '800',
              letterSpacing: '0.02em',
              textTransform: 'uppercase',
              padding: '20px 36px',
              border: `4px solid ${WHITE}`,
              boxShadow: '6px 6px 0 rgba(0,0,0,0.35)',
              borderRadius: '4px',
              margin: '0 0 16px 0',
            },
          },

          // Secondary link — text-style, low-key, "see everything" intent.
          {
            id: id(),
            type: 'html-render',
            order: 5,
            html: `<a href="/shop" style="display:inline-flex;align-items:center;gap:8px;color:${WHITE};opacity:0.85;font-family:'Inter',sans-serif;font-size:14px;letter-spacing:0.06em;text-decoration:none;border-bottom:1px solid rgba(255,255,255,0.4);padding-bottom:2px;">Or browse the full collection →</a>`,
          },
        ],
      },
      // Right — lifestyle photo (or brand panel fallback)
      {
        id: id(),
        width: '45%',
        verticalAlign: 'top',
        padding: 'none',
        backgroundColor: latestDrop.heroImageUrl ? undefined : RED,
        blocks: heroRightBlocks,
      },
    ],
    style: {
      backgroundColor: BLUE,
      paddingTop: '0',
      paddingBottom: '0',
      minHeight: '540px',
    },
  };

  // 2b. Barker banner — full-bleed flag-stripe band with a fair-flyer
  // headline. Sits between the hero and the bento to break up the visuals
  // and amplify the urgency. Pure html-render so we get the diagonal
  // ribbons + repeating stripes for free.
  const barkerBanner = {
    id: id(),
    type: 'html-render',
    order: 2,
    html: `
<div style="position:relative;background:repeating-linear-gradient(90deg,${RED} 0,${RED} 60px,${WHITE} 60px,${WHITE} 120px);padding:48px 24px;border-top:6px solid ${BLUE};border-bottom:6px solid ${BLUE};text-align:center;overflow:hidden;">
  <div style="display:inline-block;background:${BLUE};color:${WHITE};padding:24px 56px;border:4px solid ${WHITE};box-shadow:0 0 0 6px ${BLUE}, 12px 12px 0 ${RED};transform:rotate(-1.5deg);">
    <div style="font-family:'Alfa Slab One',serif;font-size:14px;letter-spacing:0.32em;color:${WHITE};text-transform:uppercase;margin-bottom:8px;">★ ★ ★ Magamommy Apparel ★ ★ ★</div>
    <div style="font-family:'Alfa Slab One',serif;font-size:42px;line-height:1;color:${WHITE};text-transform:uppercase;letter-spacing:-0.005em;">Faith &middot; Family &middot; Freedom &middot; Fabric</div>
    <div style="font-family:'Alfa Slab One',serif;font-size:14px;letter-spacing:0.32em;color:${WHITE};text-transform:uppercase;margin-top:8px;">★ ★ ★ Made by a Mama, for the Mamas ★ ★ ★</div>
  </div>
</div>`,
  };

  // 3. "PROGRAM" section — custom html-render replaces the generic bento-grid
  // so the cards read like printed signs at a fairground booth: chunky
  // borders, offset shadows, star bullets in the lists, slab-serif card
  // titles, a real banner header instead of a small overline.
  const bentoSloganHtml = (latestDrop.slogan ?? 'Fresh off the press.').replace(/</g, '&lt;');
  const bentoLeadHtml = (latestDrop.tagline ?? 'A brand-new design, printed Monday morning, pulled from the loudest political story of the week.').replace(/</g, '&lt;');
  const bento = {
    id: id(),
    type: 'html-render',
    order: 2,
    html: `
<div style="background:#F7F4ED;padding:72px 24px 96px;position:relative;border-top:6px solid ${BLUE};border-bottom:6px solid ${BLUE};">

  <!-- Banner header -->
  <div style="text-align:center;margin-bottom:48px;">
    <div style="display:inline-block;background:${BLUE};color:${WHITE};padding:12px 28px;font-family:'Alfa Slab One',serif;font-weight:400;font-size:13px;letter-spacing:0.24em;text-transform:uppercase;border:3px solid ${BLUE};box-shadow:6px 6px 0 ${RED};margin-bottom:24px;">★ ★ ★ Mama's Picks ★ ★ ★</div>
    <h2 style="font-family:'Alfa Slab One',serif;font-size:64px;line-height:0.96;letter-spacing:-0.015em;text-transform:uppercase;margin:0;color:${BLUE};">Wear your values.<br/>Loud and proud.</h2>
    <p style="font-family:'Inter',sans-serif;font-size:18px;color:#444;margin:18px 0 0;">Heavyweight cotton tees, baby onesies, and accessories — every one mama-approved.</p>
  </div>

  <!-- Two-card row -->
  <div style="max-width:1180px;margin:0 auto;display:grid;grid-template-columns:repeat(12, 1fr);gap:24px;">

    <!-- Left card: this week's drop. Wider (7/12). Dark navy. -->
    <div style="grid-column:span 7;background:${BLUE};color:${WHITE};padding:40px;border:4px solid ${BLUE};box-shadow:10px 10px 0 ${RED};position:relative;">
      <div style="font-family:'Alfa Slab One',serif;font-size:12px;letter-spacing:0.22em;text-transform:uppercase;color:${RED};margin-bottom:12px;">★ Mama's Featured ★</div>
      <h3 style="font-family:'Alfa Slab One',serif;font-size:40px;line-height:1;letter-spacing:-0.01em;text-transform:uppercase;margin:0 0 16px 0;color:${WHITE};">${bentoSloganHtml}</h3>
      <p style="font-family:'Inter',sans-serif;font-size:17px;line-height:1.45;color:rgba(255,255,255,0.86);margin:0 0 24px 0;">${bentoLeadHtml}</p>
      <ul style="list-style:none;padding:0;margin:0 0 32px 0;font-family:'Inter',sans-serif;font-size:16px;color:${WHITE};">
        <li style="padding:8px 0;border-bottom:1px dashed rgba(255,255,255,0.25);"><span style="color:${RED};font-weight:800;margin-right:10px;">★</span>Soft 100% cotton, mama-approved</li>
        <li style="padding:8px 0;border-bottom:1px dashed rgba(255,255,255,0.25);"><span style="color:${RED};font-weight:800;margin-right:10px;">★</span>Tees S–XXL, onesies NB–24M, three colorways</li>
        <li style="padding:8px 0;border-bottom:1px dashed rgba(255,255,255,0.25);"><span style="color:${RED};font-weight:800;margin-right:10px;">★</span>Ships within 48 hours</li>
        <li style="padding:8px 0;"><span style="color:${RED};font-weight:800;margin-right:10px;">★</span>Printed by hand in Pennsylvania</li>
      </ul>
      <a href="${heroCtaLink}" style="display:inline-block;background:${RED};color:${WHITE};font-family:'Alfa Slab One',serif;font-size:14px;letter-spacing:0.16em;text-transform:uppercase;text-decoration:none;padding:14px 24px;border:3px solid ${WHITE};box-shadow:4px 4px 0 ${WHITE};">Shop this design →</a>
    </div>

    <!-- Right card: brand promise. Narrower (5/12). White card with navy outline. -->
    <div style="grid-column:span 5;background:${WHITE};color:${BLUE};padding:40px;border:4px solid ${BLUE};box-shadow:10px 10px 0 ${BLUE};position:relative;">
      <div style="font-family:'Alfa Slab One',serif;font-size:12px;letter-spacing:0.22em;text-transform:uppercase;color:${RED};margin-bottom:12px;">★ Why Magamommy? ★</div>
      <h3 style="font-family:'Alfa Slab One',serif;font-size:32px;line-height:1.05;letter-spacing:-0.005em;text-transform:uppercase;margin:0 0 16px 0;color:${BLUE};">Built by a mama<br/>who gets it.</h3>
      <p style="font-family:'Inter',sans-serif;font-size:16px;line-height:1.45;color:#333;margin:0 0 24px 0;">Patriotic apparel for the kitchen-table conservative — designed at the same dining table where I help with my kids' homework. No corporate boardroom in sight.</p>
      <ul style="list-style:none;padding:0;margin:0;font-family:'Inter',sans-serif;font-size:15px;color:${BLUE};">
        <li style="padding:6px 0;border-bottom:1px dashed rgba(0,40,104,0.2);"><span style="color:${RED};font-weight:800;margin-right:10px;">★</span>Faith. Family. Freedom.</li>
        <li style="padding:6px 0;border-bottom:1px dashed rgba(0,40,104,0.2);"><span style="color:${RED};font-weight:800;margin-right:10px;">★</span>Tees, onesies, accessories</li>
        <li style="padding:6px 0;border-bottom:1px dashed rgba(0,40,104,0.2);"><span style="color:${RED};font-weight:800;margin-right:10px;">★</span>Printed in the U.S.A.</li>
        <li style="padding:6px 0;"><span style="color:${RED};font-weight:800;margin-right:10px;">★</span>Free shipping on orders $50+</li>
      </ul>
    </div>

  </div>

  <!-- Footer stars — extra fair-flyer flourish at the bottom -->
  <div style="text-align:center;margin-top:48px;font-family:'Alfa Slab One',serif;font-size:14px;letter-spacing:0.32em;color:${RED};">★ &middot; ★ &middot; ★ &middot; ★ &middot; ★ &middot; ★ &middot; ★</div>
</div>`,
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

  // 5. Brand-story section — replaces the old "how a drop works" timeline.
  // Magamommy isn't a weekly-drop site anymore; it's a general apparel store
  // for the MAGA mama, so we sell the brand story instead of the schedule.
  const brandStory = {
    id: id(),
    type: 'html-render',
    order: 4,
    html: `
<div style="background:${WHITE};padding:96px 24px;text-align:center;">
  <div style="max-width:760px;margin:0 auto;">
    <div class="mm-script" style="font-family:${SCRIPT_FONT};font-size:42px;color:${GOLD};line-height:1;margin-bottom:12px;font-weight:700;">our story</div>
    <h2 style="font-family:'Alfa Slab One',serif;font-size:54px;line-height:1.02;letter-spacing:-0.01em;text-transform:uppercase;margin:0 0 28px 0;color:${BLUE};">A brand built<br/>at the kitchen table.</h2>
    <p style="font-family:'Inter',sans-serif;font-size:19px;line-height:1.55;color:#333;margin:0 0 20px 0;">Magamommy was started by one mom &mdash; a real one, with three real kids and a real heat press in the garage &mdash; who was tired of finding political apparel that was either too crude for her kids&rsquo; school pickup or too soft to actually say anything.</p>
    <p style="font-family:'Inter',sans-serif;font-size:19px;line-height:1.55;color:#333;margin:0 0 32px 0;">Every shirt, every onesie, every accessory is designed for the suburban Republican mama who shows up to PTA, drives the carpool, and still wants the world to know exactly where she stands. Faith. Family. Freedom. Printed loud.</p>
    <div style="display:inline-flex;gap:32px;flex-wrap:wrap;justify-content:center;font-family:'Alfa Slab One',serif;font-size:13px;letter-spacing:0.22em;color:${BLUE};text-transform:uppercase;">
      <div>★ Mama-owned</div>
      <div>★ Printed in PA</div>
      <div>★ Ships in 48h</div>
    </div>
  </div>
</div>`,
  };

  // 6. "RECORD BOARD" — custom html-render replaces the generic metric-cards
  // block so we can crank the number sizes, add star bullets between cards,
  // and give it that high-school-gym scoreboard feel.
  const metrics = {
    id: id(),
    type: 'html-render',
    order: 5,
    html: `
<div style="background:${NAVY_SOFT};color:${WHITE};padding:64px 24px;text-align:center;border-top:6px solid ${GOLD};border-bottom:6px solid ${GOLD};position:relative;overflow:hidden;">
  <!-- Softer warm-toned star pattern across the back -->
  <div aria-hidden="true" style="position:absolute;inset:0;opacity:0.09;background-image:radial-gradient(circle at 25% 25%, ${CREAM} 1.5px, transparent 2px), radial-gradient(circle at 75% 75%, ${GOLD} 1.5px, transparent 2px);background-size:40px 40px;"></div>

  <div style="position:relative;max-width:1100px;margin:0 auto;">
    <!-- Script accent -->
    <div class="mm-script" style="font-family:${SCRIPT_FONT};font-size:32px;color:${GOLD};line-height:1;letter-spacing:0.02em;margin-bottom:10px;">by the numbers, mama</div>

    <!-- Banner header (rounded) -->
    <div style="display:inline-block;background:${RED};color:${WHITE};padding:12px 28px;font-family:'Alfa Slab One',serif;font-weight:400;font-size:13px;letter-spacing:0.24em;text-transform:uppercase;border:3px solid ${CREAM};border-radius:10px;box-shadow:6px 6px 0 rgba(217,162,27,0.6);margin-bottom:24px;">★ ★ ★ The Record Board ★ ★ ★</div>

    <h2 style="font-family:'Alfa Slab One',serif;font-size:48px;line-height:1.05;letter-spacing:-0.01em;text-transform:uppercase;margin:0 0 14px 0;color:${CREAM};">Promises a mama can keep.</h2>
    <p style="font-family:'Inter',sans-serif;font-size:18px;color:rgba(247,244,237,0.78);max-width:640px;margin:0 auto 56px;">Every number is a promise to you and the next mama who orders.</p>

    <!-- 4 stats in a row, gold numbers, cream dashed dividers -->
    <div style="display:flex;align-items:stretch;justify-content:space-between;gap:0;flex-wrap:wrap;">
      ${[
        { v: '100%', l: 'USA Printed',     s: 'In our Pennsylvania shop' },
        { v: '6oz',  l: 'Cotton Weight',   s: 'Combed, ring-spun, soft' },
        { v: '48h',  l: 'Ship Time',       s: 'From order to porch' },
        { v: '1',    l: 'Mama, Real',      s: 'Family-owned & operated' },
      ].map((m, i, arr) => `
        <div style="flex:1 1 200px;min-width:200px;text-align:center;padding:12px 8px;${i < arr.length - 1 ? `border-right:2px dashed rgba(247,244,237,0.22);` : ''}">
          <div style="font-family:'Alfa Slab One',serif;font-size:96px;line-height:0.9;letter-spacing:-0.03em;color:${GOLD};text-shadow:4px 4px 0 rgba(0,0,0,0.18);">${m.v}</div>
          <div style="font-family:'Alfa Slab One',serif;font-size:14px;letter-spacing:0.2em;text-transform:uppercase;margin-top:14px;color:${CREAM};">${m.l}</div>
          <div style="font-family:'Inter',sans-serif;font-size:13px;color:rgba(247,244,237,0.62);margin-top:6px;">${m.s}</div>
        </div>
      `).join('')}
    </div>
  </div>
</div>`,
  };

  // 7. FAQ accordion — wrapped in a flyer-style header.
  const faqHeader = sectionBanner('Step Up & Ask', { bg: BLUE, fg: WHITE, topPad: 80, bottomPad: 16 });
  const faqTitle = {
    id: id(),
    type: 'html-render',
    order: 0,
    html: `
<div style="background:${WHITE};text-align:center;padding-bottom:40px;">
  <h2 style="font-family:'Alfa Slab One',serif;font-size:54px;line-height:1;letter-spacing:-0.01em;text-transform:uppercase;margin:0;color:${BLUE};">The fine print, but louder.</h2>
  <p style="font-family:'Inter',sans-serif;font-size:17px;color:#444;margin:14px 0 0;">Everything you'd hear if you yelled the question across the parking lot.</p>
</div>`,
  };
  const faq = {
    id: id(),
    type: 'accordion',
    order: 6,
    items: [
      {
        id: id(),
        title: 'What\'s in the shop?',
        content:
          'Adult tees (S–XXL, three colorways), kids\' tees (sizes 2T–12), baby onesies (NB–24M), plus the occasional accessory drop — tote bags, koozies, stickers. New designs added as inspiration strikes, not on a clock.',
      },
      {
        id: id(),
        title: 'How does sizing run?',
        content:
          'True to size. Heavyweight 6 oz cotton with a relaxed unisex cut on the adult tees, classic kids\' silhouette on the youth and onesies. If you\'re between sizes, size up — these wash and hold their shape but they don\'t stretch out.',
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
      paddingTop: '8px',
      paddingBottom: '80px',
      paddingLeft: '24px',
      paddingRight: '24px',
      backgroundColor: WHITE,
      maxWidth: '880px',
      marginLeft: 'auto',
      marginRight: 'auto',
    },
  };

  // 8. Closing CTA — flashy finale with bunting at top, big SVG eagle
  // silhouette watermark behind the headline, gradient + stars background.
  const closingShoutSlogan = cleanSlogan ? `Shop "${cleanSlogan}"` : 'Shop the collection';
  const closing = {
    id: id(),
    type: 'html-render',
    order: 7,
    html: `
<div style="position:relative;background:linear-gradient(135deg, ${RED} 0%, ${BLUE} 100%);color:${WHITE};text-align:center;padding:0 0 96px 0;overflow:hidden;">

  <!-- Bunting strip at top -->
  <svg viewBox="0 0 1440 50" preserveAspectRatio="none" style="display:block;width:100%;height:50px;">
    <defs>
      <pattern id="closing-bunting" x="0" y="0" width="80" height="50" patternUnits="userSpaceOnUse">
        <path d="M0 0 L40 42 L80 0 Z" fill="${WHITE}" />
        <path d="M40 0 L60 21 L20 21 Z" fill="${RED}" opacity="0.85" />
      </pattern>
    </defs>
    <rect width="100%" height="50" fill="url(#closing-bunting)" />
  </svg>

  <!-- Eagle silhouette watermark — large, low opacity, sits behind headline -->
  <svg aria-hidden="true" viewBox="0 0 320 200" style="position:absolute;left:50%;top:50%;transform:translate(-50%,-46%);width:520px;max-width:90%;opacity:0.08;">
    <g fill="${WHITE}">
      <path d="M -90 -20 Q -60 -45 -30 -28 Q -45 -10 -90 -20 Z" transform="translate(160 130)"/>
      <path d="M  90 -20 Q  60 -45  30 -28 Q  45 -10  90 -20 Z" transform="translate(160 130)"/>
      <path d="M -22 -28 L 22 -28 L 22 8 Q 0 28 -22 8 Z" transform="translate(160 130)"/>
      <circle cx="160" cy="94" r="14"/>
    </g>
  </svg>

  <div style="position:relative;padding:80px 24px 24px;max-width:880px;margin:0 auto;">
    <!-- Tiny floral wreath ornament above the eyebrow -->
    <svg aria-hidden="true" viewBox="0 0 120 40" style="display:block;margin:0 auto 18px;width:140px;height:auto;">
      <g fill="${GOLD}" opacity="0.85">
        <path d="M10 20 q 6 -10 16 -6 q -2 8 -10 10 q -4 0 -6 -4 Z"/>
        <path d="M110 20 q -6 -10 -16 -6 q 2 8 10 10 q 4 0 6 -4 Z"/>
        <circle cx="28" cy="20" r="2.5"/>
        <circle cx="92" cy="20" r="2.5"/>
        <circle cx="44" cy="20" r="1.6" opacity="0.6"/>
        <circle cx="76" cy="20" r="1.6" opacity="0.6"/>
      </g>
      <g fill="${WHITE}" opacity="0.7">
        <circle cx="60" cy="20" r="4"/>
        <circle cx="60" cy="20" r="2" fill="${GOLD}"/>
      </g>
    </svg>

    <!-- Eyebrow chip (rounded, gold-tinted shadow) -->
    <div style="display:inline-block;background:${WHITE};color:${RED};padding:10px 24px;font-family:'Alfa Slab One',serif;font-size:13px;letter-spacing:0.24em;text-transform:uppercase;border:3px solid ${WHITE};border-radius:10px;box-shadow:6px 6px 0 rgba(217,162,27,0.55);margin-bottom:30px;">★ Shop the Collection ★</div>

    <!-- Script accent above the big headline -->
    <div class="mm-script" style="font-family:${SCRIPT_FONT};font-size:42px;color:${GOLD};line-height:1;margin-bottom:8px;">come shop with us, mama</div>

    <h2 style="font-family:'Alfa Slab One',serif;font-size:88px;line-height:0.95;letter-spacing:-0.015em;text-transform:uppercase;margin:0 0 18px 0;color:${WHITE};text-shadow:0 4px 16px rgba(0,0,0,0.25);">Made for your mama.</h2>
    <p style="font-family:'Inter',sans-serif;font-size:22px;color:rgba(255,255,255,0.94);max-width:640px;margin:0 auto 44px;line-height:1.4;">Heavyweight cotton. Honest slogans. American printed. Free shipping over $50.</p>

    <!-- CTA pair — rounded -->
    <div style="display:inline-flex;flex-wrap:wrap;gap:16px;justify-content:center;align-items:center;">
      <a href="${heroCtaLink}" style="display:inline-block;background:${WHITE};color:${BLUE};font-family:'Alfa Slab One',serif;font-size:18px;letter-spacing:0.04em;text-transform:uppercase;text-decoration:none;padding:20px 36px;border:4px solid ${WHITE};border-radius:14px;box-shadow:6px 6px 0 rgba(0,0,0,0.35);">${closingShoutSlogan} →</a>
      <a href="mailto:${CONTACT_EMAIL}?subject=Subscribe%20me%20to%20drop%20alerts" style="display:inline-block;background:transparent;color:${WHITE};font-family:'Alfa Slab One',serif;font-size:18px;letter-spacing:0.04em;text-transform:uppercase;text-decoration:none;padding:20px 36px;border:4px solid ${WHITE};border-radius:14px;">Email me future drops</a>
    </div>

    <!-- Script signature -->
    <div class="mm-script" style="margin-top:40px;font-family:${SCRIPT_FONT};font-size:36px;color:${GOLD};line-height:1;">xoxo, <span style="color:${WHITE};">magamommy</span> &#x2661;</div>
    <div style="margin-top:14px;font-family:'Inter',sans-serif;font-size:12px;color:rgba(255,255,255,0.7);letter-spacing:0.16em;text-transform:uppercase;">★ Printed in Pennsylvania &nbsp;·&nbsp; Made for the suburban mom ★</div>
  </div>
</div>`,
  };

  // Bunting between marquee and hero — string of triangular pennant flags.
  const bunting = {
    id: id(),
    type: 'html-render',
    order: 0,
    html: `
<div style="background:${BLUE};padding:0;line-height:0;">
  <svg viewBox="0 0 1440 60" preserveAspectRatio="none" style="display:block;width:100%;height:60px;">
    <defs>
      <pattern id="bunting-flags" x="0" y="0" width="80" height="60" patternUnits="userSpaceOnUse">
        <path d="M0 0 L40 50 L80 0 Z" fill="${RED}" />
        <path d="M40 0 L60 25 L20 25 Z" fill="${WHITE}" opacity="0.85" />
      </pattern>
      <pattern id="bunting-flags-2" x="40" y="0" width="80" height="60" patternUnits="userSpaceOnUse">
        <path d="M0 0 L40 50 L80 0 Z" fill="${WHITE}" />
        <circle cx="40" cy="18" r="6" fill="${RED}" />
      </pattern>
    </defs>
    <path d="M0 2 Q 720 14 1440 2" stroke="${WHITE}" stroke-width="2" fill="none" opacity="0.6"/>
    <rect width="100%" height="60" fill="url(#bunting-flags)" />
  </svg>
</div>`,
  };

  // Big SVG-eagle + crossed-flags ornament — sits between the bento and the
  // timeline as a flashy section divider. All inline SVG so it scales crisp.
  const eagleDivider = {
    id: id(),
    type: 'html-render',
    order: 0,
    html: `
<div style="background:${WHITE};padding:48px 24px 32px;text-align:center;border-top:6px solid ${RED};border-bottom:6px solid ${RED};">
  <svg viewBox="0 0 320 200" style="width:200px;height:auto;display:block;margin:0 auto;">
    <!-- Crossed flags behind the eagle -->
    <g transform="translate(40 30) rotate(-18)">
      <rect x="0" y="0" width="60" height="42" fill="${BLUE}"/>
      <g fill="${WHITE}">
        <text x="6" y="14" font-family="Alfa Slab One, serif" font-size="10">★ ★</text>
        <text x="6" y="26" font-family="Alfa Slab One, serif" font-size="10">★ ★</text>
        <text x="6" y="38" font-family="Alfa Slab One, serif" font-size="10">★ ★</text>
      </g>
      <rect x="60" y="0" width="60" height="6" fill="${RED}"/>
      <rect x="60" y="12" width="60" height="6" fill="${RED}"/>
      <rect x="60" y="24" width="60" height="6" fill="${RED}"/>
      <rect x="60" y="36" width="60" height="6" fill="${RED}"/>
      <line x1="-4" y1="0" x2="-4" y2="80" stroke="${BLUE}" stroke-width="3"/>
    </g>
    <g transform="translate(280 30) rotate(18) scale(-1 1)">
      <rect x="0" y="0" width="60" height="42" fill="${BLUE}"/>
      <g fill="${WHITE}">
        <text x="6" y="14" font-family="Alfa Slab One, serif" font-size="10">★ ★</text>
        <text x="6" y="26" font-family="Alfa Slab One, serif" font-size="10">★ ★</text>
        <text x="6" y="38" font-family="Alfa Slab One, serif" font-size="10">★ ★</text>
      </g>
      <rect x="60" y="0" width="60" height="6" fill="${RED}"/>
      <rect x="60" y="12" width="60" height="6" fill="${RED}"/>
      <rect x="60" y="24" width="60" height="6" fill="${RED}"/>
      <rect x="60" y="36" width="60" height="6" fill="${RED}"/>
      <line x1="-4" y1="0" x2="-4" y2="80" stroke="${BLUE}" stroke-width="3"/>
    </g>
    <!-- Stylized eagle silhouette (folk-art style) -->
    <g transform="translate(160 120)">
      <!-- Wings spread -->
      <path d="M -90 -20 Q -60 -45 -30 -28 Q -45 -10 -90 -20 Z" fill="${BLUE}"/>
      <path d="M -85 -10 Q -55 -25 -25 -15 Q -45 5 -85 -10 Z" fill="${BLUE}" opacity="0.7"/>
      <path d="M  90 -20 Q  60 -45  30 -28 Q  45 -10  90 -20 Z" fill="${BLUE}"/>
      <path d="M  85 -10 Q  55 -25  25 -15 Q  45 5  85 -10 Z" fill="${BLUE}" opacity="0.7"/>
      <!-- Body / shield -->
      <path d="M -22 -28 L 22 -28 L 22 8 Q 0 28 -22 8 Z" fill="${WHITE}" stroke="${BLUE}" stroke-width="2"/>
      <rect x="-22" y="-28" width="44" height="10" fill="${BLUE}"/>
      <g fill="${WHITE}">
        <text x="-18" y="-20" font-family="Alfa Slab One, serif" font-size="6">★ ★ ★ ★ ★</text>
      </g>
      <rect x="-22" y="-14" width="44" height="3" fill="${RED}"/>
      <rect x="-22" y="-7" width="44" height="3" fill="${RED}"/>
      <rect x="-22" y="0" width="44" height="3" fill="${RED}"/>
      <!-- Head -->
      <circle cx="0" cy="-36" r="12" fill="${WHITE}" stroke="${BLUE}" stroke-width="2"/>
      <circle cx="3" cy="-37" r="2" fill="${BLUE}"/>
      <path d="M 10 -34 L 18 -32 L 10 -30 Z" fill="${RED}"/>
    </g>
  </svg>
  <div style="font-family:'Alfa Slab One',serif;font-size:32px;color:${BLUE};text-transform:uppercase;letter-spacing:0.02em;margin-top:8px;">★ Meet the Mama ★</div>
  <div style="font-family:'Inter',sans-serif;font-size:14px;color:${BLUE};opacity:0.7;letter-spacing:0.2em;text-transform:uppercase;margin-top:4px;">By a mama, for the mamas</div>
</div>`,
  };

  // Star-burst banner before the closing CTA — extra flash.
  const finaleBanner = {
    id: id(),
    type: 'html-render',
    order: 0,
    html: `
<div style="background:${RED};padding:40px 24px;text-align:center;border-top:6px solid ${WHITE};border-bottom:6px solid ${WHITE};">
  <div style="display:inline-flex;align-items:center;gap:24px;color:${WHITE};font-family:'Alfa Slab One',serif;text-transform:uppercase;">
    <svg viewBox="0 0 60 60" style="width:60px;height:60px;flex:0 0 auto;">
      <polygon points="30,4 36,22 56,22 40,34 46,54 30,42 14,54 20,34 4,22 24,22" fill="${WHITE}"/>
    </svg>
    <div style="font-size:36px;letter-spacing:0.02em;line-height:1;">God Bless America &middot; God Bless Mama</div>
    <svg viewBox="0 0 60 60" style="width:60px;height:60px;flex:0 0 auto;">
      <polygon points="30,4 36,22 56,22 40,34 46,54 30,42 14,54 20,34 4,22 24,22" fill="${WHITE}"/>
    </svg>
  </div>
</div>`,
  };

  return wrap([
    fontLoader,     // loads Caveat handwritten script for accent text
    marquee,
    bunting,
    hero,
    barkerBanner,
    bento,
    eagleDivider,
    brandStory,     // replaces the old "how a drop works" timeline
    metrics,        // custom html-render "Promises a mama can keep" — warm navy + gold
    faqHeader,      // ★ STEP UP & ASK ★ banner
    faqTitle,       // big slab-serif "The fine print, but louder."
    faq,
    finaleBanner,
    closing,        // custom html-render with bunting + eagle watermark + script signature
  ]);
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
      price: products.price,
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
    priceCents: latest.price,
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
