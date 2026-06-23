/**
 * Session forgery + tenant fixture helpers for integration-api tests.
 *
 * `auth()` (from `@/lib/auth`) is mocked via vi.mock in each spec that needs a
 * forged session — see the example at the bottom. This file exports the builder
 * functions; spec authors wire them up per test file.
 *
 * Usage:
 *   import { vi } from 'vitest';
 *   vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));
 *   import { auth } from '@/lib/auth';
 *   import { sessionFor } from '@/tests/helpers/session';
 *
 *   (auth as any).mockResolvedValue(sessionFor({ id: 1, role: 'admin' }));
 */

export interface TestUser {
  id: number;
  role: 'admin' | 'employee' | 'editor' | 'owner' | 'viewer';
  email?: string;
  name?: string;
}

export interface TestSession {
  user: { id: string; email: string; name: string; role: string };
  expires: string;
}

export function sessionFor(user: TestUser): TestSession {
  return {
    user: {
      id: String(user.id),
      email: user.email ?? `u${user.id}@test.local`,
      name: user.name ?? `Test User ${user.id}`,
      role: user.role,
    },
    expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  };
}

/**
 * Creates a user + client + clientMembers row in the test schema and returns
 * a forged session plus a cleanup function. The caller decides when to run cleanup
 * (usually in afterEach). Requires the test DB to be prepared by setup-api.ts.
 */
export interface TenantCtx {
  session: TestSession;
  user: { id: number; email: string };
  client: { id: number; name: string };
}

import { getTestSql, TEST_SCHEMA } from './test-db';

async function createUserAndClient(role: 'admin' | 'editor', label: string): Promise<TenantCtx> {
  const sql = getTestSql();
  const email = `${label}-${Date.now()}-${Math.floor(Math.random() * 9999)}@test.local`;

  const [u] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.users (name, email, password, role, active)
    VALUES (${label}, ${email}, ${'x'}, ${role}, true)
    RETURNING id
  `;
  const [c] = await sql<{ id: number; company: string | null }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.clients (user_id, company)
    VALUES (${u.id}, ${`Client-${label}`})
    RETURNING id, company
  `;
  await sql`
    INSERT INTO ${sql(TEST_SCHEMA)}.client_members (client_id, user_id, role)
    VALUES (${c.id}, ${u.id}, 'owner')
  `;

  return {
    session: sessionFor({ id: u.id, role, email, name: label }),
    user: { id: u.id, email },
    client: { id: c.id, name: c.company ?? `Client-${label}` },
  };
}

export async function sessionForNewClientUser(label = 'client-user'): Promise<TenantCtx> {
  return createUserAndClient('editor', label);
}

export async function sessionForStaff(label = 'staff'): Promise<TenantCtx> {
  // Staff still get a client row so getPortalClient() has something to return
  return createUserAndClient('admin', label);
}

export async function twoTenants(): Promise<{ A: TenantCtx; B: TenantCtx }> {
  const [A, B] = await Promise.all([
    sessionForNewClientUser('tenant-a'),
    sessionForNewClientUser('tenant-b'),
  ]);
  return { A, B };
}
