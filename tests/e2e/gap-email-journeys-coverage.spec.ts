/**
 * E2E gap coverage: Email Journeys Phase 1
 *
 * Tests:
 *  1. Create a journey via POST /api/portal/email/journeys
 *  2. Add 2 steps (wait delayHours=0, then email) via POST steps
 *  3. Enroll a seeded subscriber via POST enroll
 *  4. Tick the cron (x-vercel-cron:1) — assert step-send row + enrollment
 *     advances through wait→email→completed
 *  5. Cron without auth → 401
 *  6. Cross-tenant enroll: subscriber in a different client's list → 403
 *
 * DB seeding is done via psql (child_process) to avoid importing Drizzle into
 * the Playwright worker. The unique(journey_id, subscriber_id) index means
 * duplicate enrollments are silently ignored.
 */

import { test, expect } from './setup/fixtures';
import { execSync } from 'node:child_process';
import { runCleanups, resolveClientSiteId } from './setup/helpers';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const DATABASE_URL =
  process.env.DATABASE_URL || 'postgresql://dancoyle@localhost:5432/simplerdev_test';

// ── DB helpers ────────────────────────────────────────────────────────────────

function psql(sql: string): string {
  return execSync(`psql "${DATABASE_URL}" --no-psqlrc -t`, {
    input: sql,
    encoding: 'utf8',
    timeout: 15_000,
  }).trim();
}

function psqlRow(sql: string): string[] {
  const raw = psql(sql);
  const dataLine = raw
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l !== '' && !/^(INSERT|UPDATE|DELETE|SELECT)\b/i.test(l));
  if (!dataLine) return [];
  return dataLine.split('|').map((s) => s.trim());
}

// ── Seed helpers ──────────────────────────────────────────────────────────────

interface SeedIds {
  clientId: number;
  listId: number;
  subscriberId: number;
  /** A list + subscriber belonging to a DIFFERENT client for cross-tenant tests */
  otherClientId: number;
  otherListId: number;
  otherSubscriberId: number;
}

function seedData(clientId: number): SeedIds {
  // Resolve a second (different) client for cross-tenant tests
  const otherClientRow = psqlRow(`
    SELECT id FROM clients WHERE id != ${clientId} ORDER BY id LIMIT 1
  `);
  const otherClientId = parseInt(otherClientRow[0] ?? '0', 10);
  if (!otherClientId) throw new Error('Could not resolve second test client');

  const ts = Date.now();

  // Insert an email_list for the primary client
  const listRow = psqlRow(`
    INSERT INTO email_lists (name, client_id, created_at, updated_at)
    VALUES ('Journey E2E List ${ts}', ${clientId}, NOW(), NOW())
    RETURNING id
  `);
  const listId = parseInt(listRow[0] ?? '0', 10);

  // Insert a subscriber (unsubscribe_token must be unique)
  const token = `e2e-journey-tok-${ts}`;
  const subRow = psqlRow(`
    INSERT INTO email_subscribers (list_id, email, status, unsubscribe_token, subscribed_at, created_at)
    VALUES (${listId}, 'journey-test-${ts}@example.com', 'active', '${token}', NOW(), NOW())
    RETURNING id
  `);
  const subscriberId = parseInt(subRow[0] ?? '0', 10);

  // Insert a list + subscriber for the OTHER client (cross-tenant)
  const otherListRow = psqlRow(`
    INSERT INTO email_lists (name, client_id, created_at, updated_at)
    VALUES ('Journey E2E Other List ${ts}', ${otherClientId}, NOW(), NOW())
    RETURNING id
  `);
  const otherListId = parseInt(otherListRow[0] ?? '0', 10);

  const otherToken = `e2e-journey-other-tok-${ts}`;
  const otherSubRow = psqlRow(`
    INSERT INTO email_subscribers (list_id, email, status, unsubscribe_token, subscribed_at, created_at)
    VALUES (${otherListId}, 'journey-other-${ts}@example.com', 'active', '${otherToken}', NOW(), NOW())
    RETURNING id
  `);
  const otherSubscriberId = parseInt(otherSubRow[0] ?? '0', 10);

  return { clientId, listId, subscriberId, otherClientId, otherListId, otherSubscriberId };
}

