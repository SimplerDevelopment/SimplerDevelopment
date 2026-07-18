/**
 * GET /api/portal/onboarding/status — auto-detected per-domain onboarding.
 *
 * Asserts: auth gate, pre-credited first step (goal gradient — never 0%),
 * detection flipping when tenant data appears, and @tenancy isolation
 * (tenant B's data never credits tenant A's steps).
 */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));
vi.mock('next/headers', () => ({
  headers: vi.fn(async () => new Headers()),
  cookies: vi.fn(async () => ({
    get: () => undefined,
    set: () => undefined,
    has: () => false,
  })),
}));

import { auth } from '@/lib/auth';
const mockedAuth = auth as unknown as Mock;

import { callHandler } from '../../../helpers/call-handler';
import { sessionForNewClientUser, twoTenants } from '../../../helpers/session';
import { getTestSql, TEST_SCHEMA } from '../../../helpers/test-db';
import * as route from '@/app/api/portal/onboarding/status/route';

interface StatusData {
  domains: Record<string, { steps: Array<{ key: string; done: boolean; preCredited: boolean; counted: boolean }>; done: number; total: number; complete: boolean }>;
}

async function seedContact(clientId: number) {
  const sql = getTestSql();
  await sql`
    INSERT INTO ${sql(TEST_SCHEMA)}.crm_contacts (client_id, first_name, last_name, email)
    VALUES (${clientId}, 'Ada', 'Lovelace', ${`ada-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`})
  `;
}

describe('GET /api/portal/onboarding/status', () => {
  beforeEach(() => {
    mockedAuth.mockResolvedValue(null);
  });

  it('rejects unauthenticated requests', async () => {
    const res = await callHandler(route, 'GET');
    expect(res.status).toBe(401);
  });

  it('fresh tenant: every domain has a pre-credited done step — progress is never 0/N', async () => {
    const ctx = await sessionForNewClientUser('onb-fresh');
    mockedAuth.mockResolvedValue(ctx.session);

    const res = await callHandler<{ success: boolean; data: StatusData }>(route, 'GET');
    expect(res.status).toBe(200);
    const domains = res.data!.data.domains;
    expect(Object.keys(domains).length).toBeGreaterThan(0);

    for (const [key, status] of Object.entries(domains)) {
      expect(status.total, key).toBeGreaterThan(0);
      expect(status.done, `${key} must pre-credit at least one step`).toBeGreaterThanOrEqual(1);
      expect(status.steps[0].preCredited, `${key} first step pre-credited`).toBe(true);
      expect(status.steps[0].done, `${key} first step done`).toBe(true);
    }
  });

  it('detection flips a step when tenant data appears', async () => {
    const ctx = await sessionForNewClientUser('onb-detect');
    mockedAuth.mockResolvedValue(ctx.session);

    const before = await callHandler<{ success: boolean; data: StatusData }>(route, 'GET');
    const crmBefore = before.data!.data.domains.crm;
    expect(crmBefore.steps.find((s) => s.key === 'add-contacts')?.done).toBe(false);

    await seedContact(ctx.client.id);

    const after = await callHandler<{ success: boolean; data: StatusData }>(route, 'GET');
    const crmAfter = after.data!.data.domains.crm;
    expect(crmAfter.steps.find((s) => s.key === 'add-contacts')?.done).toBe(true);
    expect(crmAfter.done).toBe(crmBefore.done + 1);
  });

  it("@tenancy tenant B's data never credits tenant A", async () => {
    const { A, B } = await twoTenants();
    await seedContact(B.client.id);

    mockedAuth.mockResolvedValue(A.session);
    const res = await callHandler<{ success: boolean; data: StatusData }>(route, 'GET');
    expect(res.data!.data.domains.crm.steps.find((s) => s.key === 'add-contacts')?.done).toBe(false);

    mockedAuth.mockResolvedValue(B.session);
    const resB = await callHandler<{ success: boolean; data: StatusData }>(route, 'GET');
    expect(resB.data!.data.domains.crm.steps.find((s) => s.key === 'add-contacts')?.done).toBe(true);
  });
});
