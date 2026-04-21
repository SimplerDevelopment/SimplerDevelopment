/**
 * Expire stale MCP pending changes.
 *
 * Pendings older than MCP_APPROVAL_TTL_DAYS (default 14) that are still in
 * 'pending' status get transitioned to 'expired' with an errorMessage noting
 * the TTL. Applied/rejected/failed rows are left alone.
 *
 * Invoked by a cron endpoint. Safe to run repeatedly — idempotent.
 */

import { db } from '@/lib/db';
import { mcpPendingChanges } from '@/lib/db/schema';
import { and, eq, inArray, sql } from 'drizzle-orm';

export const DEFAULT_TTL_DAYS = 14;

export function getTtlDays(): number {
  const raw = process.env.MCP_APPROVAL_TTL_DAYS;
  if (!raw) return DEFAULT_TTL_DAYS;
  const parsed = parseInt(raw, 10);
  if (Number.isNaN(parsed) || parsed < 1) return DEFAULT_TTL_DAYS;
  return parsed;
}

export interface ExpireOpts {
  /** TTL in days. Ignored if ttlSeconds is provided. */
  ttlDays?: number;
  /** TTL in seconds. Takes precedence over ttlDays — primarily for tests. */
  ttlSeconds?: number;
  /** Restrict to specific pending ids. If omitted, expires every stale row across all clients. */
  ids?: number[];
}

export async function expireStalePendings(opts: ExpireOpts = {}): Promise<{
  expiredCount: number;
  ttlDays: number;
  ttlSeconds: number;
  cutoff: string;
}> {
  const effectiveSeconds =
    opts.ttlSeconds !== undefined
      ? opts.ttlSeconds
      : (opts.ttlDays ?? getTtlDays()) * 24 * 60 * 60;

  // Use DB clock for the cutoff to avoid app↔DB clock skew.
  const cutoffExpr = sql<Date>`NOW() - (${effectiveSeconds}::int || ' seconds')::interval`;

  const conds = [
    eq(mcpPendingChanges.status, 'pending'),
    sql`${mcpPendingChanges.createdAt} < ${cutoffExpr}`,
  ];
  if (opts.ids && opts.ids.length > 0) {
    conds.push(inArray(mcpPendingChanges.id, opts.ids));
  }

  const prettyTtl =
    opts.ttlSeconds !== undefined
      ? `${opts.ttlSeconds}s`
      : `${opts.ttlDays ?? getTtlDays()} days`;

  const result = await db
    .update(mcpPendingChanges)
    .set({
      status: 'expired',
      errorMessage: `Auto-expired after ${prettyTtl} without review`,
    })
    .where(and(...conds))
    .returning({ id: mcpPendingChanges.id });

  // Also query the DB's current cutoff for reporting (keeps the report honest).
  const [cutoffRow] = await db.execute<{ cutoff: Date }>(
    sql`SELECT (NOW() - (${effectiveSeconds}::int || ' seconds')::interval) AS cutoff`,
  );
  const cutoff =
    cutoffRow?.cutoff instanceof Date
      ? cutoffRow.cutoff.toISOString()
      : new Date(cutoffRow?.cutoff ?? Date.now() - effectiveSeconds * 1000).toISOString();

  return {
    expiredCount: result.length,
    ttlDays: opts.ttlDays ?? getTtlDays(),
    ttlSeconds: effectiveSeconds,
    cutoff,
  };
}
