/**
 * Integration-API scaffold smoke test.
 * Confirms: per-worker schema, migrations applied, @/lib/db routes to that
 * schema via search_path, route handler imports + auth mock + callHandler
 * all wire together.
 *
 * If this spec is red, no other integration-api spec will work — fix this first.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));

import { auth } from '@/lib/auth';
import { callHandler } from '../../helpers/call-handler';
import { sessionForNewClientUser } from '../../helpers/session';
import { TEST_SCHEMA, getTestSql } from '../../helpers/test-db';

describe('integration-api scaffold smoke @smoke', () => {
  beforeAll(async () => {
    // Confirm the schema exists and has the users table (proves migrations ran).
    const sql = getTestSql();
    const rows = await sql<{ tablename: string }[]>`
      SELECT tablename FROM pg_tables WHERE schemaname = ${TEST_SCHEMA} AND tablename = 'users'
    `;
    expect(rows.length).toBe(1);
  });

  it('routes @/lib/db queries through the test schema (empty projects list for a new user)', async () => {
    const A = await sessionForNewClientUser('smoke');
    (auth as unknown as { mockResolvedValue: (v: unknown) => void }).mockResolvedValue(A.session);

    const route = await import('@/app/api/portal/projects/route');
    const res = await callHandler<{ success: boolean; data: unknown[] }>(
      route as unknown as Record<string, unknown>,
      'GET',
    );

    expect(res.status).toBe(200);
    expect(res.data?.success).toBe(true);
    // Wave 1 (2026-05) collapsed { agency, private } to a flat array.
    expect(Array.isArray(res.data?.data)).toBe(true);
    expect(res.data?.data).toEqual([]);
  });

  it('creating a project via POST persists in the test schema', async () => {
    const A = await sessionForNewClientUser('smoke-create');
    (auth as unknown as { mockResolvedValue: (v: unknown) => void }).mockResolvedValue(A.session);

    const route = await import('@/app/api/portal/projects/route');
    const res = await callHandler<{ success: boolean; data: { id: number; projectKey: string | null } }>(
      route as unknown as Record<string, unknown>,
      'POST',
      { body: { name: 'Smoke Test Project', description: 'hi' } },
    );

    expect(res.status).toBe(201);
    expect(res.data?.success).toBe(true);
    expect(res.data?.data.id).toBeGreaterThan(0);
    expect(res.data?.data.projectKey).toMatch(/^SMOK\d+$/); // "SMOK" prefix + id
  });
});
