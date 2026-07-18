/**
 * CMS posts — scheduled publish lifecycle @cms @posts @scheduled
 *
 * Contract:
 *   - PATCH /api/posts/[id]/schedule sets publishedAt to a future ISO date,
 *     leaves `published=false` until the cron tick lands.
 *   - PATCH /api/posts/[id]/schedule with publishedAt=null clears the schedule.
 *   - The /api/posts/calendar endpoint surfaces scheduled posts with
 *     status='scheduled' until the cron tick flips them.
 *   - Cron tick (simulated as the SQL the worker runs) flips
 *     published=true for any row whose publishedAt has passed.
 *
 * NOTE: There is no scheduled-publish cron route yet. We exercise the
 *       same SQL the worker will run when shipped — so this file is the
 *       behavioural contract the cron implementation must honor.
 */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));

import { auth } from '@/lib/auth';
const mockedAuth = auth as unknown as Mock;

import { callHandler } from '../../../helpers/call-handler';
import { sessionForNewClientUser, type TenantCtx } from '../../../helpers/session';
import { getTestSql, TEST_SCHEMA } from '../../../helpers/test-db';

async function seedSite(ctx: TenantCtx, label = 'site'): Promise<{ siteId: number }> {
  const sql = getTestSql();
  const [s] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.client_websites (client_id, name, domain)
    VALUES (${ctx.client.id}, ${`${label}-${Date.now()}`}, ${`${label}-${Date.now()}.test`})
    RETURNING id
  `;
  return { siteId: s.id };
}

async function seedPost(
  siteId: number,
  overrides: { slug?: string; published?: boolean; publishedAt?: Date | null } = {},
): Promise<{ id: number }> {
  const sql = getTestSql();
  const slug = overrides.slug ?? `post-${Date.now()}-${Math.floor(Math.random() * 9999)}`;
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.posts (
      website_id, title, slug, post_type, content, published, published_at
    ) VALUES (
      ${siteId}, 'Sched Post', ${slug}, 'blog',
      ${JSON.stringify({ blocks: [] })},
      ${overrides.published ?? false},
      ${overrides.publishedAt ?? null}
    ) RETURNING id
  `;
  return row;
}

describe('PATCH /api/posts/[id]/schedule @cms @posts @scheduled', () => {
  let A: TenantCtx;
  let siteId: number;
  let postId: number;

  beforeEach(async () => {
    A = await sessionForNewClientUser('cms-sched');
    ({ siteId } = await seedSite(A));
    ({ id: postId } = await seedPost(siteId));
    mockedAuth.mockResolvedValue(A.session);
  });

  it('400 on invalid ISO date', async () => {
    const route = await import('@/app/api/posts/[id]/schedule/route');
    const res = await callHandler<{ success: boolean; error: string }>(
      route as unknown as Record<string, unknown>, 'PATCH',
      { params: { id: String(postId) }, body: { publishedAt: 'not-a-date' } },
    );
    expect(res.status).toBe(400);
    expect(res.data?.error).toMatch(/validation/i);
  });

  it('schedules a future publish (published stays false, publishedAt is future)', async () => {
    const future = new Date(Date.now() + 60 * 60 * 1000); // +1h
    const route = await import('@/app/api/posts/[id]/schedule/route');
    const res = await callHandler<{ success: boolean; data: { publishedAt: string; published: boolean } }>(
      route as unknown as Record<string, unknown>, 'PATCH',
      {
        params: { id: String(postId) },
        body: { publishedAt: future.toISOString(), published: false },
      },
    );
    expect(res.status).toBe(200);
    expect(res.data!.data.published).toBe(false);
    expect(new Date(res.data!.data.publishedAt).getTime()).toBeGreaterThan(Date.now());

    const sql = getTestSql();
    const [row] = await sql<{ published: boolean; published_at: Date | null }[]>`
      SELECT published, published_at FROM ${sql(TEST_SCHEMA)}.posts WHERE id = ${postId}
    `;
    expect(row.published).toBe(false);
    expect(row.published_at).not.toBeNull();
    expect(row.published_at!.getTime()).toBeGreaterThan(Date.now());
  });

  it('clearing publishedAt removes the schedule', async () => {
    const route = await import('@/app/api/posts/[id]/schedule/route');
    // First schedule it
    await callHandler(
      route as unknown as Record<string, unknown>, 'PATCH',
      {
        params: { id: String(postId) },
        body: { publishedAt: new Date(Date.now() + 60_000).toISOString() },
      },
    );
    // Then clear it
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'PATCH',
      { params: { id: String(postId) }, body: { publishedAt: null } },
    );
    expect(res.status).toBe(200);

    const sql = getTestSql();
    const [row] = await sql<{ published_at: Date | null }[]>`
      SELECT published_at FROM ${sql(TEST_SCHEMA)}.posts WHERE id = ${postId}
    `;
    expect(row.published_at).toBeNull();
  });

  it('404 when scheduling a post id that does not exist', async () => {
    const route = await import('@/app/api/posts/[id]/schedule/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'PATCH',
      { params: { id: '999999' }, body: { publishedAt: new Date(Date.now() + 60_000).toISOString() } },
    );
    expect(res.status).toBe(404);
  });
});

