// @vitest-environment node
/**
 * Unit tests for lib/brain/calendar.ts.
 *
 * Mocks @/lib/db, @/lib/db/schema, drizzle-orm, and ./audit, then exercises
 * the listEvents / getEvent / createEvent / updateEvent / deleteEvent CRUD
 * plus the getAgenda aggregator. Mirrors the chainable-query-builder pattern
 * from tests/unit/brain-relationships.test.ts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

interface MockState {
  brainCalendarEvents: Array<Record<string, unknown>>;
  brainTasks: Array<Record<string, unknown>>;
  brainMeetings: Array<Record<string, unknown>>;
  brainRelationshipOverlays: Array<Record<string, unknown>>;
  crmCompanies: Array<Record<string, unknown>>;
  crmDeals: Array<Record<string, unknown>>;
  auditCalls: Array<Record<string, unknown>>;
}

const state: MockState = {
  brainCalendarEvents: [],
  brainTasks: [],
  brainMeetings: [],
  brainRelationshipOverlays: [],
  crmCompanies: [],
  crmDeals: [],
  auditCalls: [],
};

vi.mock('@/lib/db/schema', () => {
  const wrap = (tableName: string) =>
    new Proxy(
      { __table: tableName },
      {
        get(_t, prop: string) {
          if (prop === '__table') return tableName;
          return { __col: prop, __table: tableName };
        },
      },
    );
  return {
    brainCalendarEvents: wrap('brainCalendarEvents'),
    brainTasks: wrap('brainTasks'),
    brainMeetings: wrap('brainMeetings'),
    brainRelationshipOverlays: wrap('brainRelationshipOverlays'),
    crmCompanies: wrap('crmCompanies'),
    crmDeals: wrap('crmDeals'),
  };
});

vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ op: 'and', args: args.filter(Boolean) }),
  asc: (a: unknown) => ({ op: 'asc', a }),
  gte: (a: unknown, b: unknown) => ({ op: 'gte', a, b }),
  lt: (a: unknown, b: unknown) => ({ op: 'lt', a, b }),
  gt: (a: unknown, b: unknown) => ({ op: 'gt', a, b }),
  isNotNull: (a: unknown) => ({ op: 'isNotNull', a }),
  inArray: (a: unknown, list: unknown[]) => ({ op: 'inArray', a, list }),
}));

vi.mock('@/lib/brain/audit', () => ({
  logAudit: vi.fn(async (args: Record<string, unknown>) => {
    state.auditCalls.push(args);
  }),
}));

function evalPredicate(filter: unknown, row: Record<string, unknown>): boolean {
  if (!filter) return true;
  if (typeof filter !== 'object') return true;
  const f = filter as { op?: string; a?: unknown; b?: unknown; list?: unknown[]; args?: unknown[] };
  switch (f.op) {
    case 'eq': {
      const col = f.a as { __col?: string } | undefined;
      if (!col?.__col) return true;
      return row[col.__col] === f.b;
    }
    case 'and':
      return (f.args ?? []).every((arg) => evalPredicate(arg, row));
    case 'gte': {
      const col = f.a as { __col?: string } | undefined;
      if (!col?.__col) return true;
      const v = row[col.__col];
      const b = f.b;
      if (v instanceof Date && b instanceof Date) return v.getTime() >= b.getTime();
      return (v as number) >= (b as number);
    }
    case 'lt': {
      const col = f.a as { __col?: string } | undefined;
      if (!col?.__col) return true;
      const v = row[col.__col];
      const b = f.b;
      if (v instanceof Date && b instanceof Date) return v.getTime() < b.getTime();
      return (v as number) < (b as number);
    }
    case 'gt': {
      const col = f.a as { __col?: string } | undefined;
      if (!col?.__col) return true;
      const v = row[col.__col];
      const b = f.b;
      if (v instanceof Date && b instanceof Date) return v.getTime() > b.getTime();
      return (v as number) > (b as number);
    }
    case 'isNotNull': {
      const col = f.a as { __col?: string } | undefined;
      if (!col?.__col) return true;
      return row[col.__col] !== null && row[col.__col] !== undefined;
    }
    case 'inArray': {
      const col = f.a as { __col?: string } | undefined;
      if (!col?.__col) return true;
      const list = (f.list ?? []) as unknown[];
      return list.includes(row[col.__col]);
    }
    default:
      return true;
  }
}

function projectRow(row: Record<string, unknown>, projection: Record<string, unknown> | null): Record<string, unknown> {
  if (!projection) return { ...row };
  const out: Record<string, unknown> = {};
  for (const [alias, ref] of Object.entries(projection)) {
    const r = ref as { __col?: string } | undefined;
    out[alias] = r?.__col ? row[r.__col] : undefined;
  }
  return out;
}

function tableArray(name: string): Array<Record<string, unknown>> {
  return (state as unknown as Record<string, Array<Record<string, unknown>>>)[name] ?? [];
}

let idCounter = 1000;
function nextId(): number {
  return idCounter++;
}

vi.mock('@/lib/db', () => {
  function buildSelect(projection: Record<string, unknown> | null) {
    let activeTable: string | null = null;
    let filter: unknown = null;
    let limit: number | null = null;
    const chain: Record<string, unknown> = {
      from(table: { __table: string }) {
        activeTable = table.__table;
        return chain;
      },
      where(arg: unknown) {
        filter = arg;
        return chain;
      },
      orderBy() {
        return chain;
      },
      limit(n: number) {
        limit = n;
        return runQuery();
      },
      then(onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) {
        return runQuery().then(onFulfilled, onRejected);
      },
    };

    function runQuery(): Promise<Array<Record<string, unknown>>> {
      if (!activeTable) return Promise.resolve([]);
      const rows = tableArray(activeTable).filter((r) => evalPredicate(filter, r));
      let out = rows.map((r) => projectRow(r, projection));
      if (limit !== null) out = out.slice(0, limit);
      return Promise.resolve(out);
    }

    return chain;
  }

  function buildInsert(table: { __table: string }) {
    return {
      values(vals: Record<string, unknown> | Record<string, unknown>[]) {
        const arr = Array.isArray(vals) ? vals : [vals];
        const inserted = arr.map((v) => {
          const row = { ...v, id: nextId(), createdAt: new Date(), updatedAt: new Date() };
          tableArray(table.__table).push(row);
          return row;
        });
        return {
          returning() {
            return Promise.resolve(inserted);
          },
          then(onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) {
            return Promise.resolve(inserted).then(onFulfilled, onRejected);
          },
        };
      },
    };
  }

  function buildUpdate(table: { __table: string }) {
    return {
      set(patch: Record<string, unknown>) {
        return {
          where(filter: unknown) {
            const rows = tableArray(table.__table).filter((r) => evalPredicate(filter, r));
            for (const r of rows) Object.assign(r, patch);
            return {
              returning() {
                return Promise.resolve(rows.map((r) => ({ ...r })));
              },
              then(onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) {
                return Promise.resolve(rows.map((r) => ({ ...r }))).then(onFulfilled, onRejected);
              },
            };
          },
        };
      },
    };
  }

  function buildDelete(table: { __table: string }) {
    return {
      where(filter: unknown) {
        const all = tableArray(table.__table);
        const remaining: Array<Record<string, unknown>> = [];
        for (const r of all) {
          if (!evalPredicate(filter, r)) remaining.push(r);
        }
        all.length = 0;
        all.push(...remaining);
        return Promise.resolve();
      },
    };
  }

  return {
    db: {
      select(projection?: Record<string, unknown>) {
        return {
          from(table: { __table: string }) {
            return buildSelect(projection ?? null).from(table);
          },
        };
      },
      insert(table: { __table: string }) {
        return buildInsert(table);
      },
      update(table: { __table: string }) {
        return buildUpdate(table);
      },
      delete(table: { __table: string }) {
        return buildDelete(table);
      },
    },
  };
});

beforeEach(() => {
  state.brainCalendarEvents.length = 0;
  state.brainTasks.length = 0;
  state.brainMeetings.length = 0;
  state.brainRelationshipOverlays.length = 0;
  state.crmCompanies.length = 0;
  state.crmDeals.length = 0;
  state.auditCalls.length = 0;
  idCounter = 1000;
});

async function importModule() {
  return await import('@/lib/brain/calendar');
}

// ---------------------------------------------------------------------------
// listEvents
// ---------------------------------------------------------------------------

describe('listEvents', () => {
  it('returns [] when no events exist for the client', async () => {
    const { listEvents } = await importModule();
    const rows = await listEvents(1, { from: new Date('2026-01-01'), to: new Date('2026-02-01') });
    expect(rows).toEqual([]);
  });

  it('returns events overlapping [from, to)', async () => {
    state.brainCalendarEvents.push(
      {
        id: 1,
        clientId: 1,
        title: 'Inside',
        startAt: new Date('2026-01-10T10:00:00Z'),
        endAt: new Date('2026-01-10T11:00:00Z'),
      },
      {
        id: 2,
        clientId: 1,
        title: 'Way before',
        startAt: new Date('2025-12-01T00:00:00Z'),
        endAt: new Date('2025-12-01T01:00:00Z'),
      },
      {
        id: 3,
        clientId: 1,
        title: 'Way after',
        startAt: new Date('2026-03-01T00:00:00Z'),
        endAt: new Date('2026-03-01T01:00:00Z'),
      },
    );
    const { listEvents } = await importModule();
    const rows = await listEvents(1, { from: new Date('2026-01-01'), to: new Date('2026-02-01') });
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(1);
  });

  it('filters out events belonging to a different client', async () => {
    state.brainCalendarEvents.push({
      id: 1,
      clientId: 2,
      title: 'Wrong client',
      startAt: new Date('2026-01-10T10:00:00Z'),
      endAt: new Date('2026-01-10T11:00:00Z'),
    });
    const { listEvents } = await importModule();
    const rows = await listEvents(1, { from: new Date('2026-01-01'), to: new Date('2026-02-01') });
    expect(rows).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// getEvent
// ---------------------------------------------------------------------------

describe('getEvent', () => {
  it('returns null when the event does not exist', async () => {
    const { getEvent } = await importModule();
    const row = await getEvent(1, 999);
    expect(row).toBeNull();
  });

  it('returns the event when it matches client + id', async () => {
    state.brainCalendarEvents.push({
      id: 42,
      clientId: 1,
      title: 'Hello',
      startAt: new Date('2026-01-10T10:00:00Z'),
      endAt: new Date('2026-01-10T11:00:00Z'),
    });
    const { getEvent } = await importModule();
    const row = await getEvent(1, 42);
    expect(row).not.toBeNull();
    expect(row!.id).toBe(42);
  });

  it('returns null when the event belongs to a different client', async () => {
    state.brainCalendarEvents.push({
      id: 42,
      clientId: 2,
      title: 'Hello',
      startAt: new Date('2026-01-10T10:00:00Z'),
      endAt: new Date('2026-01-10T11:00:00Z'),
    });
    const { getEvent } = await importModule();
    const row = await getEvent(1, 42);
    expect(row).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// createEvent
// ---------------------------------------------------------------------------

describe('createEvent', () => {
  it('throws when endAt < startAt', async () => {
    const { createEvent } = await importModule();
    await expect(
      createEvent({
        clientId: 1,
        title: 'Bad',
        startAt: new Date('2026-01-10T11:00:00Z'),
        endAt: new Date('2026-01-10T10:00:00Z'),
      }),
    ).rejects.toThrow(/endAt must be >= startAt/);
  });

  it('creates an event with sensible defaults and logs audit', async () => {
    const { createEvent } = await importModule();
    const created = await createEvent({
      clientId: 1,
      title: '  My Event  ',
      startAt: new Date('2026-01-10T10:00:00Z'),
      endAt: new Date('2026-01-10T11:00:00Z'),
    });
    expect(created.title).toBe('My Event');
    expect(created.allDay).toBe(false);
    expect(created.timezone).toBe('UTC');
    expect(created.description).toBeNull();
    expect(created.location).toBeNull();
    expect(created.link).toBeNull();
    expect(created.relatedTaskId).toBeNull();
    expect(created.relatedMeetingId).toBeNull();
    expect(created.relatedRelationshipOverlayId).toBeNull();
    expect(created.source).toBe('manual');
    expect(created.createdBy).toBeNull();
    expect(state.auditCalls).toHaveLength(1);
    expect(state.auditCalls[0]).toMatchObject({
      action: 'calendar_event.created',
      entityType: 'brain_calendar_event',
      clientId: 1,
    });
  });

  it('honors explicitly provided fields and trims title to 255 chars', async () => {
    const longTitle = 'x'.repeat(300);
    const { createEvent } = await importModule();
    const created = await createEvent({
      clientId: 1,
      title: longTitle,
      description: 'desc',
      startAt: new Date('2026-01-10T10:00:00Z'),
      endAt: new Date('2026-01-10T11:00:00Z'),
      allDay: true,
      timezone: 'America/New_York',
      location: 'Zoom',
      link: 'https://example.com',
      relatedTaskId: 7,
      relatedMeetingId: 8,
      relatedRelationshipOverlayId: 9,
      createdBy: 123,
    });
    expect((created.title as string).length).toBe(255);
    expect(created.description).toBe('desc');
    expect(created.allDay).toBe(true);
    expect(created.timezone).toBe('America/New_York');
    expect(created.location).toBe('Zoom');
    expect(created.link).toBe('https://example.com');
    expect(created.relatedTaskId).toBe(7);
    expect(created.relatedMeetingId).toBe(8);
    expect(created.relatedRelationshipOverlayId).toBe(9);
    expect(created.createdBy).toBe(123);
    expect(state.auditCalls[0]).toMatchObject({ actorId: 123 });
  });

  it('accepts endAt === startAt (zero-length event)', async () => {
    const { createEvent } = await importModule();
    const t = new Date('2026-01-10T10:00:00Z');
    const created = await createEvent({ clientId: 1, title: 'point', startAt: t, endAt: t });
    expect(created.startAt).toEqual(t);
    expect(created.endAt).toEqual(t);
  });
});

// ---------------------------------------------------------------------------
// updateEvent
// ---------------------------------------------------------------------------

describe('updateEvent', () => {
  it('returns null when the event does not exist', async () => {
    const { updateEvent } = await importModule();
    const res = await updateEvent(1, 999, { title: 'x' }, 2);
    expect(res).toBeNull();
    expect(state.auditCalls).toHaveLength(0);
  });

  it('throws when patched endAt < startAt', async () => {
    state.brainCalendarEvents.push({
      id: 10,
      clientId: 1,
      title: 'orig',
      startAt: new Date('2026-01-10T10:00:00Z'),
      endAt: new Date('2026-01-10T11:00:00Z'),
    });
    const { updateEvent } = await importModule();
    await expect(
      updateEvent(1, 10, { endAt: new Date('2026-01-10T09:00:00Z') }, 2),
    ).rejects.toThrow(/endAt must be >= startAt/);
  });

  it('throws when patched startAt is after existing endAt', async () => {
    state.brainCalendarEvents.push({
      id: 11,
      clientId: 1,
      title: 'orig',
      startAt: new Date('2026-01-10T10:00:00Z'),
      endAt: new Date('2026-01-10T11:00:00Z'),
    });
    const { updateEvent } = await importModule();
    await expect(
      updateEvent(1, 11, { startAt: new Date('2026-01-10T12:00:00Z') }, 2),
    ).rejects.toThrow(/endAt must be >= startAt/);
  });

  it('applies patch fields and logs audit with changedFields', async () => {
    state.brainCalendarEvents.push({
      id: 20,
      clientId: 1,
      title: 'orig',
      description: null,
      startAt: new Date('2026-01-10T10:00:00Z'),
      endAt: new Date('2026-01-10T11:00:00Z'),
      allDay: false,
      timezone: 'UTC',
      location: null,
      link: null,
      relatedTaskId: null,
      relatedMeetingId: null,
      relatedRelationshipOverlayId: null,
    });
    const { updateEvent } = await importModule();
    const updated = await updateEvent(
      1,
      20,
      {
        title: '  Renamed  ',
        description: 'new desc',
        allDay: true,
        timezone: 'America/New_York',
        location: 'Office',
        link: 'https://x',
        relatedTaskId: 1,
        relatedMeetingId: 2,
        relatedRelationshipOverlayId: 3,
      },
      2,
    );
    expect(updated).not.toBeNull();
    expect(updated!.title).toBe('Renamed');
    expect(updated!.description).toBe('new desc');
    expect(updated!.allDay).toBe(true);
    expect(updated!.timezone).toBe('America/New_York');
    expect(updated!.location).toBe('Office');
    expect(updated!.link).toBe('https://x');
    expect(updated!.relatedTaskId).toBe(1);
    expect(updated!.relatedMeetingId).toBe(2);
    expect(updated!.relatedRelationshipOverlayId).toBe(3);
    const audit = state.auditCalls.find((a) => a.action === 'calendar_event.updated');
    expect(audit).toBeDefined();
    expect(audit!.entityId).toBe(20);
    const changed = (audit!.metadata as { changedFields: string[] }).changedFields;
    expect(changed).toEqual(
      expect.arrayContaining([
        'title',
        'description',
        'allDay',
        'timezone',
        'location',
        'link',
        'relatedTaskId',
        'relatedMeetingId',
        'relatedRelationshipOverlayId',
      ]),
    );
  });

  it('truncates a patched title to 255 chars', async () => {
    state.brainCalendarEvents.push({
      id: 21,
      clientId: 1,
      title: 'orig',
      startAt: new Date('2026-01-10T10:00:00Z'),
      endAt: new Date('2026-01-10T11:00:00Z'),
    });
    const { updateEvent } = await importModule();
    const updated = await updateEvent(1, 21, { title: 'y'.repeat(400) }, 2);
    expect((updated!.title as string).length).toBe(255);
  });

  it('updates startAt + endAt together when both supplied', async () => {
    state.brainCalendarEvents.push({
      id: 22,
      clientId: 1,
      title: 'orig',
      startAt: new Date('2026-01-10T10:00:00Z'),
      endAt: new Date('2026-01-10T11:00:00Z'),
    });
    const newStart = new Date('2026-02-01T08:00:00Z');
    const newEnd = new Date('2026-02-01T09:00:00Z');
    const { updateEvent } = await importModule();
    const updated = await updateEvent(1, 22, { startAt: newStart, endAt: newEnd }, 2);
    expect(updated!.startAt).toEqual(newStart);
    expect(updated!.endAt).toEqual(newEnd);
  });

  it('refuses to update an event owned by another client', async () => {
    state.brainCalendarEvents.push({
      id: 23,
      clientId: 99,
      title: 'someone-elses',
      startAt: new Date('2026-01-10T10:00:00Z'),
      endAt: new Date('2026-01-10T11:00:00Z'),
    });
    const { updateEvent } = await importModule();
    const res = await updateEvent(1, 23, { title: 'hacked' }, 2);
    expect(res).toBeNull();
    expect(state.brainCalendarEvents[0].title).toBe('someone-elses');
  });
});

// ---------------------------------------------------------------------------
// deleteEvent
// ---------------------------------------------------------------------------

describe('deleteEvent', () => {
  it('returns false when the event does not exist', async () => {
    const { deleteEvent } = await importModule();
    const ok = await deleteEvent(1, 999, 2);
    expect(ok).toBe(false);
    expect(state.auditCalls).toHaveLength(0);
  });

  it('deletes the event and writes an audit entry', async () => {
    state.brainCalendarEvents.push({
      id: 30,
      clientId: 1,
      title: 'doomed',
      startAt: new Date('2026-01-10T10:00:00Z'),
      endAt: new Date('2026-01-10T11:00:00Z'),
    });
    const { deleteEvent } = await importModule();
    const ok = await deleteEvent(1, 30, 2);
    expect(ok).toBe(true);
    expect(state.brainCalendarEvents).toHaveLength(0);
    expect(state.auditCalls[0]).toMatchObject({
      action: 'calendar_event.deleted',
      entityType: 'brain_calendar_event',
      entityId: 30,
      clientId: 1,
      actorId: 2,
    });
  });

  it('refuses to delete an event owned by another client', async () => {
    state.brainCalendarEvents.push({
      id: 31,
      clientId: 99,
      title: 'not yours',
      startAt: new Date('2026-01-10T10:00:00Z'),
      endAt: new Date('2026-01-10T11:00:00Z'),
    });
    const { deleteEvent } = await importModule();
    const ok = await deleteEvent(1, 31, 2);
    expect(ok).toBe(false);
    expect(state.brainCalendarEvents).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// getAgenda
// ---------------------------------------------------------------------------

describe('getAgenda', () => {
  it('returns [] when nothing is in range', async () => {
    const { getAgenda } = await importModule();
    const items = await getAgenda(1, new Date('2026-01-01'), new Date('2026-02-01'));
    expect(items).toEqual([]);
  });

  it('returns events as agenda items with the expected shape', async () => {
    state.brainCalendarEvents.push({
      id: 1,
      clientId: 1,
      title: 'Standup',
      startAt: new Date('2026-01-10T10:00:00Z'),
      endAt: new Date('2026-01-10T10:30:00Z'),
      allDay: false,
      location: 'Zoom',
    });
    const { getAgenda } = await importModule();
    const items = await getAgenda(1, new Date('2026-01-01'), new Date('2026-02-01'));
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      kind: 'event',
      key: 'event:1',
      id: 1,
      title: 'Standup',
      allDay: false,
      subtitle: 'Zoom',
      href: '/portal/brain/calendar?event=1',
    });
    expect(items[0].startAt).toBe(new Date('2026-01-10T10:00:00Z').toISOString());
    expect(items[0].endAt).toBe(new Date('2026-01-10T10:30:00Z').toISOString());
  });

  it('omits subtitle when event location is null', async () => {
    state.brainCalendarEvents.push({
      id: 2,
      clientId: 1,
      title: 'No-loc',
      startAt: new Date('2026-01-10T10:00:00Z'),
      endAt: new Date('2026-01-10T11:00:00Z'),
      allDay: false,
      location: null,
    });
    const { getAgenda } = await importModule();
    const items = await getAgenda(1, new Date('2026-01-01'), new Date('2026-02-01'));
    expect(items[0].subtitle).toBeUndefined();
  });

  it('returns tasks as task_due items', async () => {
    state.brainTasks.push({
      id: 5,
      clientId: 1,
      title: 'File NDA',
      dueDate: new Date('2026-01-15T00:00:00Z'),
      priority: 'high',
      status: 'open',
    });
    const { getAgenda } = await importModule();
    const items = await getAgenda(1, new Date('2026-01-01'), new Date('2026-02-01'));
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      kind: 'task_due',
      key: 'task_due:5',
      id: 5,
      title: 'File NDA',
      endAt: null,
      allDay: true,
      subtitle: 'high · open',
      href: '/portal/brain/tasks?focus=5',
    });
  });

  it('returns meetings as meeting items with status formatting', async () => {
    state.brainMeetings.push({
      id: 9,
      clientId: 1,
      title: 'Kickoff',
      meetingDate: new Date('2026-01-20T15:00:00Z'),
      status: 'in_progress',
    });
    const { getAgenda } = await importModule();
    const items = await getAgenda(1, new Date('2026-01-01'), new Date('2026-02-01'));
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      kind: 'meeting',
      key: 'meeting:9',
      id: 9,
      title: 'Kickoff',
      endAt: null,
      allDay: false,
      subtitle: 'in progress',
      href: '/portal/brain/communications/9',
    });
  });

  it('returns relationship reviews with the linked company name', async () => {
    state.crmCompanies.push({ id: 10, clientId: 1, name: 'Acme' });
    state.brainRelationshipOverlays.push({
      id: 100,
      clientId: 1,
      companyId: 10,
      dealId: null,
      nextReviewAt: new Date('2026-01-25T00:00:00Z'),
      relationshipType: 'key_partner',
      priority: 'high',
    });
    const { getAgenda } = await importModule();
    const items = await getAgenda(1, new Date('2026-01-01'), new Date('2026-02-01'));
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      kind: 'relationship_review',
      key: 'relationship_review:100',
      id: 100,
      title: 'Review: Acme',
      endAt: null,
      allDay: true,
      subtitle: 'key partner · high',
      href: '/portal/brain/relationships/100',
    });
  });

  it('returns relationship reviews with the linked deal title when overlay points at a deal', async () => {
    state.crmDeals.push({ id: 77, clientId: 1, title: 'Q1 Renewal' });
    state.brainRelationshipOverlays.push({
      id: 101,
      clientId: 1,
      companyId: null,
      dealId: 77,
      nextReviewAt: new Date('2026-01-26T00:00:00Z'),
      relationshipType: 'opportunity',
      priority: 'medium',
    });
    const { getAgenda } = await importModule();
    const items = await getAgenda(1, new Date('2026-01-01'), new Date('2026-02-01'));
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe('Review: Q1 Renewal');
  });

  it('falls back to "Company #id" when the company row cannot be resolved', async () => {
    // overlay references a company that is NOT in crmCompanies — the IN-array
    // lookup returns nothing, so the fallback label kicks in.
    state.brainRelationshipOverlays.push({
      id: 102,
      clientId: 1,
      companyId: 999,
      dealId: null,
      nextReviewAt: new Date('2026-01-27T00:00:00Z'),
      relationshipType: 'generic',
      priority: 'low',
    });
    const { getAgenda } = await importModule();
    const items = await getAgenda(1, new Date('2026-01-01'), new Date('2026-02-01'));
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe('Review: Company #999');
  });

  it('falls back to "Deal #id" when the deal row cannot be resolved', async () => {
    state.brainRelationshipOverlays.push({
      id: 103,
      clientId: 1,
      companyId: null,
      dealId: 888,
      nextReviewAt: new Date('2026-01-27T00:00:00Z'),
      relationshipType: 'generic',
      priority: 'low',
    });
    const { getAgenda } = await importModule();
    const items = await getAgenda(1, new Date('2026-01-01'), new Date('2026-02-01'));
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe('Review: Deal #888');
  });

  it('labels overlays without companyId/dealId as "Relationship"', async () => {
    state.brainRelationshipOverlays.push({
      id: 104,
      clientId: 1,
      companyId: null,
      dealId: null,
      nextReviewAt: new Date('2026-01-28T00:00:00Z'),
      relationshipType: 'generic',
      priority: 'low',
    });
    const { getAgenda } = await importModule();
    const items = await getAgenda(1, new Date('2026-01-01'), new Date('2026-02-01'));
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe('Review: Relationship');
  });

  it('skips tasks/meetings/overlays whose date field is null', async () => {
    state.brainTasks.push({ id: 1, clientId: 1, title: 'no-due', dueDate: null, priority: 'low', status: 'open' });
    state.brainMeetings.push({ id: 2, clientId: 1, title: 'no-date', meetingDate: null, status: 'scheduled' });
    state.brainRelationshipOverlays.push({
      id: 3,
      clientId: 1,
      companyId: 10,
      dealId: null,
      nextReviewAt: null,
      relationshipType: 'generic',
      priority: 'low',
    });
    const { getAgenda } = await importModule();
    const items = await getAgenda(1, new Date('2026-01-01'), new Date('2026-02-01'));
    expect(items).toEqual([]);
  });

  it('sorts the combined agenda by startAt ascending', async () => {
    state.brainCalendarEvents.push({
      id: 1,
      clientId: 1,
      title: 'Mid',
      startAt: new Date('2026-01-15T10:00:00Z'),
      endAt: new Date('2026-01-15T11:00:00Z'),
      allDay: false,
      location: null,
    });
    state.brainTasks.push({
      id: 2,
      clientId: 1,
      title: 'Early',
      dueDate: new Date('2026-01-05T00:00:00Z'),
      priority: 'low',
      status: 'open',
    });
    state.brainMeetings.push({
      id: 3,
      clientId: 1,
      title: 'Late',
      meetingDate: new Date('2026-01-25T00:00:00Z'),
      status: 'scheduled',
    });
    const { getAgenda } = await importModule();
    const items = await getAgenda(1, new Date('2026-01-01'), new Date('2026-02-01'));
    expect(items.map((i) => i.title)).toEqual(['Early', 'Mid', 'Late']);
  });

  it('isolates results by clientId', async () => {
    state.brainCalendarEvents.push({
      id: 1,
      clientId: 2,
      title: 'Wrong client',
      startAt: new Date('2026-01-10T10:00:00Z'),
      endAt: new Date('2026-01-10T11:00:00Z'),
      allDay: false,
      location: null,
    });
    state.brainTasks.push({
      id: 2,
      clientId: 2,
      title: 'Wrong task',
      dueDate: new Date('2026-01-10T00:00:00Z'),
      priority: 'low',
      status: 'open',
    });
    const { getAgenda } = await importModule();
    const items = await getAgenda(1, new Date('2026-01-01'), new Date('2026-02-01'));
    expect(items).toEqual([]);
  });
});
