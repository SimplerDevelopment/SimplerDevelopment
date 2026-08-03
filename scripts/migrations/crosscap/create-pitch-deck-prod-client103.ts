/**
 * Create the CrossCap platform pitch deck on PROD under CrossCap's OWN client
 * (client_id 103), so it renders at crosscap-advisors.simplerdevelopment.com.
 *
 * Sibling of create-pitch-deck-prod.ts, which places the same deck under the
 * SimplerDevelopment client (104) for presenting from sd.com. This variant puts
 * it under the Crossover Capital Advisors tenant instead. Reuses the exact same
 * slide content from buildSlides() — only the owning client differs.
 *
 * Why raw SQL (not the ORM): prod's schema is hand-applied and lags the Drizzle
 * TS schema. This writes only the columns prod actually has.
 *
 * Invoke against the prod METRO proxy URL:
 *   DATABASE_URL="postgresql://...@metro.proxy.rlwy.net:25565/railway" \
 *     bunx tsx scripts/migrations/crosscap/create-pitch-deck-prod-client103.ts
 *
 * Idempotent: upserts the pitch_decks row by (client_id, slug).
 */

import postgres from 'postgres';
import { buildSlides } from './create-pitch-deck';

/** Validate the env-supplied prod URL and open a connection. Lives inside the
 *  run path (not module scope) so the rebrand logic stays importable for tests. */
function connect() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is required (use the prod metro public proxy URL, not the internal one).');
    process.exit(1);
  }
  if (url.includes('.railway.internal')) {
    console.error('Refusing to use an internal Railway URL — pass the public proxy URL instead.');
    process.exit(1);
  }
  const host = url.replace(/.*@([^/]+)\/.*/, '$1');
  if (!/metro\.proxy\.rlwy\.net/.test(host) && process.env.ALLOW_NON_METRO !== '1') {
    console.error(`Host "${host}" is not the metro prod proxy. Re-run with ALLOW_NON_METRO=1 to override.`);
    process.exit(1);
  }
  console.log(`Targeting: ${url.replace(/:\/\/[^@]+@/, '://***@')}`);
  return postgres(url, { max: 1, idle_timeout: 5 });
}

// CrossCap's own tenant — confirmed in scripts/migrations/crosscap/ids.json
const CLIENT_ID = 103;
const EXPECTED_WEBSITE_ID = 143;
const EXPECTED_SUBDOMAIN = 'crosscap-advisors';

const BRANDING_PROFILE_ID = 6; // Crossover Capital Brand (gold/navy, Cormorant + Plus Jakarta Sans)

const DECK_SLUG = 'platform-pitch';
const DECK_TITLE = 'SimplerDevelopment for CrossCap Advisors';
const DECK_DESC =
  'Pitch deck for Crossover Capital Advisors — positioning SimplerDevelopment as the consolidating platform (Company Brain + CRM + Booking + Content + Website) for their fragmented wealth-management stack.';

// CrossCap brand theme — gold accent on brand navy, Cormorant Garamond display /
// Plus Jakarta Sans body. Matches branding profile 6.
const theme = {
  primaryColor: '#cfa122',
  accentColor: '#cfa122',
  backgroundColor: '#0a1628',
  textColor: '#faf8f3',
  headingFont: 'Cormorant Garamond',
  bodyFont: 'Plus Jakarta Sans',
};

const DISPLAY_FONT = 'Cormorant Garamond';
const BODY_FONT = 'Plus Jakarta Sans';

// SD-blue palette → CrossCap gold/navy. Applied case-insensitively to every
// color string in styles, section backgrounds, page settings, and inline-HTML
// content (material-icons + inline style colors). rgba(...) values are left
// untouched (whites on dark stay white). Ordering is collision-free: no TO hex
// appears as a FROM, so a single pass is stable.
const COLOR_MAP: ReadonlyArray<readonly [string, string]> = [
  ['#0f1b2e', '#0a1628'], // navy bg
  ['#0a1422', '#060d18'], // navy deep
  ['#1a2940', '#17283f'], // navy mid (cards on dark)
  ['#2563eb', '#9a7817'], // primary blue → dark gold (eyebrows/icons, AA on light)
  ['#1d4ed8', '#7a5e14'], // blue deep → darker gold
  ['#dbeafe', '#f3e9cf'], // blue light → pale gold
  ['#f59e0b', '#cfa122'], // amber → signature gold (dividers/accents)
  ['#fef3c7', '#f7edd2'], // amber light → pale gold
  ['#10b981', '#cfa122'], // emerald → gold
  ['#d1fae5', '#f7edd2'], // emerald light → pale gold
  ['#f8fafc', '#faf8f3'], // cool cream → warm cream
  ['#f1f5f9', '#f3efe6'], // card soft → warm
  ['#e2e8f0', '#e7e0d2'], // card line → warm
  ['#0f172a', '#0a1628'], // dark text → brand navy
  ['#334155', '#443f37'], // body text → warm slate
  ['#64748b', '#837a68'], // muted text → warm muted
  ['#94a3b8', '#b3a88f'], // muted line → warm muted line
];

