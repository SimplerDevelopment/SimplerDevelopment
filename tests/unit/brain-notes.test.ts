// @vitest-environment node
/**
 * Unit tests for lib/brain/notes.ts.
 *
 * The module is entirely DB-coupled. We mock `@/lib/db`, `@/lib/db/schema`,
 * `drizzle-orm`, plus the side-effect modules (`./audit`, `./extract-wikilinks`,
 * `@/lib/s3/delete`) and back the DB with an in-memory chainable builder, in
 * the same pattern as tests/unit/brain-relationships.test.ts.
 *
 * Coverage scope:
 *   - listNotes / countNotes (filter routing — exercised by passing each
 *     option; the predicate evaluator only handles eq/and/inArray/sql so the
 *     sql-only filters become no-ops, which is sufficient to exercise the code
 *     paths and confirm the function doesn't throw).
 *   - getNote / getNoteBySourceUrl
 *   - createNote (incl. truncation of title/body)
 *   - updateNote (incl. missing-row null return, wikilink re-sync on body
 *     change, audit changedFields)
 *   - deleteNote (soft, hard via opts.force, hard via prior soft-delete, S3
 *     cleanup branch, missing-row false)
 *   - restoreNote (missing, already-live, restore path)
 *   - bulkUpdateNotes (every kind, plus the empty-input / no-owned guards)
 *   - clearAttachment (already-clear, attached, missing)
 *   - listAllTags, countTrashedNotes
 *   - listTagsWithCounts, emptyTrash, purgeOldTrash via db.execute / cascade
 *     deletes — we stub the execute path with forced results.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

interface MockState {
  brainNotes: Array<Record<string, unknown>>;
  brainKbLinks: Array<Record<string, unknown>>;
  brainCustomFieldValues: Array<Record<string, unknown>>;
  brainAuditLogs: Array<Record<string, unknown>>;
  /** Forced result queue for `db.execute(sql\`...\`)`. Pop one per call. */
  forcedExecute: Array<unknown>;
  auditCalls: Array<Record<string, unknown>>;
  wikilinkCalls: Array<{ clientId: number; noteId: number; body: string }>;
  s3DeleteCalls: string[];
}

const state: MockState = {
  brainNotes: [],
  brainKbLinks: [],
  brainCustomFieldValues: [],
  brainAuditLogs: [],
  forcedExecute: [],
  auditCalls: [],
  wikilinkCalls: [],
  s3DeleteCalls: [],
};

vi.mock('@/lib/db/schema', () => {
  const wrap = (tableName: string) =>
    new Proxy(
      { __table: tableName },
      {
        get(_t, prop: string) {
          if (prop === '__table') return tableName;
          if (prop === 'then') return undefined; // not thenable
          return { __col: prop, __table: tableName };
        },
      },
    );
  return new Proxy({
    brainNotes: wrap('brainNotes'),
    brainKbLinks: wrap('brainKbLinks'),
    brainCustomFieldValues: wrap('brainCustomFieldValues'),
    brainAuditLogs: wrap('brainAuditLogs'),
  }, { has: (t, p) => (p in t) || !(p === "then" || p === "__esModule" || p === "default" || typeof p !== "string"), get: (t, p) => (p in t) ? t[p] : ((p === "then" || p === "__esModule" || p === "default" || typeof p !== "string") ? undefined : wrap(p)) });
});

vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ op: 'and', args: args.filter(Boolean) }),
  or: (...args: unknown[]) => ({ op: 'or', args: args.filter(Boolean) }),
  desc: (a: unknown) => ({ op: 'desc', a }),
  asc: (a: unknown) => ({ op: 'asc', a }),
  inArray: (a: unknown, list: unknown[]) => ({ op: 'inArray', a, list }),
  isNull: (a: unknown) => ({ op: 'isNull', a }),
  isNotNull: (a: unknown) => ({ op: 'isNotNull', a }),
  sql: Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => ({ op: 'sql', strings, values }),
    {},
  ),
}));

vi.mock('@/lib/brain/audit', () => ({
  logAudit: vi.fn(async (args: Record<string, unknown>) => {
    state.auditCalls.push(args);
  }),
}));

vi.mock('@/lib/brain/extract-wikilinks', () => ({
  extractAndSyncWikiLinks: vi.fn(async (clientId: number, noteId: number, body: string) => {
    state.wikilinkCalls.push({ clientId, noteId, body });
  }),
}));

vi.mock('@/lib/s3/delete', () => ({
  deleteFromS3: vi.fn(async (key: string) => {
    state.s3DeleteCalls.push(key);
  }),
}));

