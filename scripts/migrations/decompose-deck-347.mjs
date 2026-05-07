/**
 * One-off: deck 347 has 6 slides, each a single `html-render` block with all
 * content baked into a templated HTML+CSS layout. This script decomposes each
 * slide into a sequence of atomic CMS blocks so individual pieces can be moved
 * and edited in the visual editor.
 *
 * Tradeoff: the bespoke layout/colors are dropped. Content is preserved.
 *
 * Backs up `pitch_decks.slides` for id=347 to a timestamped JSON file before
 * writing. Pass `--apply` to actually update the row; default is dry-run.
 *
 *   bun scripts/migrations/decompose-deck-347.mjs              # dry run
 *   bun scripts/migrations/decompose-deck-347.mjs --apply      # writes
 */
import postgres from 'postgres';
import fs from 'node:fs';
import path from 'node:path';

const DECK_ID = 347;
const APPLY = process.argv.includes('--apply');

const sql = postgres(process.env.DATABASE_URL, { max: 1 });
let counter = 0;
const uid = (suffix) => `block-${Date.now()}-${++counter}-${suffix}`;

const heading = (content, level, opts = {}) => ({
  id: uid('h'), type: 'heading', order: 0,
  content, level, alignment: opts.alignment ?? 'center',
});
const text = (content, opts = {}) => ({
  id: uid('t'), type: 'text', order: 0,
  content, alignment: opts.alignment ?? 'center',
  ...(opts.size ? { size: opts.size } : {}),
});
const image = (url, alt, opts = {}) => ({
  id: uid('i'), type: 'image', order: 0,
  url, alt,
  alignment: opts.alignment ?? 'center',
  width: opts.width ?? 'medium',
});
const divider = () => ({
  id: uid('d'), type: 'divider', order: 0, lineStyle: 'solid',
});
const cardGrid = (cards, columns = 3) => ({
  id: uid('cg'), type: 'card-grid', order: 0,
  columns, cards,
});
const cta = (title, description, btnText, btnUrl) => ({
  id: uid('cta'), type: 'cta', order: 0,
  title,
  description,
  primaryButtonText: btnText,
  primaryButtonUrl: btnUrl,
});

const card = (title, description, icon) => ({
  id: uid('c'), title, description, ...(icon ? { icon } : {}),
});

/** Strip <p> wrappers from richtext, returning an array of paragraph strings. */
function paragraphs(richHtml) {
  if (!richHtml) return [];
  const matches = [...richHtml.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)];
  if (matches.length) return matches.map(m => m[1].replace(/<[^>]+>/g, '').trim()).filter(Boolean);
  return [richHtml.replace(/<[^>]+>/g, '').trim()].filter(Boolean);
}

