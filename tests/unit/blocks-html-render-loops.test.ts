// @vitest-environment node
/**
 * Unit coverage for `lib/blocks/html-render-loops.ts` — the server-side
 * expansion of `data-loop="posts"` regions inside html-render blocks, plus
 * post-field resolution and the recursive block-tree walker.
 *
 * The module hits the database via drizzle (`db.select().from(posts)...`).
 * We mock `@/lib/db`, `@/lib/db/schema`, and `drizzle-orm` so the chain
 * captures its conditions/order/limit and returns a programmable row set.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Block, HtmlRenderBlock } from '@/types/blocks';

// ---------------------------------------------------------------------------
// Mock infrastructure
// ---------------------------------------------------------------------------

// Each call to `db.select(...).from(...).where(...).orderBy(...).limit(...)`
// resolves with the next queued row set. Tests push rows via `queueRows()`.
// `lastSelectCall` records the args passed at each link in the chain so tests
// can assert that conditions / orderBy / limit are wired correctly.
type Row = {
  id: number;
  title: string | null;
  slug: string | null;
  excerpt: string | null;
  coverImage: string | null;
  publishedAt: Date | string | null;
  postType: string;
  content?: string | null;
};

const queuedRowSets: Row[][] = [];
let lastSelectCall: {
  selectArg?: unknown;
  whereArg?: unknown;
  orderByArg?: unknown;
  limitArg?: unknown;
} = {};

function queueRows(rows: Row[]) {
  queuedRowSets.push(rows);
}

function nextRowSet(): Row[] {
  return queuedRowSets.shift() ?? [];
}

vi.mock('@/lib/db', () => ({
  db: {
    select: (selectArg?: unknown) => {
      // The count-subquery for pagination (`select({ c: sql\`count(*)\` })`)
      // runs in parallel with the data select via Promise.all. Don't let it
      // overwrite the test-observable `lastSelectCall` — tests assert on the
      // data query's limit/orderBy, not the count query's.
      const isCountSubquery =
        selectArg !== null && typeof selectArg === 'object' &&
        Object.keys(selectArg as Record<string, unknown>).length === 1 &&
        'c' in (selectArg as Record<string, unknown>);
      if (!isCountSubquery) {
        lastSelectCall = { selectArg };
      }
      return {
        from: () => {
          // Query shapes in the source:
          //  - fetchLoopItems: select().from().where().orderBy().limit().offset()
          //  - resolvePostFields: select().from().where()
          //  - fetchPostCustomFields (post-types lookup): select().from().where().limit(1)
          //  - fetchPostCustomFields (customFields, values): select().from().where()
          // `.where()` resolves directly to rows, or chains into
          // `.orderBy().limit().offset()` / `.limit()` that resolves to the same set.
          type LimitChain = { offset: (n: number) => Promise<Row[]> } & PromiseLike<Row[]>;
          let whereResult: {
            orderBy: (oc: unknown) => { limit: (n: number) => LimitChain };
            limit: (n: number) => LimitChain;
          } & PromiseLike<Row[]>;
          const where = (w: unknown) => {
            lastSelectCall.whereArg = w;
            const rowsPromise = Promise.resolve(nextRowSet());
            const limitChain = (n: number): LimitChain => {
              lastSelectCall.limitArg = n;
              return {
                offset: (_o: number) => rowsPromise,
                then: (onF: (r: Row[]) => unknown, onR?: (e: unknown) => unknown) => rowsPromise.then(onF, onR),
              } as LimitChain;
            };
            whereResult = {
              orderBy: (oc: unknown) => {
                lastSelectCall.orderByArg = oc;
                return { limit: limitChain };
              },
              limit: limitChain,
              // Awaiting `.where()` directly should also resolve to rows.
              then: (onF: (r: Row[]) => unknown, onR?: (e: unknown) => unknown) => rowsPromise.then(onF, onR),
            } as typeof whereResult;
            return whereResult;
          };
          return { where };
        },
      };
    },
  },
}));

vi.mock('@/lib/db/schema', () => ({
  posts: {
    id: { name: 'id' },
    title: { name: 'title' },
    slug: { name: 'slug' },
    excerpt: { name: 'excerpt' },
    coverImage: { name: 'cover_image' },
    publishedAt: { name: 'published_at' },
    postType: { name: 'post_type' },
    content: { name: 'content' },
    websiteId: { name: 'website_id' },
    published: { name: 'published' },
  },
  // The html-render-loops code resolves typed CMS post-type fields by joining
  // post_types → custom_fields → post_custom_field_values. The minimal column
  // surface keeps the eq()/and()/select() builder happy under the same shape
  // as `posts` above.
  postTypes: {
    id: { name: 'id' },
    slug: { name: 'slug' },
    websiteId: { name: 'website_id' },
  },
  customFields: {
    id: { name: 'id' },
    slug: { name: 'slug' },
    postTypeId: { name: 'post_type_id' },
  },
  postCustomFieldValues: {
    postId: { name: 'post_id' },
    customFieldId: { name: 'custom_field_id' },
    value: { name: 'value' },
  },
}));

vi.mock('drizzle-orm', () => ({
  and: (...args: unknown[]) => ({ _kind: 'and', args }),
  asc: (col: unknown) => ({ _kind: 'asc', col }),
  desc: (col: unknown) => ({ _kind: 'desc', col }),
  eq: (a: unknown, b: unknown) => ({ _kind: 'eq', a, b }),
  inArray: (col: unknown, vals: unknown[]) => ({ _kind: 'inArray', col, vals }),
  ne: (a: unknown, b: unknown) => ({ _kind: 'ne', a, b }),
  notInArray: (col: unknown, vals: unknown[]) => ({ _kind: 'notInArray', col, vals }),
  // Tagged-template + value-coercing `sql` shim — used by the loops code for
  // post-type-scoped count subqueries; the tests don't assert on its output.
  sql: Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => ({ _kind: 'sql', strings, values }),
    {
      raw: (s: string) => ({ _kind: 'sql-raw', s }),
    },
  ),
}));

// ---------------------------------------------------------------------------
// Imports under test (after mocks)
// ---------------------------------------------------------------------------
import {
  expandHtmlRenderLoops,
  expandLoopsInBlocks,
  expandLoopsInContent,
} from '@/lib/blocks/html-render-loops';

beforeEach(() => {
  queuedRowSets.length = 0;
  lastSelectCall = {};
});

// ---------------------------------------------------------------------------
// expandHtmlRenderLoops — happy paths
// ---------------------------------------------------------------------------
describe('expandHtmlRenderLoops', () => {
  it('returns the block unchanged when no loop config is present', async () => {
    const block: HtmlRenderBlock = {
      id: 'b1',
      type: 'html-render',
      html: '<div data-loop="posts"><h3>{{post.title}}</h3></div>',
    };
    const out = await expandHtmlRenderLoops(10, block);
    // Must be the exact same reference (early return).
    expect(out).toBe(block);
    // And no DB call was made.
    expect(lastSelectCall.whereArg).toBeUndefined();
  });

  it('returns the block unchanged when html has no data-loop region', async () => {
    const block: HtmlRenderBlock = {
      id: 'b2',
      type: 'html-render',
      html: '<section><h2>Static page</h2></section>',
      loop: { source: 'posts', postType: 'blog' },
    };
    const out = await expandHtmlRenderLoops(1, block);
    expect(out).toBe(block);
    // No fetch happened — region scan short-circuited.
    expect(lastSelectCall.whereArg).toBeUndefined();
  });

  it('repeats the loop element once per fetched post and substitutes placeholders', async () => {
    queueRows([
      {
        id: 1,
        title: 'First',
        slug: 'first',
        excerpt: 'Hello',
        coverImage: 'https://cdn/a.png',
        publishedAt: new Date('2026-01-01T00:00:00Z'),
        postType: 'blog',
      },
      {
        id: 2,
        title: 'Second',
        slug: 'second',
        excerpt: 'World',
        coverImage: '',
        publishedAt: new Date('2026-01-02T00:00:00Z'),
        postType: 'blog',
      },
    ]);
    const block: HtmlRenderBlock = {
      id: 'b3',
      type: 'html-render',
      html: '<ul><li data-loop="posts"><a href="{{post.url}}">{{post.title}}</a></li></ul>',
      loop: { source: 'posts', postType: 'blog', limit: 5 },
    };
    const out = await expandHtmlRenderLoops(42, block);
    expect(out.html).toContain('href="/blog/first"');
    expect(out.html).toContain('href="/blog/second"');
    expect(out.html).toContain('>First<');
    expect(out.html).toContain('>Second<');
    // data-loop attribute stripped, replaced with data-loop-item indices
    expect(out.html).not.toContain('data-loop="posts"');
    expect(out.html).toContain('data-loop-item="0"');
    expect(out.html).toContain('data-loop-item="1"');
    // Two <li> elements in the output
    expect((out.html.match(/<li/g) || []).length).toBe(2);
    // Surrounding <ul></ul> preserved
    expect(out.html.startsWith('<ul>')).toBe(true);
    expect(out.html.endsWith('</ul>')).toBe(true);
  });

  it('drops the loop element entirely when no posts match', async () => {
    queueRows([]); // empty result
    const block: HtmlRenderBlock = {
      id: 'b4',
      type: 'html-render',
      html: '<section>Above<div data-loop="posts">card {{post.title}}</div>Below</section>',
      loop: { source: 'posts', postType: 'event' },
    };
    const out = await expandHtmlRenderLoops(7, block);
    // The loop wrapper and its inner content are gone, surrounding text is intact.
    expect(out.html).not.toContain('data-loop');
    expect(out.html).not.toContain('card');
    expect(out.html).toContain('Above');
    expect(out.html).toContain('Below');
  });

  it('html-attribute-escapes built-in scalar placeholders (e.g. title with quotes)', async () => {
    queueRows([
      {
        id: 9,
        title: 'A "quoted" & <special> title',
        slug: 'tricky',
        excerpt: '',
        coverImage: '',
        publishedAt: null,
        postType: 'blog',
      },
    ]);
    const block: HtmlRenderBlock = {
      id: 'b5',
      type: 'html-render',
      html: '<li data-loop="posts"><span title="{{post.title}}">{{post.title}}</span></li>',
      loop: { source: 'posts', postType: 'blog' },
    };
    const out = await expandHtmlRenderLoops(1, block);
    expect(out.html).toContain('&quot;quoted&quot;');
    expect(out.html).toContain('&amp;');
    expect(out.html).toContain('&lt;special&gt;');
    // Original raw chars must NOT appear in the rendered output.
    expect(out.html).not.toMatch(/<span title="A "quoted"/);
  });

  it('passes post.values.X through verbatim (raw HTML from authored richtext)', async () => {
    queueRows([
      {
        id: 12,
        title: 'T',
        slug: 't',
        excerpt: '',
        coverImage: '',
        publishedAt: null,
        postType: 'blog',
        // The target post's serialized content carries an html-render block
        // whose `values` map should be exposed under post.values.X.
        content: JSON.stringify({
          blocks: [
            {
              id: 'inner',
              type: 'html-render',
              html: '',
              values: { card_body: '<strong>Bold copy</strong>' },
            },
          ],
        }),
      },
    ]);
    const block: HtmlRenderBlock = {
      id: 'b6',
      type: 'html-render',
      html: '<li data-loop="posts"><div>{{post.values.card_body}}</div></li>',
      loop: { source: 'posts', postType: 'blog' },
    };
    const out = await expandHtmlRenderLoops(1, block);
    // The richtext value lands verbatim (NOT escaped).
    expect(out.html).toContain('<strong>Bold copy</strong>');
  });

  it('emits empty string for an unknown post.X placeholder', async () => {
    queueRows([
      {
        id: 1,
        title: 'OK',
        slug: 'ok',
        excerpt: '',
        coverImage: '',
        publishedAt: null,
        postType: 'blog',
      },
    ]);
    const block: HtmlRenderBlock = {
      id: 'b7',
      type: 'html-render',
      html: '<li data-loop="posts">[{{post.title}}|{{post.bogus}}|{{post.values.missing}}]</li>',
      loop: { source: 'posts', postType: 'blog' },
    };
    const out = await expandHtmlRenderLoops(1, block);
    expect(out.html).toContain('[OK||]');
  });

  it('auto-excludes currentPostId from the fetch (passed through to inArray)', async () => {
    queueRows([]);
    const block: HtmlRenderBlock = {
      id: 'b8',
      type: 'html-render',
      html: '<div data-loop="posts">x</div>',
      loop: { source: 'posts', postType: 'blog', exclude: [5, 6] },
    };
    await expandHtmlRenderLoops(1, block, 99);
    // and(...) gets the conditions; one of them is notInArray with the merged set
    const andCall = lastSelectCall.whereArg as { args: Array<{ _kind: string; vals?: number[] }> };
    const notIn = andCall.args.find(c => c._kind === 'notInArray');
    expect(notIn).toBeDefined();
    // Set unions in any order — check membership not order
    expect(notIn?.vals?.sort()).toEqual([5, 6, 99]);
  });

  it('does not add notInArray when no exclusions are present', async () => {
    queueRows([]);
    const block: HtmlRenderBlock = {
      id: 'b9',
      type: 'html-render',
      html: '<div data-loop="posts">x</div>',
      loop: { source: 'posts', postType: 'blog' },
    };
    await expandHtmlRenderLoops(1, block); // no currentPostId
    const andCall = lastSelectCall.whereArg as { args: Array<{ _kind: string }> };
    expect(andCall.args.some(c => c._kind === 'notInArray')).toBe(false);
  });

  it('clamps limit to [1, 24]', async () => {
    queueRows([]);
    const block: HtmlRenderBlock = {
      id: 'b10',
      type: 'html-render',
      html: '<div data-loop="posts">x</div>',
      loop: { source: 'posts', postType: 'blog', limit: 9999 },
    };
    await expandHtmlRenderLoops(1, block);
    expect(lastSelectCall.limitArg).toBe(24);

    queueRows([]);
    await expandHtmlRenderLoops(1, {
      ...block,
      loop: { source: 'posts', postType: 'blog', limit: -5 },
    });
    expect(lastSelectCall.limitArg).toBe(1);

    queueRows([]);
    await expandHtmlRenderLoops(1, {
      ...block,
      loop: { source: 'posts', postType: 'blog' }, // default
    });
    expect(lastSelectCall.limitArg).toBe(3);
  });

  it('orderBy "title" maps to asc(title)', async () => {
    queueRows([]);
    await expandHtmlRenderLoops(1, {
      id: 'o1', type: 'html-render',
      html: '<div data-loop="posts">x</div>',
      loop: { source: 'posts', postType: 'blog', orderBy: 'title' },
    });
    const o = lastSelectCall.orderByArg as { _kind: string; col: { name: string } };
    expect(o._kind).toBe('asc');
    expect(o.col.name).toBe('title');
  });

  it('orderBy "oldest" maps to asc(published_at)', async () => {
    queueRows([]);
    await expandHtmlRenderLoops(1, {
      id: 'o2', type: 'html-render',
      html: '<div data-loop="posts">x</div>',
      loop: { source: 'posts', postType: 'blog', orderBy: 'oldest' },
    });
    const o = lastSelectCall.orderByArg as { _kind: string; col: { name: string } };
    expect(o._kind).toBe('asc');
    expect(o.col.name).toBe('published_at');
  });

  it('orderBy default ("recent") maps to desc(published_at)', async () => {
    queueRows([]);
    await expandHtmlRenderLoops(1, {
      id: 'o3', type: 'html-render',
      html: '<div data-loop="posts">x</div>',
      loop: { source: 'posts', postType: 'blog' },
    });
    const o = lastSelectCall.orderByArg as { _kind: string; col: { name: string } };
    expect(o._kind).toBe('desc');
    expect(o.col.name).toBe('published_at');
  });

  it('routes non-blog post types to "/<slug>" rather than "/blog/<slug>"', async () => {
    queueRows([
      {
        id: 1,
        title: 'Case A',
        slug: 'case-a',
        excerpt: '',
        coverImage: '',
        publishedAt: null,
        postType: 'case-study',
      },
    ]);
    const out = await expandHtmlRenderLoops(1, {
      id: 'r', type: 'html-render',
      html: '<li data-loop="posts"><a href="{{post.url}}">{{post.title}}</a></li>',
      loop: { source: 'posts', postType: 'case-study' },
    });
    expect(out.html).toContain('href="/case-a"');
    expect(out.html).not.toContain('/blog/case-a');
  });

  it('handles missing optional fields (null title / slug / dates) without crashing', async () => {
    queueRows([
      {
        id: 1, title: null, slug: null,
        excerpt: null, coverImage: null,
        publishedAt: null, postType: 'blog',
      },
    ]);
    const out = await expandHtmlRenderLoops(1, {
      id: 'n', type: 'html-render',
      html: '<li data-loop="posts">[{{post.title}}/{{post.publishedAt}}]</li>',
      loop: { source: 'posts', postType: 'blog' },
    });
    expect(out.html).toContain('[/]');
  });

  it('falls back to empty values when post content JSON is malformed', async () => {
    queueRows([
      {
        id: 1, title: 'X', slug: 'x', excerpt: '', coverImage: '',
        publishedAt: null, postType: 'blog',
        content: '{not json',
      },
    ]);
    const out = await expandHtmlRenderLoops(1, {
      id: 'm', type: 'html-render',
      html: '<li data-loop="posts">[{{post.values.anything}}]</li>',
      loop: { source: 'posts', postType: 'blog' },
    });
    expect(out.html).toContain('[]');
  });

  it('returns empty values map when content is empty string', async () => {
    queueRows([
      {
        id: 1, title: 'X', slug: 'x', excerpt: '', coverImage: '',
        publishedAt: null, postType: 'blog',
        content: '',
      },
    ]);
    const out = await expandHtmlRenderLoops(1, {
      id: 'e', type: 'html-render',
      html: '<li data-loop="posts">[{{post.values.k}}]</li>',
      loop: { source: 'posts', postType: 'blog' },
    });
    expect(out.html).toContain('[]');
  });

  it('non-html-render blocks inside post content do not contribute values', async () => {
    queueRows([
      {
        id: 1, title: 'X', slug: 'x', excerpt: '', coverImage: '',
        publishedAt: null, postType: 'blog',
        content: JSON.stringify({
          blocks: [
            // Not an html-render block — should be skipped silently
            { id: 't', type: 'text', text: 'hello' },
            { id: 'h', type: 'html-render', html: '', values: { k: 'v' } },
          ],
        }),
      },
    ]);
    const out = await expandHtmlRenderLoops(1, {
      id: 'mx', type: 'html-render',
      html: '<li data-loop="posts">[{{post.values.k}}]</li>',
      loop: { source: 'posts', postType: 'blog' },
    });
    expect(out.html).toContain('[v]');
  });

  it('later html-render blocks in content win on key collision (merge order)', async () => {
    queueRows([
      {
        id: 1, title: 'X', slug: 'x', excerpt: '', coverImage: '',
        publishedAt: null, postType: 'blog',
        content: JSON.stringify({
          blocks: [
            { id: 'a', type: 'html-render', html: '', values: { color: 'red' } },
            { id: 'b', type: 'html-render', html: '', values: { color: 'blue' } },
          ],
        }),
      },
    ]);
    const out = await expandHtmlRenderLoops(1, {
      id: 'mc', type: 'html-render',
      html: '<li data-loop="posts">[{{post.values.color}}]</li>',
      loop: { source: 'posts', postType: 'blog' },
    });
    expect(out.html).toContain('[blue]');
  });

  it('serializes publishedAt as ISO string when present', async () => {
    queueRows([
      {
        id: 1, title: 'X', slug: 'x', excerpt: '', coverImage: '',
        publishedAt: new Date('2026-03-15T12:00:00Z'),
        postType: 'blog',
      },
    ]);
    const out = await expandHtmlRenderLoops(1, {
      id: 'd', type: 'html-render',
      html: '<li data-loop="posts">[{{post.publishedAt}}]</li>',
      loop: { source: 'posts', postType: 'blog' },
    });
    expect(out.html).toContain('2026-03-15T12:00:00.000Z');
  });

  it('handles missing html on the block (empty string default)', async () => {
    const block = {
      id: 'no-html', type: 'html-render', html: '',
      loop: { source: 'posts' as const, postType: 'blog' },
    };
    const out = await expandHtmlRenderLoops(1, block);
    // No regions in empty html — original block returned unchanged.
    expect(out).toBe(block);
  });

  it('handles multiple loop regions in the same html', async () => {
    // First findLoopRegions sweep produces two regions, but fetchLoopItems
    // runs once and items are repeated into BOTH regions (back-to-front).
    queueRows([
      {
        id: 1, title: 'A', slug: 'a', excerpt: '', coverImage: '',
        publishedAt: null, postType: 'blog',
      },
    ]);
    const out = await expandHtmlRenderLoops(1, {
      id: 'multi', type: 'html-render',
      html: '<div data-loop="posts">first {{post.title}}</div>'
        + '<div data-loop="posts">second {{post.title}}</div>',
      loop: { source: 'posts', postType: 'blog' },
    });
    // Both regions populated with the single item
    expect(out.html).toContain('first A');
    expect(out.html).toContain('second A');
  });

  it('properly handles nested same-tag elements inside a loop region', async () => {
    queueRows([
      {
        id: 1, title: 'Nest', slug: 'n', excerpt: '', coverImage: '',
        publishedAt: null, postType: 'blog',
      },
    ]);
    const out = await expandHtmlRenderLoops(1, {
      id: 'nest', type: 'html-render',
      html: '<div data-loop="posts"><div class="card">{{post.title}}<div>inner</div></div></div>',
      loop: { source: 'posts', postType: 'blog' },
    });
    // Outer wrapper preserved, inner div untouched, placeholder filled
    expect(out.html).toContain('Nest');
    expect(out.html).toContain('<div>inner</div>');
    // data-loop attribute is stripped from the outermost wrapper
    expect(out.html).not.toMatch(/data-loop="posts"/);
  });

  it('ignores void/self-closing elements when scanning for loop regions', async () => {
    queueRows([]);
    const block: HtmlRenderBlock = {
      id: 'void', type: 'html-render',
      // <img data-loop> would be a region if void tags weren't skipped — they are.
      html: '<img data-loop="posts" src="" /><br data-loop="posts">',
      loop: { source: 'posts', postType: 'blog' },
    };
    const out = await expandHtmlRenderLoops(1, block);
    // No region found → block returned unchanged.
    expect(out).toBe(block);
  });
});

// ---------------------------------------------------------------------------
// expandLoopsInBlocks — recursive walker
// ---------------------------------------------------------------------------
describe('expandLoopsInBlocks', () => {
  it('returns non-html-render blocks unchanged', async () => {
    const blocks: Block[] = [
      { id: 'p', type: 'paragraph', text: 'hi' } as unknown as Block,
      { id: 'h', type: 'heading', text: 'Title' } as unknown as Block,
    ];
    const out = await expandLoopsInBlocks(1, blocks);
    expect(out).toEqual(blocks);
  });

  it('expands an html-render block at the top level', async () => {
    queueRows([
      {
        id: 1, title: 'P', slug: 'p', excerpt: '', coverImage: '',
        publishedAt: null, postType: 'blog',
      },
    ]);
    const blocks: Block[] = [
      {
        id: 'h1', type: 'html-render',
        html: '<li data-loop="posts">{{post.title}}</li>',
        loop: { source: 'posts', postType: 'blog' },
      } as HtmlRenderBlock,
    ];
    const out = await expandLoopsInBlocks(1, blocks);
    const rendered = (out[0] as HtmlRenderBlock).html;
    expect(rendered).toContain('>P</li>');
    expect(rendered).not.toContain('data-loop="posts"');
  });

  it('recurses into columns containers', async () => {
    queueRows([
      {
        id: 1, title: 'C', slug: 'c', excerpt: '', coverImage: '',
        publishedAt: null, postType: 'blog',
      },
    ]);
    const blocks: Block[] = [
      {
        id: 'col', type: 'columns',
        columns: [
          {
            blocks: [
              {
                id: 'inner', type: 'html-render',
                html: '<li data-loop="posts">{{post.title}}</li>',
                loop: { source: 'posts', postType: 'blog' },
              } as HtmlRenderBlock,
            ],
          },
        ],
      } as unknown as Block,
    ];
    const out = await expandLoopsInBlocks(1, blocks);
    const innerHtml = ((out[0] as unknown as { columns: Array<{ blocks: HtmlRenderBlock[] }> })
      .columns[0].blocks[0]).html;
    expect(innerHtml).toContain('>C</li>');
  });

  it('recurses into tabs containers', async () => {
    queueRows([
      {
        id: 1, title: 'T', slug: 't', excerpt: '', coverImage: '',
        publishedAt: null, postType: 'blog',
      },
    ]);
    const blocks: Block[] = [
      {
        id: 'tabs', type: 'tabs',
        tabs: [
          {
            blocks: [
              {
                id: 'inner', type: 'html-render',
                html: '<li data-loop="posts">{{post.title}}</li>',
                loop: { source: 'posts', postType: 'blog' },
              } as HtmlRenderBlock,
            ],
          },
        ],
      } as unknown as Block,
    ];
    const out = await expandLoopsInBlocks(1, blocks);
    const innerHtml = ((out[0] as unknown as { tabs: Array<{ blocks: HtmlRenderBlock[] }> })
      .tabs[0].blocks[0]).html;
    expect(innerHtml).toContain('>T</li>');
  });

  it('recurses into section containers', async () => {
    queueRows([
      {
        id: 1, title: 'S', slug: 's', excerpt: '', coverImage: '',
        publishedAt: null, postType: 'blog',
      },
    ]);
    const blocks: Block[] = [
      {
        id: 'sec', type: 'section',
        blocks: [
          {
            id: 'inner', type: 'html-render',
            html: '<li data-loop="posts">{{post.title}}</li>',
            loop: { source: 'posts', postType: 'blog' },
          } as HtmlRenderBlock,
        ],
      } as unknown as Block,
    ];
    const out = await expandLoopsInBlocks(1, blocks);
    const innerHtml = ((out[0] as unknown as { blocks: HtmlRenderBlock[] }).blocks[0]).html;
    expect(innerHtml).toContain('>S</li>');
  });

  it('handles a columns block whose columns are missing blocks (defensive default to [])', async () => {
    const blocks: Block[] = [
      {
        id: 'empty-col', type: 'columns',
        columns: [{}], // no `blocks` array
      } as unknown as Block,
    ];
    const out = await expandLoopsInBlocks(1, blocks);
    expect((out[0] as unknown as { columns: Array<{ blocks: Block[] }> }).columns[0].blocks).toEqual([]);
  });

  it('skips columns/tabs/section recursion when the array is missing', async () => {
    // columns block WITHOUT `columns` array — falls through to push as-is.
    const blocks: Block[] = [
      { id: 'lone-col', type: 'columns' } as unknown as Block,
      { id: 'lone-tabs', type: 'tabs' } as unknown as Block,
      { id: 'lone-sec', type: 'section' } as unknown as Block,
    ];
    const out = await expandLoopsInBlocks(1, blocks);
    expect(out).toEqual(blocks);
  });

  it('resolves post-typed fields into row objects before loop expansion', async () => {
    // resolvePostFields is called first — it does ONE select (no orderBy/limit)
    // to fetch the records keyed by id. Then fetchLoopItems runs for the loop.
    queueRows([
      {
        id: 99, title: 'Hero', slug: 'hero',
        excerpt: '', coverImage: '',
        publishedAt: new Date('2026-01-01T00:00:00Z'),
        postType: 'blog',
      },
    ]);
    // No loop, so fetchLoopItems isn't called — but the block has no loop.
    const blocks: Block[] = [
      {
        id: 'pf', type: 'html-render',
        html: '<a href="{{featured.url}}">{{featured.title}}</a>',
        fields: [{ name: 'featured', type: 'post' }],
        values: { featured: '99' },
      } as unknown as HtmlRenderBlock,
    ];
    const out = await expandLoopsInBlocks(1, blocks);
    const v = ((out[0] as HtmlRenderBlock).values as Record<string, unknown>).featured as {
      id: string; title: string; slug: string; url: string;
    };
    expect(v.id).toBe('99');
    expect(v.title).toBe('Hero');
    expect(v.url).toBe('/blog/hero');
  });

  it('resolves post field to empty object when value is empty string', async () => {
    const blocks: Block[] = [
      {
        id: 'pf2', type: 'html-render',
        html: '<a href="{{ref.url}}">x</a>',
        fields: [{ name: 'ref', type: 'post' }],
        values: { ref: '' },
      } as unknown as HtmlRenderBlock,
    ];
    const out = await expandLoopsInBlocks(1, blocks);
    // No ids to lookup → resolvePostFields exits early, block unchanged.
    expect((out[0] as HtmlRenderBlock).values?.ref).toBe('');
  });

  it('resolves post field to empty object when looked-up id is not found', async () => {
    queueRows([]); // no rows match
    const blocks: Block[] = [
      {
        id: 'pf3', type: 'html-render',
        html: '<a href="{{ref.url}}">x</a>',
        fields: [{ name: 'ref', type: 'post' }],
        values: { ref: '404' },
      } as unknown as HtmlRenderBlock,
    ];
    const out = await expandLoopsInBlocks(1, blocks);
    expect(((out[0] as HtmlRenderBlock).values as Record<string, unknown>).ref).toEqual({});
  });

  it('skips post-field resolution when block has no fields', async () => {
    const blocks: Block[] = [
      {
        id: 'pf4', type: 'html-render',
        html: '<p>{{x}}</p>',
        values: { x: 'y' },
      } as unknown as HtmlRenderBlock,
    ];
    const out = await expandLoopsInBlocks(1, blocks);
    // No DB lookup happened
    expect(lastSelectCall.whereArg).toBeUndefined();
    expect(out[0]).toEqual(blocks[0]);
  });

  it('skips post-field resolution when no fields are of type "post"', async () => {
    const blocks: Block[] = [
      {
        id: 'pf5', type: 'html-render',
        html: '<p>{{x}}</p>',
        fields: [{ name: 'x', type: 'text' }],
        values: { x: 'y' },
      } as unknown as HtmlRenderBlock,
    ];
    const out = await expandLoopsInBlocks(1, blocks);
    expect(lastSelectCall.whereArg).toBeUndefined();
    expect(out[0]).toEqual(blocks[0]);
  });

  it('resolves post field with missing/non-string value as {}', async () => {
    // The fields config declares a post type, but the value isn't a string.
    // resolvePostFields filters to numeric ids; no ids → returns block early.
    const blocks: Block[] = [
      {
        id: 'pf6', type: 'html-render',
        html: '<p>{{ref.url}}</p>',
        fields: [{ name: 'ref', type: 'post' }],
        values: {} as Record<string, string>, // no `ref` key at all
      } as unknown as HtmlRenderBlock,
    ];
    const out = await expandLoopsInBlocks(1, blocks);
    expect(lastSelectCall.whereArg).toBeUndefined();
    expect((out[0] as HtmlRenderBlock).values).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// expandLoopsInContent — JSON wrapper
// ---------------------------------------------------------------------------
describe('expandLoopsInContent', () => {
  it('returns the input untouched when JSON is malformed', async () => {
    const bad = '{not valid';
    const out = await expandLoopsInContent(1, bad);
    expect(out).toBe(bad);
  });

  it('returns the input untouched when there are no blocks', async () => {
    const empty = JSON.stringify({ blocks: [] });
    const out = await expandLoopsInContent(1, empty);
    expect(out).toBe(empty);
  });

  it('returns the input untouched when `blocks` is missing', async () => {
    const noBlocks = JSON.stringify({ version: '1.0' });
    const out = await expandLoopsInContent(1, noBlocks);
    expect(out).toBe(noBlocks);
  });

  it('expands blocks and returns a serialized JSON envelope', async () => {
    queueRows([
      {
        id: 1, title: 'Item', slug: 'item', excerpt: '', coverImage: '',
        publishedAt: null, postType: 'blog',
      },
    ]);
    const json = JSON.stringify({
      blocks: [
        {
          id: 'h', type: 'html-render',
          html: '<li data-loop="posts">{{post.title}}</li>',
          loop: { source: 'posts', postType: 'blog' },
        },
      ],
      version: '1.0',
    });
    const out = await expandLoopsInContent(1, json);
    const parsed = JSON.parse(out);
    expect(parsed.version).toBe('1.0');
    expect(parsed.blocks[0].html).toContain('>Item</li>');
    expect(parsed.blocks[0].html).not.toContain('data-loop="posts"');
  });

  it('defaults version to "1.0" when not present in the input', async () => {
    queueRows([]); // empty loop result
    const json = JSON.stringify({
      blocks: [
        {
          id: 'h', type: 'html-render',
          html: '<li data-loop="posts">x</li>',
          loop: { source: 'posts', postType: 'blog' },
        },
      ],
    });
    const out = await expandLoopsInContent(1, json);
    const parsed = JSON.parse(out);
    expect(parsed.version).toBe('1.0');
  });

  it('passes currentPostId through to expandLoopsInBlocks for auto-exclude', async () => {
    queueRows([]); // empty loop; we just check the where clause
    const json = JSON.stringify({
      blocks: [
        {
          id: 'h', type: 'html-render',
          html: '<li data-loop="posts">x</li>',
          loop: { source: 'posts', postType: 'blog' },
        },
      ],
    });
    await expandLoopsInContent(7, json, 42);
    const andCall = lastSelectCall.whereArg as { args: Array<{ _kind: string; vals?: number[] }> };
    const notIn = andCall.args.find(c => c._kind === 'notInArray');
    expect(notIn?.vals).toContain(42);
  });
});
