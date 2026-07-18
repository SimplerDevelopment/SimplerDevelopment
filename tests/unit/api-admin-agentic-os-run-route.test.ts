// @vitest-environment node
/**
 * Unit tests for POST /api/admin/agentic-os/run
 *
 * The route:
 *  1. 404s outside local dev (isLocalDev() === false)
 *  2. Requires admin/employee session (auth())
 *  3. Validates skillId + variables
 *  4. Looks up skill in SKILLS_BY_ID, checks isOnDemand + required variables
 *  5. Inserts a pending row, checks executorEnabled(), spawns child process
 *  6. Returns { success: true, data: { runId } } (200) on spawn
 *  7. Returns 503 when executor is disabled (run persisted as 'unavailable')
 *
 * Mocks: auth, db, executor helpers, child_process.spawn, isLocalDev,
 * SKILLS_BY_ID (via registry mock).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ===========================================================================
// drizzle-orm stubs
// ===========================================================================

vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
}));

// ===========================================================================
// DB schema stub
// ===========================================================================

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
  return new Proxy(
    { agenticOsRuns: wrap('agenticOsRuns') },
    {
      has: (t, p) =>
        p in t ||
        !(
          p === 'then' ||
          p === '__esModule' ||
          p === 'default' ||
          typeof p !== 'string'
        ),
      get: (t, p) =>
        p in t
          ? t[p as keyof typeof t]
          : p === 'then' ||
              p === '__esModule' ||
              p === 'default' ||
              typeof p !== 'string'
            ? undefined
            : wrap(p as string),
    },
  );
});

// ===========================================================================
// In-memory DB
// ===========================================================================

interface RunRow {
  id: number;
  skillId: string;
  status: string;
  prompt: string;
  variables: Record<string, string>;
  createdBy: number | null;
  host: string;
  errorMessage?: string;
  startedAt?: Date;
  completedAt?: Date;
  output?: string;
  exitCode?: number | null;
}

const runs: RunRow[] = [];
let runIdCounter = 1;

function evalPredicate(filter: unknown, row: Record<string, unknown>): boolean {
  if (!filter || typeof filter !== 'object') return true;
  const f = filter as { op?: string; a?: unknown; b?: unknown };
  if (f.op === 'eq') {
    const col = f.a as { __col?: string } | undefined;
    if (!col?.__col) return true;
    return row[col.__col] === f.b;
  }
  return true;
}

vi.mock('@/lib/db', () => {
  function buildSelect() {
    let activeTable = '';
    let filter: unknown = null;
    const chain: Record<string, unknown> = {
      from(table: { __table: string }) {
        activeTable = table.__table;
        return chain;
      },
      where(arg: unknown) {
        filter = arg;
        return chain;
      },
      limit(n: number) {
        return run(n);
      },
      then(
        onFulfilled: (v: unknown) => unknown,
        onRejected?: (e: unknown) => unknown,
      ) {
        return run(null).then(onFulfilled, onRejected);
      },
    };
    function run(limit: number | null): Promise<Array<Record<string, unknown>>> {
      let rows: Array<Record<string, unknown>>;
      if (activeTable === 'agenticOsRuns') {
        rows = runs.map((r) => ({ ...r }));
      } else {
        rows = [];
      }
      rows = rows.filter((r) => evalPredicate(filter, r));
      if (limit !== null) rows = rows.slice(0, limit);
      return Promise.resolve(rows);
    }
    return chain;
  }

  function buildInsert(table: { __table: string }) {
    return {
      values(vals: Record<string, unknown>) {
        return {
          returning(_proj?: Record<string, unknown>) {
            const row: RunRow = {
              id: runIdCounter++,
              skillId: String(vals.skillId ?? ''),
              status: String(vals.status ?? 'pending'),
              prompt: String(vals.prompt ?? ''),
              variables: (vals.variables ?? {}) as Record<string, string>,
              createdBy: typeof vals.createdBy === 'number' ? vals.createdBy : null,
              host: String(vals.host ?? ''),
            };
            if (table.__table === 'agenticOsRuns') runs.push(row);
            return Promise.resolve([{ id: row.id }]);
          },
        };
      },
    };
  }

  function buildUpdate(table: { __table: string }) {
    let setValues: Record<string, unknown> = {};
    let filter: unknown = null;
    const chain: Record<string, unknown> = {
      set(vals: Record<string, unknown>) {
        setValues = vals;
        return chain;
      },
      where(arg: unknown) {
        filter = arg;
        return runUpdate();
      },
    };
    function runUpdate(): Promise<Record<string, unknown>[]> {
      if (table.__table === 'agenticOsRuns') {
        for (const r of runs) {
          if (evalPredicate(filter, r as unknown as Record<string, unknown>)) {
            Object.assign(r, setValues);
          }
        }
      }
      return Promise.resolve([]);
    }
    return chain;
  }

  return {
    db: {
      select(_proj?: unknown) {
        return {
          from(table: { __table: string }) {
            return buildSelect().from(table);
          },
        };
      },
      insert(table: { __table: string }) {
        return buildInsert(table);
      },
      update(table: { __table: string }) {
        return buildUpdate(table);
      },
    },
  };
});

// ===========================================================================
// Auth mock
// ===========================================================================

const authMock = vi.fn();
vi.mock('@/lib/auth', () => ({
  auth: () => authMock(),
}));

// ===========================================================================
// isLocalDev mock
// ===========================================================================

const isLocalDevMock = vi.fn<[], boolean>();
vi.mock('@/lib/agentic-os/local-only', () => ({
  isLocalDev: () => isLocalDevMock(),
}));

// ===========================================================================
// Registry mock — provide two test skills
// ===========================================================================

vi.mock('@/lib/agentic-os/registry', () => ({
  SKILLS_BY_ID: {
    'test-skill': {
      id: 'test-skill',
      trigger: 'on-demand',
      promptTemplate: 'Do {{task}} now.',
      variables: [
        { key: 'task', label: 'Task', required: true },
        { key: 'opt', label: 'Optional', required: false },
      ],
    },
    'scheduled-skill': {
      id: 'scheduled-skill',
      trigger: 'scheduled',
      cronExpression: '0 0 * * *',
    },
  },
}));

// ===========================================================================
// types mock — keep isOnDemand / renderPromptTemplate real logic
// ===========================================================================

vi.mock('@/lib/agentic-os/types', () => ({
  isOnDemand: (s: { trigger: string }) => s.trigger === 'on-demand',
  renderPromptTemplate: (template: string, values: Record<string, string>) =>
    template.replace(/\{\{\s*([a-zA-Z0-9_-]+)\s*\}\}/g, (_m, key) => {
      const v = values[key];
      return v && v.length > 0 ? v : `{{${key}}}`;
    }),
}));

// ===========================================================================
// Executor mocks
// ===========================================================================

const executorEnabledMock = vi.fn<[], boolean>();
const resolveClaudeBinMock = vi.fn<[], string | null>();
const truncatePromptMock = vi.fn((s: string) => s);
const makeStreamJsonParserMock = vi.fn(() => (_chunk: string) => null);
const appendOutputMock = vi.fn();
const registerChildMock = vi.fn();
const unregisterChildMock = vi.fn();

vi.mock('@/lib/agentic-os/executor', () => ({
  executorEnabled: () => executorEnabledMock(),
  resolveClaudeBin: () => resolveClaudeBinMock(),
  truncatePrompt: (s: string) => truncatePromptMock(s),
  makeStreamJsonParser: () => makeStreamJsonParserMock(),
  appendOutput: (...args: unknown[]) => appendOutputMock(...args),
  registerChild: (...args: unknown[]) => registerChildMock(...args),
  unregisterChild: (...args: unknown[]) => unregisterChildMock(...args),
  MAX_OUTPUT_BYTES: 256 * 1024,
}));

// ===========================================================================
// child_process.spawn mock
// ===========================================================================

// We mock the spawn at the node:child_process module level so the route's
// import picks it up via the vi.mock hoisting mechanism.

import { EventEmitter } from 'node:events';

class MockChildProcess extends EventEmitter {
  stdout = new EventEmitter() as NodeJS.ReadableStream & EventEmitter & { setEncoding: () => void };
  stderr = new EventEmitter() as NodeJS.ReadableStream & EventEmitter & { setEncoding: () => void };
  constructor() {
    super();
    // Add setEncoding no-ops so the route's `setEncoding('utf8')` calls don't throw.
    (this.stdout as { setEncoding: () => void }).setEncoding = () => {};
    (this.stderr as { setEncoding: () => void }).setEncoding = () => {};
  }
}

const spawnMock = vi.fn();
vi.mock('node:child_process', () => ({
  spawn: (...args: unknown[]) => spawnMock(...args),
}));

// ===========================================================================
// Module under test
// ===========================================================================

const { POST } = await import('@/app/api/admin/agentic-os/run/route');

// ===========================================================================
// Helpers
// ===========================================================================

function makeReq(body: unknown): Request {
  return new Request('http://x/api/admin/agentic-os/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makeRawReq(raw: string): Request {
  return new Request('http://x/api/admin/agentic-os/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: raw,
  });
}

function adminSession() {
  return { user: { id: '7', role: 'admin' } };
}

function employeeSession() {
  return { user: { id: '8', role: 'employee' } };
}

function makeMockChild(): MockChildProcess {
  const child = new MockChildProcess();
  spawnMock.mockReturnValue(child);
  return child;
}

// ===========================================================================
// Shared resets
// ===========================================================================

beforeEach(() => {
  runs.length = 0;
  runIdCounter = 1;

  authMock.mockReset();
  isLocalDevMock.mockReset();
  executorEnabledMock.mockReset();
  resolveClaudeBinMock.mockReset();
  spawnMock.mockReset();
  appendOutputMock.mockReset();
  registerChildMock.mockReset();
  unregisterChildMock.mockReset();

  // Sensible defaults
  isLocalDevMock.mockReturnValue(true);
  authMock.mockResolvedValue(adminSession());
  executorEnabledMock.mockReturnValue(true);
  resolveClaudeBinMock.mockReturnValue('/usr/local/bin/claude');

  vi.spyOn(console, 'error').mockImplementation(() => {});
});

// ===========================================================================
// Non-local gate
// ===========================================================================

describe('POST /api/admin/agentic-os/run — local-dev gate', () => {
  it('returns 404 when isLocalDev() is false', async () => {
    isLocalDevMock.mockReturnValueOnce(false);
    const res = await POST(makeReq({ skillId: 'test-skill', variables: { task: 'x' } }));
    expect(res.status).toBe(404);
  });
});

// ===========================================================================
// Auth
// ===========================================================================

describe('POST /api/admin/agentic-os/run — auth', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValueOnce(null);
    const res = await POST(makeReq({ skillId: 'test-skill', variables: { task: 'x' } }));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.message).toBe('Unauthorized');
  });

  it('returns 401 when session has no user id', async () => {
    authMock.mockResolvedValueOnce({ user: {} });
    const res = await POST(makeReq({ skillId: 'test-skill', variables: { task: 'x' } }));
    expect(res.status).toBe(401);
  });

  it('returns 401 when role is client', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '9', role: 'client' } });
    const res = await POST(makeReq({ skillId: 'test-skill', variables: { task: 'x' } }));
    expect(res.status).toBe(401);
  });

  it('accepts employee role', async () => {
    authMock.mockResolvedValueOnce(employeeSession());
    makeMockChild();
    const res = await POST(makeReq({ skillId: 'test-skill', variables: { task: 'do it' } }));
    expect(res.status).toBe(200);
  });

  it('accepts admin role', async () => {
    makeMockChild();
    const res = await POST(makeReq({ skillId: 'test-skill', variables: { task: 'do it' } }));
    expect(res.status).toBe(200);
  });
});

// ===========================================================================
// Body validation
// ===========================================================================

describe('POST /api/admin/agentic-os/run — body validation', () => {
  it('returns 400 on malformed JSON', async () => {
    const res = await POST(makeRawReq('not json'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toBe('Invalid JSON body');
  });

  it('returns 400 when skillId is missing', async () => {
    const res = await POST(makeReq({ variables: {} }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toBe('skillId is required');
  });

  it('returns 400 when skillId is empty string', async () => {
    const res = await POST(makeReq({ skillId: '', variables: {} }));
    expect(res.status).toBe(400);
  });
});

// ===========================================================================
// Skill lookup
// ===========================================================================

describe('POST /api/admin/agentic-os/run — skill lookup', () => {
  it('returns 404 when skillId is not in registry', async () => {
    const res = await POST(makeReq({ skillId: 'nonexistent', variables: {} }));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.message).toMatch(/unknown/i);
  });

  it('returns 400 when skill is not on-demand (scheduled skill)', async () => {
    const res = await POST(makeReq({ skillId: 'scheduled-skill', variables: {} }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toMatch(/not on-demand/i);
  });
});

// ===========================================================================
// Variable validation
// ===========================================================================

describe('POST /api/admin/agentic-os/run — variable validation', () => {
  it('returns 400 when required variable is missing', async () => {
    const res = await POST(makeReq({ skillId: 'test-skill', variables: {} }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toMatch(/task/);
  });

  it('returns 400 when required variable is empty string', async () => {
    const res = await POST(makeReq({ skillId: 'test-skill', variables: { task: '' } }));
    expect(res.status).toBe(400);
  });

  it('accepts optional variables being absent', async () => {
    makeMockChild();
    const res = await POST(makeReq({ skillId: 'test-skill', variables: { task: 'do it' } }));
    expect(res.status).toBe(200);
  });

  it('coerces non-string variable values to strings', async () => {
    makeMockChild();
    const res = await POST(
      makeReq({
        skillId: 'test-skill',
        variables: { task: 42 },
      }),
    );
    expect(res.status).toBe(200);
  });
});

// ===========================================================================
// Executor gate — disabled
// ===========================================================================

describe('POST /api/admin/agentic-os/run — executor disabled', () => {
  it('returns 503 and persists unavailable row when executorEnabled() is false', async () => {
    executorEnabledMock.mockReturnValueOnce(false);
    const res = await POST(makeReq({ skillId: 'test-skill', variables: { task: 'do it' } }));
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.data?.runId).toBeTypeOf('number');
    expect(body.message).toMatch(/disabled/i);

    const row = runs[0];
    expect(row?.status).toBe('unavailable');
  });

  it('returns 503 when executorEnabled is true but resolveClaudeBin returns null', async () => {
    // The route has a second check: if resolveClaudeBin() returns null after executorEnabled
    // passes, it still 503s. We model this by making executorEnabled return true but
    // claudeBin null (the route double-checks claudeBin separately).
    executorEnabledMock.mockReturnValueOnce(true);
    resolveClaudeBinMock.mockReturnValueOnce(null);
    const res = await POST(makeReq({ skillId: 'test-skill', variables: { task: 'do it' } }));
    // The route re-checks claudeBin; if null it also 503s
    expect(res.status).toBe(503);
  });
});

// ===========================================================================
// Happy path — spawn + 200
// ===========================================================================

describe('POST /api/admin/agentic-os/run — happy path', () => {
  it('spawns claude and returns 200 with runId', async () => {
    makeMockChild();
    const res = await POST(makeReq({ skillId: 'test-skill', variables: { task: 'do it' } }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.runId).toBeTypeOf('number');

    // Child was spawned with the claude binary
    expect(spawnMock).toHaveBeenCalledTimes(1);
    const spawnArgs = spawnMock.mock.calls[0] as [string, string[]];
    expect(spawnArgs[0]).toBe('/usr/local/bin/claude');
    expect(spawnArgs[1]).toContain('-p');
  });

  it('persists a run row with status=running before returning', async () => {
    makeMockChild();
    const res = await POST(makeReq({ skillId: 'test-skill', variables: { task: 'do it' } }));
    expect(res.status).toBe(200);
    const row = runs[0];
    expect(row?.status).toBe('running');
  });

  it('registers the child process entry', async () => {
    makeMockChild();
    await POST(makeReq({ skillId: 'test-skill', variables: { task: 'do it' } }));
    expect(registerChildMock).toHaveBeenCalledTimes(1);
    const entry = registerChildMock.mock.calls[0]![0] as { runId: number };
    expect(entry.runId).toBeTypeOf('number');
  });

  it('includes the rendered prompt in the spawn call', async () => {
    makeMockChild();
    await POST(makeReq({ skillId: 'test-skill', variables: { task: 'write tests' } }));
    expect(spawnMock).toHaveBeenCalledTimes(1);
    const spawnArgs = spawnMock.mock.calls[0] as [string, string[]];
    // The last argument in the argv array should be the rendered prompt
    const promptArg = spawnArgs[1][spawnArgs[1].length - 1];
    expect(promptArg).toContain('write tests');
  });
});

// ===========================================================================
// variables coercion edge cases
// ===========================================================================

describe('POST /api/admin/agentic-os/run — variables coercion', () => {
  it('treats null variable values as empty string', async () => {
    // Route logic: `else if (v == null) variables[k] = ''`
    makeMockChild();
    const res = await POST(
      makeReq({ skillId: 'test-skill', variables: { task: 'go', opt: null } }),
    );
    expect(res.status).toBe(200);
  });

  it('ignores non-object variables field gracefully', async () => {
    // variables is string — should be treated as {} (the for-of branch is skipped)
    const res = await POST(makeReq({ skillId: 'test-skill', variables: 'bad' }));
    // task is missing → 400
    expect(res.status).toBe(400);
  });
});