function cleanupData(ids: SeedIds, journeyId?: number) {
  if (journeyId) {
    // Cascade deletes enrollments + steps + step_sends
    psql(`DELETE FROM email_journeys WHERE id = ${journeyId}`);
  }
  psql(`DELETE FROM email_subscribers WHERE id IN (${ids.subscriberId}, ${ids.otherSubscriberId})`);
  psql(`DELETE FROM email_lists WHERE id IN (${ids.listId}, ${ids.otherListId})`);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe.configure({ mode: 'serial' });

test.describe('Email Journeys Phase 1 @gap @email-journeys', () => {
  const cleanups: Array<() => Promise<void>> = [];
  let ids: SeedIds;
  let journeyId: number;
  let waitStepId: number;
  let emailStepId: number;

  test.beforeAll(async ({ clientApi }) => {
    const siteId = await resolveClientSiteId(clientApi);
    const clientId = parseInt(psql(`SELECT client_id FROM client_websites WHERE id = ${siteId}`) || '0', 10);
    ids = seedData(clientId);
  });

  test.afterAll(async () => {
    await runCleanups(cleanups);
    cleanupData(ids, journeyId);
  });

  // ── CRUD ──────────────────────────────────────────────────────────────────

  test('POST /api/portal/email/journeys — create journey', async ({ clientApi }) => {
    const res = await clientApi.post('/api/portal/email/journeys', {
      name: `E2E Journey ${Date.now()}`,
      triggerType: 'manual',
    });
    expect(res.status).toBe(201);
    expect(res.data.success).toBe(true);
    journeyId = res.data.data.id;
    expect(journeyId).toBeGreaterThan(0);
  });

  test('GET /api/portal/email/journeys — lists the journey', async ({ clientApi }) => {
    const res = await clientApi.get('/api/portal/email/journeys');
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    const found = res.data.data.find((j: { id: number }) => j.id === journeyId);
    expect(found).toBeTruthy();
  });

  test('GET /api/portal/email/journeys/[id] — get by id', async ({ clientApi }) => {
    const res = await clientApi.get(`/api/portal/email/journeys/${journeyId}`);
    expect(res.status).toBe(200);
    expect(res.data.data.id).toBe(journeyId);
  });

  test('PUT /api/portal/email/journeys/[id] — update name', async ({ clientApi }) => {
    const res = await clientApi.put(`/api/portal/email/journeys/${journeyId}`, {
      name: 'Updated Journey Name',
    });
    expect(res.status).toBe(200);
    expect(res.data.data.name).toBe('Updated Journey Name');
  });

  // ── Steps ─────────────────────────────────────────────────────────────────

  test('POST /api/portal/email/journeys/[id]/steps — add wait step (order 0)', async ({ clientApi }) => {
    const res = await clientApi.post(`/api/portal/email/journeys/${journeyId}/steps`, {
      stepOrder: 0,
      stepType: 'wait',
      config: { delayHours: 0 },
    });
    expect(res.status).toBe(201);
    waitStepId = res.data.data.id;
    expect(waitStepId).toBeGreaterThan(0);
  });

  test('POST /api/portal/email/journeys/[id]/steps — add email step (order 1)', async ({ clientApi }) => {
    const res = await clientApi.post(`/api/portal/email/journeys/${journeyId}/steps`, {
      stepOrder: 1,
      stepType: 'email',
      config: {
        subject: 'Hello from Journey',
        htmlContent: '<p>Welcome!</p>',
        fromName: 'Test',
        fromEmail: 'noreply@example.com',
      },
    });
    expect(res.status).toBe(201);
    emailStepId = res.data.data.id;
    expect(emailStepId).toBeGreaterThan(0);
  });

  test('GET /api/portal/email/journeys/[id]/steps — lists 2 steps', async ({ clientApi }) => {
    const res = await clientApi.get(`/api/portal/email/journeys/${journeyId}/steps`);
    expect(res.status).toBe(200);
    expect(res.data.data).toHaveLength(2);
    expect(res.data.data[0].stepOrder).toBe(0);
    expect(res.data.data[1].stepOrder).toBe(1);
  });

  // ── Enroll ────────────────────────────────────────────────────────────────

  test('POST enroll — enrolls subscriber', async ({ clientApi }) => {
    const res = await clientApi.post(`/api/portal/email/journeys/${journeyId}/enroll`, {
      subscriberIds: [ids.subscriberId],
    });
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.data.enrolled).toBe(1);
    expect(res.data.data.skipped).toBe(0);
  });

  test('POST enroll again — re-enrollment silently skipped', async ({ clientApi }) => {
    const res = await clientApi.post(`/api/portal/email/journeys/${journeyId}/enroll`, {
      subscriberIds: [ids.subscriberId],
    });
    expect(res.status).toBe(200);
    expect(res.data.data.enrolled).toBe(0);
    expect(res.data.data.skipped).toBe(1);
  });

  // ── Cron: advance ────────────────────────────────────────────────────────

  test('cron tick — unauthorized without x-vercel-cron or CRON_SECRET → 401', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/cron/process-journey-enrollments`);
    expect(res.status()).toBe(401);
  });

  test('cron tick — advances wait(0h) + email step, enrollment completes', async ({ request }) => {
    // Ensure the enrollment's nextRunAt is in the past (it was set to NOW() on
    // insert so it should already be due; set explicitly to be safe).
    psql(`
      UPDATE email_journey_enrollments
      SET next_run_at = NOW() - INTERVAL '1 second'
      WHERE journey_id = ${journeyId} AND subscriber_id = ${ids.subscriberId}
    `);

    const res = await request.get(`${BASE_URL}/api/cron/process-journey-enrollments`, {
      headers: { 'x-vercel-cron': '1' },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);

    // The wait step (delayHours=0) advances currentStepOrder immediately.
    // Run the cron a second time to process the email step.
    const res2 = await request.get(`${BASE_URL}/api/cron/process-journey-enrollments`, {
      headers: { 'x-vercel-cron': '1' },
    });
    expect(res2.status()).toBe(200);

    // Enrollment should now be completed (no more steps after order 1)
    const statusRow = psqlRow(`
      SELECT status FROM email_journey_enrollments
      WHERE journey_id = ${journeyId} AND subscriber_id = ${ids.subscriberId}
      LIMIT 1
    `);
    expect(statusRow[0]).toBe('completed');

    // A step-send row should exist for the email step
    const sendRow = psqlRow(`
      SELECT COUNT(*) FROM email_journey_step_sends ejs
      JOIN email_journey_enrollments eje ON eje.id = ejs.enrollment_id
      WHERE eje.journey_id = ${journeyId}
        AND eje.subscriber_id = ${ids.subscriberId}
        AND ejs.step_id = ${emailStepId}
    `);
    expect(parseInt(sendRow[0] ?? '0', 10)).toBe(1);
  });

  // ── Cross-tenant isolation ────────────────────────────────────────────────

  test('POST enroll — cross-tenant subscriber → 403', async ({ clientApi }) => {
    // ids.otherSubscriberId belongs to otherClientId's list, not this client
    const res = await clientApi.post(`/api/portal/email/journeys/${journeyId}/enroll`, {
      subscriberIds: [ids.otherSubscriberId],
    });
    expect(res.status).toBe(403);
  });

  test('GET /api/portal/email/journeys/[id] — 404 for foreign journey id', async ({ clientApi }) => {
    const res = await clientApi.get('/api/portal/email/journeys/999999');
    expect(res.status).toBe(404);
  });

  test('GET /api/portal/email/journeys — unauthenticated → 401', async ({ unauthApi }) => {
    const res = await unauthApi.get('/api/portal/email/journeys');
    expect(res.status).toBe(401);
  });

  // ── DELETE ────────────────────────────────────────────────────────────────

  test('DELETE /api/portal/email/journeys/[id] — removes journey', async ({ clientApi }) => {
    // Create a throwaway journey so we don't destroy the one used above
    const createRes = await clientApi.post('/api/portal/email/journeys', {
      name: `E2E Delete Target ${Date.now()}`,
      triggerType: 'manual',
    });
    const deleteId: number = createRes.data.data.id;

    const res = await clientApi.delete(`/api/portal/email/journeys/${deleteId}`);
    expect(res.status).toBe(200);

    const getRes = await clientApi.get(`/api/portal/email/journeys/${deleteId}`);
    expect(getRes.status).toBe(404);
  });
});
