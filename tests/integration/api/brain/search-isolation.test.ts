/**
 * Brain search — scope-isolation regression.
 *
 * The single highest-value test in this directory: a tenant must never see
 * another tenant's notes/meetings/tasks/relationships through search. This
 * spec is the load-bearing guard against any future regression in
 * `searchBrain` (or one of its branches) leaking cross-tenant rows.
 */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));

import { auth } from '@/lib/auth';
const mockedAuth = auth as unknown as Mock;

import { callHandler } from '../../../helpers/call-handler';
import { sessionForNewClientUser, type TenantCtx } from '../../../helpers/session';
import { getTestSql, TEST_SCHEMA } from '../../../helpers/test-db';

describe('Brain search — scope isolation @brain @search @security', () => {
  let A: TenantCtx;
  let B: TenantCtx;
  beforeEach(async () => {
    [A, B] = await Promise.all([
      sessionForNewClientUser('brain-search-a'),
      sessionForNewClientUser('brain-search-b'),
    ]);
  });

  it('searching as tenant A never returns tenant B\'s knowledge notes', async () => {
    const sql = getTestSql();
    // Distinct, content-addressable token in BOTH tenants' notes.
    const token = `xyzzy${Date.now()}`;

    await sql.unsafe(`
      INSERT INTO "${TEST_SCHEMA}".brain_notes (client_id, title, body, tags)
      VALUES
        (${A.client.id}, $$A-note ${token}$$, 'A body content', '[]'::jsonb),
        (${B.client.id}, $$B-secret-note ${token}$$, 'B body content with ${token}', '[]'::jsonb)
    `);

    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/brain/search/route');
    const res = await callHandler<{ success: boolean; data: { hits: Array<{ type: string; title: string }> } }>(
      route as unknown as Record<string, unknown>,
      'GET',
      { query: { q: token } },
    );
    expect(res.status).toBe(200);
    const titles = res.data!.data.hits.map(h => h.title);
    // A sees their own note
    expect(titles.some(t => t.includes('A-note'))).toBe(true);
    // …but never B's
    expect(titles.some(t => t.includes('B-secret-note'))).toBe(false);
  });

  it('searching as tenant A never returns tenant B\'s meetings', async () => {
    const sql = getTestSql();
    const token = `marker${Date.now()}`;

    await sql.unsafe(`
      INSERT INTO "${TEST_SCHEMA}".brain_meetings (
        client_id, title, status, confidentiality_level, source, source_ref, source_metadata
      ) VALUES
        (${A.client.id}, $$A-meeting ${token}$$, 'draft', 'standard', 'paste', $$paste:a-${token}$$, '{}'::jsonb),
        (${B.client.id}, $$B-secret-meeting ${token}$$, 'draft', 'standard', 'paste', $$paste:b-${token}$$, '{}'::jsonb)
    `);

    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/brain/search/route');
    const res = await callHandler<{ success: boolean; data: { hits: Array<{ type: string; title: string }> } }>(
      route as unknown as Record<string, unknown>,
      'GET',
      { query: { q: token, types: 'meeting' } },
    );
    expect(res.status).toBe(200);
    const meetingTitles = res.data!.data.hits.filter(h => h.type === 'meeting').map(h => h.title);
    expect(meetingTitles.some(t => t.includes('A-meeting'))).toBe(true);
    expect(meetingTitles.some(t => t.includes('B-secret-meeting'))).toBe(false);
  });

  it('searching as tenant A never returns tenant B\'s tasks', async () => {
    const sql = getTestSql();
    const token = `taskmark${Date.now()}`;

    await sql.unsafe(`
      INSERT INTO "${TEST_SCHEMA}".brain_tasks (client_id, title, status, priority, source, created_by_ai, needs_review, compliance_flag)
      VALUES
        (${A.client.id}, $$A-task ${token}$$, 'open', 'medium', 'manual', false, false, false),
        (${B.client.id}, $$B-secret-task ${token}$$, 'open', 'medium', 'manual', false, false, false)
    `);

    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/brain/search/route');
    const res = await callHandler<{ success: boolean; data: { hits: Array<{ type: string; title: string }> } }>(
      route as unknown as Record<string, unknown>,
      'GET',
      { query: { q: token, types: 'task' } },
    );
    expect(res.status).toBe(200);
    const taskTitles = res.data!.data.hits.filter(h => h.type === 'task').map(h => h.title);
    expect(taskTitles.some(t => t.includes('A-task'))).toBe(true);
    expect(taskTitles.some(t => t.includes('B-secret-task'))).toBe(false);
  });

  it('401 when unauthenticated', async () => {
    mockedAuth.mockResolvedValue(null);
    const route = await import('@/app/api/portal/brain/search/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'GET',
      { query: { q: 'anything' } },
    );
    expect(res.status).toBe(401);
  });

  it('empty query returns an empty hits envelope', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/brain/search/route');
    const res = await callHandler<{ success: boolean; data: { hits: unknown[] } }>(
      route as unknown as Record<string, unknown>,
      'GET',
      { query: { q: '' } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.hits).toEqual([]);
  });
});
