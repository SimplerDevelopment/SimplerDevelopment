// @vitest-environment node
/**
 * Unit tests for lib/post-types/mcp-sdk-adapter.ts.
 *
 * The adapter exports `registerPostTypeToolsOnSdk(server, ctx)` which
 * registers ~12 tools for Custom Post Type (CPT) management:
 *   - CRUD for CPTs themselves
 *   - template get/update (with post-content placeholder normalization)
 *   - custom CSS/JS get/update
 *   - custom-fields CRUD (with parent validation for repeater/group)
 *
 * Strategy: mock @/lib/db (chainable query builder), drizzle-orm helpers,
 * the schema module, and next/cache.revalidatePath. Build a fake McpServer
 * that captures `{ name -> handler }` pairs, invoke each handler with
 * sample args, and assert on the returned JSON shape + scope branches.
 */

process.env.DATABASE_URL ??= 'postgresql://placeholder@localhost:5432/placeholder';
process.env.NEXTAUTH_URL ??= 'http://localhost:3000';

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PortalMcpContext } from '@/lib/mcp-auth';

// ── mocks ──────────────────────────────────────────────────────────────────

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  unstable_cache: (fn: (...a: unknown[]) => unknown) => fn,
}));

// db mock: each select/insert/update/delete returns a chainable proxy whose
// `await` resolves to a configurable rows array. The mock supports a queue
// for sequential select() / insert() / update() / delete() calls so tests
// can stage multi-step flows (site lookup → type lookup → mutation).

type QueryResult = unknown[];
const dbState: {
  selectQueue: QueryResult[];
  selectDefault: QueryResult;
  insertReturning: QueryResult;
  insertQueue: QueryResult[];
  updateReturning: QueryResult;
  updateQueue: QueryResult[];
  deleteCount: number;
} = {
  selectQueue: [],
  selectDefault: [],
  insertReturning: [],
  insertQueue: [],
  updateReturning: [],
  updateQueue: [],
  deleteCount: 0,
};

function makeAwaitable(rows: QueryResult) {
  const chain: Record<string, unknown> = {};
  const proxy: unknown = new Proxy(chain, {
    get(_target, prop) {
      if (prop === 'then') {
        return (onFulfilled: (v: QueryResult) => unknown) =>
          Promise.resolve(rows).then(onFulfilled);
      }
      // Any chain method (where/limit/orderBy/from/values/returning/set/etc)
      // returns the same proxy so the chain stays awaitable.
      return () => proxy;
    },
  });
  return proxy as unknown as {
    [k: string]: (...args: unknown[]) => unknown;
    then: (onFulfilled: (v: QueryResult) => unknown) => Promise<unknown>;
  };
}

vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn(() => {
      const rows = dbState.selectQueue.length > 0
        ? dbState.selectQueue.shift()!
        : dbState.selectDefault;
      return makeAwaitable(rows);
    }),
    insert: vi.fn(() => {
      const rows = dbState.insertQueue.length > 0
        ? dbState.insertQueue.shift()!
        : dbState.insertReturning;
      return makeAwaitable(rows);
    }),
    update: vi.fn(() => {
      const rows = dbState.updateQueue.length > 0
        ? dbState.updateQueue.shift()!
        : dbState.updateReturning;
      return makeAwaitable(rows);
    }),
    delete: vi.fn(() => {
      dbState.deleteCount++;
      return makeAwaitable([]);
    }),
  },
}));

// Schema objects are referenced as opaque tables/columns; provide enough shape.
vi.mock('@/lib/db/schema', () => {
  const col = (name: string) => ({ name, table: { _: { name: 'fake' } } });
  return {
    clientWebsites: { id: col('id'), clientId: col('clientId') },
    postTypes: {
      id: col('id'),
      name: col('name'),
      slug: col('slug'),
      websiteId: col('websiteId'),
      description: col('description'),
      icon: col('icon'),
      active: col('active'),
      template: col('template'),
      customCss: col('customCss'),
      customJs: col('customJs'),
      updatedAt: col('updatedAt'),
    },
    customFields: {
      id: col('id'),
      postTypeId: col('postTypeId'),
      parentId: col('parentId'),
      fieldType: col('fieldType'),
      order: col('order'),
      updatedAt: col('updatedAt'),
    },
  };
});

// drizzle-orm helpers are opaque to the adapter — return empty marker objs.
vi.mock('drizzle-orm', () => ({
  eq: vi.fn(() => ({})),
  and: vi.fn(() => ({})),
  or: vi.fn(() => ({})),
  asc: vi.fn(() => ({})),
  isNull: vi.fn(() => ({})),
  inArray: (a: unknown, list: unknown[]) => ({ op: 'inArray', a, list }),
}));