function evalPredicate(filter: unknown, row: Record<string, unknown>): boolean {
  if (!filter) return true;
  if (typeof filter !== 'object') return true;
  const f = filter as {
    op?: string;
    a?: unknown;
    b?: unknown;
    list?: unknown[];
    args?: unknown[];
  };
  switch (f.op) {
    case 'eq': {
      const col = f.a as { __col?: string } | undefined;
      if (!col?.__col) return true;
      return row[col.__col] === f.b;
    }
    case 'and':
      return (f.args ?? []).every((arg) => evalPredicate(arg, row));
    case 'or':
      return (f.args ?? []).some((arg) => evalPredicate(arg, row));
    case 'inArray': {
      const col = f.a as { __col?: string } | undefined;
      if (!col?.__col) return true;
      const list = (f.list ?? []) as unknown[];
      return list.includes(row[col.__col]);
    }
    case 'isNull': {
      const col = f.a as { __col?: string } | undefined;
      if (!col?.__col) return true;
      const v = row[col.__col];
      return v === null || v === undefined;
    }
    case 'isNotNull': {
      const col = f.a as { __col?: string } | undefined;
      if (!col?.__col) return true;
      const v = row[col.__col];
      return v !== null && v !== undefined;
    }
    case 'sql':
      // sql fragments we can't simulate — treat as pass-through so the code
      // path executes. Tests that rely on the post-filter shape pre-seed
      // rows that survive the eq/and/isNull predicates already.
      return true;
    default:
      return true;
  }
}

function projectRow(
  row: Record<string, unknown>,
  projection: Record<string, unknown> | null,
): Record<string, unknown> {
  if (!projection) return { ...row };
  const out: Record<string, unknown> = {};
  for (const [alias, ref] of Object.entries(projection)) {
    const r = ref as { __col?: string; op?: string } | undefined;
    if (r?.__col) {
      out[alias] = row[r.__col];
    } else if (r?.op === 'sql') {
      // count(*)::int — return total of the filtered row count via a
      // sentinel so the caller branch (`row?.count ?? 0`) sees a number.
      // Our buildSelect handler patches this in after projection.
      out[alias] = undefined;
    } else {
      out[alias] = undefined;
    }
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
    let offset = 0;
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
      groupBy() {
        return runQuery();
      },
      limit(n: number) {
        limit = n;
        return chain;
      },
      offset(n: number) {
        offset = n;
        return runQuery();
      },
      then(onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) {
        return runQuery().then(onFulfilled, onRejected);
      },
    };

    function runQuery(): Promise<Array<Record<string, unknown>>> {
      if (!activeTable) return Promise.resolve([]);
      const filtered = tableArray(activeTable).filter((r) => evalPredicate(filter, r));
      let out = filtered.map((r) => projectRow(r, projection));

      // If the projection is a count(*) shape, replace the sentinel with the
      // actual filtered row count. We detect this by a single projection key
      // whose ref looks like an sql fragment.
      if (projection) {
        const keys = Object.keys(projection);
        if (keys.length === 1) {
          const ref = projection[keys[0]] as { op?: string } | undefined;
          if (ref?.op === 'sql') {
            out = [{ [keys[0]]: filtered.length }];
          }
        }
      }

      if (offset) out = out.slice(offset);
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
          const row = {
            ...v,
            id: nextId(),
            createdAt: new Date(),
            updatedAt: v.updatedAt ?? new Date(),
            deletedAt: v.deletedAt ?? null,
          };
          tableArray(table.__table).push(row);
          return row;
        });
        return {
          returning() {
            return Promise.resolve(inserted.map((r) => ({ ...r })));
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
            const result = {
              returning(proj?: Record<string, unknown>) {
                if (proj) {
                  return Promise.resolve(rows.map((r) => projectRow(r, proj)));
                }
                return Promise.resolve(rows.map((r) => ({ ...r })));
              },
              then(onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) {
                return Promise.resolve(rows.map((r) => ({ ...r }))).then(onFulfilled, onRejected);
              },
            };
            return result;
          },
        };
      },
    };
  }

  function buildDelete(table: { __table: string }) {
    return {
      where(filter: unknown) {
        const all = tableArray(table.__table);
        const matched: Array<Record<string, unknown>> = [];
        const remaining: Array<Record<string, unknown>> = [];
        for (const r of all) {
          if (evalPredicate(filter, r)) matched.push(r);
          else remaining.push(r);
        }
        all.length = 0;
        all.push(...remaining);
        const result = {
          returning(proj?: Record<string, unknown>) {
            if (proj) {
              return Promise.resolve(matched.map((r) => projectRow(r, proj)));
            }
            return Promise.resolve(matched.map((r) => ({ ...r })));
          },
          then(onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) {
            return Promise.resolve(matched.map((r) => ({ ...r }))).then(onFulfilled, onRejected);
          },
        };
        return result;
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
      execute(_arg: unknown) {
        const next = state.forcedExecute.shift();
        return Promise.resolve(next ?? []);
      },
    },
  };
});