function recolor(s: string): string {
  let out = s;
  for (const [from, to] of COLOR_MAP) {
    out = out.replace(new RegExp(from.replace(/[#]/g, '\\$&'), 'gi'), to);
  }
  return out;
}

// Numbered phase badges are filled circles with text — a blind hex swap would
// put white text on gold (fails AA). Pin each badge to an accessible pairing
// while keeping a navy → dark-gold → gold visual progression.
const BADGE_OVERRIDES: Record<string, { backgroundColor: string; color: string }> = {
  'p1-badge': { backgroundColor: '#0a1628', color: '#ffffff' },
  'p2-badge': { backgroundColor: '#9a7817', color: '#ffffff' },
  'p3-badge': { backgroundColor: '#cfa122', color: '#0a1628' },
};

type AnyObj = Record<string, unknown>;

function rebrandStyle(block: AnyObj): void {
  const style = block.style as AnyObj | undefined;
  if (style) {
    for (const k of Object.keys(style)) {
      if (typeof style[k] === 'string') style[k] = recolor(style[k] as string);
    }
    // Fonts: display headings (level 1-2) → serif; everything else → body sans.
    if (style.fontFamily === 'Inter') {
      const isDisplayHeading =
        block.type === 'heading' && typeof block.level === 'number' && block.level <= 2;
      style.fontFamily = isDisplayHeading ? DISPLAY_FONT : BODY_FONT;
    }
  }
  if (typeof block.backgroundColor === 'string') block.backgroundColor = recolor(block.backgroundColor);
  if (typeof block.content === 'string') block.content = recolor(block.content);

  const override = typeof block.id === 'string' ? BADGE_OVERRIDES[block.id] : undefined;
  if (override) {
    block.style = { ...(block.style as AnyObj), ...override };
  }
}

function walkBlocks(blocks: AnyObj[] | undefined): void {
  if (!Array.isArray(blocks)) return;
  for (const block of blocks) {
    rebrandStyle(block);
    walkBlocks(block.blocks as AnyObj[] | undefined);
    const columns = block.columns as AnyObj[] | undefined;
    if (Array.isArray(columns)) {
      for (const col of columns) walkBlocks(col.blocks as AnyObj[] | undefined);
    }
  }
}

export function rebrandForCrosscap(slides: AnyObj[]): AnyObj[] {
  for (const slide of slides) {
    walkBlocks(slide.blocks as AnyObj[] | undefined);
    const ps = slide.pageSettings as AnyObj | undefined;
    if (ps) {
      for (const k of Object.keys(ps)) {
        if (typeof ps[k] === 'string') ps[k] = recolor(ps[k] as string);
      }
      if (ps.fontFamily === 'Inter') ps.fontFamily = BODY_FONT;
    }
  }
  return slides;
}

async function main() {
  const sql = connect();
  // ── verify the tenant exists before writing anything ───────────────────────
  const client = await sql`
    SELECT id, company FROM clients WHERE id = ${CLIENT_ID} LIMIT 1
  `;
  if (!client[0]) {
    throw new Error(`Client ${CLIENT_ID} not found on this DB — wrong database or unprovisioned tenant.`);
  }
  console.log(`Client ${CLIENT_ID}: ${client[0].company ?? '(no company name)'}`);

  const site = await sql`
    SELECT id, subdomain, domain, active FROM client_websites
    WHERE client_id = ${CLIENT_ID}
    ORDER BY id ASC
  `;
  if (!site.length) {
    throw new Error(`No client_websites rows for client ${CLIENT_ID}; the deck would not resolve to a public URL.`);
  }
  const primary = site.find((s) => s.subdomain === EXPECTED_SUBDOMAIN) ?? site[0];
  console.log(
    `Website: id=${primary.id} subdomain=${primary.subdomain} domain=${primary.domain ?? '—'} active=${primary.active}` +
      (primary.id !== EXPECTED_WEBSITE_ID ? `  (note: expected website id ${EXPECTED_WEBSITE_ID})` : ''),
  );

  // ── pitch_decks upsert ─────────────────────────────────────────────────────
  const slides = rebrandForCrosscap(buildSlides() as AnyObj[]);
  const slidesJson = JSON.stringify(slides);
  const themeJson = JSON.stringify(theme);

  const existingDeck = await sql`
    SELECT id FROM pitch_decks
    WHERE client_id = ${CLIENT_ID} AND slug = ${DECK_SLUG}
    LIMIT 1
  `;
  let deckId: number;
  if (existingDeck[0]) {
    deckId = existingDeck[0].id;
    await sql`
      UPDATE pitch_decks
      SET title = ${DECK_TITLE},
          description = ${DECK_DESC},
          status = 'published',
          slides = ${slidesJson}::json,
          theme = ${themeJson}::json,
          branding_profile_id = ${BRANDING_PROFILE_ID},
          format_version = 2,
          updated_at = NOW()
      WHERE id = ${deckId}
    `;
    console.log(`Updated pitch_decks row ${deckId} (${slides.length} slides).`);
  } else {
    const inserted = await sql`
      INSERT INTO pitch_decks (
        client_id, title, slug, description, status, slides, theme, branding_profile_id, format_version
      ) VALUES (
        ${CLIENT_ID}, ${DECK_TITLE}, ${DECK_SLUG}, ${DECK_DESC}, 'published',
        ${slidesJson}::json, ${themeJson}::json, ${BRANDING_PROFILE_ID}, 2
      ) RETURNING id
    `;
    deckId = inserted[0].id;
    console.log(`Created pitch_decks row ${deckId} (${slides.length} slides).`);
  }

  console.log('\n=== PROD WRITE COMPLETE ===');
  console.log(`Deck id: ${deckId}`);
  console.log(`Public URL: https://${primary.subdomain}.simplerdevelopment.com/slides/${DECK_SLUG}`);
  console.log(`Editor:     /portal/tools/pitch-decks/${deckId}`);
  await sql.end();
}

// Only auto-run when executed directly — keeps rebrandForCrosscap importable
// for the dry-run verifier without opening a DB connection.
if (process.argv[1]?.includes('create-pitch-deck-prod-client103')) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