// ── helpers ─────────────────────────────────────────────────────────────────

import { registerPostTypeToolsOnSdk } from '@/lib/post-types/mcp-sdk-adapter';

interface CapturedTool {
  name: string;
  config: {
    title?: string;
    description?: string;
    inputSchema?: Record<string, unknown>;
  };
  handler: (
    args: Record<string, unknown>,
  ) => Promise<{ content: { text: string; type: string }[]; isError?: boolean }>;
}

function makeServer() {
  const tools = new Map<string, CapturedTool>();
  const stub = {
    registerTool: vi.fn(
      (name: string, config: CapturedTool['config'], handler: CapturedTool['handler']) => {
        tools.set(name, { name, config, handler });
        return { update: vi.fn(), enable: vi.fn(), disable: vi.fn() };
      },
    ),
    registerResource: vi.fn(),
  };
  return { stub, tools };
}

function ctxFor(scopes: string[]): PortalMcpContext {
  return {
    userId: 11,
    keyId: 1,
    scopes,
    client: { id: 1, company: 'Acme' } as PortalMcpContext['client'],
  };
}

function parseJson(res: { content: { text: string }[] }): unknown {
  return JSON.parse(res.content[0].text);
}

function registerAll(scopes: string[] = ['sites:read', 'sites:write']) {
  const { stub, tools } = makeServer();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  registerPostTypeToolsOnSdk(stub as any, ctxFor(scopes));
  return tools;
}

// Set up a typical owned-site → editable-type flow for the *_update / *_get
// handlers. The adapter does: select(clientWebsites) then select(postTypes).
function stageOwnedSiteAndType(typeRow: Record<string, unknown> = { id: 100, websiteId: 50 }) {
  dbState.selectQueue.push([{ id: 50 }]);          // siteOwnedByClient
  dbState.selectQueue.push([typeRow]);             // postTypes lookup
}

// ── tests ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  dbState.selectQueue = [];
  dbState.selectDefault = [];
  dbState.insertReturning = [];
  dbState.insertQueue = [];
  dbState.updateReturning = [];
  dbState.updateQueue = [];
  dbState.deleteCount = 0;
});

describe('registerPostTypeToolsOnSdk — registration', () => {
  it('registers the full toolset when scopes include read+write', () => {
    const tools = registerAll();
    const expected = [
      'post_types_list',
      'post_types_get',
      'post_types_create',
      'post_types_update',
      'post_types_delete',
      'post_types_get_template',
      'post_types_update_template',
      'post_types_get_code',
      'post_types_update_code',
      'post_types_fields_list',
      'post_types_fields_create',
      'post_types_fields_update',
      'post_types_fields_delete',
    ];
    for (const name of expected) {
      expect(tools.has(name), `should register ${name}`).toBe(true);
    }
    expect(tools.size).toBe(expected.length);
  });

  it('registers only read tools when scopes lack sites:write', () => {
    const tools = registerAll(['sites:read']);
    expect(tools.has('post_types_list')).toBe(true);
    expect(tools.has('post_types_get')).toBe(true);
    expect(tools.has('post_types_get_template')).toBe(true);
    expect(tools.has('post_types_get_code')).toBe(true);
    expect(tools.has('post_types_fields_list')).toBe(true);
    expect(tools.has('post_types_create')).toBe(false);
    expect(tools.has('post_types_update')).toBe(false);
    expect(tools.has('post_types_delete')).toBe(false);
    expect(tools.has('post_types_update_template')).toBe(false);
    expect(tools.has('post_types_update_code')).toBe(false);
    expect(tools.has('post_types_fields_create')).toBe(false);
    expect(tools.has('post_types_fields_update')).toBe(false);
    expect(tools.has('post_types_fields_delete')).toBe(false);
  });

  it('registers nothing when ctx lacks any sites scope', () => {
    const tools = registerAll(['other:read']);
    expect(tools.size).toBe(0);
  });

  it('every tool has a title, description, and inputSchema', () => {
    const tools = registerAll();
    for (const t of tools.values()) {
      expect(t.config.title, `${t.name}.title`).toBeTruthy();
      expect((t.config.description ?? '').length).toBeGreaterThan(5);
      expect(t.config.inputSchema).toBeDefined();
    }
  });
});

// ── post_types_list ────────────────────────────────────────────────────────

