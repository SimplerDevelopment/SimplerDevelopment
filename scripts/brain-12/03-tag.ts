/**
 * BRAIN-12 tagger — Phase 1 + Phase 2.
 *
 * Phase 1: identify title-duplicate groups, pick the canonical row using
 *   (longest body → most recent updated_at → lowest id), tag losers with
 *   `pending_deletion`.
 * Phase 2: tag all short-but-non-stub notes (<500 chars body, no attachment,
 *   not pinned, not already pending_deletion) with `short_note_review`.
 *
 * Dry-run by default — prints planned actions and counts. Pass `--apply` to
 * actually mutate the database.
 *
 * Idempotent — runs that re-tag a row that already has the tag are no-ops.
 *
 * USAGE
 *   # Dry-run (safe — read-only):
 *   DATABASE_URL="$METRO_URL" bunx tsx scripts/brain-12/03-tag.ts
 *
 *   # Apply:
 *   DATABASE_URL="$METRO_URL" bunx tsx scripts/brain-12/03-tag.ts --apply
 */

import postgres from 'postgres';

const url = process.env.DATABASE_URL;
if (!url) { console.error('DATABASE_URL not set'); process.exit(1); }
if (url.includes('.railway.internal')) { console.error('Use the public proxy URL.'); process.exit(1); }

const APPLY = process.argv.includes('--apply');
const CLIENT_ID = 100; // Post Captain Consulting
const STUB_LEN = 500;
const PENDING_TAG = 'pending_deletion';
const REVIEW_TAG = 'short_note_review';

const sql = postgres(url, { max: 1, idle_timeout: 5 });

function bold(s: string) { return `\x1b[1m${s}\x1b[0m`; }
function dim(s: string) { return `\x1b[2m${s}\x1b[0m`; }

