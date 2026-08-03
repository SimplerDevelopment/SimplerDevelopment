/**
 * Replace pitch deck 365 (CrossCap, client 103) content with the SimplerDevelopment
 * capabilities pitch — "An Agentic OS for Crossover Capital" — an agentic dashboard
 * build followed by a fractional-CTO retainer. Keeps the same deck row, slug, and
 * CrossCap gold/navy theme; swaps title/description/slides and republishes.
 *
 * Invoke against the prod metro proxy URL:
 *   DATABASE_URL="postgresql://...@metro.proxy.rlwy.net:25565/railway" \
 *     bun scripts/migrations/crosscap/replace-deck-365-agentic.ts
 */

import postgres from 'postgres';
import { buildAgenticSlides } from './agentic-os-slides';
import { platformSlide, byokSlide } from './extra-slides';

// Compliance slide now focuses on the regulated stack; BYO-LLM moves to the
// dedicated "Your Data, Your Keys" slide. Repurpose that one line to avoid
// overlap between the two trust slides.
const CONTENT_SWAPS: Record<string, string> = {
  'Bring-your-own-LLM option for strict mandates.': 'Your data is never used to train any model.',
};

function insertAfter(arr: any[], label: string, slide: any): void {
  const i = arr.findIndex((s) => s.label === label);
  if (i < 0) throw new Error(`Could not find slide labeled "${label}" to insert after.`);
  arr.splice(i + 1, 0, slide);
}

const DECK_ID = 365;
const CLIENT_ID = 103;
const TITLE = 'An Agentic OS for Crossover Capital';
const DESC =
  'SimplerDevelopment capabilities pitch for Crossover Capital Advisors — an agentic dashboard build followed by a fractional-CTO retainer, built on the foundation already live in their portal.';

function connect() {
  const url = process.env.DATABASE_URL;
  if (!url) { console.error('DATABASE_URL is required (prod metro public proxy URL).'); process.exit(1); }
  if (url.includes('.railway.internal')) { console.error('Refusing internal Railway URL — use the public proxy.'); process.exit(1); }
  const host = url.replace(/.*@([^/]+)\/.*/, '$1');
  if (!/metro\.proxy\.rlwy\.net/.test(host) && process.env.ALLOW_NON_METRO !== '1') {
    console.error(`Host "${host}" is not the metro prod proxy. Set ALLOW_NON_METRO=1 to override.`); process.exit(1);
  }
  console.log(`Targeting: ${url.replace(/:\/\/[^@]+@/, '://***@')}`);
  return postgres(url, { max: 1, idle_timeout: 5 });
}

// DividerBlockRender ignores block.style (renders a bare <hr>), so our intended
// short gold accent line renders as an empty box. Strip divider blocks — the
// eyebrow→heading→body hierarchy reads cleanly without them (as deck 365 did).
function stripDividers(blocks: any[]): any[] {
  if (!Array.isArray(blocks)) return blocks;
  return blocks
    .filter((b) => b?.type !== 'divider')
    .map((b) => {
      if (Array.isArray(b.blocks)) b.blocks = stripDividers(b.blocks);
      if (Array.isArray(b.columns)) b.columns = b.columns.map((c: any) => ({ ...c, blocks: stripDividers(c.blocks) }));
      return b;
    });
}

// HeadingBlockRender only uses innerHTML when content contains a '<' tag;
// otherwise it renders plain text, so HTML entities (&rsquo; etc.) show
// literally. Decode entities to literal Unicode everywhere so headings, text,
// and composite blocks all render correctly. Real markup (<br/>, <span>) is
// untouched since it isn't an entity.
const ENTITIES: Record<string, string> = {
  '&rsquo;': '’', '&lsquo;': '‘', '&ldquo;': '“', '&rdquo;': '”',
  '&mdash;': '—', '&ndash;': '–', '&middot;': '·', '&times;': '×',
  '&hellip;': '…', '&deg;': '°', '&nbsp;': ' ', '&amp;': '&',
};
function decodeStr(s: string): string {
  if (CONTENT_SWAPS[s]) return CONTENT_SWAPS[s];
  let out = s;
  for (const [ent, ch] of Object.entries(ENTITIES)) out = out.split(ent).join(ch); // &amp; last
  return out;
}
function decodeDeep(v: any): any {
  if (typeof v === 'string') return decodeStr(v);
  if (Array.isArray(v)) return v.map(decodeDeep);
  if (v && typeof v === 'object') { for (const k of Object.keys(v)) v[k] = decodeDeep(v[k]); return v; }
  return v;
}

async function main() {
  const sql = connect();
  const base = buildAgenticSlides();
  insertAfter(base, 'The Vision', platformSlide());   // → tools breadth before The Build
  insertAfter(base, 'Compliance', byokSlide());        // → BYOK / data sovereignty after Compliance
  const slides = decodeDeep(base.map((s: any) => ({ ...s, blocks: stripDividers(s.blocks) })));
  const slidesJson = JSON.stringify(slides);
  console.log(`Assembled ${slides.length} slides: ${slides.map((s: any) => s.label).join(' | ')}`);

  const before = await sql`SELECT id, slug, title, status FROM pitch_decks WHERE id = ${DECK_ID} AND client_id = ${CLIENT_ID} LIMIT 1`;
  if (!before[0]) { console.error(`Deck ${DECK_ID} (client ${CLIENT_ID}) not found.`); await sql.end(); process.exit(1); }
  console.log(`Before: #${before[0].id} [${before[0].status}] "${before[0].title}" slug=${before[0].slug}`);

  await sql`
    UPDATE pitch_decks
    SET title = ${TITLE},
        description = ${DESC},
        slides = ${slidesJson}::json,
        status = 'published',
        format_version = 2,
        updated_at = NOW()
    WHERE id = ${DECK_ID} AND client_id = ${CLIENT_ID}
  `;
  console.log(`\n=== REPLACED deck ${DECK_ID} with ${slides.length} slides ("${TITLE}") ===`);
  console.log(`Public URL: https://crosscap-advisors.simplerdevelopment.com/slides/${before[0].slug}`);
  await sql.end();
}

main().catch(async (e) => { console.error(e); process.exit(1); });