describe('post_types_list', () => {
  it('returns error when site is not owned by client', async () => {
    dbState.selectQueue.push([]); // siteOwnedByClient → empty
    const tools = registerAll();
    const res = await tools.get('post_types_list')!.handler({ websiteId: 50 });
    expect((parseJson(res) as { error: string }).error).toMatch(/Site not found/);
  });

  it('lists site + globals by default', async () => {
    dbState.selectQueue.push([{ id: 50 }]);                          // site
    dbState.selectQueue.push([{ id: 1, slug: 'page' }, { id: 2, slug: 'blog' }]); // types
    const tools = registerAll();
    const res = await tools.get('post_types_list')!.handler({ websiteId: 50 });
    expect(parseJson(res)).toEqual([{ id: 1, slug: 'page' }, { id: 2, slug: 'blog' }]);
  });

  it('lists only site-specific types when siteOnly=true', async () => {
    dbState.selectQueue.push([{ id: 50 }]);
    dbState.selectQueue.push([{ id: 99, slug: 'product' }]);
    const tools = registerAll();
    const res = await tools.get('post_types_list')!.handler({ websiteId: 50, siteOnly: true });
    expect(parseJson(res)).toEqual([{ id: 99, slug: 'product' }]);
  });
});

// ── post_types_get ──────────────────────────────────────────────────────────

describe('post_types_get', () => {
  it('returns site-not-found when site lookup empty', async () => {
    dbState.selectQueue.push([]);
    const tools = registerAll();
    const res = await tools.get('post_types_get')!.handler({ websiteId: 50, typeId: 1 });
    expect((parseJson(res) as { error: string }).error).toMatch(/Site not found/);
  });

  it('returns post-type-not-found when type lookup empty', async () => {
    dbState.selectQueue.push([{ id: 50 }]); // site
    dbState.selectQueue.push([]);           // type
    const tools = registerAll();
    const res = await tools.get('post_types_get')!.handler({ websiteId: 50, typeId: 1 });
    expect((parseJson(res) as { error: string }).error).toMatch(/Post type not found/);
  });

  it('returns the type on hit', async () => {
    dbState.selectQueue.push([{ id: 50 }]);
    dbState.selectQueue.push([{ id: 7, name: 'Product', slug: 'product' }]);
    const tools = registerAll();
    const res = await tools.get('post_types_get')!.handler({ websiteId: 50, typeId: 7 });
    expect((parseJson(res) as { id: number; name: string }).name).toBe('Product');
  });
});

// ── post_types_create ──────────────────────────────────────────────────────

describe('post_types_create', () => {
  it('returns site-not-found when site missing', async () => {
    dbState.selectQueue.push([]);
    const tools = registerAll();
    const res = await tools.get('post_types_create')!.handler({
      websiteId: 50,
      name: 'Product',
      slug: 'product',
    });
    expect((parseJson(res) as { error: string }).error).toMatch(/Site not found/);
  });

  it('rejects slug collisions', async () => {
    dbState.selectQueue.push([{ id: 50 }]);              // site
    dbState.selectQueue.push([{ id: 999 }]);             // collision row
    const tools = registerAll();
    const res = await tools.get('post_types_create')!.handler({
      websiteId: 50,
      name: 'Product',
      slug: 'product',
    });
    expect((parseJson(res) as { error: string }).error).toMatch(/already exists/);
  });

  it('inserts and returns the new type when slug is unique', async () => {
    dbState.selectQueue.push([{ id: 50 }]);              // site
    dbState.selectQueue.push([]);                        // no collision
    dbState.insertReturning = [{ id: 77, name: 'Product', slug: 'product', icon: 'article', active: true }];
    const tools = registerAll();
    const res = await tools.get('post_types_create')!.handler({
      websiteId: 50,
      name: 'Product',
      slug: 'product',
      description: 'optional',
    });
    expect((parseJson(res) as { id: number }).id).toBe(77);
  });

  it('defaults icon to "article" when not provided', async () => {
    dbState.selectQueue.push([{ id: 50 }]);
    dbState.selectQueue.push([]);
    dbState.insertReturning = [{ id: 78, icon: 'article' }];
    const tools = registerAll();
    const res = await tools.get('post_types_create')!.handler({
      websiteId: 50,
      name: 'Thing',
      slug: 'thing',
    });
    expect((parseJson(res) as { icon: string }).icon).toBe('article');
  });
});

// ── post_types_update ──────────────────────────────────────────────────────

