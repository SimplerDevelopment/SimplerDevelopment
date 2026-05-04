/**
 * Portal Company Brain — golden-path mutations.
 *
 * Each scenario walks the user through a complete create → edit → delete
 * lifecycle on a single brain entity (knowledge, communication,
 * relationship, task, calendar event). Marked @critical because these are
 * the highest-traffic brain APIs and must always round-trip.
 *
 * All test data is prefixed with `BRAIN-` and tracked via `runCleanups` so
 * the suite is idempotent across re-runs.
 */
import { test, expect } from './setup/fixtures';
import { runCleanups } from './setup/helpers';
import { randomUUID } from 'crypto';

const PFX = 'BRAIN-';
const uniq = () => randomUUID().slice(0, 8);

async function ensureBrainEnabled(api: import('./setup/api-client').ApiClient): Promise<boolean> {
  // Brain communications POST refuses to run unless the brain profile is
  // enabled. Idempotent — subsequent runs are fine.
  const res = await api.put('/api/portal/brain/settings', { enabled: true });
  return res.status === 200 && res.data?.success === true;
}

test.describe('Portal Brain — mutation golden paths @brain @critical', () => {
  // ── Knowledge: create / edit / delete ──────────────────────────────────
  test.describe('Knowledge', () => {
    let cleanups: Array<() => Promise<void>> = [];
    test.afterEach(async () => { await runCleanups(cleanups); cleanups = []; });

    test('create → edit → delete a knowledge note @critical', async ({ clientApi }) => {
      const title = `${PFX}know ${uniq()}`;

      // CREATE
      const created = await clientApi.post('/api/portal/brain/knowledge', {
        title,
        body: 'Initial body',
        tags: [`${PFX}t`],
      });
      expect(created.status, JSON.stringify(created.data)).toBe(200);
      expect(created.data?.success).toBe(true);
      const id = created.data.data.id as number;
      cleanups.push(async () => {
        await clientApi.delete(`/api/portal/brain/knowledge/${id}`).catch(() => {});
      });

      // EDIT
      const edited = await clientApi.patch(`/api/portal/brain/knowledge/${id}`, {
        title: `${title} (edited)`,
        pinned: true,
      });
      expect(edited.status).toBe(200);
      expect(edited.data?.data.title).toBe(`${title} (edited)`);
      expect(edited.data?.data.pinned).toBe(true);

      // DELETE
      const deleted = await clientApi.delete(`/api/portal/brain/knowledge/${id}`);
      expect(deleted.status).toBe(200);
      expect(deleted.data?.success).toBe(true);

      // Confirm gone
      const get = await clientApi.get(`/api/portal/brain/knowledge/${id}`);
      expect(get.status).toBe(404);
    });
  });

  // ── Communications: create → mark reviewed → delete ────────────────────
  test.describe('Communications', () => {
    let cleanups: Array<() => Promise<void>> = [];
    let brainEnabled = false;

    test.beforeAll(async ({ clientApi }) => {
      brainEnabled = await ensureBrainEnabled(clientApi);
    });

    test.afterEach(async () => { await runCleanups(cleanups); cleanups = []; });

    test('create → mark reviewed (PUT link) → delete a communication @critical', async ({ clientApi }) => {
      test.skip(!brainEnabled, 'Brain profile not enabled');

      const title = `${PFX}comm ${uniq()}`;

      // CREATE via paste adapter
      const created = await clientApi.post('/api/portal/brain/communications', {
        adapterId: 'paste',
        input: {
          transcript: 'Alice: Hi.\nBob: Hello.\nAlice: Action — followup soon.',
          title,
        },
      });
      if (created.status !== 200) {
        // Some environments without AI keys still return 400 from the paste
        // adapter (env-dependent). Skip rather than fail.
        test.skip(created.status === 400, `Adapter create failed: ${created.data?.message}`);
      }
      expect(created.status).toBe(200);
      const id = created.data.data.id as number;
      cleanups.push(async () => {
        await clientApi.delete(`/api/portal/brain/communications/${id}`).catch(() => {});
      });

      // EDIT — link to companyId=null/dealId=null is the no-op happy path that
      // exercises the PUT route without needing CRM seed data. The PUT handler
      // returns the updated row.
      const linked = await clientApi.put(`/api/portal/brain/communications/${id}`, {
        companyId: null,
        dealId: null,
      });
      expect(linked.status).toBe(200);
      expect(linked.data?.success).toBe(true);

      // The /communications/[id]/review GET surfaces the AI review queue —
      // we just verify it's reachable and tenant-scoped (returns array).
      const review = await clientApi.get(`/api/portal/brain/communications/${id}/review`);
      expect(review.status).toBe(200);
      expect(Array.isArray(review.data?.data)).toBe(true);

      // DELETE
      const deleted = await clientApi.delete(`/api/portal/brain/communications/${id}`);
      expect(deleted.status).toBe(200);

      const get = await clientApi.get(`/api/portal/brain/communications/${id}`);
      expect(get.status).toBe(404);
    });
  });

  // ── Relationships: create → edit → delete ──────────────────────────────
  test.describe('Relationships', () => {
    let cleanups: Array<() => Promise<void>> = [];
    let companyId: number | null = null;

    test.beforeAll(async ({ clientApi }) => {
      // Need a CRM company to anchor the overlay to.
      const res = await clientApi.post('/api/portal/crm/companies', {
        name: `${PFX}rel co ${uniq()}`,
        industry: 'Technology',
      });
      if (res.status === 201 && res.data?.data?.id) {
        companyId = res.data.data.id;
      }
    });

    test.afterAll(async ({ clientApi }) => {
      if (companyId != null) {
        await clientApi.delete(`/api/portal/crm/companies/${companyId}`).catch(() => {});
      }
    });

    test.afterEach(async () => { await runCleanups(cleanups); cleanups = []; });

    test('create → edit → delete a relationship @critical', async ({ clientApi }) => {
      test.skip(companyId == null, 'No CRM company seeded');

      // CREATE
      const created = await clientApi.post('/api/portal/brain/relationships', {
        companyId,
        relationshipType: 'client',
        priority: 'high',
        summary: `${PFX}overlay ${uniq()}`,
      });
      expect(created.status, JSON.stringify(created.data)).toBe(200);
      const id = created.data.data.id as number;
      cleanups.push(async () => {
        await clientApi.delete(`/api/portal/brain/relationships/${id}`).catch(() => {});
      });

      // EDIT
      const edited = await clientApi.put(`/api/portal/brain/relationships/${id}`, {
        priority: 'critical',
        summary: `${PFX}overlay edited`,
      });
      expect(edited.status).toBe(200);
      expect(edited.data?.data.priority).toBe('critical');

      // DELETE
      const deleted = await clientApi.delete(`/api/portal/brain/relationships/${id}`);
      expect(deleted.status).toBe(200);

      const get = await clientApi.get(`/api/portal/brain/relationships/${id}`);
      expect(get.status).toBe(404);
    });
  });

  // ── Tasks: create → complete → delete ──────────────────────────────────
  test.describe('Tasks', () => {
    let cleanups: Array<() => Promise<void>> = [];
    test.afterEach(async () => { await runCleanups(cleanups); cleanups = []; });

    test('create → complete (status=done) → delete a brain task @critical', async ({ clientApi }) => {
      const title = `${PFX}task ${uniq()}`;

      // CREATE
      const created = await clientApi.post('/api/portal/brain/tasks', {
        title,
        description: 'E2E lifecycle task',
        priority: 'medium',
      });
      expect(created.status).toBe(200);
      const id = created.data.data.id as number;
      cleanups.push(async () => {
        await clientApi.delete(`/api/portal/brain/tasks/${id}`).catch(() => {});
      });

      // COMPLETE (status=done)
      const completed = await clientApi.put(`/api/portal/brain/tasks/${id}`, {
        status: 'done',
      });
      expect(completed.status).toBe(200);
      expect(completed.data?.data.status).toBe('done');

      // DELETE
      const deleted = await clientApi.delete(`/api/portal/brain/tasks/${id}`);
      expect(deleted.status).toBe(200);

      const get = await clientApi.get(`/api/portal/brain/tasks/${id}`);
      expect(get.status).toBe(404);
    });
  });

  // ── Calendar events: create → edit → delete ────────────────────────────
  test.describe('Calendar events', () => {
    let cleanups: Array<() => Promise<void>> = [];
    test.afterEach(async () => { await runCleanups(cleanups); cleanups = []; });

    test('create → edit → delete a calendar event @critical', async ({ clientApi }) => {
      const title = `${PFX}event ${uniq()}`;
      const startAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      const endAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();

      // CREATE
      const created = await clientApi.post('/api/portal/brain/calendar/events', {
        title,
        startAt,
        endAt,
        timezone: 'UTC',
      });
      expect(created.status, JSON.stringify(created.data)).toBe(200);
      const id = created.data.data.id as number;
      cleanups.push(async () => {
        await clientApi.delete(`/api/portal/brain/calendar/events/${id}`).catch(() => {});
      });

      // EDIT
      const edited = await clientApi.patch(`/api/portal/brain/calendar/events/${id}`, {
        title: `${title} (edited)`,
        location: 'HQ',
      });
      expect(edited.status).toBe(200);
      expect(edited.data?.data.title).toBe(`${title} (edited)`);

      // DELETE
      const deleted = await clientApi.delete(`/api/portal/brain/calendar/events/${id}`);
      expect(deleted.status).toBe(200);

      const get = await clientApi.get(`/api/portal/brain/calendar/events/${id}`);
      expect(get.status).toBe(404);
    });
  });
});