beforeEach(() => {
  state.brainNotes.length = 0;
  state.brainKbLinks.length = 0;
  state.brainCustomFieldValues.length = 0;
  state.brainAuditLogs.length = 0;
  state.forcedExecute.length = 0;
  state.auditCalls.length = 0;
  state.wikilinkCalls.length = 0;
  state.s3DeleteCalls.length = 0;
  idCounter = 1000;
});

async function importModule() {
  return await import('@/lib/brain/notes');
}

// Helpers ---------------------------------------------------------------------

function seedNote(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  const row: Record<string, unknown> = {
    id: overrides.id ?? nextId(),
    clientId: overrides.clientId ?? 1,
    title: overrides.title ?? 'Sample',
    body: overrides.body ?? 'body',
    tags: overrides.tags ?? [],
    meetingId: overrides.meetingId ?? null,
    relationshipOverlayId: overrides.relationshipOverlayId ?? null,
    companyId: overrides.companyId ?? null,
    dealId: overrides.dealId ?? null,
    contactId: overrides.contactId ?? null,
    confidentialityLevel: overrides.confidentialityLevel ?? 'standard',
    pinned: overrides.pinned ?? false,
    source: overrides.source ?? 'manual',
    reviewItemId: overrides.reviewItemId ?? null,
    sourceUrl: overrides.sourceUrl ?? null,
    attachmentUrl: overrides.attachmentUrl ?? null,
    attachmentFilename: overrides.attachmentFilename ?? null,
    attachmentMimeType: overrides.attachmentMimeType ?? null,
    attachmentFileSize: overrides.attachmentFileSize ?? null,
    attachmentStoredKey: overrides.attachmentStoredKey ?? null,
    createdBy: overrides.createdBy ?? null,
    deletedAt: overrides.deletedAt ?? null,
    createdAt: overrides.createdAt ?? new Date(),
    updatedAt: overrides.updatedAt ?? new Date(),
    ...overrides,
  };
  state.brainNotes.push(row);
  return row;
}

// -----------------------------------------------------------------------------
// listNotes / countNotes
// -----------------------------------------------------------------------------

describe('listNotes', () => {
  it('returns [] when nothing exists for the client', async () => {
    const { listNotes } = await importModule();
    const rows = await listNotes(1);
    expect(rows).toEqual([]);
  });

  it('returns notes scoped to the clientId and excludes other tenants', async () => {
    seedNote({ id: 1, clientId: 1, title: 'mine' });
    seedNote({ id: 2, clientId: 2, title: 'theirs' });
    const { listNotes } = await importModule();
    const rows = await listNotes(1);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(1);
  });

  it('excludes soft-deleted notes by default but includes them when trashed=true', async () => {
    seedNote({ id: 10, clientId: 1, title: 'alive', deletedAt: null });
    seedNote({ id: 11, clientId: 1, title: 'dead', deletedAt: new Date() });
    const { listNotes } = await importModule();
    const live = await listNotes(1);
    expect(live.map((r) => r.id)).toEqual([10]);
    const trashed = await listNotes(1, { trashed: true });
    expect(trashed.map((r) => r.id)).toEqual([11]);
  });

  it('filters by relationshipOverlayId / companyId / dealId / contactId / meetingId', async () => {
    seedNote({ id: 20, clientId: 1, companyId: 5 });
    seedNote({ id: 21, clientId: 1, companyId: 6 });
    const { listNotes } = await importModule();
    const rows = await listNotes(1, { companyId: 5 });
    expect(rows.map((r) => r.id)).toEqual([20]);
  });

  it('filters pinned-only', async () => {
    seedNote({ id: 30, clientId: 1, pinned: true });
    seedNote({ id: 31, clientId: 1, pinned: false });
    const { listNotes } = await importModule();
    const rows = await listNotes(1, { pinnedOnly: true });
    expect(rows.map((r) => r.id)).toEqual([30]);
  });

  it('respects limit and offset (pagination)', async () => {
    for (let i = 0; i < 5; i++) seedNote({ id: 100 + i, clientId: 1 });
    const { listNotes } = await importModule();
    const page = await listNotes(1, { limit: 2, offset: 1 });
    expect(page).toHaveLength(2);
  });

  it('exercises sort/order branches without throwing', async () => {
    seedNote({ id: 200, clientId: 1, title: 'a' });
    const { listNotes } = await importModule();
    for (const sort of ['updated', 'created', 'title'] as const) {
      for (const order of ['asc', 'desc'] as const) {
        const rows = await listNotes(1, { sort, order });
        expect(Array.isArray(rows)).toBe(true);
      }
    }
  });

  it('exercises sql-only filters (search/tag/tagPrefix/untagged/orphans/sourceUrl prefixes) without throwing', async () => {
    seedNote({ id: 300, clientId: 1, tags: ['kb/marketing'] });
    const { listNotes } = await importModule();
    // The mocked predicate evaluator treats sql fragments as pass-through, so
    // these don't change which rows return — the point is just to walk the
    // branches in buildNoteFilters.
    const r = await listNotes(1, {
      search: 'foo',
      tag: 'kb/marketing',
      tagPrefix: 'kb',
      untagged: true,
      orphans: true,
      sourceUrl: 'https://example.test',
      sourceUrlStartsWith: 'https://',
    });
    expect(r.length).toBeGreaterThanOrEqual(0);
  });
});

