/**
 * BRAIN-12 inventory pass — READ-ONLY.
 *
 * Tally stubs, URL-duplicates, and orphan "Untitled" notes for Post Captain
 * (client 100) on prod. Pinned and already-deleted notes are excluded.
 *
 * The card describes 206 stubs / 335 duplicates from a 2026-05-07 inventory;
 * this re-runs the same shape to ground-truth before any tagging.
 */

import postgres from 'postgres';

const url = process.env.DATABASE_URL;
if (!url) { console.error('DATABASE_URL not set'); process.exit(1); }
if (url.includes('.railway.internal')) { console.error('Use the public proxy URL.'); process.exit(1); }

const sql = postgres(url, { max: 1, idle_timeout: 5 });

const STUB_LEN = 500;
const CLIENT_ID = 100; // Post Captain Consulting

async function main() {
  console.log(`Targeting: ${url.replace(/:\/\/[^@]+@/, '://***@')}`);

  const [{ count: total }] = await sql`
    SELECT COUNT(*)::int AS count FROM brain_notes
    WHERE client_id = ${CLIENT_ID} AND deleted_at IS NULL
  ` as any;
  console.log(`\nActive (non-deleted) notes for client ${CLIENT_ID}: ${total}`);

  const [{ count: pinned }] = await sql`
    SELECT COUNT(*)::int AS count FROM brain_notes
    WHERE client_id = ${CLIENT_ID} AND deleted_at IS NULL AND pinned = true
  ` as any;
  console.log(`  Pinned (safe from cleanup): ${pinned}`);

  // ── 1. STUBS ─────────────────────────────────────────────────────────────
  const stubs = await sql`
    SELECT COUNT(*)::int AS count
    FROM brain_notes
    WHERE client_id = ${CLIENT_ID}
      AND deleted_at IS NULL
      AND pinned = false
      AND length(coalesce(body, '')) < ${STUB_LEN}
      AND attachment_url IS NULL
  ` as any;
  console.log(`\n── STUBS (body < ${STUB_LEN} chars, no attachment, not pinned) ─────`);
  console.log(`  Count: ${stubs[0].count}`);

  // Common body patterns to confirm "permission denied" / placeholder shape
  const stubPatterns = await sql`
    SELECT
      COUNT(*) FILTER (WHERE body ILIKE '%permission denied%') AS perm_denied,
      COUNT(*) FILTER (WHERE body ILIKE '%couldn''t find anything%') AS not_found,
      COUNT(*) FILTER (WHERE body ILIKE '%no content%' OR body = '') AS empty_body,
      COUNT(*) FILTER (WHERE title ILIKE 'Untitled%') AS untitled,
      COUNT(*) FILTER (WHERE source_url IS NOT NULL) AS has_source_url
    FROM brain_notes
    WHERE client_id = ${CLIENT_ID}
      AND deleted_at IS NULL
      AND pinned = false
      AND length(coalesce(body, '')) < ${STUB_LEN}
      AND attachment_url IS NULL
  ` as any;
  console.log('  Pattern breakdown:', stubPatterns[0]);

  // Sample 5 stubs to eyeball
  const sampleStubs = await sql`
    SELECT id, title, length(coalesce(body, '')) AS body_len, source, source_url IS NOT NULL AS has_url
    FROM brain_notes
    WHERE client_id = ${CLIENT_ID}
      AND deleted_at IS NULL
      AND pinned = false
      AND length(coalesce(body, '')) < ${STUB_LEN}
      AND attachment_url IS NULL
    ORDER BY id
    LIMIT 5
  `;
  console.log('  Sample of 5:');
  for (const r of sampleStubs) console.log(`    id=${r.id} body_len=${r.body_len} source=${r.source} has_url=${r.has_url} title="${r.title.slice(0,80)}"`);

  // ── 2. URL DUPLICATES ────────────────────────────────────────────────────
  // Two definitions to compare:
  //   (a) duplicate notes by source_url (same URL, multiple rows)
  //   (b) duplicate notes by normalized URL (strip query string, trailing slash)
  const dupGroupsExact = await sql`
    SELECT COUNT(*)::int AS group_count, SUM(c - 1)::int AS extra_rows
    FROM (
      SELECT source_url, COUNT(*) AS c
      FROM brain_notes
      WHERE client_id = ${CLIENT_ID}
        AND deleted_at IS NULL
        AND pinned = false
        AND source_url IS NOT NULL
        AND source_url <> ''
      GROUP BY source_url
      HAVING COUNT(*) > 1
    ) t
  ` as any;
  console.log(`\n── URL DUPLICATES (exact source_url match) ──────────────────────────`);
  console.log(`  ${dupGroupsExact[0].group_count} duplicate-groups, ${dupGroupsExact[0].extra_rows} rows beyond the canonical one in each group`);

  // Top 5 dupe groups to look at
  const topDupes = await sql`
    SELECT source_url, COUNT(*)::int AS row_count
    FROM brain_notes
    WHERE client_id = ${CLIENT_ID}
      AND deleted_at IS NULL
      AND pinned = false
      AND source_url IS NOT NULL
      AND source_url <> ''
    GROUP BY source_url
    HAVING COUNT(*) > 1
    ORDER BY COUNT(*) DESC
    LIMIT 5
  `;
  console.log('  Top 5 duplicated URLs:');
  for (const r of topDupes) console.log(`    ${r.row_count}× ${r.source_url}`);

  // ── 3. ORPHAN "Untitled" / EMPTY ────────────────────────────────────────
  const orphans = await sql`
    SELECT COUNT(*)::int AS count
    FROM brain_notes
    WHERE client_id = ${CLIENT_ID}
      AND deleted_at IS NULL
      AND pinned = false
      AND (title ILIKE 'Untitled%' OR title ILIKE 'New note%' OR title = '')
      AND length(coalesce(body, '')) = 0
      AND attachment_url IS NULL
  ` as any;
  console.log(`\n── ORPHANS (Untitled + empty body + no attachment) ──────────────────`);
  console.log(`  Count: ${orphans[0].count}`);

  // ── 4. EXISTING 'pending_deletion' TAG, IF ANY ──────────────────────────
  const alreadyTagged = await sql`
    SELECT COUNT(*)::int AS count
    FROM brain_notes
    WHERE client_id = ${CLIENT_ID}
      AND deleted_at IS NULL
      AND tags @> '["pending_deletion"]'::jsonb
  ` as any;
  console.log(`\n── ALREADY TAGGED with 'pending_deletion': ${alreadyTagged[0].count}`);

  // ── 5. EMBEDDING-SPEND BASELINE ─────────────────────────────────────────
  // brain_note_embeddings exists? if so count rows we'd be retiring
  try {
    const emb = await sql`
      SELECT COUNT(*)::int AS count
      FROM brain_note_embeddings bne
      JOIN brain_notes bn ON bn.id = bne.note_id
      WHERE bn.client_id = ${CLIENT_ID}
        AND bn.deleted_at IS NULL
        AND bn.pinned = false
        AND (
          length(coalesce(bn.body, '')) < ${STUB_LEN}
          OR bn.source_url IN (
            SELECT source_url FROM brain_notes
            WHERE client_id = ${CLIENT_ID} AND deleted_at IS NULL AND source_url IS NOT NULL AND source_url <> ''
            GROUP BY source_url HAVING COUNT(*) > 1
          )
        )
    ` as any;
    console.log(`\n── EMBEDDINGS that would be retired (rough): ${emb[0].count}`);
  } catch (e: any) {
    console.log(`\n── EMBEDDINGS check skipped: ${e.message}`);
  }

  await sql.end();
}

main().catch(async (e) => { console.error(e); await sql.end(); process.exit(1); });
