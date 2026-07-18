/**
 * Brain decisions — verification of the "audit-in-tx" divergence.
 *
 * Wave 2b reported that calling `logAudit` from inside a `db.transaction(...)`
 * callback deadlocks because `lib/db` is pinned to `max: 1` (the postgres-js
 * client cannot acquire a second connection while the tx holds the only one).
 * Wave 2b worked around this in `lib/brain/topics.ts` with a private
 * `txAudit(conn, …)` helper that writes through the tx handle.
 *
 * Wave 2a (decisions) took the other route:
 *   • `supersedeDecision` calls `logAudit` AFTER the transaction commits
 *     (see lib/brain/decisions.ts line 542 + the explanatory comment).
 *   • `createDecisionFromReviewItem` SKIPS its own `logAudit` when a `tx`
 *     handle is passed in (see lib/brain/decisions.ts line 337); the
 *     dispatcher in `lib/brain/review.ts` writes a single
 *     `review_item.approved` audit row through `tx.insert(brainAuditLogs)`
 *     covering both the proposal and the resulting decision id.
 *
 * Both routes coexist coherently — no deadlock is latent in 2a's code. This
 * test pins that down by:
 *   1. Driving a supersede through the route handler (the same code path the
 *      portal UI uses); the test would HANG (and time out) if `logAudit`
 *      were actually inside the tx.
 *   2. Asserting that a `brain_decision.supersede` audit row IS written, so
 *      the post-tx audit pathway is exercised and observable.
 *
 * See `.planning/brain-restructure/HANDOFF.md` (Known follow-ups, P1) for
 * the broader writeup.
 *
 * Tagged `@brain @decisions @audit-in-tx`. Lives alongside the canonical
 * decisions integration suite.
 */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));

import { auth } from '@/lib/auth';
const mockedAuth = auth as unknown as Mock;

import { callHandler } from '../../../helpers/call-handler';
import { sessionForNewClientUser, type TenantCtx } from '../../../helpers/session';
import { getTestSql, TEST_SCHEMA } from '../../../helpers/test-db';

async function seedDecision(ctx: TenantCtx): Promise<{ id: number }> {
  const sql = getTestSql();
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.brain_decisions
      (client_id, title, decision, rationale, status, reversibility, decided_at)
    VALUES (
      ${ctx.client.id},
      ${`audit-tx-v1-${Date.now()}-${Math.floor(Math.random() * 9999)}`},
      ${'use stripe'},
      ${'we already integrate it'},
      ${'accepted'},
      ${'two_way'},
      ${new Date().toISOString()}
    )
    RETURNING id
  `;
  return row;
}

describe('Brain decisions — audit-in-tx divergence is benign @brain @decisions @audit-in-tx', () => {
  let A: TenantCtx;
  beforeEach(async () => {
    A = await sessionForNewClientUser('brain-dec-audit-tx');
  });

  it('supersede does not deadlock and writes its audit row after the tx commits', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const v1 = await seedDecision(A);

    const route = await import(
      '@/app/api/portal/brain/decisions/[id]/supersede/route'
    );

    // If `logAudit` were called inside `supersedeDecision`'s
    // `db.transaction(...)` block, this call would never resolve because
    // logAudit's own INSERT can't acquire the pinned single connection.
    // Vitest's default 5-second test timeout would surface the hang as a
    // failure — wrap in Promise.race so we get a crisp diagnostic if the
    // invariant ever regresses.
    const supersedePromise = callHandler<{
      data: {
        previous: { id: number; status: string };
        current: { id: number };
      };
    }>(route as unknown as Record<string, unknown>, 'POST', {
      params: { id: String(v1.id) },
      body: {
        title: 'audit-tx-v2',
        decision: 'switch to braintree',
        rationale: 'new pricing model needs a 3DS-aware processor',
      },
    });

    const timeout = new Promise<never>((_, reject) =>
      setTimeout(
        () =>
          reject(
            new Error(
              'supersede did not resolve in 4s — possible audit-in-tx deadlock regression',
            ),
          ),
        4_000,
      ),
    );

    const res = await Promise.race([supersedePromise, timeout]);
    expect(res.status).toBe(201);
    expect(res.data?.data.previous.status).toBe('superseded');
    const newId = res.data!.data.current.id;
    expect(newId).toEqual(expect.any(Number));

    // Audit row pathway. supersedeDecision writes `brain_decision.supersede`
    // outside the transaction; that row MUST exist for the divergence to be
    // benign (otherwise we'd silently lose audit data).
    const sql = getTestSql();
    const auditRows = await sql<{ id: number; metadata: Record<string, unknown> | null }[]>`
      SELECT id, metadata FROM ${sql(TEST_SCHEMA)}.brain_audit_logs
      WHERE client_id = ${A.client.id}
        AND action = 'brain_decision.supersede'
        AND entity_id = ${v1.id}
    `;
    expect(auditRows.length).toBeGreaterThan(0);
    // The supersedeDecision helper records `newDecisionId` in metadata; we
    // assert on its presence (the exact metadata shape is part of the
    // public contract — see lib/brain/decisions.ts).
    const meta = auditRows[0].metadata ?? {};
    expect((meta as Record<string, unknown>).newDecisionId).toBe(newId);
  });
});
