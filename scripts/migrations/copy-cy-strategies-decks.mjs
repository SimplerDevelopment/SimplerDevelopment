/**
 * Copy CY Strategies (client_id=98) pitch decks 271 + 347 from STAGING into
 * TARGET, preserving IDs. Additive — does not touch other prod decks.
 *
 *   SOURCE_DATABASE_URL=<staging>  DATABASE_URL=<target>  bun scripts/migrations/copy-cy-strategies-decks.mjs           # dry run
 *   SOURCE_DATABASE_URL=<staging>  DATABASE_URL=<target>  bun scripts/migrations/copy-cy-strategies-decks.mjs --apply   # writes
 *
 * Default target if DATABASE_URL is unset: simplerdev_migrate_dryrun on localhost.
 */
import postgres from 'postgres';

const APPLY = process.argv.includes('--apply');
const DECK_IDS = [271, 347];
const CLIENT_ID = 98;

const SOURCE_URL = process.env.SOURCE_DATABASE_URL;
const TARGET_URL =
  process.env.DATABASE_URL ?? 'postgresql://dancoyle@localhost:5432/simplerdev_migrate_dryrun';

if (!SOURCE_URL) {
  console.error('SOURCE_DATABASE_URL is required (staging connection).');
  process.exit(1);
}
if (SOURCE_URL === TARGET_URL) {
  console.error('SOURCE_DATABASE_URL and DATABASE_URL point at the same DB. Aborting.');
  process.exit(1);
}

const source = postgres(SOURCE_URL, { max: 1 });
const target = postgres(TARGET_URL, { max: 1 });

function redact(url) {
  return url.replace(/:\/\/[^@]*@/, '://[REDACTED]@');
}

console.log(`source: ${redact(SOURCE_URL)}`);
console.log(`target: ${redact(TARGET_URL)}`);
console.log(`mode:   ${APPLY ? 'APPLY (commits)' : 'DRY RUN (rolls back)'}`);

try {
  // Pre-flight: source has both deck IDs
  const sourceRows = await source`
    SELECT * FROM pitch_decks
    WHERE id = ANY(${DECK_IDS}) AND client_id = ${CLIENT_ID}
    ORDER BY id
  `;
  if (sourceRows.length !== DECK_IDS.length) {
    console.error(
      `expected ${DECK_IDS.length} source rows, found ${sourceRows.length}. ids found: ${sourceRows.map((r) => r.id).join(',')}`,
    );
    process.exit(1);
  }
  console.log(
    `\nsource decks:\n${sourceRows.map((r) => `  ${r.id}  ${r.title}`).join('\n')}`,
  );

  // Pre-flight: target must NOT already have these IDs
  const targetCollisions = await target`
    SELECT id, client_id, title FROM pitch_decks WHERE id = ANY(${DECK_IDS})
  `;
  if (targetCollisions.length > 0) {
    console.error(
      `\ntarget already has rows at ${DECK_IDS}: ${targetCollisions.map((r) => `id=${r.id} client=${r.client_id} title=${r.title}`).join('; ')}`,
    );
    console.error('Aborting — manual reconciliation needed.');
    process.exit(1);
  }

  // Discover column list once — both DBs should have same schema
  const cols = Object.keys(sourceRows[0]);
  console.log(`\ncolumns to copy: ${cols.length}`);

  await target.begin(async (tx) => {
    for (const row of sourceRows) {
      const values = cols.map((c) => row[c]);
      // Use OVERRIDING SYSTEM VALUE so we can specify id explicitly.
      const colList = cols.map((c) => `"${c}"`).join(', ');
      const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');
      await tx.unsafe(
        `INSERT INTO pitch_decks (${colList}) OVERRIDING SYSTEM VALUE VALUES (${placeholders})`,
        values,
      );
      console.log(`  inserted deck ${row.id}: ${row.title}`);
    }

    // Bump sequence so future auto-increments don't collide
    const maxId = Math.max(...DECK_IDS);
    await tx`SELECT setval('pitch_decks_id_seq', GREATEST((SELECT MAX(id) FROM pitch_decks), ${maxId}))`;

    // Verification
    const post = await tx`
      SELECT id, client_id, title FROM pitch_decks
      WHERE id = ANY(${DECK_IDS})
      ORDER BY id
    `;
    console.log('\npost-insert state in target:');
    for (const r of post) console.log(`  ${r.id}  client=${r.client_id}  ${r.title}`);

    if (post.length !== DECK_IDS.length) {
      throw new Error(`post-insert count mismatch: ${post.length} vs expected ${DECK_IDS.length}`);
    }

    if (!APPLY) {
      console.log('\nDRY RUN — rolling back.');
      throw new Error('__DRY_RUN_ROLLBACK__');
    }
  });

  if (APPLY) {
    console.log('\nDONE — decks committed.');
  }
} catch (err) {
  if (err?.message === '__DRY_RUN_ROLLBACK__') {
    console.log('rolled back as expected.');
    process.exit(0);
  }
  console.error('\nFAILED:', err.message);
  process.exit(1);
} finally {
  await source.end();
  await target.end();
}
