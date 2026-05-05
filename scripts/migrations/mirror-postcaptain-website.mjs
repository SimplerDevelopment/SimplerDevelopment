/**
 * Mirror the Post Captain website (client_id=100, website_id=144) from STAGING
 * into TARGET. LITERAL MIRROR semantics: anything tied to website_id=144 on
 * target that isn't on staging gets removed; staging's state becomes target's.
 *
 *   SOURCE_DATABASE_URL=<staging>  DATABASE_URL=<target>  bun scripts/migrations/mirror-postcaptain-website.mjs           # dry run
 *   SOURCE_DATABASE_URL=<staging>  DATABASE_URL=<target>  bun scripts/migrations/mirror-postcaptain-website.mjs --apply   # writes
 *
 * Default target if DATABASE_URL is unset: simplerdev_migrate_dryrun on localhost.
 *
 * Tables touched (verified via FK graph + count audits 2026-05-05):
 *   client_websites (UPDATE row 144 — preserves external SET NULL refs)
 *   posts           DELETE+INSERT — cascades wipe revisions, categories, tags, taxonomy_terms,
 *                                    custom_field_values, block_template_usages
 *   post_revisions  INSERT after posts (FK post_id, CASCADE on delete)
 *   media           DELETE+INSERT (NB: only DB rows — assumes shared S3 bucket
 *                                    between source and target. If buckets differ,
 *                                    the binary files must be copied separately.)
 *   site_branding   DELETE+INSERT
 *   site_navigation DELETE+INSERT
 *   post_types      DELETE+INSERT
 *   website_email_templates  DELETE+INSERT
 *
 * IDs are preserved (verified zero-collision against prod restore).
 * Sequences are bumped to MAX(id) post-insert.
 */
import postgres from 'postgres';

const APPLY = process.argv.includes('--apply');
const WEBSITE_ID = 144;
const CLIENT_ID = 100;

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

function redact(url) {
  return url.replace(/:\/\/[^@]*@/, '://[REDACTED]@');
}

const source = postgres(SOURCE_URL, { max: 1 });
const target = postgres(TARGET_URL, { max: 1 });

console.log(`source: ${redact(SOURCE_URL)}`);
console.log(`target: ${redact(TARGET_URL)}`);
console.log(`mode:   ${APPLY ? 'APPLY (commits)' : 'DRY RUN (rolls back)'}`);
console.log(`scope:  client_websites.id = ${WEBSITE_ID} (Post Captain)`);

// Tables to mirror, in INSERT order (parent → child).
// post_revisions runs after posts because of FK post_id.
// All others have no inter-FK among themselves at the website level.
const SITE_SCOPED_TABLES = [
  'post_types',
  'media',
  'site_branding',
  'site_navigation',
  'website_email_templates',
  'posts',
];

async function fetchSiteRows(db, table) {
  return await db.unsafe(`SELECT * FROM "${table}" WHERE website_id = $1 ORDER BY id`, [WEBSITE_ID]);
}

async function fetchPostRevisions(db) {
  return await db.unsafe(
    `SELECT pr.* FROM post_revisions pr
       JOIN posts p ON p.id = pr.post_id
       WHERE p.website_id = $1 ORDER BY pr.id`,
    [WEBSITE_ID],
  );
}

function buildInsertSql(table, cols) {
  const colList = cols.map((c) => `"${c}"`).join(', ');
  const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');
  return `INSERT INTO "${table}" (${colList}) OVERRIDING SYSTEM VALUE VALUES (${placeholders})`;
}

