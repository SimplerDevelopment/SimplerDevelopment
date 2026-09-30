/**
 * AUTH79-020 pilot — cards/** and integrations/** call gatePortalRole at the level the role matrix
 * assigns, and a denial from the gate is what the route returns (before it touches the DB).
 *
 * The gate itself (role ladder, log-only default) is tested in portal-auth-gate-portal-role.test.ts;
 * this file proves the ROUTES are wired to it. Revert the gate call in any route below and its row
 * fails: the handler would run on, reach the db proxy, and throw instead of returning the denial.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { assertMockUsed } from '../helpers/assertMockUsed';

const CLIENT = { id: 12, userId: 99 };
const DENIED = new Response(JSON.stringify({ success: false, message: 'Permission denied' }), { status: 403 });

const h = vi.hoisted(() => ({
  session: { user: { id: '7', role: 'client' } } as { user: { id: string; role: string } } | null,
  gate: vi.fn(),
  dbReached: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ auth: async () => h.session }));
vi.mock('@/lib/portal-client', () => ({ getPortalClient: vi.fn(async () => CLIENT) }));
vi.mock('@/lib/portal-auth', () => ({ gatePortalRole: (...a: unknown[]) => h.gate(...a) }));
vi.mock('@/lib/portal', () => ({ isPortalStaff: vi.fn(async () => false) }));
vi.mock('@/lib/portal/project-access', () => ({ canUserEditProject: vi.fn(async () => true) }));
vi.mock('@/lib/pm-activity', () => ({ logCardActivity: vi.fn() }));
vi.mock('@/lib/kanban/events', () => ({ publishBoardChanged: vi.fn(), publishBoardChangedForCard: vi.fn() }));
vi.mock('@/lib/billing/entitlements', () => ({ getClientEntitlements: vi.fn() }));
vi.mock('@/lib/google/tenant-credentials', () => ({ getTenantWorkspaceCredentialsByClientId: vi.fn() }));

// A drizzle-ish chain: every method returns the chain, awaiting it yields one card/project-shaped row.
// Anything the route does AFTER a denial would go through `.insert/.update/.delete`, which record a hit.
vi.mock('@/lib/db', () => {
  const row = { id: 1, projectId: 5, clientId: 12 };
  const chain: Record<string, unknown> = {};
  const self = new Proxy(chain, {
    get: (_t, prop) => {
      if (prop === 'then') return (res: (v: unknown) => void) => res([row]);
      return () => self;
    },
  });
  const db = {
    select: () => self,
    insert: () => {
      h.dbReached('insert');
      return self;
    },
    update: () => {
      h.dbReached('update');
      return self;
    },
    delete: () => {
      h.dbReached('delete');
      return self;
    },
  };
  return { db, getFanoutDb: () => db };
});

const ctx = (extra: Record<string, string> = {}) => ({ params: Promise.resolve({ id: '1', ...extra }) });
const json = (url: string, method: string, body: unknown = {}) =>
  new Request(`http://localhost${url}`, {
    method,
    ...(method === 'GET' ? {} : { body: JSON.stringify(body) }),
    headers: { 'content-type': 'application/json' },
  });

type Row = { name: string; action: 'read' | 'write' | 'admin'; call: () => Promise<Response> };

const rows: Row[] = [
  // integrations/api-keys — credentials: every handler, including the listing, is admin
  { name: 'api-keys GET', action: 'admin', call: async () => (await import('@/app/api/portal/integrations/api-keys/route')).GET() },
  { name: 'api-keys POST', action: 'admin', call: async () => (await import('@/app/api/portal/integrations/api-keys/route')).POST(json('/x', 'POST', { provider: 'resend', apiKey: 'x'.repeat(12) })) },
  { name: 'api-keys/[id] PATCH', action: 'admin', call: async () => (await import('@/app/api/portal/integrations/api-keys/[id]/route')).PATCH(json('/x', 'PATCH', { label: 'a' }), ctx()) },
  { name: 'api-keys/[id] DELETE', action: 'admin', call: async () => (await import('@/app/api/portal/integrations/api-keys/[id]/route')).DELETE(json('/x', 'DELETE'), ctx()) },
  // integrations/{google,microsoft,linkedin}: connect + disconnect admin, status read
  { name: 'google connect GET', action: 'admin', call: async () => (await import('@/app/api/portal/integrations/google/connect/route')).GET(json('/x', 'GET') as never) },
  { name: 'google disconnect POST', action: 'admin', call: async () => (await import('@/app/api/portal/integrations/google/disconnect/route')).POST() },
  { name: 'google status GET', action: 'read', call: async () => (await import('@/app/api/portal/integrations/google/status/route')).GET() },
  { name: 'microsoft connect GET', action: 'admin', call: async () => (await import('@/app/api/portal/integrations/microsoft/connect/route')).GET(json('/x', 'GET') as never) },
  { name: 'microsoft disconnect POST', action: 'admin', call: async () => (await import('@/app/api/portal/integrations/microsoft/disconnect/route')).POST() },
  { name: 'microsoft status GET', action: 'read', call: async () => (await import('@/app/api/portal/integrations/microsoft/status/route')).GET() },
  { name: 'linkedin connect GET', action: 'admin', call: async () => (await import('@/app/api/portal/integrations/linkedin/connect/route')).GET(json('/x', 'GET') as never) },
  { name: 'linkedin disconnect POST', action: 'admin', call: async () => (await import('@/app/api/portal/integrations/linkedin/disconnect/route')).POST() },
  { name: 'linkedin status GET', action: 'read', call: async () => (await import('@/app/api/portal/integrations/linkedin/status/route')).GET() },
  // cards: reads are viewer+, every mutation member+ (helper-based routes included)
  { name: 'cards POST', action: 'write', call: async () => (await import('@/app/api/portal/cards/route')).POST(json('/x', 'POST', { columnId: 1 })) },
  { name: 'cards/[id] GET', action: 'read', call: async () => (await import('@/app/api/portal/cards/[id]/route')).GET(json('/x', 'GET'), ctx()) },
  { name: 'cards/[id] PATCH', action: 'write', call: async () => (await import('@/app/api/portal/cards/[id]/route')).PATCH(json('/x', 'PATCH', { title: 't' }), ctx()) },
  { name: 'cards/[id] DELETE', action: 'write', call: async () => (await import('@/app/api/portal/cards/[id]/route')).DELETE(json('/x', 'DELETE'), ctx()) },
  { name: 'cards/[id]/move PATCH', action: 'write', call: async () => (await import('@/app/api/portal/cards/[id]/move/route')).PATCH(json('/x', 'PATCH', { columnId: 2, order: 0 }), ctx()) },
  { name: 'cards/[id]/comments POST', action: 'write', call: async () => (await import('@/app/api/portal/cards/[id]/comments/route')).POST(json('/x', 'POST', { body: 'hi' }), ctx()) },
  { name: 'cards/[id]/assignees GET', action: 'read', call: async () => (await import('@/app/api/portal/cards/[id]/assignees/route')).GET(json('/x', 'GET'), ctx()) },
  { name: 'cards/[id]/assignees POST', action: 'write', call: async () => (await import('@/app/api/portal/cards/[id]/assignees/route')).POST(json('/x', 'POST', { userId: 3 }), ctx()) },
  { name: 'cards/[id]/labels POST', action: 'write', call: async () => (await import('@/app/api/portal/cards/[id]/labels/route')).POST(json('/x', 'POST', { labelId: 1 }), ctx()) },
  { name: 'cards/[id]/checklist GET', action: 'read', call: async () => (await import('@/app/api/portal/cards/[id]/checklist/route')).GET(json('/x', 'GET'), ctx()) },
  { name: 'cards/[id]/checklist POST', action: 'write', call: async () => (await import('@/app/api/portal/cards/[id]/checklist/route')).POST(json('/x', 'POST', { text: 'a' }), ctx()) },
  { name: 'cards/[id]/dependencies POST', action: 'write', call: async () => (await import('@/app/api/portal/cards/[id]/dependencies/route')).POST(json('/x', 'POST', { blockerCardId: 2 }), ctx()) },
  { name: 'cards/[id]/custom-fields GET', action: 'read', call: async () => (await import('@/app/api/portal/cards/[id]/custom-fields/route')).GET(json('/x', 'GET'), ctx()) },
  { name: 'cards/[id]/custom-fields PUT', action: 'write', call: async () => (await import('@/app/api/portal/cards/[id]/custom-fields/route')).PUT(json('/x', 'PUT', { values: [] }), ctx()) },
  { name: 'cards/[id]/artifacts GET', action: 'read', call: async () => (await import('@/app/api/portal/cards/[id]/artifacts/route')).GET(json('/x', 'GET'), ctx()) },
  { name: 'cards/[id]/artifacts DELETE', action: 'write', call: async () => (await import('@/app/api/portal/cards/[id]/artifacts/route')).DELETE(json('/x', 'DELETE', { artifactDbId: 1 }), ctx()) },
  { name: 'cards/[id]/artifacts/available GET', action: 'read', call: async () => (await import('@/app/api/portal/cards/[id]/artifacts/available/route')).GET(json('/x', 'GET') as never, ctx()) },
  // watching only writes the caller's own subscription, so it is deliberately read-level (role-gate: read-ok)
  { name: 'cards/[id]/watch POST', action: 'read', call: async () => (await import('@/app/api/portal/cards/[id]/watch/route')).POST(json('/x', 'POST'), ctx()) },
];

beforeEach(() => {
  h.session = { user: { id: '7', role: 'client' } };
  h.gate.mockReset();
  h.dbReached.mockReset();
});

describe('AUTH79-020 pilot: cards + integrations are role-gated per the matrix', () => {
  it.each(rows)('$name gates at "$action" and returns the gate denial without doing the work', async ({ action, call }) => {
    h.gate.mockResolvedValue(DENIED);
    const res = await call();
    assertMockUsed(h.gate, 'gatePortalRole');
    expect(h.gate).toHaveBeenCalledWith(7, CLIENT, action);
    expect(res.status).toBe(403);
    expect(h.dbReached).not.toHaveBeenCalled();
  });
});

describe('staff sessions have no company role, so the company gate is skipped for them', () => {
  it.each([
    ['cards/[id] PATCH', async () => (await import('@/app/api/portal/cards/[id]/route')).PATCH(json('/x', 'PATCH', { title: 't' }), ctx())],
    ['cards/[id]/comments POST', async () => (await import('@/app/api/portal/cards/[id]/comments/route')).POST(json('/x', 'POST', { body: 'hi' }), ctx())],
  ] as const)('%s', async (_name, call) => {
    h.session = { user: { id: '7', role: 'admin' } };
    h.gate.mockResolvedValue(DENIED);
    await call().catch(() => {}); // the rest of the handler is not under test, only that it never consulted the gate
    expect(h.gate).not.toHaveBeenCalled();
  });
});