describe('post_types_update', () => {
  it('returns not-editable when type lookup fails', async () => {
    dbState.selectQueue.push([{ id: 50 }]);
    dbState.selectQueue.push([]); // type not found / not editable
    const tools = registerAll();
    const res = await tools.get('post_types_update')!.handler({
      websiteId: 50,
      typeId: 7,
      name: 'New',
    });
    expect((parseJson(res) as { error: string }).error).toMatch(/not editable/);
  });

  it('updates and returns the patched row', async () => {
    stageOwnedSiteAndType({ id: 7, websiteId: 50, name: 'Old' });
    dbState.updateReturning = [{ id: 7, name: 'NewName', active: false }];
    const tools = registerAll();
    const res = await tools.get('post_types_update')!.handler({
      websiteId: 50,
      typeId: 7,
      name: 'NewName',
      active: false,
    });
    const out = parseJson(res) as { id: number; name: string; active: boolean };
    expect(out.name).toBe('NewName');
    expect(out.active).toBe(false);
  });
});

// ── post_types_delete ──────────────────────────────────────────────────────

describe('post_types_delete', () => {
  it('returns not-editable when type missing', async () => {
    dbState.selectQueue.push([{ id: 50 }]);
    dbState.selectQueue.push([]);
    const tools = registerAll();
    const res = await tools.get('post_types_delete')!.handler({ websiteId: 50, typeId: 7 });
    expect((parseJson(res) as { error: string }).error).toMatch(/not editable/);
  });

  it('deletes the type and returns success echo', async () => {
    stageOwnedSiteAndType({ id: 7, websiteId: 50 });
    const tools = registerAll();
    const res = await tools.get('post_types_delete')!.handler({ websiteId: 50, typeId: 7 });
    const out = parseJson(res) as { success: boolean; id: number };
    expect(out.success).toBe(true);
    expect(out.id).toBe(7);
    expect(dbState.deleteCount).toBe(1);
  });
});

// ── post_types_get_template ────────────────────────────────────────────────

describe('post_types_get_template', () => {
  it('returns default template + defaulted:true when type has no template', async () => {
    stageOwnedSiteAndType({ id: 7, websiteId: 50, template: null });
    const tools = registerAll();
    const res = await tools.get('post_types_get_template')!.handler({
      websiteId: 50,
      typeId: 7,
    });
    const out = parseJson(res) as {
      template: { blocks: { type: string; required: boolean }[] };
      defaulted: boolean;
    };
    expect(out.defaulted).toBe(true);
    expect(out.template.blocks).toHaveLength(1);
    expect(out.template.blocks[0].type).toBe('post-content');
    expect(out.template.blocks[0].required).toBe(true);
  });

  it('parses stored JSON template + returns defaulted:false', async () => {
    const stored = JSON.stringify({
      blocks: [{ id: 'block-post-content-1', type: 'post-content', order: 0, required: true }],
      version: '1.0',
    });
    stageOwnedSiteAndType({ id: 7, websiteId: 50, template: stored });
    const tools = registerAll();
    const res = await tools.get('post_types_get_template')!.handler({
      websiteId: 50,
      typeId: 7,
    });
    const out = parseJson(res) as {
      template: { blocks: unknown[] };
      defaulted: boolean;
    };
    expect(out.defaulted).toBe(false);
    expect(out.template.blocks).toHaveLength(1);
  });

  it('prepends a placeholder when stored template lost it', async () => {
    const stored = JSON.stringify({
      blocks: [{ id: 'h1', type: 'heading', order: 0 }],
      version: '1.0',
    });
    stageOwnedSiteAndType({ id: 7, websiteId: 50, template: stored });
    const tools = registerAll();
    const res = await tools.get('post_types_get_template')!.handler({
      websiteId: 50,
      typeId: 7,
    });
    const out = parseJson(res) as {
      template: { blocks: { type: string }[] };
      defaulted: boolean;
    };
    // post-content placeholder should have been prepended.
    expect(out.template.blocks[0].type).toBe('post-content');
    expect(out.template.blocks.length).toBeGreaterThanOrEqual(2);
  });

  it('tolerates malformed JSON without throwing', async () => {
    stageOwnedSiteAndType({ id: 7, websiteId: 50, template: 'not json {{{' });
    const tools = registerAll();
    const res = await tools.get('post_types_get_template')!.handler({
      websiteId: 50,
      typeId: 7,
    });
    const out = parseJson(res) as { template: null | unknown; defaulted: boolean };
    expect(out.defaulted).toBe(false);
    // adapter sets template = null on parse failure
    expect(out.template).toBeNull();
  });

  it('returns not-found when type missing', async () => {
    dbState.selectQueue.push([{ id: 50 }]);
    dbState.selectQueue.push([]);
    const tools = registerAll();
    const res = await tools.get('post_types_get_template')!.handler({
      websiteId: 50,
      typeId: 7,
    });
    expect((parseJson(res) as { error: string }).error).toMatch(/Post type not found/);
  });
});