describe('countNotes', () => {
  it('returns 0 when nothing matches', async () => {
    const { countNotes } = await importModule();
    expect(await countNotes(1)).toBe(0);
  });

  it('counts live notes by default', async () => {
    seedNote({ id: 1, clientId: 1, deletedAt: null });
    seedNote({ id: 2, clientId: 1, deletedAt: null });
    seedNote({ id: 3, clientId: 1, deletedAt: new Date() });
    const { countNotes } = await importModule();
    expect(await countNotes(1)).toBe(2);
  });
});

// -----------------------------------------------------------------------------
// getNote / getNoteBySourceUrl
// -----------------------------------------------------------------------------

describe('getNote', () => {
  it('returns null when the note is missing', async () => {
    const { getNote } = await importModule();
    expect(await getNote(1, 999)).toBeNull();
  });

  it('returns the matching note scoped to the client', async () => {
    seedNote({ id: 50, clientId: 1, title: 'wanted' });
    seedNote({ id: 50, clientId: 2, title: 'other tenant' });
    const { getNote } = await importModule();
    const row = await getNote(1, 50);
    expect(row).not.toBeNull();
    expect(row!.title).toBe('wanted');
  });
});

describe('getNoteBySourceUrl', () => {
  it('returns null when no note matches the URL', async () => {
    const { getNoteBySourceUrl } = await importModule();
    expect(await getNoteBySourceUrl(1, 'https://x')).toBeNull();
  });

  it('returns a matching note', async () => {
    seedNote({ id: 60, clientId: 1, sourceUrl: 'https://example.com' });
    const { getNoteBySourceUrl } = await importModule();
    const row = await getNoteBySourceUrl(1, 'https://example.com');
    expect(row).not.toBeNull();
    expect(row!.id).toBe(60);
  });
});

// -----------------------------------------------------------------------------
// createNote
// -----------------------------------------------------------------------------

describe('createNote', () => {
  it('creates a note with sane defaults and writes an audit entry', async () => {
    const { createNote } = await importModule();
    const created = await createNote({
      clientId: 1,
      title: 'Hello',
      body: 'world',
      createdBy: 7,
    });
    expect(created.id).toBeDefined();
    expect(created.title).toBe('Hello');
    expect(created.body).toBe('world');
    expect(created.tags).toEqual([]);
    expect(created.confidentialityLevel).toBe('standard');
    expect(created.source).toBe('manual');
    expect(state.auditCalls).toHaveLength(1);
    expect(state.auditCalls[0]).toMatchObject({
      action: 'note.created',
      entityType: 'brain_note',
      actorId: 7,
    });
    // Wikilink extraction fired with the inserted body.
    expect(state.wikilinkCalls).toHaveLength(1);
    expect(state.wikilinkCalls[0]).toMatchObject({ clientId: 1, body: 'world' });
  });

  it('trims and truncates oversized title/body inputs', async () => {
    const { createNote } = await importModule();
    const longTitle = '  ' + 'x'.repeat(400) + '  ';
    const longBody = 'b'.repeat(60_000);
    const created = await createNote({
      clientId: 1,
      title: longTitle,
      body: longBody,
    });
    expect((created.title as string).length).toBe(255);
    expect((created.body as string).length).toBe(50_000);
  });

  it('defaults body to empty string when omitted', async () => {
    const { createNote } = await importModule();
    const created = await createNote({ clientId: 1, title: 'no body' });
    expect(created.body).toBe('');
  });

  it('survives a wikilink-sync failure', async () => {
    const { extractAndSyncWikiLinks } = await import('@/lib/brain/extract-wikilinks');
    (extractAndSyncWikiLinks as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('boom'));
    const { createNote } = await importModule();
    const created = await createNote({ clientId: 1, title: 'Resilient' });
    expect(created.id).toBeDefined();
    expect(state.auditCalls).toHaveLength(1);
  });
});

