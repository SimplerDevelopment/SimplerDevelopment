/**
 * CRM email sequences / cadences @gap @crm-sequences
 * Phase 2 of [[Spec - CRM Email Sync + Sequences]].
 *
 * CRUD + enroll + the process-crm-sequences cron tick (advances an enrollment
 * and writes an idempotent send row). Resend is sandbox-neutralized, so the
 * cron records the send attempt (success or error) and advances regardless —
 * which is exactly what this asserts.
 */
import { test, expect } from './setup/fixtures';
import { runCleanups, createTestContact } from './setup/helpers';
import { execSync } from 'child_process';

const DB = `postgresql://${process.env.USER ?? ''}@localhost:5432/simplerdev_test`;
function sql(q: string): string {
  return execSync(`psql "${DB}" -At -c "${q.replace(/"/g, '\\"')}"`, { encoding: 'utf8' }).trim();
}

test.describe.configure({ mode: 'serial' });

test.describe('CRM sequences @gap @crm-sequences', () => {
  const cleanups: Array<() => Promise<void>> = [];
  let contactId: number;
  let seqId: number;

  test.afterAll(async () => {
    if (seqId) sql(`DELETE FROM crm_sequences WHERE id=${seqId}`); // cascades steps/enrollments/sends
    await runCleanups(cleanups);
  });

  test('POST creates a sequence with inline steps', async ({ clientApi }) => {
    const { contact, cleanup } = await createTestContact(clientApi);
    contactId = contact.id;
    cleanups.push(cleanup);

    const res = await clientApi.post('/api/portal/crm/sequences', {
      name: 'Onboarding cadence',
      steps: [
        { delayHours: 0, subject: 'Welcome', bodyHtml: '<p>Hi</p>' },
        { delayHours: 72, subject: 'Following up', bodyHtml: '<p>Still there?</p>' },
      ],
    });
    expect(res.status).toBe(201);
    expect(res.data.data.id).toBeGreaterThan(0);
    expect(res.data.data.steps).toHaveLength(2);
    expect(res.data.data.steps[0].stepOrder).toBe(0);
    seqId = res.data.data.id;
  });

  test('POST rejects missing name (400) and a step missing subject (400)', async ({ clientApi }) => {
    expect((await clientApi.post('/api/portal/crm/sequences', { steps: [] })).status).toBe(400);
    expect(
      (await clientApi.post('/api/portal/crm/sequences', { name: 'x', steps: [{ bodyHtml: '<p>x</p>' }] })).status,
    ).toBe(400);
  });

  test('GET list + GET [id] (with steps)', async ({ clientApi }) => {
    const list = await clientApi.get('/api/portal/crm/sequences');
    expect(list.status).toBe(200);
    expect((list.data.data as Array<{ id: number }>).some((s) => s.id === seqId)).toBe(true);

    const one = await clientApi.get(`/api/portal/crm/sequences/${seqId}`);
    expect(one.status).toBe(200);
    expect(one.data.data.steps).toHaveLength(2);
  });

  test('POST enroll creates an active enrollment; re-enroll is 409', async ({ clientApi }) => {
    const res = await clientApi.post(`/api/portal/crm/sequences/${seqId}/enroll`, { contactId });
    expect(res.status).toBe(201);
    expect(res.data.data.status).toBe('active');
    expect(res.data.data.currentStep).toBe(0);

    const dup = await clientApi.post(`/api/portal/crm/sequences/${seqId}/enroll`, { contactId });
    expect(dup.status).toBe(409);
  });

  test('cron tick sends the due step + advances the enrollment', async ({ request }) => {
    // step 0 has delayHours=0 → due immediately. The cron is global; the vercel
    // header authorizes it (same gate as the survey cron).
    const tick = await request.get('/api/cron/process-crm-sequences', {
      headers: { 'x-vercel-cron': '1' },
    });
    expect(tick.status()).toBe(200);

    // A send row was written for (enrollment, step 0), and currentStep advanced.
    const enrollmentId = sql(`SELECT id FROM crm_sequence_enrollments WHERE sequence_id=${seqId} AND contact_id=${contactId}`);
    const sendCount = sql(`SELECT count(*) FROM crm_sequence_sends WHERE enrollment_id=${enrollmentId}`);
    expect(parseInt(sendCount, 10)).toBeGreaterThanOrEqual(1);
    const currentStep = sql(`SELECT current_step FROM crm_sequence_enrollments WHERE id=${enrollmentId}`);
    expect(parseInt(currentStep, 10)).toBe(1); // advanced past step 0
  });

  test('cron is idempotent — a second tick does not re-send step 0', async ({ request }) => {
    const enrollmentId = sql(`SELECT id FROM crm_sequence_enrollments WHERE sequence_id=${seqId} AND contact_id=${contactId}`);
    const before = sql(`SELECT count(*) FROM crm_sequence_sends WHERE enrollment_id=${enrollmentId}`);
    await request.get('/api/cron/process-crm-sequences', { headers: { 'x-vercel-cron': '1' } });
    const after = sql(`SELECT count(*) FROM crm_sequence_sends WHERE enrollment_id=${enrollmentId}`);
    // step 1 has a 72h delay → not due, so no new send this tick.
    expect(after).toBe(before);
  });

  test('PATCH updates name/enabled', async ({ clientApi }) => {
    const res = await clientApi.patch(`/api/portal/crm/sequences/${seqId}`, { enabled: false, name: 'Renamed' });
    expect(res.status).toBe(200);
    expect(res.data.data.enabled).toBe(false);
    expect(res.data.data.name).toBe('Renamed');
  });

  test('404 for unknown id (enroll/get/patch/delete); 401 unauthenticated', async ({ clientApi, unauthApi }) => {
    expect((await clientApi.get('/api/portal/crm/sequences/999999')).status).toBe(404);
    expect((await clientApi.post('/api/portal/crm/sequences/999999/enroll', { contactId })).status).toBe(404);
    expect((await clientApi.patch('/api/portal/crm/sequences/999999', { enabled: true })).status).toBe(404);
    expect((await clientApi.delete('/api/portal/crm/sequences/999999')).status).toBe(404);
    expect((await unauthApi.get('/api/portal/crm/sequences')).status).toBe(401);
    expect((await unauthApi.post(`/api/portal/crm/sequences/${seqId}/enroll`, { contactId })).status).toBe(401);
  });
});