// ── post_types_update_template ─────────────────────────────────────────────

describe('post_types_update_template', () => {
  it('returns not-editable when type missing', async () => {
    dbState.selectQueue.push([{ id: 50 }]);
    dbState.selectQueue.push([]);
    const tools = registerAll();
    const res = await tools.get('post_types_update_template')!.handler({
      websiteId: 50,
      typeId: 7,
      template: null,
    });
    expect((parseJson(res) as { error: string }).error).toMatch(/not editable/);
  });

  it('normalizes template=null to a default placeholder', async () => {
    stageOwnedSiteAndType({ id: 7, websiteId: 50 });
    dbState.updateReturning = [{
      id: 7,
      template: JSON.stringify({
        blocks: [{ id: 'p1', type: 'post-content', order: 0, required: true }],
        version: '1.0',
      }),
    }];
    const tools = registerAll();
    const res = await tools.get('post_types_update_template')!.handler({
      websiteId: 50,
      typeId: 7,
      template: null,
    });
    const out = parseJson(res) as {
      template: { blocks: { type: string; required: boolean }[] };
      defaulted: boolean;
    };
    expect(out.defaulted).toBe(false);
    expect(out.template.blocks[0].type).toBe('post-content');
    expect(out.template.blocks[0].required).toBe(true);
  });

  it('dedupes extra post-content placeholders (first wins)', async () => {
    stageOwnedSiteAndType({ id: 7, websiteId: 50 });
    // The adapter normalizes, then re-parses the updateReturning row.
    // Stage a returning row that matches the de-duped result.
    dbState.updateReturning = [{
      id: 7,
      template: JSON.stringify({
        blocks: [{ id: 'first', type: 'post-content', order: 0, required: true }],
        version: '1.0',
      }),
    }];
    const tools = registerAll();
    const res = await tools.get('post_types_update_template')!.handler({
      websiteId: 50,
      typeId: 7,
      template: {
        blocks: [
          { id: 'first', type: 'post-content', order: 0 },
          { id: 'second', type: 'post-content', order: 1 },
        ],
        version: '1.0',
      },
    });
    const out = parseJson(res) as { template: { blocks: { type: string }[] } };
    const placeholders = out.template.blocks.filter((b) => b.type === 'post-content');
    expect(placeholders).toHaveLength(1);
  });

  it('tolerates a returning row with malformed JSON template', async () => {
    stageOwnedSiteAndType({ id: 7, websiteId: 50 });
    dbState.updateReturning = [{ id: 7, template: 'definitely not json' }];
    const tools = registerAll();
    const res = await tools.get('post_types_update_template')!.handler({
      websiteId: 50,
      typeId: 7,
      template: { blocks: [], version: '1.0' },
    });
    const out = parseJson(res) as { template: unknown; defaulted: boolean };
    expect(out.defaulted).toBe(false);
    expect(out.template).toBeNull();
  });
});

// ── post_types_get_code ────────────────────────────────────────────────────

describe('post_types_get_code', () => {
  it('returns empty strings when both fields are null', async () => {
    stageOwnedSiteAndType({ id: 7, websiteId: 50, customCss: null, customJs: null });
    const tools = registerAll();
    const res = await tools.get('post_types_get_code')!.handler({
      websiteId: 50,
      typeId: 7,
    });
    expect(parseJson(res)).toEqual({ customCss: '', customJs: '' });
  });

  it('returns stored CSS + JS values', async () => {
    stageOwnedSiteAndType({
      id: 7,
      websiteId: 50,
      customCss: '.x{color:red}',
      customJs: 'console.log(1)',
    });
    const tools = registerAll();
    const res = await tools.get('post_types_get_code')!.handler({
      websiteId: 50,
      typeId: 7,
    });
    expect(parseJson(res)).toEqual({
      customCss: '.x{color:red}',
      customJs: 'console.log(1)',
    });
  });

  it('returns not-found when type missing', async () => {
    dbState.selectQueue.push([{ id: 50 }]);
    dbState.selectQueue.push([]);
    const tools = registerAll();
    const res = await tools.get('post_types_get_code')!.handler({
      websiteId: 50,
      typeId: 7,
    });
    expect((parseJson(res) as { error: string }).error).toMatch(/Post type not found/);
  });
});

