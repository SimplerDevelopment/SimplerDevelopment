/**
 * Backfill embeddings for every supported entity type belonging to the
 * Post Captain client (id=100). Only embeds entities that don't already
 * have chunks — re-runnable without re-billing for already-embedded rows.
 *
 *   bun run scripts/migrations/postcaptain/embed-all.ts \
 *     [--types=note,meeting,company,...] [--limit=N] [--dry-run]
 *
 * Skips notes by default since the KB import already embedded them; pass
 * --types=note explicitly to re-embed.
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local', override: true });

const POST_CAPTAIN_CLIENT_ID = 100;

interface Args {
  types: string[] | null;
  limit: number | null;
  dryRun: boolean;
  /** "N/M" — process id N (1-indexed) of total M shards. Each shard processes
   *  rows where id % M = N-1. Run M instances in parallel; each gets its own
   *  DB connection so they don't fight over the max=1 pool. */
  shard: { n: number; m: number } | null;
}

function parseArgs(): Args {
  const out: Args = { types: null, limit: null, dryRun: false, shard: null };
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith('--types=')) out.types = arg.slice(8).split(',').map(s => s.trim()).filter(Boolean);
    else if (arg.startsWith('--limit=')) out.limit = parseInt(arg.slice(8), 10);
    else if (arg === '--dry-run') out.dryRun = true;
    else if (arg.startsWith('--shard=')) {
      const m = arg.slice(8).match(/^(\d+)\/(\d+)$/);
      if (m) out.shard = { n: parseInt(m[1], 10), m: parseInt(m[2], 10) };
    }
  }
  return out;
}