function decompose(slide) {
  const v = slide.blocks?.[0]?.values ?? {};
  const blocks = [];
  switch (slide.label) {
    case 'Cover': {
      if (v.cover_logo) blocks.push(image(v.cover_logo, 'CY Strategies', { width: 'small' }));
      if (v.cover_eyebrow) blocks.push(text(v.cover_eyebrow, { size: 'sm' }));
      if (v.cover_headline) blocks.push(heading(v.cover_headline, 1));
      if (v.cover_punchline) blocks.push(heading(v.cover_punchline, 2));
      blocks.push(divider());
      if (v.cover_intro) blocks.push(text(v.cover_intro, { size: 'lg' }));
      if (v.cover_body) blocks.push(text(v.cover_body));
      for (const p of paragraphs(v.cover_about)) blocks.push(text(p));
      if (v.cover_read_time) blocks.push(text(v.cover_read_time, { size: 'sm' }));
      if (v.cover_headshot) blocks.push(image(v.cover_headshot, v.cover_headshot_alt || 'Headshot', { width: 'medium' }));
      break;
    }
    case 'How I Think': {
      if (v.think_eyebrow) blocks.push(text(v.think_eyebrow, { size: 'sm' }));
      if (v.think_headline) blocks.push(heading(v.think_headline, 1));
      if (v.think_para_1) blocks.push(text(v.think_para_1, { alignment: 'left' }));
      if (v.think_para_2) blocks.push(text(v.think_para_2, { alignment: 'left' }));
      if (v.think_quote_lead) blocks.push(heading(v.think_quote_lead, 3, { alignment: 'left' }));
      if (v.think_quote_intro) blocks.push(text(v.think_quote_intro, { alignment: 'left' }));
      if (v.think_bullet_1) blocks.push(text(`• ${v.think_bullet_1}`, { alignment: 'left' }));
      if (v.think_bullet_2) blocks.push(text(`• ${v.think_bullet_2}`, { alignment: 'left' }));
      if (v.think_bullet_3) blocks.push(text(`• ${v.think_bullet_3}`, { alignment: 'left' }));
      if (v.think_closing) blocks.push(text(v.think_closing, { alignment: 'left' }));
      break;
    }
    case 'What Good Strategy Is': {
      if (v.strategy_eyebrow) blocks.push(text(v.strategy_eyebrow, { size: 'sm' }));
      if (v.strategy_headline) blocks.push(heading(v.strategy_headline, 1));
      if (v.strategy_para_1) blocks.push(text(v.strategy_para_1, { alignment: 'left' }));
      if (v.strategy_para_2) blocks.push(text(v.strategy_para_2, { alignment: 'left' }));
      if (v.strategy_para_3) blocks.push(text(v.strategy_para_3, { alignment: 'left' }));
      break;
    }
    case 'Four Offerings': {
      if (v.offerings_eyebrow) blocks.push(text(v.offerings_eyebrow, { size: 'sm' }));
      if (v.offerings_headline) blocks.push(heading(v.offerings_headline, 1));
      const offerings = [
        ['o1', 'photo_camera'],
        ['o2', 'explore'],
        ['o3', 'flag'],
        ['o4', 'sync'],
      ];
      const cards = offerings
        .filter(([k]) => v[`${k}_title`])
        .map(([k, icon]) => card(
          `${v[`${k}_num`] || ''} — ${v[`${k}_title`]}`.replace(/^\s*—\s*/, ''),
          [v[`${k}_desc`], v[`${k}_get`]].filter(Boolean).join('\n\n'),
          icon,
        ));
      if (cards.length) blocks.push(cardGrid(cards, 2));
      break;
    }
    case 'Recent Work': {
      if (v.work_eyebrow) blocks.push(text(v.work_eyebrow, { size: 'sm' }));
      if (v.work_headline) blocks.push(heading(v.work_headline, 1));
      const cards = [];
      for (const i of [1, 2, 3]) {
        const name = v[`client${i}_name`];
        if (!name) continue;
        cards.push(card(
          name,
          [v[`client${i}_story`], v[`client${i}_proof`]].filter(Boolean).join('\n\n'),
        ));
      }
      if (cards.length) blocks.push(cardGrid(cards, 1));
      break;
    }
    case 'Whats Next': {
      if (v.cta_eyebrow) blocks.push(text(v.cta_eyebrow, { size: 'sm' }));
      if (v.cta_headline) blocks.push(heading(v.cta_headline, 1));
      if (v.cta_subhead) blocks.push(text(v.cta_subhead));
      if (v.cta1_title) blocks.push(cta(v.cta1_title, v.cta1_support, v.cta1_label || 'Start', v.cta1_url || '#'));
      if (v.cta2_title) blocks.push(cta(v.cta2_title, v.cta2_support, v.cta2_label || 'Start', v.cta2_url || '#'));
      break;
    }
    default:
      console.warn(`No decomposition rule for slide label: ${slide.label}`);
      return slide;
  }
  // Renumber order so blocks stack in the order we built them.
  blocks.forEach((b, i) => { b.order = i; });
  return { ...slide, blocks };
}

const [row] = await sql`SELECT id, slides FROM pitch_decks WHERE id = ${DECK_ID}`;
if (!row) { console.error(`Deck ${DECK_ID} not found`); process.exit(1); }

const backupDir = path.join(process.cwd(), '.backups');
fs.mkdirSync(backupDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupPath = path.join(backupDir, `deck-${DECK_ID}-slides-${stamp}.json`);
fs.writeFileSync(backupPath, JSON.stringify(row.slides, null, 2));
console.log(`Backed up original slides to ${backupPath}`);

const newSlides = row.slides.map(decompose);

console.log('\nBlock counts before → after:');
row.slides.forEach((s, i) => {
  console.log(`  slide ${i + 1} (${s.label.padEnd(24)}): ${String(s.blocks?.length ?? 0).padStart(2)} → ${String(newSlides[i].blocks.length).padStart(2)}`);
});

if (!APPLY) {
  console.log('\n[dry run] re-run with --apply to write to the database.');
  await sql.end();
  process.exit(0);
}

await sql`UPDATE pitch_decks SET slides = ${sql.json(newSlides)}, updated_at = NOW() WHERE id = ${DECK_ID}`;
console.log(`\nWrote new slides to deck ${DECK_ID}.`);
await sql.end();
