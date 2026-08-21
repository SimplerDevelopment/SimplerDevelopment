import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

/**
 * A SEPARATE read pool for handlers that fan out many independent queries in a
 * single `Promise.all`.
 *
 * Why this exists rather than just raising the shared pool
 * ───────────────────────────────────────────────────────
 * The Drizzle client in `./index.ts` is pinned to `max: 1`, and that is
 * load-bearing. Twelve modules (lib/brain/*, lib/audit/agent-action-log.ts,
 * lib/billing/activate-modules.ts) are written around it: with one connection,
 * calling `logAudit` inside a `db.transaction(...)` deadlocks DETERMINISTICALLY,
 * so the mistake surfaces on a developer's machine instead of intermittently in
 * production. Raising `max` globally would keep those workarounds correct but
 * turn a loud, reproducible failure into a rare load-dependent hang — a worse
 * trade than the latency it would buy.
 *
 * But `max: 1` also means a `Promise.all` of N queries is not parallel at all.
 * Postgres executes one query at a time per connection, so postgres.js
 * pipelining removes round-trips and nothing else: the batch runs fully serial
 * (measured — 17 queries took 875ms against an 850ms serial baseline). That is
 * what made `GET /api/portal/cards/[id]` take ~3.5s on prod, 17 queries each
 * paying a Vercel→Railway round-trip back to back (PUX-087).
 *
 * So the shared client keeps its invariant and the fan-out gets its own small
 * pool — the same move `lib/chat/realtime.ts` and `lib/pathviz/stream.ts`
 * already make when they need a connection without starving the app's only one.
 *
 * RULES — narrow on purpose
 * ─────────────────────────
 *   - READS ONLY. Writes stay on `db` so they keep the transaction semantics
 *     and audit ordering the rest of the codebase assumes.
 *   - NEVER inside a `db.transaction()` callback. This is a different
 *     connection; it cannot see the transaction's uncommitted rows.
 *   - Only for queries that are already independent and already batched.
 */

/**
 * Sized at 5. metro's `max_connections` is 500 and each warm lambda holds its
 * own pool, so 5 costs ~250 across 50 concurrent lambdas. The measured curve
 * flattens fast: 4 connections already take the 17-query batch to 278ms (3.1x)
 * where 8 reaches 159ms (5.5x), so the extra connections buy little for double
 * the footprint.
 */
export function resolveFanoutPoolMax(env: NodeJS.ProcessEnv = process.env): number {
  const override = Number(env.DB_FANOUT_POOL_MAX);
  if (override > 0) return override;
  // `next build` forks 47+ static-generation workers and none of them serve a
  // fan-out request, so never hand them extra connections. Worker env is
  // inherited (next/dist/lib/worker.js spreads ...process.env), so NEXT_PHASE
  // reaches them.
  return env.NEXT_PHASE === 'phase-production-build' ? 1 : 5;
}

let fanoutDb: ReturnType<typeof drizzle<typeof schema>> | null = null;

/**
 * Lazily-created read pool — nothing is connected until a fan-out route
 * actually runs, so importing this module costs a process nothing.
 */
export function getFanoutDb() {
  if (!fanoutDb) {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL environment variable is not set');
    }
    fanoutDb = drizzle(
      postgres(process.env.DATABASE_URL, {
        max: resolveFanoutPoolMax(),
        idle_timeout: 20,
        connect_timeout: 5,
      }),
      { schema },
    );
  }
  return fanoutDb;
}