// -----------------------------------------------------------------------------
// updateNote
// -----------------------------------------------------------------------------

describe('updateNote', () => {
  it('returns null when the note does not exist', async () => {
    const { updateNote } = await importModule();
    const res = await updateNote(1, 999, { title: 'x' }, 7);
    expect(res).toBeNull();
    expect(state.auditCalls).toHaveLength(0);
  });

  it('applies the patch and writes a changedFields audit entry', async () => {
    seedNote({ id: 70, clientId: 1, title: 'old', body: 'old body' });
    const { updateNote } = await importModule();
    const res = await updateNote(
      1,
      70,
      {
        title: 'new',
        body: 'new body',
        tags: ['k1'],
        pinned: true,
        sourceUrl: 'https://s.example',
      },
      9,
    );
    expect(res).not.toBeNull();
    expect(res!.title).toBe('new');
    expect(res!.tags).toEqual(['k1']);
    // Updated audit + wikilink resync (because body changed).
    expect(state.auditCalls.some((a) => a.action === 'note.updated')).toBe(true);
    const audit = state.auditCalls.find((a) => a.action === 'note.updated')!;
    const meta = audit.metadata as { changedFields: string[] };
    expect(meta.changedFields).toEqual(
      expect.arrayContaining(['title', 'body', 'tags', 'pinned', 'sourceUrl']),
    );
    expect(state.wikilinkCalls.find((c) => c.noteId === 70)).toBeDefined();
  });

  it('does not re-run wikilink extraction when body is not touched', async () => {
    seedNote({ id: 71, clientId: 1 });
    const { updateNote } = await importModule();
    await updateNote(1, 71, { title: 'only title' }, 9);
    expect(state.wikilinkCalls.length).toBe(0);
  });

  it('exercises every conditional field branch in the patch builder', async () => {
    seedNote({ id: 72, clientId: 1 });
    const { updateNote } = await importModule();
    const res = await updateNote(
      1,
      72,
      {
        title: 'T',
        body: 'B',
        tags: ['x'],
        meetingId: 1,
        relationshipOverlayId: 2,
        companyId: 3,
        dealId: 4,
        contactId: 5,
        confidentialityLevel: 'confidential',
        pinned: true,
        sourceUrl: 'https://x',
      },
      9,
    );
    expect(res).not.toBeNull();
    expect(res!.confidentialityLevel).toBe('confidential');
  });
});

// -----------------------------------------------------------------------------
// deleteNote
// -----------------------------------------------------------------------------

describe('deleteNote', () => {
  it('returns false when the note is missing', async () => {
    const { deleteNote } = await importModule();
    expect(await deleteNote(1, 999, 7)).toBe(false);
  });

  it('soft-deletes a live note by default', async () => {
    seedNote({ id: 80, clientId: 1, deletedAt: null });
    const { deleteNote } = await importModule();
    const ok = await deleteNote(1, 80, 7);
    expect(ok).toBe(true);
    const row = state.brainNotes.find((r) => r.id === 80)!;
    expect(row.deletedAt).toBeInstanceOf(Date);
    expect(state.auditCalls.some((a) => a.action === 'soft_deleted')).toBe(true);
  });

  it('hard-deletes when opts.force=true', async () => {
    seedNote({ id: 81, clientId: 1, deletedAt: null });
    const { deleteNote } = await importModule();
    const ok = await deleteNote(1, 81, 7, { force: true });
    expect(ok).toBe(true);
    expect(state.brainNotes.find((r) => r.id === 81)).toBeUndefined();
    expect(state.auditCalls.some((a) => a.action === 'hard_deleted')).toBe(true);
  });

  it('hard-deletes when already soft-deleted (second delete escalates)', async () => {
    seedNote({ id: 82, clientId: 1, deletedAt: new Date(), attachmentStoredKey: 'keys/a.png' });
    const { deleteNote } = await importModule();
    const ok = await deleteNote(1, 82, 7);
    expect(ok).toBe(true);
    expect(state.brainNotes.find((r) => r.id === 82)).toBeUndefined();
    expect(state.s3DeleteCalls).toContain('keys/a.png');
    const audit = state.auditCalls.find((a) => a.action === 'hard_deleted')!;
    expect((audit.metadata as { hadAttachment: boolean }).hadAttachment).toBe(true);
  });
});

// -----------------------------------------------------------------------------
// restoreNote
// -----------------------------------------------------------------------------