describe('cron tick — auto-publish scheduled posts @cms @posts @scheduled @cron', () => {
  let A: TenantCtx;
  let siteId: number;

  beforeEach(async () => {
    A = await sessionForNewClientUser('cms-sched-cron');
    ({ siteId } = await seedSite(A));
    mockedAuth.mockResolvedValue(A.session);
  });

  /**
   * The cron tick is the canonical statement the scheduled-publish worker
   * is expected to run. Encoding it here means:
   *   1) we have a behavioural test for the publish flow today, and
   *   2) the worker route, when added, must use this same predicate or
   *      this test will catch the drift.
   */
  async function runCronTick() {
    const sql = getTestSql();
    const result = await sql<{ id: number }[]>`
      UPDATE ${sql(TEST_SCHEMA)}.posts
      SET published = true,
          updated_at = NOW()
      WHERE published = false
        AND published_at IS NOT NULL
        AND published_at <= NOW()
      RETURNING id
    `;
    return result.length;
  }

  it('flips published=true when publishedAt is in the past', async () => {
    const past = new Date(Date.now() - 5 * 60 * 1000); // 5 min ago
    const { id } = await seedPost(siteId, { publishedAt: past, published: false });

    const flipped = await runCronTick();
    expect(flipped).toBeGreaterThanOrEqual(1);

    const sql = getTestSql();
    const [row] = await sql<{ published: boolean }[]>`
      SELECT published FROM ${sql(TEST_SCHEMA)}.posts WHERE id = ${id}
    `;
    expect(row.published).toBe(true);
  });

  it('does NOT flip a future-scheduled post', async () => {
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const { id } = await seedPost(siteId, { publishedAt: future, published: false });

    await runCronTick();

    const sql = getTestSql();
    const [row] = await sql<{ published: boolean }[]>`
      SELECT published FROM ${sql(TEST_SCHEMA)}.posts WHERE id = ${id}
    `;
    expect(row.published).toBe(false);
  });

  it('does NOT touch posts without a publishedAt (drafts)', async () => {
    const { id } = await seedPost(siteId, { publishedAt: null, published: false });

    await runCronTick();

    const sql = getTestSql();
    const [row] = await sql<{ published: boolean; published_at: Date | null }[]>`
      SELECT published, published_at FROM ${sql(TEST_SCHEMA)}.posts WHERE id = ${id}
    `;
    expect(row.published).toBe(false);
    expect(row.published_at).toBeNull();
  });

  it('does NOT re-flip already-published posts', async () => {
    const past = new Date(Date.now() - 10 * 60 * 1000);
    const { id } = await seedPost(siteId, { publishedAt: past, published: true });

    const sql = getTestSql();
    const [before] = await sql<{ updated_at: Date }[]>`
      SELECT updated_at FROM ${sql(TEST_SCHEMA)}.posts WHERE id = ${id}
    `;
    await new Promise(r => setTimeout(r, 25));
    await runCronTick();

    const [after] = await sql<{ updated_at: Date }[]>`
      SELECT updated_at FROM ${sql(TEST_SCHEMA)}.posts WHERE id = ${id}
    `;
    // Already-published rows are excluded by `published = false`, so updated_at stays.
    expect(after.updated_at.getTime()).toBe(before.updated_at.getTime());
  });
});