// ── post_types_update_code ─────────────────────────────────────────────────

describe('post_types_update_code', () => {
  it('returns not-editable when type missing', async () => {
    dbState.selectQueue.push([{ id: 50 }]);
    dbState.selectQueue.push([]);
    const tools = registerAll();
    const res = await tools.get('post_types_update_code')!.handler({
      websiteId: 50,
      typeId: 7,
      customCss: '',
    });
    expect((parseJson(res) as { error: string }).error).toMatch(/not editable/);
  });

  it('persists provided CSS and JS', async () => {
    stageOwnedSiteAndType({ id: 7, websiteId: 50 });
    dbState.updateReturning = [{ id: 7, customCss: '.a{}', customJs: 'x=1' }];
    const tools = registerAll();
    const res = await tools.get('post_types_update_code')!.handler({
      websiteId: 50,
      typeId: 7,
      customCss: '.a{}',
      customJs: 'x=1',
    });
    expect(parseJson(res)).toEqual({ customCss: '.a{}', customJs: 'x=1' });
  });

  it('treats empty strings as clears (null in DB, empty in echo)', async () => {
    stageOwnedSiteAndType({ id: 7, websiteId: 50 });
    dbState.updateReturning = [{ id: 7, customCss: null, customJs: null }];
    const tools = registerAll();
    const res = await tools.get('post_types_update_code')!.handler({
      websiteId: 50,
      typeId: 7,
      customCss: '',
      customJs: '',
    });
    expect(parseJson(res)).toEqual({ customCss: '', customJs: '' });
  });
});

// ── post_types_fields_list ─────────────────────────────────────────────────

describe('post_types_fields_list', () => {
  it('returns not-found when type missing', async () => {
    dbState.selectQueue.push([{ id: 50 }]);
    dbState.selectQueue.push([]);
    const tools = registerAll();
    const res = await tools.get('post_types_fields_list')!.handler({
      websiteId: 50,
      typeId: 7,
    });
    expect((parseJson(res) as { error: string }).error).toMatch(/Post type not found/);
  });

  it('returns the custom field rows', async () => {
    stageOwnedSiteAndType({ id: 7, websiteId: 50 });
    dbState.selectQueue.push([
      { id: 1, name: 'Color', slug: 'color', fieldType: 'text', order: 0 },
      { id: 2, name: 'Items', slug: 'items', fieldType: 'repeater', order: 1 },
    ]);
    const tools = registerAll();
    const res = await tools.get('post_types_fields_list')!.handler({
      websiteId: 50,
      typeId: 7,
    });
    const out = parseJson(res) as { id: number; slug: string }[];
    expect(out).toHaveLength(2);
    expect(out[1].slug).toBe('items');
  });
});

// ── post_types_fields_create ───────────────────────────────────────────────

