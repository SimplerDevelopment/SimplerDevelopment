/**
 * lib/portal-auth — gatePortalRole, the role-only gate the AUTH79-020 sweep adds
 * to routes that resolve their company with raw `auth()` + `getPortalClient`.
 *
 * What must hold (ADR portal-role-matrix): the role ladder is the same one
 * authorizePortal uses; the gate is log-only by default so a wrong mapping shows
 * up as a `portal.role.insufficient` line rather than a locked-out customer; and
 * it hard-denies once AUTH_ROLE_ENFORCE=1 or when a caller opts out of observe.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

let membershipRows: Array<{ role: string }> = [];
const selectSpy = vi.fn();

vi.mock('@/lib/db', () => ({
  db: {
    select: (...args: unknown[]) => {
      selectSpy(...args);
      return { from: () => ({ where: () => ({ limit: async () => membershipRows }) }) };
    },
  },
}));
vi.mock('@/lib/db/schema', () => ({
  clients: {},
  clientMembers: { clientId: 'clientId', userId: 'userId', role: 'role' },
  clientServices: {},
  services: {},
  clientWebsites: {},
}));
vi.mock('drizzle-orm', () => ({ eq: () => ({}), and: () => ({}) }));
vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/portal-client', () => ({
  getPortalClient: vi.fn(),
  resolveClientSite: vi.fn(),
  resolvePortalSite: vi.fn(),
  getPortalRole: vi.fn(),
}));
vi.mock('@/lib/mcp-auth', () => ({ resolvePortalFromCurrentRequest: vi.fn(), hasScope: vi.fn() }));
vi.mock('@/lib/oauth/required-scope', () => ({ requiredScopeFor: vi.fn() }));
vi.mock('@/lib/feature-flags', () => ({ hasFlag: vi.fn() }));

import { gatePortalRole } from '@/lib/portal-auth';

type Client = Parameters<typeof gatePortalRole>[1];
const OWNER_ID = 99;
const MEMBER_ID = 7;
const client = { id: 12, userId: OWNER_ID } as Client;

let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  membershipRows = [];
  selectSpy.mockClear();
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  delete process.env.AUTH_ROLE_ENFORCE;
  warn.mockRestore();
});

describe('gatePortalRole', () => {
  it('lets the client owner through at every level without a membership lookup', async () => {
    expect(await gatePortalRole(OWNER_ID, client, 'owner')).toBeNull();
    expect(selectSpy).not.toHaveBeenCalled();
  });

  it('lets a member write', async () => {
    membershipRows = [{ role: 'member' }];
    expect(await gatePortalRole(MEMBER_ID, client, 'write')).toBeNull();
  });

  it('logs but allows an insufficient role by default (observe mode)', async () => {
    membershipRows = [{ role: 'viewer' }];
    expect(await gatePortalRole(MEMBER_ID, client, 'write')).toBeNull();
    const logged = JSON.parse(String(warn.mock.calls[0]?.[0]));
    expect(logged).toMatchObject({
      event: 'portal.role.insufficient',
      role: 'viewer',
      action: 'write',
      clientId: 12,
      userId: MEMBER_ID,
      enforced: false,
    });
  });

  it('denies an insufficient role with a 403 envelope once AUTH_ROLE_ENFORCE=1', async () => {
    process.env.AUTH_ROLE_ENFORCE = '1';
    membershipRows = [{ role: 'member' }];
    const res = await gatePortalRole(MEMBER_ID, client, 'admin');
    expect(res?.status).toBe(403);
    expect(await res?.json()).toMatchObject({ success: false });
  });

  it('denies immediately when the caller opts out of observe mode', async () => {
    membershipRows = [{ role: 'viewer' }];
    const res = await gatePortalRole(MEMBER_ID, client, 'write', { observe: false });
    expect(res?.status).toBe(403);
  });

  it('treats a user with no membership row as a viewer', async () => {
    process.env.AUTH_ROLE_ENFORCE = '1';
    membershipRows = [];
    expect(await gatePortalRole(MEMBER_ID, client, 'read')).toBeNull();
    expect((await gatePortalRole(MEMBER_ID, client, 'write'))?.status).toBe(403);
  });
});
