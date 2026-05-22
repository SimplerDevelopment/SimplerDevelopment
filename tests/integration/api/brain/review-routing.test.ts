/**
 * Brain review-item routing — full REST round-trip + tenancy + idempotency +
 * suggestion-changes-when-expertise-changes.
 *
 * Routes:
 *   POST /api/portal/brain/review-items/[id]/suggest-reviewer
 *   GET  /api/portal/brain/review?suggestedReviewerPersonId=<id>
 *
 * The pure scoring math is covered in tests/unit/brain-review-routing.test.ts.
 * This file exercises the database orchestration: candidate gathering, the
 * substring match against actual brain_topics rows, the persist-then-list
 * round-trip, and tenancy isolation.
 */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));

import { auth } from '@/lib/auth';
const mockedAuth = auth as unknown as Mock;

import { callHandler } from '../../../helpers/call-handler';
import { sessionForNewClientUser, type TenantCtx } from '../../../helpers/session';
import { getTestSql, TEST_SCHEMA } from '../../../helpers/test-db';

interface SeedPersonOpts {
  fullName?: string;
  status?: 'active' | 'inactive' | 'departed';
}

async function seedPerson(ctx: TenantCtx, overrides: SeedPersonOpts = {}): Promise<{ id: number }> {
  const sql = getTestSql();
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.brain_people (client_id, full_name, status)
    VALUES (
      ${ctx.client.id},
      ${overrides.fullName ?? `Person ${Date.now()}-${Math.floor(Math.random() * 9999)}`},
      ${overrides.status ?? 'active'}
    )
    RETURNING id
  `;
  return row;
}

async function seedExpertiseTag(ctx: TenantCtx, name: string): Promise<{ id: number }> {
  const sql = getTestSql();
  const slug = `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now()}-${Math.floor(Math.random() * 9999)}`;
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.brain_expertise_tags (client_id, name, slug, source)
    VALUES (${ctx.client.id}, ${name}, ${slug}, 'manual')
    RETURNING id
  `;
  return row;
}

async function attachExpertise(ctx: TenantCtx, personId: number, tagId: number, level: number | null = 4): Promise<void> {
  const sql = getTestSql();
  await sql`
    INSERT INTO ${sql(TEST_SCHEMA)}.brain_person_expertise (client_id, person_id, expertise_tag_id, level)
    VALUES (${ctx.client.id}, ${personId}, ${tagId}, ${level})
    ON CONFLICT DO NOTHING
  `;
}

async function seedTopic(ctx: TenantCtx, name: string, description: string | null = null): Promise<{ id: number }> {
  const sql = getTestSql();
  const ts = Date.now();
  const slug = `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${ts}-${Math.floor(Math.random() * 9999)}`;
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.brain_topics (client_id, name, slug, path, description)
    VALUES (${ctx.client.id}, ${name}, ${slug}, ${'/' + slug}, ${description})
    RETURNING id
  `;
  return row;
}

async function attachTopicToEntity(
  ctx: TenantCtx,
  topicId: number,
  entityType: string,
  entityId: number,
): Promise<void> {
  const sql = getTestSql();
  await sql`
    INSERT INTO ${sql(TEST_SCHEMA)}.brain_entity_topics (client_id, topic_id, entity_type, entity_id)
    VALUES (${ctx.client.id}, ${topicId}, ${entityType}, ${entityId})
    ON CONFLICT DO NOTHING
  `;
}

async function seedMeeting(ctx: TenantCtx): Promise<{ id: number }> {
  const sql = getTestSql();
  const ts = Date.now();
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.brain_meetings (
      client_id, title, source, source_ref, status
    )
    VALUES (
      ${ctx.client.id},
      ${`Meeting ${ts}`},
      'paste',
      ${`paste-${ts}-${Math.floor(Math.random() * 9999)}`},
      'draft'
    )
    RETURNING id
  `;
  return row;
}

