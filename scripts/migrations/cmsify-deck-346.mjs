/**
 * One-off: deck 346 is a single-slide html-embed deck pointing at a static
 * HTML file. Deck 347 is a CMS-ified copy of the same content (6 slides, each
 * a templated html-render block with fields/values). This script copies 347's
 * slide structure into 346 with regenerated IDs so the two decks don't share
 * block identifiers.
 *
 * Backs up 346's slides JSON before writing. Pass `--apply` to update.
 *
 *   bun scripts/migrations/cmsify-deck-346.mjs               # dry run
 *   bun scripts/migrations/cmsify-deck-346.mjs --apply       # writes
 */
import postgres from 'postgres';
import fs from 'node:fs';
import path from 'node:path';

const SOURCE_DECK_ID = 347;
const TARGET_DECK_ID = 346;
const APPLY = process.argv.includes('--apply');

const sql = postgres(process.env.DATABASE_URL, { max: 1 });
let counter = 0;
const uid = (suffix) => `block-${Date.now()}-${++counter}-${suffix || 'r'}`;
const slideUid = (i) => `slide-${Date.now()}-${i + 1}`;

const [target] = await sql`SELECT id, title, slug, slides FROM pitch_decks WHERE id = ${TARGET_DECK_ID}`;
if (!target) { console.error(`Deck ${TARGET_DECK_ID} not found`); process.exit(1); }
const [source] = await sql`SELECT id, title, slug, slides FROM pitch_decks WHERE id = ${SOURCE_DECK_ID}`;
if (!source) { console.error(`Source deck ${SOURCE_DECK_ID} not found`); process.exit(1); }

console.log(`source: id=${source.id}  title=${source.title}  slides=${source.slides.length}`);
console.log(`target: id=${target.id}  title=${target.title}  slides=${target.slides.length}`);

// Backup target before any write
const backupDir = path.join(process.cwd(), '.backups');
fs.mkdirSync(backupDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupPath = path.join(backupDir, `deck-${TARGET_DECK_ID}-slides-${stamp}.json`);
fs.writeFileSync(backupPath, JSON.stringify(target.slides, null, 2));
console.log(`\nBacked up target slides to ${backupPath}`);

// Build new slides — clone shape from source, regenerate slide.id and block.id
// so the two decks remain independent. Preserve label, blocks ordering, html,
// fields, values, loop, width, formatVersion-relevant flags, notes.
const newSlides = source.slides.map((s, i) => {
  const newBlocks = (s.blocks || []).map((b) => ({
    ...b,
    id: uid(b.type === 'html-render' ? 'hr' : b.type),
  }));
  return {
    ...s,
    id: slideUid(i),
    blocks: newBlocks,
  };
});

console.log('\nNew slide layout:');
newSlides.forEach((s, i) => {
  const block = s.blocks?.[0];
  console.log(`  slide ${i + 1}: label="${s.label}"  blocks=${s.blocks.length}  type=${block?.type}  fields=${block?.fields?.length || 0}`);
});

if (!APPLY) {
  console.log('\n[dry run] re-run with --apply to write to the database.');
  await sql.end();
  process.exit(0);
}

await sql`UPDATE pitch_decks SET slides = ${sql.json(newSlides)}, format_version = 2, updated_at = NOW() WHERE id = ${TARGET_DECK_ID}`;
console.log(`\nWrote new slides to deck ${TARGET_DECK_ID}.`);
await sql.end();