async function run() {
  const args = parseArgs();

  const { db } = await import('../../../lib/db');
  const { sql, eq, and } = await import('drizzle-orm');
  const {
    brainMeetings, brainTasks, brainRelationshipOverlays,
    crmCompanies, crmContacts, crmDeals,
    posts, clientWebsites,
  } = await import('../../../lib/db/schema');
  const { embedManyEntities, ALL_ENTITY_TYPES } = await import('../../../lib/brain/embeddings');
  type EntityType = typeof ALL_ENTITY_TYPES[number];

  // Default: every entity type except note (already embedded by the KB import).
  const requestedTypes = args.types
    ? args.types.filter((t): t is EntityType => (ALL_ENTITY_TYPES as readonly string[]).includes(t))
    : ALL_ENTITY_TYPES.filter(t => t !== 'note');
  const shardLabel = args.shard ? `[shard ${args.shard.n}/${args.shard.m}] ` : '';
  console.log(`${shardLabel}>> entity types: ${requestedTypes.join(', ')}`);
  console.log(`${shardLabel}>> dry-run=${args.dryRun} limit=${args.limit ?? 'all'}`);

  // Find ids per entity type. Each block needs a client-scoped query that
  // also excludes ids that already have at least one chunk in brain_embeddings.
  // Shard filter: only process ids where id % M = N-1. Lets multiple
  // instances run in parallel without stomping on each other.
  // sql.raw is safe here — args.shard comes from a strict /^\d+\/\d+$/ regex.
  function shardClause(alias: string) {
    if (!args.shard) return sql.raw('');
    return sql.raw(` AND (${alias}.id % ${args.shard.m}) = ${args.shard.n - 1}`);
  }

  async function idsToEmbed(entityType: EntityType): Promise<number[]> {
    const limit = args.limit ?? 100000;
    let rows: Array<{ id: number }> = [];
    switch (entityType) {
      case 'note': {
        const r = await db.execute<{ id: number }>(sql`
          SELECT n.id FROM brain_notes n
          LEFT JOIN brain_embeddings e ON e.entity_type='note' AND e.entity_id=n.id
          WHERE n.client_id=${POST_CAPTAIN_CLIENT_ID} AND e.id IS NULL${shardClause('n')}
          ORDER BY n.id LIMIT ${limit}
        `);
        rows = r as unknown as Array<{ id: number }>;
        break;
      }
      case 'meeting': {
        const r = await db.execute<{ id: number }>(sql`
          SELECT m.id FROM brain_meetings m
          LEFT JOIN brain_embeddings e ON e.entity_type='meeting' AND e.entity_id=m.id
          WHERE m.client_id=${POST_CAPTAIN_CLIENT_ID} AND e.id IS NULL${shardClause('m')}
          ORDER BY m.id LIMIT ${limit}
        `);
        rows = r as unknown as Array<{ id: number }>;
        break;
      }
      case 'task': {
        const r = await db.execute<{ id: number }>(sql`
          SELECT t.id FROM brain_tasks t
          LEFT JOIN brain_embeddings e ON e.entity_type='task' AND e.entity_id=t.id
          WHERE t.client_id=${POST_CAPTAIN_CLIENT_ID} AND e.id IS NULL${shardClause('t')}
          ORDER BY t.id LIMIT ${limit}
        `);
        rows = r as unknown as Array<{ id: number }>;
        break;
      }
      case 'relationship': {
        const r = await db.execute<{ id: number }>(sql`
          SELECT r.id FROM brain_relationship_overlays r
          LEFT JOIN brain_embeddings e ON e.entity_type='relationship' AND e.entity_id=r.id
          WHERE r.client_id=${POST_CAPTAIN_CLIENT_ID} AND e.id IS NULL${shardClause('r')}
          ORDER BY r.id LIMIT ${limit}
        `);
        rows = r as unknown as Array<{ id: number }>;
        break;
      }
      case 'company': {
        const r = await db.execute<{ id: number }>(sql`
          SELECT c.id FROM crm_companies c
          LEFT JOIN brain_embeddings e ON e.entity_type='company' AND e.entity_id=c.id
          WHERE c.client_id=${POST_CAPTAIN_CLIENT_ID} AND e.id IS NULL${shardClause('c')}
          ORDER BY c.id LIMIT ${limit}
        `);
        rows = r as unknown as Array<{ id: number }>;
        break;
      }
      case 'contact': {
        const r = await db.execute<{ id: number }>(sql`
          SELECT c.id FROM crm_contacts c
          LEFT JOIN brain_embeddings e ON e.entity_type='contact' AND e.entity_id=c.id
          WHERE c.client_id=${POST_CAPTAIN_CLIENT_ID} AND e.id IS NULL${shardClause('c')}
          ORDER BY c.id LIMIT ${limit}
        `);
        rows = r as unknown as Array<{ id: number }>;
        break;
      }
      case 'deal': {
        const r = await db.execute<{ id: number }>(sql`
          SELECT d.id FROM crm_deals d
          LEFT JOIN brain_embeddings e ON e.entity_type='deal' AND e.entity_id=d.id
          WHERE d.client_id=${POST_CAPTAIN_CLIENT_ID} AND e.id IS NULL${shardClause('d')}
          ORDER BY d.id LIMIT ${limit}
        `);
        rows = r as unknown as Array<{ id: number }>;
        break;
      }
      case 'post': {
        // Posts are scoped via website_id -> client_websites.client_id.
        const r = await db.execute<{ id: number }>(sql`
          SELECT p.id FROM posts p
          JOIN client_websites w ON w.id = p.website_id AND w.client_id = ${POST_CAPTAIN_CLIENT_ID}
          LEFT JOIN brain_embeddings e ON e.entity_type='post' AND e.entity_id=p.id
          WHERE e.id IS NULL${shardClause('p')}
          ORDER BY p.id LIMIT ${limit}
        `);
        rows = r as unknown as Array<{ id: number }>;
        break;
      }
    }
    return rows.map(r => r.id);
  }

  // Batch size for OpenAI embeddings request — embedManyEntities flattens
  // all entities' chunks into one request. OpenAI accepts up to 2048
  // inputs per call; we chunk at 100 to keep request bodies sane and to
  // make per-batch retries cheap. This is the big perf win — short-content
  // entities (contacts, deals) go from 1 round-trip per entity (~1.5s) to
  // 100 entities per round-trip (~1.5s for the whole batch).
  const BATCH = 100;

  const summary: Record<string, { count: number; succeeded: number; failed: number; chunks: number; tokens: number }> = {};
  for (const t of requestedTypes) {
    const ids = await idsToEmbed(t);
    summary[t] = { count: ids.length, succeeded: 0, failed: 0, chunks: 0, tokens: 0 };
    console.log(`${shardLabel}>> ${t}: ${ids.length} to embed`);
    if (args.dryRun || ids.length === 0) continue;

    let processed = 0;
    let lastReport = Date.now();

    for (let i = 0; i < ids.length; i += BATCH) {
      const slice = ids.slice(i, i + BATCH);
      try {
        const r = await embedManyEntities({
          clientId: POST_CAPTAIN_CLIENT_ID,
          entityType: t,
          entityIds: slice,
        });
        summary[t].succeeded += r.entities + r.skipped;
        summary[t].chunks += r.chunks;
        summary[t].tokens += r.tokens;
      } catch (err) {
        summary[t].failed += slice.length;
        console.error(`     ! ${t} batch ${i}: ${err instanceof Error ? err.message : err}`);
      }
      processed += slice.length;
      if (Date.now() - lastReport > 5000 || i + BATCH >= ids.length) {
        console.log(`${shardLabel}     ${processed}/${ids.length} (${summary[t].chunks} chunks, ${summary[t].tokens.toLocaleString()} tokens)`);
        lastReport = Date.now();
      }
    }
  }

  console.log('\n>> backfill summary');
  let grandTokens = 0;
  for (const [t, s] of Object.entries(summary)) {
    console.log(`     ${t.padEnd(15)} ${s.succeeded}/${s.count} ok, ${s.failed} failed, ${s.chunks} chunks, ${s.tokens.toLocaleString()} tokens`);
    grandTokens += s.tokens;
  }
  console.log(`     ${'TOTAL'.padEnd(15)} ${grandTokens.toLocaleString()} tokens (~$${(grandTokens / 1_000_000 * 0.02).toFixed(3)})`);
  process.exit(0);
}

run().catch(err => { console.error(err); process.exit(1); });