async function seedReviewItem(
  ctx: TenantCtx,
  meetingId: number,
  payload: Record<string, unknown> = { title: 'do the thing' },
): Promise<{ id: number }> {
  const sql = getTestSql();
  const payloadStr = JSON.stringify(payload);
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.brain_ai_review_items (
      client_id, source_type, source_id, proposed_type, proposed_payload, status
    ) VALUES (
      ${ctx.client.id}, 'meeting', ${meetingId}, 'task', ${payloadStr}::jsonb, 'pending'
    )
    RETURNING id
  `;
  return row;
}

interface SuggestionResponse {
  success: boolean;
  data: { suggestion: { personId: number; score: number; reason: string } | null };
  message?: string;
}

describe('POST /api/portal/brain/review-items/[id]/suggest-reviewer @brain @review-routing', () => {
  let A: TenantCtx;
  beforeEach(async () => { A = await sessionForNewClientUser('brain-rev-routing'); });

  it('401 when unauthenticated', async () => {
    mockedAuth.mockResolvedValue(null);
    const route = await import('@/app/api/portal/brain/review-items/[id]/suggest-reviewer/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'POST',
      { params: { id: '1' } },
    );
    expect(res.status).toBe(401);
  });

  it('404 when review item missing', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/brain/review-items/[id]/suggest-reviewer/route');
    const res = await callHandler<{ success: boolean; message: string }>(
      route as unknown as Record<string, unknown>,
      'POST',
      { params: { id: '99999999' } },
    );
    expect(res.status).toBe(404);
    expect(res.data?.message).toMatch(/not found/i);
  });

  it('persists a suggestion when an expert exists', async () => {
    mockedAuth.mockResolvedValue(A.session);

    // Build: meeting → topic 'Kubernetes' → review item.
    // Person Alex has level=4 'kubernetes' expertise.
    const meeting = await seedMeeting(A);
    const topic = await seedTopic(A, 'Kubernetes upgrade');
    await attachTopicToEntity(A, topic.id, 'meeting', meeting.id);
    const reviewItem = await seedReviewItem(A, meeting.id);
    const alex = await seedPerson(A, { fullName: 'Alex Cluster' });
    const k8s = await seedExpertiseTag(A, 'kubernetes');
    await attachExpertise(A, alex.id, k8s.id, 4);

    const route = await import('@/app/api/portal/brain/review-items/[id]/suggest-reviewer/route');
    const res = await callHandler<SuggestionResponse>(
      route as unknown as Record<string, unknown>,
      'POST',
      { params: { id: String(reviewItem.id) } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.suggestion).not.toBeNull();
    expect(res.data?.data.suggestion?.personId).toBe(alex.id);
    expect(res.data?.data.suggestion?.score).toBeGreaterThanOrEqual(3);
    expect(res.data?.data.suggestion?.reason).toMatch(/Alex Cluster/);

    // Persisted on the row.
    const sql = getTestSql();
    const [row] = await sql<{ suggested_reviewer_person_id: number | null; suggested_reviewer_score: number | null }[]>`
      SELECT suggested_reviewer_person_id, suggested_reviewer_score
      FROM ${sql(TEST_SCHEMA)}.brain_ai_review_items WHERE id = ${reviewItem.id}
    `;
    expect(row.suggested_reviewer_person_id).toBe(alex.id);
    expect(row.suggested_reviewer_score).toBeGreaterThanOrEqual(3);
  });

  it('returns null suggestion when no candidate meets threshold', async () => {
    mockedAuth.mockResolvedValue(A.session);

    const meeting = await seedMeeting(A);
    const reviewItem = await seedReviewItem(A, meeting.id);
    // No people, no topics → degenerate.

    const route = await import('@/app/api/portal/brain/review-items/[id]/suggest-reviewer/route');
    const res = await callHandler<SuggestionResponse>(
      route as unknown as Record<string, unknown>,
      'POST',
      { params: { id: String(reviewItem.id) } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.suggestion).toBeNull();
  });

  it('is idempotent — re-running yields the same suggestion', async () => {
    mockedAuth.mockResolvedValue(A.session);

    const meeting = await seedMeeting(A);
    const topic = await seedTopic(A, 'security audit');
    await attachTopicToEntity(A, topic.id, 'meeting', meeting.id);
    const reviewItem = await seedReviewItem(A, meeting.id);
    const sam = await seedPerson(A, { fullName: 'Sam Secure' });
    const sec = await seedExpertiseTag(A, 'security');
    await attachExpertise(A, sam.id, sec.id, 3);

    const route = await import('@/app/api/portal/brain/review-items/[id]/suggest-reviewer/route');
    const first = await callHandler<SuggestionResponse>(
      route as unknown as Record<string, unknown>,
      'POST',
      { params: { id: String(reviewItem.id) } },
    );
    const second = await callHandler<SuggestionResponse>(
      route as unknown as Record<string, unknown>,
      'POST',
      { params: { id: String(reviewItem.id) } },
    );
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.data?.data.suggestion?.personId).toBe(first.data?.data.suggestion?.personId);
    expect(second.data?.data.suggestion?.score).toBe(first.data?.data.suggestion?.score);
  });

  it('suggestion changes when new expertise is added', async () => {
    mockedAuth.mockResolvedValue(A.session);

    const meeting = await seedMeeting(A);
    const topic = await seedTopic(A, 'database migration');
    await attachTopicToEntity(A, topic.id, 'meeting', meeting.id);
    const reviewItem = await seedReviewItem(A, meeting.id);
    const initial = await seedPerson(A, { fullName: 'Initial Owner' });
    const baseTag = await seedExpertiseTag(A, 'database');
    await attachExpertise(A, initial.id, baseTag.id, 2);

    const route = await import('@/app/api/portal/brain/review-items/[id]/suggest-reviewer/route');
    const before = await callHandler<SuggestionResponse>(
      route as unknown as Record<string, unknown>,
      'POST',
      { params: { id: String(reviewItem.id) } },
    );
    expect(before.data?.data.suggestion?.personId).toBe(initial.id);

    // A more qualified expert joins.
    const dba = await seedPerson(A, { fullName: 'Dr DBA' });
    await attachExpertise(A, dba.id, baseTag.id, 4); // expert level — gets +2 bonus

    const after = await callHandler<SuggestionResponse>(
      route as unknown as Record<string, unknown>,
      'POST',
      { params: { id: String(reviewItem.id) } },
    );
    expect(after.data?.data.suggestion?.personId).toBe(dba.id);
    expect(after.data?.data.suggestion?.score).toBeGreaterThan(before.data!.data.suggestion!.score);
  });

  it('404 cross-tenant — A cannot suggest on B\'s review item', async () => {
    const B = await sessionForNewClientUser('brain-rev-routing-b');
    const meetingB = await seedMeeting(B);
    const itemB = await seedReviewItem(B, meetingB.id);
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/portal/brain/review-items/[id]/suggest-reviewer/route');
    const res = await callHandler<{ success: boolean; message: string }>(
      route as unknown as Record<string, unknown>,
      'POST',
      { params: { id: String(itemB.id) } },
    );
    expect(res.status).toBe(404);
  });
});

describe('GET /api/portal/brain/review?suggestedReviewerPersonId @brain @review-routing', () => {
  let A: TenantCtx;
  beforeEach(async () => { A = await sessionForNewClientUser('brain-rev-list'); });

  it('filters to items routed to the given person', async () => {
    mockedAuth.mockResolvedValue(A.session);

    const meeting = await seedMeeting(A);
    const topic = await seedTopic(A, 'kubernetes ops');
    await attachTopicToEntity(A, topic.id, 'meeting', meeting.id);

    const alex = await seedPerson(A, { fullName: 'Alex' });
    const sam = await seedPerson(A, { fullName: 'Sam' });
    const k8s = await seedExpertiseTag(A, 'kubernetes');
    await attachExpertise(A, alex.id, k8s.id, 4);

    // Two pending items — both should route to Alex.
    const itemA = await seedReviewItem(A, meeting.id, { title: 'rollout 1.30' });
    const itemB = await seedReviewItem(A, meeting.id, { title: 'rotate certs' });

    const suggestRoute = await import('@/app/api/portal/brain/review-items/[id]/suggest-reviewer/route');
    await callHandler(suggestRoute as unknown as Record<string, unknown>, 'POST', { params: { id: String(itemA.id) } });
    await callHandler(suggestRoute as unknown as Record<string, unknown>, 'POST', { params: { id: String(itemB.id) } });

    const listRoute = await import('@/app/api/portal/brain/review/route');
    const res = await callHandler<{ success: boolean; data: { items: Array<{ id: number; suggestedReviewerPersonId: number | null }> } }>(
      listRoute as unknown as Record<string, unknown>,
      'GET',
      { query: { suggestedReviewerPersonId: alex.id, status: 'pending' } },
    );
    expect(res.status).toBe(200);
    const ids = res.data!.data.items.map((i) => i.id).sort();
    expect(ids).toEqual([itemA.id, itemB.id].sort());

    // Filtering by Sam returns nothing.
    const samRes = await callHandler<{ success: boolean; data: { items: Array<{ id: number }> } }>(
      listRoute as unknown as Record<string, unknown>,
      'GET',
      { query: { suggestedReviewerPersonId: sam.id, status: 'pending' } },
    );
    expect(samRes.status).toBe(200);
    expect(samRes.data!.data.items).toEqual([]);
  });
});