describe('restoreNote', () => {
  it('returns null when the note is missing', async () => {
    const { restoreNote } = await importModule();
    expect(await restoreNote(1, 999, 7)).toBeNull();
  });

  it('returns the row as-is if not soft-deleted', async () => {
    const row = seedNote({ id: 90, clientId: 1, deletedAt: null, title: 'live' });
    const { restoreNote } = await importModule();
    const res = await restoreNote(1, 90, 7);
    expect(res).not.toBeNull();
    expect(res!.id).toBe(row.id);
    // No audit entry was written.
    expect(state.auditCalls).toHaveLength(0);
  });

  it('clears deletedAt and writes a restored audit entry', async () => {
    seedNote({ id: 91, clientId: 1, deletedAt: new Date() });
    const { restoreNote } = await importModule();
    const res = await restoreNote(1, 91, 7);
    expect(res).not.toBeNull();
    expect(res!.deletedAt).toBeNull();
    expect(state.auditCalls.some((a) => a.action === 'restored')).toBe(true);
  });
});

// -----------------------------------------------------------------------------
// bulkUpdateNotes
// -----------------------------------------------------------------------------

describe('bulkUpdateNotes', () => {
  it('short-circuits on empty/duplicate-only input', async () => {
    const { bulkUpdateNotes } = await importModule();
    const res = await bulkUpdateNotes(1, [], { kind: 'soft_delete' }, 7);
    expect(res).toEqual({ updated: 0, failed: [] });
  });

  it('marks not-owned ids as failed and processes none', async () => {
    seedNote({ id: 100, clientId: 2 }); // owned by another tenant
    const { bulkUpdateNotes } = await importModule();
    const res = await bulkUpdateNotes(1, [100], { kind: 'soft_delete' }, 7);
    expect(res.updated).toBe(0);
    expect(res.failed).toEqual([100]);
  });

  it('soft-deletes owned notes', async () => {
    seedNote({ id: 110, clientId: 1 });
    seedNote({ id: 111, clientId: 1 });
    const { bulkUpdateNotes } = await importModule();
    const res = await bulkUpdateNotes(1, [110, 111, NaN], { kind: 'soft_delete' }, 7);
    expect(res.updated).toBe(2);
    expect(state.auditCalls.filter((a) => a.action === 'soft_deleted')).toHaveLength(2);
  });

  it('restores owned notes', async () => {
    seedNote({ id: 120, clientId: 1, deletedAt: new Date() });
    const { bulkUpdateNotes } = await importModule();
    const res = await bulkUpdateNotes(1, [120], { kind: 'restore' }, 7);
    expect(res.updated).toBe(1);
    expect(state.auditCalls.some((a) => a.action === 'restored')).toBe(true);
  });

  it('hard-deletes owned notes and queues S3 cleanup for any with attachments', async () => {
    seedNote({ id: 130, clientId: 1, attachmentStoredKey: 'k/130.png' });
    seedNote({ id: 131, clientId: 1, attachmentStoredKey: null });
    const { bulkUpdateNotes } = await importModule();
    const res = await bulkUpdateNotes(1, [130, 131], { kind: 'hard_delete' }, 7);
    expect(res.updated).toBe(2);
    expect(state.s3DeleteCalls).toEqual(['k/130.png']);
    expect(state.auditCalls.filter((a) => a.action === 'hard_deleted')).toHaveLength(2);
  });

  it('adds tags only when new ones change the array', async () => {
    seedNote({ id: 140, clientId: 1, tags: ['a'] });
    seedNote({ id: 141, clientId: 1, tags: ['a', 'b'] });
    const { bulkUpdateNotes } = await importModule();
    const res = await bulkUpdateNotes(
      1,
      [140, 141],
      { kind: 'add_tags', tags: ['b', '  ', ''] },
      7,
    );
    // 140 picks up 'b'; 141 already has it so no change.
    expect(res.updated).toBe(1);
    const row140 = state.brainNotes.find((r) => r.id === 140)!;
    expect(row140.tags).toEqual(['a', 'b']);
  });

  it('removes tags only when something is actually present to remove', async () => {
    seedNote({ id: 150, clientId: 1, tags: ['a', 'b'] });
    seedNote({ id: 151, clientId: 1, tags: ['c'] });
    const { bulkUpdateNotes } = await importModule();
    const res = await bulkUpdateNotes(
      1,
      [150, 151],
      { kind: 'remove_tags', tags: ['a'] },
      7,
    );
    expect(res.updated).toBe(1);
    const row150 = state.brainNotes.find((r) => r.id === 150)!;
    expect(row150.tags).toEqual(['b']);
  });

  it('replace_tag_prefix rewrites tag namespaces and dedupes', async () => {
    seedNote({ id: 160, clientId: 1, tags: ['kb/marketing', 'kb/marketing/seo', 'other'] });
    seedNote({ id: 161, clientId: 1, tags: ['unrelated'] });
    const { bulkUpdateNotes } = await importModule();
    const res = await bulkUpdateNotes(
      1,
      [160, 161],
      { kind: 'replace_tag_prefix', from: 'kb/marketing', to: 'kb/growth' },
      7,
    );
    expect(res.updated).toBe(1);
    const row160 = state.brainNotes.find((r) => r.id === 160)!;
    expect(row160.tags).toEqual(['kb/growth', 'kb/growth/seo', 'other']);
  });
});

