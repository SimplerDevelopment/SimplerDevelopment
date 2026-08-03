/**
 * Fix readability/contrast issues on the live CrossCap "Attorney Referral
 * Partnership" pitch deck (client 103) on the PROD metro DB.
 *
 * Two modes:
 *   (default) INSPECT — dumps the deck's slides JSON to _cc-deck-dump.json and
 *             prints theme + a contrast-suspect summary. No writes.
 *   APPLY=1   — runs fixSlides() (authored after inspection) and writes back.
 *
 * Invoke against the prod metro proxy URL:
 *   DATABASE_URL="postgresql://...@metro.proxy.rlwy.net:25565/railway" \
 *     bunx tsx scripts/migrations/crosscap/fix-attorney-deck-prod.ts
 *   # then, after the fix is authored:
 *   APPLY=1 DATABASE_URL="..." bunx tsx scripts/migrations/crosscap/fix-attorney-deck-prod.ts
 */

import postgres from 'postgres';
import { writeFileSync } from 'fs';
import { join } from 'path';

function connect() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is required (prod metro public proxy URL).');
    process.exit(1);
  }
  if (url.includes('.railway.internal')) {
    console.error('Refusing to use an internal Railway URL — pass the public proxy URL.');
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

const CLIENT_ID = 103;
const DECK_SLUG = 'crossover-capital-attorney-referral-partnership-mqfb9u06';
const DUMP_PATH = join('scripts', 'migrations', 'crosscap', '_cc-deck-dump.json');

type AnyObj = Record<string, unknown>;

// ── Fix palette ──────────────────────────────────────────────────────────────
const CARD_BG = '#0a1628';                       // navy card background (chosen direction)
const CARD_BORDER = 'rgba(207,161,34,0.22)';     // faint gold edge so cards read as intentional
const TIMELINE_NUMBER = 'rgba(207,161,34,0.6)';  // ghost numbers: 0.12 → 0.6 (visible watermark)
const GOLD_STAT = '#9a7817';                     // darker gold for large stat values on light (AA-large)
const GOLD_TEXT = '#8a6d14';                      // darker gold for small eyebrows/labels on light (AA-normal)
const GOLD_FAMILY = ['#cfa122', '#dbb440'];       // brand gold + accent gold

function isGold(c: unknown): boolean {
  return typeof c === 'string' && GOLD_FAMILY.includes(c.trim().toLowerCase());
}

/** Light vs dark background test via relative luminance. */
function isLightBg(c: unknown): boolean {
  if (typeof c !== 'string') return true; // default slide bg is white
  let r = 255, g = 255, b = 255;
  const hex = c.trim().replace('#', '');
  if (/^[0-9a-f]{6}$/i.test(hex)) { r = parseInt(hex.slice(0, 2), 16); g = parseInt(hex.slice(2, 4), 16); b = parseInt(hex.slice(4, 6), 16); }
  else if (/^[0-9a-f]{3}$/i.test(hex)) { r = parseInt(hex[0] + hex[0], 16); g = parseInt(hex[1] + hex[1], 16); b = parseInt(hex[2] + hex[2], 16); }
  else { const m = c.match(/rgba?\(([^)]+)\)/); if (m) { const p = m[1].split(',').map((x) => parseFloat(x)); [r, g, b] = p; } }
  const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return lum > 0.5;
}

