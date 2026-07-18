/**
 * cov-u8.spec.ts — Company Brain AI slice [12..13]
 *
 * Card 12: dataview structured query — POST /api/portal/brain/dataview
 *          returns a cross-entity tabular result given a valid query payload.
 *
 * Card 13: meeting full lifecycle — create via paste adapter
 *          → GET detail → PUT update → DELETE (not 404 stubs).
 *          Routes are under /api/portal/brain/communications (not /meetings).
 */
import { test, expect } from './setup/fixtures';
import { randomUUID } from 'crypto';

const uniq = () => `${Date.now()}-${randomUUID().slice(0, 8)}`;

// ─────────────────────────────────────────────────────────────────────────────
// Card 12 — Dataview structured query
// POST /api/portal/brain/dataview
// GET  /api/portal/brain/dataview  (introspect supported types)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Brain Dataview — structured query @brain @brain-dataview', () => {
  test('GET returns supported types list', async ({ clientApi }) => {
    const res = await clientApi.get('/api/portal/brain/dataview');
    expect(res.status, JSON.stringify(res.data)).toBe(200);
    expect(res.data.success).toBe(true);
    expect(Array.isArray(res.data.data.types)).toBe(true);
    expect(res.data.data.types).toContain('notes');
    expect(res.data.data.types).toContain('tasks');
    expect(res.data.data.types).toContain('meetings');
  });

  test('POST {type:"notes"} returns rows and columns @critical', async ({ clientApi }) => {
    const res = await clientApi.post('/api/portal/brain/dataview', {
      type: 'notes',
      limit: 5,
    });
    expect(res.status, JSON.stringify(res.data)).toBe(200);
    expect(res.data.success).toBe(true);
    expect(Array.isArray(res.data.data.rows)).toBe(true);
    expect(Array.isArray(res.data.data.columns)).toBe(true);
  });

  test('POST {type:"tasks"} returns rows and columns', async ({ clientApi }) => {
    const res = await clientApi.post('/api/portal/brain/dataview', {
      type: 'tasks',
      limit: 5,
    });
    expect(res.status, JSON.stringify(res.data)).toBe(200);
    expect(res.data.success).toBe(true);
    expect(Array.isArray(res.data.data.rows)).toBe(true);
    expect(Array.isArray(res.data.data.columns)).toBe(true);
  });

  test('POST {type:"meetings"} returns rows and columns', async ({ clientApi }) => {
    const res = await clientApi.post('/api/portal/brain/dataview', {
      type: 'meetings',
      limit: 5,
    });
    expect(res.status, JSON.stringify(res.data)).toBe(200);
    expect(res.data.success).toBe(true);
    expect(Array.isArray(res.data.data.rows)).toBe(true);
    expect(Array.isArray(res.data.data.columns)).toBe(true);
  });

  test('POST {type:"companies"} returns rows and columns', async ({ clientApi }) => {
    const res = await clientApi.post('/api/portal/brain/dataview', {
      type: 'companies',
      limit: 5,
    });
    expect(res.status, JSON.stringify(res.data)).toBe(200);
    expect(res.data.success).toBe(true);
    expect(Array.isArray(res.data.data.rows)).toBe(true);
  });

  test('POST with columns subset only returns requested columns', async ({ clientApi }) => {
    const res = await clientApi.post('/api/portal/brain/dataview', {
      type: 'notes',
      columns: ['id', 'title'],
      limit: 3,
    });
    expect(res.status, JSON.stringify(res.data)).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.data.columns).toEqual(expect.arrayContaining(['id', 'title']));
  });

  test('POST with sort parameter works', async ({ clientApi }) => {
    const res = await clientApi.post('/api/portal/brain/dataview', {
      type: 'notes',
      sort: 'title',
      limit: 3,
    });
    expect(res.status, JSON.stringify(res.data)).toBe(200);
    expect(res.data.success).toBe(true);
  });

  test('POST rejects unknown type with 400', async ({ clientApi }) => {
    const res = await clientApi.post('/api/portal/brain/dataview', {
      type: 'bogus_type_xyz',
    });
    expect(res.status).toBe(400);
    expect(res.data.success).toBe(false);
  });

  test('POST rejects missing type with 400', async ({ clientApi }) => {
    const res = await clientApi.post('/api/portal/brain/dataview', {
      limit: 5,
    });
    expect(res.status).toBe(400);
    expect(res.data.success).toBe(false);
  });

  test('POST rejects invalid filter key with 400', async ({ clientApi }) => {
    const res = await clientApi.post('/api/portal/brain/dataview', {
      type: 'notes',
      filter: { __injected_col: 'hack' },
    });
    expect(res.status).toBe(400);
    expect(res.data.success).toBe(false);
  });

  test('POST rejects non-JSON body with 400', async ({ clientApi }) => {
    const res = await clientApi.post('/api/portal/brain/dataview', null);
    expect(res.status).toBe(400);
  });

  test('GET unauthenticated returns 401', async ({ unauthApi }) => {
    const res = await unauthApi.get('/api/portal/brain/dataview');
    expect(res.status).toBe(401);
  });

  test('POST unauthenticated returns 401', async ({ unauthApi }) => {
    const res = await unauthApi.post('/api/portal/brain/dataview', { type: 'notes' });
    expect(res.status).toBe(401);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Card 13 — Meeting full lifecycle via paste adapter
// POST   /api/portal/brain/communications        → create
// GET    /api/portal/brain/communications/[id]   → detail
// PUT    /api/portal/brain/communications/[id]   → update (link)
// DELETE /api/portal/brain/communications/[id]   → delete
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Brain Communications — meeting lifecycle @brain @brain-comms', () => {
  let createdMeetingId: number | null = null;

  test.afterAll(async ({ clientApi }) => {
    if (createdMeetingId !== null) {
      await clientApi
        .delete(`/api/portal/brain/communications/${createdMeetingId}`)
        .catch(() => null);
    }
  });

  test(
    'full lifecycle: paste create → GET detail → PUT link → DELETE @critical',
    async ({ clientApi }) => {
      const token = uniq();
      const title = `E2E Meeting ${token}`;

      // ── CREATE via paste adapter ──────────────────────────────────────────
      const createRes = await clientApi.post('/api/portal/brain/communications', {
        adapterId: 'paste',
        input: {
          transcript: `E2E test meeting transcript ${token}. Discussion about quarterly roadmap.`,
          title,
          meetingDate: new Date().toISOString(),
          participants: [{ name: 'Alice', email: 'alice@example.com' }],
        },
      });
      expect(createRes.status, JSON.stringify(createRes.data)).toBe(200);
      expect(createRes.data.success).toBe(true);
      expect(createRes.data.data).toHaveProperty('id');
      const meetingId: number = createRes.data.data.id;
      createdMeetingId = meetingId;

      // ── GET detail ───────────────────────────────────────────────────────
      const getRes = await clientApi.get(`/api/portal/brain/communications/${meetingId}`);
      expect(getRes.status, JSON.stringify(getRes.data)).toBe(200);
      expect(getRes.data.success).toBe(true);
      expect(getRes.data.data.id).toBe(meetingId);

      // ── PUT update (link mutation — companyId / dealId) ──────────────────
      // PUT only supports link mutations; clear both links is safe
      const putRes = await clientApi.put(`/api/portal/brain/communications/${meetingId}`, {
        companyId: null,
        dealId: null,
      });
      expect(putRes.status, JSON.stringify(putRes.data)).toBe(200);
      expect(putRes.data.success).toBe(true);
      expect(putRes.data.data.id).toBe(meetingId);

      // ── DELETE ───────────────────────────────────────────────────────────
      const delRes = await clientApi.delete(`/api/portal/brain/communications/${meetingId}`);
      expect(delRes.status, JSON.stringify(delRes.data)).toBe(200);
      expect(delRes.data.success).toBe(true);
      createdMeetingId = null; // already cleaned up

      // ── Verify gone (404) ────────────────────────────────────────────────
      const gone = await clientApi.get(`/api/portal/brain/communications/${meetingId}`);
      expect(gone.status).toBe(404);
    },
  );

  test('POST rejects missing input with 400', async ({ clientApi }) => {
    const res = await clientApi.post('/api/portal/brain/communications', {
      adapterId: 'paste',
    });
    expect(res.status).toBe(400);
    expect(res.data.success).toBe(false);
  });

  test('POST rejects empty transcript with 400', async ({ clientApi }) => {
    const res = await clientApi.post('/api/portal/brain/communications', {
      adapterId: 'paste',
      input: { transcript: '' },
    });
    expect(res.status).toBe(400);
    expect(res.data.success).toBe(false);
  });

  test('POST rejects linking both companyId and dealId', async ({ clientApi }) => {
    const res = await clientApi.post('/api/portal/brain/communications', {
      adapterId: 'paste',
      input: { transcript: 'test', title: 'double-link test' },
      companyId: 1,
      dealId: 1,
    });
    expect(res.status).toBe(400);
    expect(res.data.success).toBe(false);
  });

  test('GET detail returns 404 for unknown id', async ({ clientApi }) => {
    const res = await clientApi.get('/api/portal/brain/communications/999999999');
    expect(res.status).toBe(404);
  });

  test('PUT returns 404 for unknown id', async ({ clientApi }) => {
    const res = await clientApi.put('/api/portal/brain/communications/999999999', {
      companyId: null,
    });
    expect(res.status).toBe(404);
  });

  test('DELETE returns 404 for unknown id', async ({ clientApi }) => {
    const res = await clientApi.delete('/api/portal/brain/communications/999999999');
    expect(res.status).toBe(404);
  });

  test('POST unauthenticated returns 401', async ({ unauthApi }) => {
    const res = await unauthApi.post('/api/portal/brain/communications', {
      adapterId: 'paste',
      input: { transcript: 'test' },
    });
    expect(res.status).toBe(401);
  });

  test('GET unauthenticated returns 401', async ({ unauthApi }) => {
    const res = await unauthApi.get('/api/portal/brain/communications/1');
    expect(res.status).toBe(401);
  });
});