async function main() {
  console.log(`Targeting: ${url!.replace(/:\/\/[^@]+@/, '://***@')}`);
  console.log(APPLY ? bold('MODE: --apply (writes will happen)') : dim('MODE: dry-run (no writes)'));
  console.log('');

  // ── Phase 1: title-duplicate losers ────────────────────────────────────────
  //
  // For each title with >1 non-deleted non-pinned rows on client 100:
  //   canonical = ranked by (length(body) DESC, updated_at DESC, id ASC) row 1
  //   losers    = ranks 2..N
  // Loser rows get the `pending_deletion` tag added (if not already present).
  console.log(bold('── Phase 1: Title-duplicate losers ─────────────────────────'));

  const losers = await sql`
    WITH ranked AS (
      SELECT
        id,
        title,
        length(coalesce(body, '')) AS body_len,
        updated_at,
        tags,
        ROW_NUMBER() OVER (
          PARTITION BY title
          ORDER BY length(coalesce(body, '')) DESC, updated_at DESC, id ASC
        ) AS rk,
        COUNT(*) OVER (PARTITION BY title) AS group_size
      FROM brain_notes
      WHERE client_id = ${CLIENT_ID}
        AND deleted_at IS NULL
        AND pinned = false
    )
    SELECT id, title, body_len, group_size, tags::text AS tags_text
    FROM ranked
    WHERE rk > 1
    ORDER BY title, rk
  `;
  console.log(`Title-dupe loser rows identified: ${losers.length}`);

  // How many already have the tag?
  const alreadyTagged = losers.filter((r: any) => {
    try { return (JSON.parse(r.tags_text) as string[]).includes(PENDING_TAG); }
    catch { return false; }
  });
  console.log(`  already tagged '${PENDING_TAG}': ${alreadyTagged.length}`);
  console.log(`  to be tagged this run:           ${losers.length - alreadyTagged.length}`);

  // Top 5 duplicate-title groups for visibility
  const groupSizes = new Map<string, number>();
  for (const r of losers) groupSizes.set(r.title, (groupSizes.get(r.title) ?? 0) + 1);
  const topGroups = [...groupSizes.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  console.log('  Top groups by loser count:');
  for (const [title, count] of topGroups) console.log(`    ${count + 1}× "${title.slice(0, 70)}" → ${count} losers`);

  if (APPLY) {
    const toTag = losers
      .filter((r: any) => { try { return !(JSON.parse(r.tags_text) as string[]).includes(PENDING_TAG); } catch { return true; } })
      .map((r: any) => r.id);
    if (toTag.length > 0) {
      // Use jsonb concat. Convert json column to jsonb, append the tag, convert back.
      await sql`
        UPDATE brain_notes
        SET tags = (tags::jsonb || ${JSON.stringify([PENDING_TAG])}::jsonb)::json,
            updated_at = NOW()
        WHERE id = ANY(${toTag}::int[])
      `;
      console.log(`  ${bold('TAGGED')}: ${toTag.length} rows with '${PENDING_TAG}'`);
    } else {
      console.log(`  Nothing to tag — all losers already marked.`);
    }
  } else {
    console.log(dim(`  (dry-run — would tag ${losers.length - alreadyTagged.length} rows)`));
  }

  // ── Phase 2: short-note review set ────────────────────────────────────────
  //
  // All non-deleted non-pinned rows with body < 500 chars and no attachment.
  // Exclude rows already tagged pending_deletion (they're about to be deleted
  // anyway — double-tagging just adds noise).
  console.log('');
  console.log(bold('── Phase 2: Short-note review set ──────────────────────────'));

  const stubs = await sql`
    SELECT id, title, length(coalesce(body, '')) AS body_len, tags::text AS tags_text
    FROM brain_notes
    WHERE client_id = ${CLIENT_ID}
      AND deleted_at IS NULL
      AND pinned = false
      AND length(coalesce(body, '')) < ${STUB_LEN}
      AND attachment_url IS NULL
  `;
  console.log(`Short-note rows: ${stubs.length}`);

  // Will be tagged: stubs not already tagged short_note_review AND not pending_deletion
  const toTagStubs = stubs.filter((r: any) => {
    try {
      const t = JSON.parse(r.tags_text) as string[];
      return !t.includes(REVIEW_TAG) && !t.includes(PENDING_TAG);
    } catch { return true; }
  }).map((r: any) => r.id);

  const alreadyReview = stubs.filter((r: any) => {
    try { return (JSON.parse(r.tags_text) as string[]).includes(REVIEW_TAG); } catch { return false; }
  });
  const alsoPending = stubs.filter((r: any) => {
    try { return (JSON.parse(r.tags_text) as string[]).includes(PENDING_TAG); } catch { return false; }
  });
  console.log(`  already tagged '${REVIEW_TAG}':   ${alreadyReview.length}`);
  console.log(`  also in pending_deletion (skip): ${alsoPending.length}`);
  console.log(`  to be tagged this run:           ${toTagStubs.length}`);

  if (APPLY) {
    if (toTagStubs.length > 0) {
      await sql`
        UPDATE brain_notes
        SET tags = (tags::jsonb || ${JSON.stringify([REVIEW_TAG])}::jsonb)::json,
            updated_at = NOW()
        WHERE id = ANY(${toTagStubs}::int[])
      `;
      console.log(`  ${bold('TAGGED')}: ${toTagStubs.length} rows with '${REVIEW_TAG}'`);
    } else {
      console.log(`  Nothing to tag.`);
    }
  } else {
    console.log(dim(`  (dry-run — would tag ${toTagStubs.length} rows)`));
  }

  // ── Final tallies ─────────────────────────────────────────────────────────
  console.log('');
  console.log(bold('── Final state on prod ──────────────────────────────────────'));
  const final = await sql`
    SELECT
      COUNT(*) FILTER (WHERE tags::jsonb @> ${JSON.stringify([PENDING_TAG])}::jsonb) AS pending,
      COUNT(*) FILTER (WHERE tags::jsonb @> ${JSON.stringify([REVIEW_TAG])}::jsonb)  AS review,
      COUNT(*) FILTER (WHERE deleted_at IS NULL AND pinned = false) AS active_cleanable
    FROM brain_notes
    WHERE client_id = ${CLIENT_ID}
      AND deleted_at IS NULL
  ` as any;
  console.log(`  pending_deletion: ${final[0].pending}`);
  console.log(`  short_note_review: ${final[0].review}`);
  console.log(`  total active (cleanable): ${final[0].active_cleanable}`);

  if (!APPLY) {
    console.log('');
    console.log(dim('Re-run with `--apply` to write.'));
  }

  await sql.end();
}

main().catch(async (e) => { console.error(e); await sql.end(); process.exit(1); });