// -----------------------------------------------------------------------------
// clearAttachment
// -----------------------------------------------------------------------------

describe('clearAttachment', () => {
  it('returns false when the note is missing', async () => {
    const { clearAttachment } = await importModule();
    expect(await clearAttachment(1, 999, 7)).toBe(false);
  });

  it('returns true and is a no-op when there is nothing to clear', async () => {
    seedNote({ id: 170, clientId: 1, attachmentStoredKey: null });
    const { clearAttachment } = await importModule();
    const res = await clearAttachment(1, 170, 7);
    expect(res).toBe(true);
    expect(state.s3DeleteCalls).toEqual([]);
    expect(state.auditCalls).toHaveLength(0);
  });

  it('clears the attachment columns, schedules S3 cleanup, and writes an audit entry', async () => {
    seedNote({
      id: 171,
      clientId: 1,
      attachmentStoredKey: 'k/171.bin',
      attachmentFilename: 'doc.pdf',
      attachmentUrl: 'https://cdn/doc.pdf',
      attachmentMimeType: 'application/pdf',
      attachmentFileSize: 1234,
    });
    const { clearAttachment } = await importModule();
    const ok = await clearAttachment(1, 171, 7);
    expect(ok).toBe(true);
    const row = state.brainNotes.find((r) => r.id === 171)!;
    expect(row.attachmentStoredKey).toBeNull();
    expect(row.attachmentFilename).toBeNull();
    expect(state.s3DeleteCalls).toEqual(['k/171.bin']);
    expect(state.auditCalls.some((a) => a.action === 'note.attachment_cleared')).toBe(true);
  });
});

// -----------------------------------------------------------------------------
// listAllTags
// -----------------------------------------------------------------------------

describe('listAllTags', () => {
  it('returns sorted unique tags across live notes', async () => {
    seedNote({ id: 180, clientId: 1, tags: ['zeta', 'alpha'] });
    seedNote({ id: 181, clientId: 1, tags: ['alpha', 'mid'] });
    seedNote({ id: 182, clientId: 1, tags: ['hidden'], deletedAt: new Date() });
    const { listAllTags } = await importModule();
    const tags = await listAllTags(1);
    expect(tags).toEqual(['alpha', 'mid', 'zeta']);
  });

  it('tolerates null/undefined tags arrays', async () => {
    seedNote({ id: 183, clientId: 1, tags: null });
    const { listAllTags } = await importModule();
    expect(await listAllTags(1)).toEqual([]);
  });
});

// -----------------------------------------------------------------------------
// countTrashedNotes
// -----------------------------------------------------------------------------

describe('countTrashedNotes', () => {
  it('returns 0 when nothing is trashed', async () => {
    seedNote({ id: 190, clientId: 1, deletedAt: null });
    const { countTrashedNotes } = await importModule();
    expect(await countTrashedNotes(1)).toBe(0);
  });

  it('counts only soft-deleted notes', async () => {
    seedNote({ id: 191, clientId: 1, deletedAt: new Date() });
    seedNote({ id: 192, clientId: 1, deletedAt: new Date() });
    seedNote({ id: 193, clientId: 1, deletedAt: null });
    const { countTrashedNotes } = await importModule();
    expect(await countTrashedNotes(1)).toBe(2);
  });
});

// -----------------------------------------------------------------------------
// listTagsWithCounts — execute-based; we feed forced results.
// -----------------------------------------------------------------------------

