import postgres from 'postgres';
const url = process.env.DATABASE_URL!;
const sql = postgres(url, { max: 1, idle_timeout: 5 });

async function main() {
  console.log(`Targeting: ${url.replace(/:\/\/[^@]+@/, '://***@')}`);

  // Normalize: lowercase, strip trailing slash, strip query string, strip fragment
  const norm = sql`
    SELECT
      regexp_replace(
        regexp_replace(
          regexp_replace(lower(source_url), '#.*$', ''),
          '\\?.*$', ''
        ),
        '/+$', ''
      )
  `;

  const dups = await sql`
    WITH norm_urls AS (
      SELECT id, title,
        regexp_replace(
          regexp_replace(
            regexp_replace(lower(source_url), '#.*$', ''),
            '\\?.*$', ''
          ),
          '/+$', ''
        ) AS norm_url
      FROM brain_notes
      WHERE client_id = 100
        AND deleted_at IS NULL
        AND pinned = false
        AND source_url IS NOT NULL
        AND source_url <> ''
    )
    SELECT COUNT(*)::int AS group_count, SUM(c - 1)::int AS extra_rows
    FROM (SELECT norm_url, COUNT(*) AS c FROM norm_urls GROUP BY norm_url HAVING COUNT(*) > 1) t
  ` as any;
  console.log(`Normalized-URL duplicate groups: ${dups[0].group_count}, extra rows: ${dups[0].extra_rows}`);

  // Top 10 to confirm pattern
  const top = await sql`
    WITH norm_urls AS (
      SELECT id, title,
        regexp_replace(
          regexp_replace(
            regexp_replace(lower(source_url), '#.*$', ''),
            '\\?.*$', ''
          ),
          '/+$', ''
        ) AS norm_url
      FROM brain_notes
      WHERE client_id = 100 AND deleted_at IS NULL AND pinned = false
        AND source_url IS NOT NULL AND source_url <> ''
    )
    SELECT norm_url, COUNT(*)::int AS c
    FROM norm_urls
    GROUP BY norm_url
    HAVING COUNT(*) > 1
    ORDER BY COUNT(*) DESC
    LIMIT 10
  `;
  console.log('\nTop 10 normalized duplicate URLs:');
  for (const r of top) console.log(`  ${r.c}× ${r.norm_url}`);

  // Title-only duplicates (same title, different urls)
  const titleDups = await sql`
    SELECT title, COUNT(*)::int AS c
    FROM brain_notes
    WHERE client_id = 100 AND deleted_at IS NULL AND pinned = false
    GROUP BY title
    HAVING COUNT(*) > 1
    ORDER BY COUNT(*) DESC
    LIMIT 10
  `;
  console.log('\nTop 10 duplicate titles:');
  for (const r of titleDups) console.log(`  ${r.c}× "${r.title.slice(0, 80)}"`);

  // Pending-deletion tag count (fixed json cast)
  const tagged = await sql`
    SELECT COUNT(*)::int AS c FROM brain_notes
    WHERE client_id = 100 AND deleted_at IS NULL
      AND tags::jsonb @> '["pending_deletion"]'::jsonb
  ` as any;
  console.log(`\nAlready tagged 'pending_deletion': ${tagged[0].c}`);

  // What sources are stubs? (gives more shape than the body-pattern check)
  const stubsBySource = await sql`
    SELECT source, COUNT(*)::int AS c
    FROM brain_notes
    WHERE client_id = 100 AND deleted_at IS NULL AND pinned = false
      AND length(coalesce(body, '')) < 500
      AND attachment_url IS NULL
    GROUP BY source ORDER BY COUNT(*) DESC
  `;
  console.log('\nStub notes by source:');
  for (const r of stubsBySource) console.log(`  ${r.c}× source=${r.source}`);

  await sql.end();
}
main().catch(async (e) => { console.error(e); await sql.end(); process.exit(1); });
