/**
 * Revert deck 271 to a single-slide html-embed pointing at a freshly uploaded
 * copy of `./CY Strategies - TF2 Qualifier v4.html` (which now has identity
 * capture + survey submission baked in). Inserts a media row so the
 * /api/media/proxy/<key> URL resolves.
 *
 *   bun scripts/migrations/revert-271-with-submit.mjs           # dry run
 *   bun scripts/migrations/revert-271-with-submit.mjs --apply   # writes
 */
import 'dotenv/config';
import { config as dotenvConfig } from 'dotenv';
dotenvConfig({ path: '.env.local', override: false });
import postgres from 'postgres';
import fs from 'node:fs';
import path from 'node:path';
import { uploadToS3 } from '../../lib/s3/upload.ts';

const DECK_ID = 271;
const APPLY = process.argv.includes('--apply');
const HTML_PATH = './CY Strategies - TF2 Qualifier v4.html';
const FILENAME = 'CY Strategies - TF2 Qualifier v4.html';

const sql = postgres(process.env.DATABASE_URL, { max: 1 });

const [deck] = await sql`SELECT id, client_id, slides FROM pitch_decks WHERE id = ${DECK_ID}`;
if (!deck) { console.error(`Deck ${DECK_ID} not found`); process.exit(1); }

// Backup current slides (the 10-slide CMS version)
const backupDir = path.join(process.cwd(), '.backups');
fs.mkdirSync(backupDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupPath = path.join(backupDir, `deck-${DECK_ID}-slides-${stamp}.json`);
fs.writeFileSync(backupPath, JSON.stringify(deck.slides, null, 2));
console.log(`Backed up current slides to ${backupPath} (was ${deck.slides.length} slide(s))`);

const html = fs.readFileSync(HTML_PATH);
console.log(`Reading ${HTML_PATH} — ${html.length} bytes`);

if (!APPLY) {
  console.log('\n[dry run] would upload HTML, insert media row, and overwrite deck 271 with one html-embed slide.');
  console.log('         re-run with --apply to perform the writes.');
  await sql.end();
  process.exit(0);
}

console.log('\nUploading to S3...');
const upload = await uploadToS3(html, FILENAME, 'text/html');
console.log(`  url: ${upload.url}`);
console.log(`  storedFilename: ${upload.storedFilename}`);
console.log(`  size: ${upload.fileSize} bytes`);

console.log('\nInserting media row...');
const [mediaRow] = await sql`
  INSERT INTO media (filename, stored_filename, mime_type, file_size, url, uploaded_by, client_id)
  VALUES (
    ${FILENAME},
    ${upload.storedFilename},
    'text/html',
    ${upload.fileSize},
    ${upload.url},
    NULL,
    ${deck.client_id}
  )
  RETURNING id, url
`;
console.log(`  media id=${mediaRow.id}  url=${mediaRow.url}`);

const ts = Date.now();
const newSlide = {
  id: `slide-${ts}`,
  label: 'CY Strategies - TF2 Qualifier v4',
  blocks: [{
    id: `block-${ts}-html`,
    type: 'html-embed',
    order: 1,
    url: upload.url,
    filename: FILENAME,
    height: '100vh',
    width: 'full',
    sandbox: 'scripts',
    iframeTitle: 'CY Strategies - TF2 Qualifier v4',
  }],
};

await sql`UPDATE pitch_decks SET slides = ${sql.json([newSlide])}, format_version = 2, updated_at = NOW() WHERE id = ${DECK_ID}`;
console.log(`\nDeck ${DECK_ID} updated to single html-embed slide pointing at ${upload.url}`);
await sql.end();