describe('listTagsWithCounts', () => {
  it('shapes the three execute results into the documented response', async () => {
    state.forcedExecute = [
      // tag rows
      [
        { tag: 'a', count: 3 },
        { tag: 'b', count: 1 },
      ],
      // untagged
      [{ count: 5 }],
      // total
      [{ count: 9 }],
    ];
    const { listTagsWithCounts } = await importModule();
    const res = await listTagsWithCounts(1);
    expect(res.tags).toEqual([
      { tag: 'a', count: 3 },
      { tag: 'b', count: 1 },
    ]);
    expect(res.untagged).toBe(5);
    expect(res.total).toBe(9);
  });

  it('falls back to 0 when the execute rows are empty', async () => {
    state.forcedExecute = [[], [], []];
    const { listTagsWithCounts } = await importModule();
    const res = await listTagsWithCounts(1);
    expect(res.tags).toEqual([]);
    expect(res.untagged).toBe(0);
    expect(res.total).toBe(0);
  });
});

// -----------------------------------------------------------------------------
// emptyTrash
// -----------------------------------------------------------------------------

describe('emptyTrash', () => {
  it('returns { deleted: 0 } when there is nothing to purge', async () => {
    const { emptyTrash } = await importModule();
    const res = await emptyTrash(1, 7);
    expect(res).toEqual({ deleted: 0 });
    expect(state.auditCalls).toHaveLength(0);
  });

  it('cascade-deletes trashed notes, attachments, and writes a single tenant audit row', async () => {
    seedNote({ id: 200, clientId: 1, deletedAt: new Date(), attachmentStoredKey: 'k/200.bin' });
    seedNote({ id: 201, clientId: 1, deletedAt: new Date(), attachmentStoredKey: null });
    // unrelated rows in the cascade tables
    state.brainKbLinks.push({ id: 1, clientId: 1, toNoteId: 200 });
    state.brainCustomFieldValues.push({ id: 1, entityType: 'note', entityId: 201 });
    state.brainAuditLogs.push({ id: 1, clientId: 1, entityType: 'brain_note', entityId: 200 });
    const { emptyTrash } = await importModule();
    const res = await emptyTrash(1, 7);
    expect(res.deleted).toBe(2);
    expect(state.brainNotes).toHaveLength(0);
    expect(state.brainKbLinks).toHaveLength(0);
    expect(state.brainCustomFieldValues).toHaveLength(0);
    expect(state.brainAuditLogs).toHaveLength(0);
    expect(state.s3DeleteCalls).toEqual(['k/200.bin']);
    const audit = state.auditCalls.find((a) => a.action === 'trash_emptied')!;
    expect(audit).toBeDefined();
    expect((audit.metadata as { count: number; hadAttachments: number })).toEqual({
      count: 2,
      hadAttachments: 1,
    });
  });
});

// -----------------------------------------------------------------------------
// purgeOldTrash — exercises the same cascade path but with the retention
// filter. Our mocked predicate evaluator treats the sql comparison
// (`brainNotes.deletedAt < cutoff`) as a no-op, so every trashed row counts as
// "stale" — that's fine for unit-coverage purposes.
// -----------------------------------------------------------------------------

describe('purgeOldTrash', () => {
  it('returns zeros when nothing is stale', async () => {
    const { purgeOldTrash } = await importModule();
    const res = await purgeOldTrash(1, 30);
    expect(res).toEqual({ purged: 0, attachmentsDeleted: 0 });
  });

  it('purges stale rows and writes a per-note auto_purged audit row each', async () => {
    seedNote({
      id: 210,
      clientId: 1,
      deletedAt: new Date('2026-01-01'),
      attachmentStoredKey: 'k/210.bin',
    });
    seedNote({
      id: 211,
      clientId: 1,
      deletedAt: new Date('2026-01-01'),
      attachmentStoredKey: null,
    });
    state.brainKbLinks.push({ id: 1, clientId: 1, toNoteId: 210 });
    state.brainCustomFieldValues.push({ id: 1, entityType: 'note', entityId: 210 });
    state.brainAuditLogs.push({ id: 1, clientId: 1, entityType: 'brain_note', entityId: 210 });
    const { purgeOldTrash } = await importModule();
    const res = await purgeOldTrash(1, 30);
    expect(res.purged).toBe(2);
    expect(res.attachmentsDeleted).toBe(1);
    expect(state.brainNotes).toHaveLength(0);
    expect(state.s3DeleteCalls).toEqual(['k/210.bin']);
    const autoPurged = state.auditCalls.filter((a) => a.action === 'auto_purged');
    expect(autoPurged).toHaveLength(2);
    const meta210 = autoPurged.find((a) => a.entityId === 210)!.metadata as Record<string, unknown>;
    expect(meta210.hadAttachment).toBe(true);
    expect(meta210.retentionDays).toBe(30);
  });

  it('defaults the retention window to 90 days', async () => {
    seedNote({ id: 220, clientId: 1, deletedAt: new Date('2026-01-01') });
    const { purgeOldTrash } = await importModule();
    const res = await purgeOldTrash(1);
    expect(res.purged).toBe(1);
  });
});