describe('post_types_fields_create', () => {
  it('returns not-editable when type missing', async () => {
    dbState.selectQueue.push([{ id: 50 }]);
    dbState.selectQueue.push([]);
    const tools = registerAll();
    const res = await tools.get('post_types_fields_create')!.handler({
      websiteId: 50,
      typeId: 7,
      name: 'Color',
      slug: 'color',
      fieldType: 'text',
    });
    expect((parseJson(res) as { error: string }).error).toMatch(/not editable/);
  });

  it('rejects parentId that points to a field on a different type', async () => {
    stageOwnedSiteAndType({ id: 7, websiteId: 50 });
    dbState.selectQueue.push([{ id: 99, postTypeId: 888, fieldType: 'repeater' }]);
    const tools = registerAll();
    const res = await tools.get('post_types_fields_create')!.handler({
      websiteId: 50,
      typeId: 7,
      parentId: 99,
      name: 'Child',
      slug: 'child',
      fieldType: 'text',
    });
    expect((parseJson(res) as { error: string }).error).toMatch(/parentId is not a field on this content type/);
  });

  it('rejects parentId pointing to a non-container field', async () => {
    stageOwnedSiteAndType({ id: 7, websiteId: 50 });
    dbState.selectQueue.push([{ id: 99, postTypeId: 7, fieldType: 'text' }]);
    const tools = registerAll();
    const res = await tools.get('post_types_fields_create')!.handler({
      websiteId: 50,
      typeId: 7,
      parentId: 99,
      name: 'Child',
      slug: 'child',
      fieldType: 'text',
    });
    expect((parseJson(res) as { error: string }).error).toMatch(/repeater or group/);
  });

  it('rejects when parentId field row is missing', async () => {
    stageOwnedSiteAndType({ id: 7, websiteId: 50 });
    dbState.selectQueue.push([]); // parent lookup empty
    const tools = registerAll();
    const res = await tools.get('post_types_fields_create')!.handler({
      websiteId: 50,
      typeId: 7,
      parentId: 99,
      name: 'Child',
      slug: 'child',
      fieldType: 'text',
    });
    expect((parseJson(res) as { error: string }).error).toMatch(/parentId is not a field/);
  });

  it('creates a top-level field successfully', async () => {
    stageOwnedSiteAndType({ id: 7, websiteId: 50 });
    dbState.insertReturning = [{
      id: 33,
      name: 'Color',
      slug: 'color',
      fieldType: 'text',
      required: false,
    }];
    const tools = registerAll();
    const res = await tools.get('post_types_fields_create')!.handler({
      websiteId: 50,
      typeId: 7,
      name: 'Color',
      slug: 'color',
      fieldType: 'text',
    });
    expect((parseJson(res) as { id: number }).id).toBe(33);
  });

  it('creates a nested field when parent is a repeater on the same type', async () => {
    stageOwnedSiteAndType({ id: 7, websiteId: 50 });
    dbState.selectQueue.push([{ id: 99, postTypeId: 7, fieldType: 'repeater' }]);
    dbState.insertReturning = [{ id: 34, name: 'Child', parentId: 99 }];
    const tools = registerAll();
    const res = await tools.get('post_types_fields_create')!.handler({
      websiteId: 50,
      typeId: 7,
      parentId: 99,
      name: 'Child',
      slug: 'child',
      fieldType: 'text',
    });
    expect((parseJson(res) as { id: number; parentId: number }).parentId).toBe(99);
  });

  it('creates a select field with options', async () => {
    stageOwnedSiteAndType({ id: 7, websiteId: 50 });
    dbState.insertReturning = [{
      id: 35,
      fieldType: 'select',
      options: ['a', 'b'],
    }];
    const tools = registerAll();
    const res = await tools.get('post_types_fields_create')!.handler({
      websiteId: 50,
      typeId: 7,
      name: 'Choice',
      slug: 'choice',
      fieldType: 'select',
      options: ['a', 'b'],
    });
    const out = parseJson(res) as { options: string[] };
    expect(out.options).toEqual(['a', 'b']);
  });
});

// ── post_types_fields_update ───────────────────────────────────────────────

