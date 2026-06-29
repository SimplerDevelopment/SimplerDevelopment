/**
 * Embeddable email signup forms @gap @email-signup
 *
 * A public signup POST adds a subscriber to the form's list and enrolls them
 * into matching active list_join journeys (closing the journeys loop).
 */
import { test, expect } from './setup/fixtures';
import { resolveClientSiteId } from './setup/helpers';
import { execSync } from 'child_process';

const DB = `postgresql://${process.env.USER ?? ''}@localhost:5432/simplerdev_test`;
function sql(q: string): string {
  return execSync(`psql "${DB}" -At -c "${q.replace(/"/g, '\\"')}"`, { encoding: 'utf8' }).trim();
}

test.describe.configure({ mode: 'serial' });

test.describe('Email signup forms @gap @email-signup', () => {
  let siteId: number;
  let clientId: number;
  let listId: number;
  let formId: number;
  let embedKey: string;
  let journeyId: number;

  test.afterAll(async () => {
    if (journeyId) sql(`DELETE FROM email_journeys WHERE id=${journeyId}`);
    if (listId) {
      sql(`DELETE FROM email_subscribers WHERE list_id=${listId}`);
      sql(`DELETE FROM email_signup_forms WHERE list_id=${listId}`);
      sql(`DELETE FROM email_lists WHERE id=${listId}`);
    }
  });

  test('create a signup form; public signup adds a subscriber (idempotent)', async ({ clientApi, request }) => {
    siteId = await resolveClientSiteId(clientApi);
    clientId = parseInt(sql(`SELECT client_id FROM client_websites WHERE id=${siteId}`), 10);
    listId = parseInt(sql(`INSERT INTO email_lists (name, client_id) VALUES ('Signup E2E ${Date.now()}', ${clientId}) RETURNING id`), 10);

    const create = await clientApi.post('/api/portal/email/signup-forms', { name: 'E2E Form', listId });
    expect([200, 201]).toContain(create.status);
    formId = create.data.data.id;
    embedKey = create.data.data.embedKey;
    expect(embedKey).toMatch(/^[0-9a-f]{48}$/);

    const email = `signup-${Date.now()}@example.com`;
    const r1 = await request.post(`/api/public/email/signup/${embedKey}`, { data: { email, name: 'Sub One' } });
    expect(r1.status()).toBe(200);
    expect(sql(`SELECT count(*) FROM email_subscribers WHERE list_id=${listId} AND email='${email}'`)).toBe('1');

    // Idempotent on (list, email).
    const r2 = await request.post(`/api/public/email/signup/${embedKey}`, { data: { email } });
    expect(r2.status()).toBe(200);
    expect(sql(`SELECT count(*) FROM email_subscribers WHERE list_id=${listId} AND email='${email}'`)).toBe('1');
  });

  test('signup with a bad key → 404; bad email → 400', async ({ request }) => {
    expect((await request.post('/api/public/email/signup/deadbeef', { data: { email: 'x@y.com' } })).status()).toBe(404);
    expect((await request.post(`/api/public/email/signup/${embedKey}`, { data: { email: 'not-an-email' } })).status()).toBe(400);
  });

  test('signup enrolls into an active list_join journey', async ({ clientApi, request }) => {
    const j = await clientApi.post('/api/portal/email/journeys', {
      name: 'Signup Journey',
      triggerType: 'list_join',
      triggerConfig: { listId },
    });
    expect([200, 201]).toContain(j.status);
    journeyId = j.data.data.id;
    sql(`UPDATE email_journeys SET status='active' WHERE id=${journeyId}`);

    const email = `enroll-${Date.now()}@example.com`;
    const res = await request.post(`/api/public/email/signup/${embedKey}`, { data: { email } });
    expect(res.status()).toBe(200);

    const subId = sql(`SELECT id FROM email_subscribers WHERE list_id=${listId} AND email='${email}'`);
    expect(parseInt(sql(`SELECT count(*) FROM email_journey_enrollments WHERE journey_id=${journeyId} AND subscriber_id=${subId}`), 10)).toBe(1);
  });

  test('portal CRUD is tenant-scoped', async ({ clientApi, unauthApi }) => {
    const list = await clientApi.get('/api/portal/email/signup-forms');
    expect(list.status).toBe(200);
    expect((list.data.data as Array<{ id: number }>).some((f) => f.id === formId)).toBe(true);
    expect((await unauthApi.get('/api/portal/email/signup-forms')).status).toBe(401);
    expect((await clientApi.delete(`/api/portal/email/signup-forms/${formId}`)).status).toBe(200);
    expect((await clientApi.get(`/api/portal/email/signup-forms/${formId}`)).status).toBe(404);
  });
});
