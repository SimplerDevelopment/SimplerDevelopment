/**
 * lib/ai/portal-tools/team — invite_team_member must enforce the same rules as
 * the REST invite (app/api/portal/team/route.ts), because it runs for any member
 * who can reach the chat and the MODEL picks the role (PUX-229):
 *   - only an owner or admin may invite;
 *   - only an owner may assign `admin`;
 *   - anything off the admin/member/viewer ladder is coerced to `member`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

let selectQueue: Array<Array<Record<string, unknown>>> = [];
const inserts: Array<{ table: string; values: Record<string, unknown> }> = [];

vi.mock('drizzle-orm', () => ({ eq: () => ({}), and: () => ({}), isNull: () => ({}), or: () => ({}) }));
vi.mock('@/lib/db/schema', () => ({
  clientMembers: { __t: 'clientMembers', clientId: 'cm.clientId', userId: 'cm.userId', role: 'cm.role' },
  clients: { __t: 'clients', id: 'c.id', userId: 'c.userId' },
  users: { __t: 'users', email: 'u.email' },
  suggestedProjects: { __t: 'suggestedProjects' },
  suggestedProjectRequests: { __t: 'suggestedProjectRequests' },
}));
vi.mock('@/lib/db', () => ({
  db: {
    select: () => {
      const chain = {
        from: () => chain,
        where: () => chain,
        limit: async () => selectQueue.shift() ?? [],
      };
      return chain;
    },
    insert: (table: { __t: string }) => ({
      values: (values: Record<string, unknown>) => {
        inserts.push({ table: table.__t, values });
        return { returning: async () => [{ id: 50, ...values }] };
      },
    }),
  },
}));

import { teamHandlers } from '@/lib/ai/portal-tools/team';

const CLIENT = 12;
const OWNER = 1;
const CALLER = 7;
const invite = teamHandlers.invite_team_member;

/** Queue the handler's lookups: company owner, caller membership, invitee, invitee membership. */
function queue(callerRole: string | null, ownerId = OWNER) {
  selectQueue = [
    [{ userId: ownerId }],
    callerRole ? [{ role: callerRole }] : [],
    [{ id: 50, email: 'new@x.com' }],
    [],
  ];
}

beforeEach(() => {
  selectQueue = [];
  inserts.length = 0;
});

describe('invite_team_member (PUX-229)', () => {
  it.each([['member'], ['viewer'], [null]])('refuses a %s caller and inserts nothing', async (role) => {
    queue(role);
    const out = await invite({ name: 'Alt', email: 'alt@x.com', role: 'admin' }, CLIENT, CALLER);
    expect(out).toEqual({ error: 'Only owners and admins can invite team members.' });
    expect(inserts).toHaveLength(0);
  });

  it('lets an admin invite a member', async () => {
    queue('admin');
    const out = await invite({ name: 'New', email: 'new@x.com', role: 'member' }, CLIENT, CALLER);
    expect(out).toMatchObject({ success: true });
    expect(inserts.find((i) => i.table === 'clientMembers')?.values).toMatchObject({ role: 'member', clientId: CLIENT });
  });

  it('refuses an admin assigning admin — only owners can', async () => {
    queue('admin');
    const out = await invite({ name: 'New', email: 'new@x.com', role: 'admin' }, CLIENT, CALLER);
    expect(out).toEqual({ error: 'Only owners can assign the admin role.' });
    expect(inserts).toHaveLength(0);
  });

  it('lets the owner assign admin', async () => {
    queue(null, CALLER); // caller IS the company owner, with no member row
    const out = await invite({ name: 'New', email: 'new@x.com', role: 'admin' }, CLIENT, CALLER);
    expect(out).toMatchObject({ success: true });
    expect(inserts.find((i) => i.table === 'clientMembers')?.values).toMatchObject({ role: 'admin' });
  });

  it.each([['owner'], ['superuser'], [undefined]])('coerces off-ladder role %p to member', async (role) => {
    queue(null, CALLER);
    await invite({ name: 'New', email: 'new@x.com', role }, CLIENT, CALLER);
    expect(inserts.find((i) => i.table === 'clientMembers')?.values).toMatchObject({ role: 'member' });
  });
});