describe('post_types_fields_update', () => {
  it('returns not-editable when type missing', async () => {
    dbState.selectQueue.push([{ id: 50 }]);
    dbState.selectQueue.push([]);
    const tools = registerAll();
    const res = await tools.get('post_types_fields_update')!.handler({
      websiteId: 50,
      typeId: 7,
      fieldId: 33,
      name: 'X',
    });
    expect((parseJson(res) as { error: string }).error).toMatch(/not editable/);
  });

  it('returns field-not-found when fieldId does not belong to the type', async () => {
    stageOwnedSiteAndType({ id: 7, websiteId: 50 });
    dbState.selectQueue.push([]); // customFields lookup empty
    const tools = registerAll();
    const res = await tools.get('post_types_fields_update')!.handler({
      websiteId: 50,
      typeId: 7,
      fieldId: 33,
      name: 'X',
    });
    expect((parseJson(res) as { error: string }).error).toMatch(/Custom field not found/);
  });

  it('updates a field on hit', async () => {
    stageOwnedSiteAndType({ id: 7, websiteId: 50 });
    dbState.selectQueue.push([{ id: 33, postTypeId: 7, fieldType: 'text' }]);
    dbState.updateReturning = [{ id: 33, name: 'NewName' }];
    const tools = registerAll();
    const res = await tools.get('post_types_fields_update')!.handler({
      websiteId: 50,
      typeId: 7,
      fieldId: 33,
      name: 'NewName',
    });
    expect((parseJson(res) as { name: string }).name).toBe('NewName');
  });

  it('rejects reparent to a parent on a different type', async () => {
    stageOwnedSiteAndType({ id: 7, websiteId: 50 });
    dbState.selectQueue.push([{ id: 33, postTypeId: 7 }]);                  // field
    dbState.selectQueue.push([{ id: 99, postTypeId: 888, fieldType: 'repeater' }]); // bad parent
    const tools = registerAll();
    const res = await tools.get('post_types_fields_update')!.handler({
      websiteId: 50,
      typeId: 7,
      fieldId: 33,
      parentId: 99,
    });
    expect((parseJson(res) as { error: string }).error).toMatch(/not a field on this content type/);
  });

  it('rejects reparent to a non-container parent', async () => {
    stageOwnedSiteAndType({ id: 7, websiteId: 50 });
    dbState.selectQueue.push([{ id: 33, postTypeId: 7 }]);
    dbState.selectQueue.push([{ id: 99, postTypeId: 7, fieldType: 'text' }]);
    const tools = registerAll();
    const res = await tools.get('post_types_fields_update')!.handler({
      websiteId: 50,
      typeId: 7,
      fieldId: 33,
      parentId: 99,
    });
    expect((parseJson(res) as { error: string }).error).toMatch(/repeater or group/);
  });

  it('rejects reparent when new parent row is missing', async () => {
    stageOwnedSiteAndType({ id: 7, websiteId: 50 });
    dbState.selectQueue.push([{ id: 33, postTypeId: 7 }]);
    dbState.selectQueue.push([]); // parent missing
    const tools = registerAll();
    const res = await tools.get('post_types_fields_update')!.handler({
      websiteId: 50,
      typeId: 7,
      fieldId: 33,
      parentId: 99,
    });
    expect((parseJson(res) as { error: string }).error).toMatch(/not a field/);
  });

  it('allows reparent to a valid group parent on the same type', async () => {
    stageOwnedSiteAndType({ id: 7, websiteId: 50 });
    dbState.selectQueue.push([{ id: 33, postTypeId: 7 }]);
    dbState.selectQueue.push([{ id: 99, postTypeId: 7, fieldType: 'group' }]);
    dbState.updateReturning = [{ id: 33, parentId: 99 }];
    const tools = registerAll();
    const res = await tools.get('post_types_fields_update')!.handler({
      websiteId: 50,
      typeId: 7,
      fieldId: 33,
      parentId: 99,
    });
    expect((parseJson(res) as { parentId: number }).parentId).toBe(99);
  });
});

// ── post_types_fields_delete ───────────────────────────────────────────────

describe('post_types_fields_delete', () => {
  it('returns not-editable when type missing', async () => {
    dbState.selectQueue.push([{ id: 50 }]);
    dbState.selectQueue.push([]);
    const tools = registerAll();
    const res = await tools.get('post_types_fields_delete')!.handler({
      websiteId: 50,
      typeId: 7,
      fieldId: 33,
    });
    expect((parseJson(res) as { error: string }).error).toMatch(/not editable/);
  });

  it('returns field-not-found when field row missing', async () => {
    stageOwnedSiteAndType({ id: 7, websiteId: 50 });
    dbState.selectQueue.push([]);
    const tools = registerAll();
    const res = await tools.get('post_types_fields_delete')!.handler({
      websiteId: 50,
      typeId: 7,
      fieldId: 33,
    });
    expect((parseJson(res) as { error: string }).error).toMatch(/Custom field not found/);
  });

  it('deletes the field and returns success echo', async () => {
    stageOwnedSiteAndType({ id: 7, websiteId: 50 });
    dbState.selectQueue.push([{ id: 33 }]);
    const tools = registerAll();
    const res = await tools.get('post_types_fields_delete')!.handler({
      websiteId: 50,
      typeId: 7,
      fieldId: 33,
    });
    expect(parseJson(res)).toEqual({ success: true, id: 33 });
    expect(dbState.deleteCount).toBe(1);
  });
});

// ── revalidate / next/cache integration (best-effort no-throw) ─────────────

describe('revalidate side-effect', () => {
  it('write paths invoke revalidatePath without throwing on failure', async () => {
    const cache = await import('next/cache');
    (cache.revalidatePath as ReturnType<typeof vi.fn>).mockClear();
    (cache.revalidatePath as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('not in render');
    });
    stageOwnedSiteAndType({ id: 7, websiteId: 50 });
    dbState.updateReturning = [{ id: 7, name: 'X' }];
    const tools = registerAll();
    // Should not throw even though revalidatePath throws inside revalidate().
    const res = await tools.get('post_types_update')!.handler({
      websiteId: 50,
      typeId: 7,
      name: 'X',
    });
    expect((parseJson(res) as { id: number }).id).toBe(7);
    expect(cache.revalidatePath).toHaveBeenCalled();
  });
});