/** Authored after inspecting the dump (deck 365). Returns true if anything changed. */
export function fixSlides(slides: AnyObj[]): boolean {
  let changes = 0;
  const setColor = (es: AnyObj, key: string, color: string) => {
    const cur = (es[key] ?? {}) as AnyObj;
    if (cur.color !== color) { es[key] = { ...cur, color }; changes++; }
  };

  function walk(block: AnyObj, bgLight: boolean): void {
    const es = (block.elementStyles ?? {}) as AnyObj;
    switch (block.type) {
      case 'card-grid': {
        // Give cards a navy background so the white titles / gold subtitles read.
        const card = (es.card ?? {}) as AnyObj;
        if (card.backgroundColor !== CARD_BG || card.borderColor !== CARD_BORDER) {
          es.card = { ...card, backgroundColor: CARD_BG, borderColor: CARD_BORDER };
          block.elementStyles = es;
          changes++;
        }
        break;
      }
      case 'timeline': {
        // Faint ghost numbers (default 0.12 alpha) → visible watermark.
        if (block.numberColor !== TIMELINE_NUMBER) { block.numberColor = TIMELINE_NUMBER; changes++; }
        break;
      }
      case 'stats': {
        // Big gold stat values fail AA on a light slide — darken them.
        if (bgLight && (isGold((es.statValue as AnyObj)?.color) || (es.statValue as AnyObj)?.color === undefined)) {
          setColor(es, 'statValue', GOLD_STAT);
          block.elementStyles = es;
        }
        break;
      }
      case 'text':
      case 'heading': {
        // Standalone gold eyebrows/labels on a light slide → darker gold (AA).
        const style = (block.style ?? {}) as AnyObj;
        if (bgLight && isGold(style.color)) { style.color = GOLD_TEXT; block.style = style; changes++; }
        break;
      }
    }

    // Recurse, updating background context from this block's own bg if set.
    const ownBg = block.backgroundColor ?? (block.style as AnyObj)?.backgroundColor;
    const childLight = ownBg !== undefined ? isLightBg(ownBg) : bgLight;
    for (const c of (block.blocks ?? []) as AnyObj[]) walk(c, childLight);
    for (const col of (block.columns ?? []) as AnyObj[]) for (const c of (col.blocks ?? []) as AnyObj[]) walk(c, childLight);
  }

  for (const slide of slides) {
    const ps = (slide.pageSettings ?? {}) as AnyObj;
    const slideLight = isLightBg(ps.backgroundColor);
    for (const b of (slide.blocks ?? []) as AnyObj[]) walk(b, slideLight);
  }
  console.log(`fixSlides: ${changes} edits.`);
  return changes > 0;
}

async function main() {
  const sql = connect();
  const rows = await sql`
    SELECT id, slug, status, format_version, theme, slides
    FROM pitch_decks
    WHERE client_id = ${CLIENT_ID} AND slug = ${DECK_SLUG}
    LIMIT 1
  `;
  if (!rows[0]) {
    console.error(`Deck not found: client ${CLIENT_ID}, slug ${DECK_SLUG}.`);
    await sql.end();
    process.exit(1);
  }
  const deck = rows[0];
  const slides = (deck.slides ?? []) as AnyObj[];
  console.log(`Deck id=${deck.id} status=${deck.status} fmt=${deck.format_version} slides=${slides.length}`);
  console.log('theme:', JSON.stringify(deck.theme));
  console.log('labels:', slides.map((s) => s.label).join(' | '));

  if (process.env.APPLY === '1') {
    const changed = fixSlides(slides);
    if (!changed) {
      console.log('No changes produced by fixSlides — aborting write.');
      await sql.end();
      return;
    }
    await sql`
      UPDATE pitch_decks
      SET slides = ${JSON.stringify(slides)}::json, updated_at = NOW()
      WHERE id = ${deck.id}
    `;
    console.log(`APPLIED fixes to deck ${deck.id}.`);
  } else {
    writeFileSync(DUMP_PATH, JSON.stringify(slides, null, 2));
    console.log(`\nINSPECT: wrote slides JSON to ${DUMP_PATH} (${slides.length} slides). Re-run with APPLY=1 once fixSlides is authored.`);
  }
  await sql.end();
}

// Auto-run only when executed directly — keeps fixSlides importable for the
// dry-run verifier without opening a DB connection.
// @ts-ignore - import.meta.main is provided by the Bun runtime
if (import.meta.main) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