try {
  // ── Pre-flight: fetch source rows ───────────────────────────────────────
  console.log('\n--- pre-flight: fetching source rows ---');

  const sourceWebsite = await source`SELECT * FROM client_websites WHERE id = ${WEBSITE_ID}`;
  if (sourceWebsite.length !== 1) {
    console.error(`expected 1 client_websites row at id=${WEBSITE_ID}, got ${sourceWebsite.length}`);
    process.exit(1);
  }
  if (sourceWebsite[0].client_id !== CLIENT_ID) {
    console.error(`source website ${WEBSITE_ID} has client_id ${sourceWebsite[0].client_id}, expected ${CLIENT_ID}`);
    process.exit(1);
  }
  console.log(`  client_websites:        1 row (id=${WEBSITE_ID})`);

  const sourceData = {};
  for (const t of SITE_SCOPED_TABLES) {
    sourceData[t] = await fetchSiteRows(source, t);
    console.log(`  ${t.padEnd(24)}${sourceData[t].length} rows`);
  }
  sourceData.post_revisions = await fetchPostRevisions(source);
  console.log(`  post_revisions:         ${sourceData.post_revisions.length} rows (joined via posts.website_id)`);

  // ── Pre-flight: target current state ────────────────────────────────────
  console.log('\n--- pre-flight: target current state (will be overwritten) ---');
  for (const t of SITE_SCOPED_TABLES) {
    const [{ count }] = await target.unsafe(
      `SELECT count(*)::int AS count FROM "${t}" WHERE website_id = $1`,
      [WEBSITE_ID],
    );
    console.log(`  ${t.padEnd(24)}${count} rows`);
  }
  const [{ count: prRev }] = await target.unsafe(
    `SELECT count(*)::int AS count FROM post_revisions pr
       JOIN posts p ON p.id = pr.post_id WHERE p.website_id = $1`,
    [WEBSITE_ID],
  );
  console.log(`  post_revisions:         ${prRev} rows`);

  // ── Transactional mirror ────────────────────────────────────────────────
  console.log('\n--- mirror transaction ---');

  await target.begin(async (tx) => {
    // 1. Update client_websites (preserves SET NULL refs from booking_pages / gift_certificates)
    const wsCols = Object.keys(sourceWebsite[0]).filter((c) => c !== 'id');
    const wsSet = wsCols.map((c, i) => `"${c}" = $${i + 1}`).join(', ');
    const wsValues = wsCols.map((c) => sourceWebsite[0][c]);
    await tx.unsafe(
      `UPDATE client_websites SET ${wsSet} WHERE id = $${wsCols.length + 1}`,
      [...wsValues, WEBSITE_ID],
    );
    console.log(`  UPDATE client_websites WHERE id=${WEBSITE_ID}`);

    // 2. Delete all site-scoped rows (children first via CASCADE)
    //    posts CASCADE wipes post_revisions, post_categories, post_tags,
    //    post_taxonomy_terms, post_custom_field_values, block_template_usages.
    await tx.unsafe(`DELETE FROM posts WHERE website_id = $1`, [WEBSITE_ID]);
    console.log(`  DELETE FROM posts (cascades to children)`);
    for (const t of ['media', 'site_branding', 'site_navigation', 'post_types', 'website_email_templates']) {
      await tx.unsafe(`DELETE FROM "${t}" WHERE website_id = $1`, [WEBSITE_ID]);
      console.log(`  DELETE FROM ${t}`);
    }

    // 2b. Renumber any non-target-site rows whose IDs collide with the source
    //     IDs we're about to insert. URLs reference UUIDs (stored_filename),
    //     not numeric ids, so reassigning ids is safe. Bumps the sequence first
    //     to guarantee fresh ids land outside the source range.
    for (const t of SITE_SCOPED_TABLES) {
      const rows = sourceData[t];
      if (rows.length === 0) continue;
      const sourceIds = rows.map((r) => r.id).filter((id) => id != null);
      if (sourceIds.length === 0) continue;
      const maxSourceId = Math.max(...sourceIds);
      // Bump sequence past the max source id so nextval() doesn't collide.
      await tx.unsafe(
        `SELECT setval($1, GREATEST((SELECT last_value FROM "${t}_id_seq"), $2::bigint))`,
        [`${t}_id_seq`, maxSourceId],
      );
      const colliders = await tx.unsafe(
        `SELECT id FROM "${t}" WHERE id = ANY($1::int[]) AND (website_id IS DISTINCT FROM $2)`,
        [sourceIds, WEBSITE_ID],
      );
      if (colliders.length > 0) {
        for (const c of colliders) {
          await tx.unsafe(
            `UPDATE "${t}" SET id = nextval('${t}_id_seq') WHERE id = $1 AND (website_id IS DISTINCT FROM $2)`,
            [c.id, WEBSITE_ID],
          );
        }
        console.log(`  RENUMBER ${colliders.length} non-target ${t} row(s) (ids: ${colliders.map((c) => c.id).join(',')})`);
      }
    }

    // 3. Insert site-scoped rows in dependency order
    for (const t of SITE_SCOPED_TABLES) {
      const rows = sourceData[t];
      if (rows.length === 0) continue;
      const cols = Object.keys(rows[0]);
      const sql = buildInsertSql(t, cols);
      for (const r of rows) {
        await tx.unsafe(sql, cols.map((c) => r[c]));
      }
      console.log(`  INSERT ${rows.length} rows into ${t}`);
    }

    // 4. Insert post_revisions (FK post_id — must come after posts)
    if (sourceData.post_revisions.length > 0) {
      const cols = Object.keys(sourceData.post_revisions[0]);
      const sql = buildInsertSql('post_revisions', cols);
      for (const r of sourceData.post_revisions) {
        await tx.unsafe(sql, cols.map((c) => r[c]));
      }
      console.log(`  INSERT ${sourceData.post_revisions.length} rows into post_revisions`);
    }

    // 5. Bump sequences for any table where we inserted by explicit ID
    const seqTables = [...SITE_SCOPED_TABLES, 'post_revisions'];
    for (const t of seqTables) {
      // Standard pg sequence name pattern: <table>_id_seq
      await tx.unsafe(
        `SELECT setval($1, GREATEST((SELECT MAX(id) FROM "${t}"), (SELECT last_value FROM "${t}_id_seq")))`,
        [`${t}_id_seq`],
      );
    }
    console.log(`  SEQUENCE bumps applied`);

    // 6. Verify post-state row counts on target match source
    console.log('\n--- post-state verification ---');
    let mismatch = false;
    for (const t of SITE_SCOPED_TABLES) {
      const [{ count }] = await tx.unsafe(
        `SELECT count(*)::int AS count FROM "${t}" WHERE website_id = $1`,
        [WEBSITE_ID],
      );
      const expected = sourceData[t].length;
      const ok = count === expected;
      console.log(`  ${t.padEnd(24)}${count} rows  (source: ${expected}) ${ok ? 'OK' : 'MISMATCH'}`);
      if (!ok) mismatch = true;
    }
    const [{ count: prCount }] = await tx.unsafe(
      `SELECT count(*)::int AS count FROM post_revisions pr
         JOIN posts p ON p.id = pr.post_id WHERE p.website_id = $1`,
      [WEBSITE_ID],
    );
    const prOk = prCount === sourceData.post_revisions.length;
    console.log(`  post_revisions:         ${prCount} rows  (source: ${sourceData.post_revisions.length}) ${prOk ? 'OK' : 'MISMATCH'}`);
    if (!prOk) mismatch = true;

    if (mismatch) {
      throw new Error('row count mismatch — aborting');
    }

    if (!APPLY) {
      console.log('\nDRY RUN — rolling back.');
      throw new Error('__DRY_RUN_ROLLBACK__');
    }
  });

  if (APPLY) {
    console.log('\nDONE — mirror committed.');
  }
} catch (err) {
  if (err?.message === '__DRY_RUN_ROLLBACK__') {
    console.log('rolled back as expected.');
    process.exit(0);
  }
  console.error('\nFAILED:', err.message);
  if (err?.stack) console.error(err.stack);
  process.exit(1);
} finally {
  await source.end();
  await target.end();
}
