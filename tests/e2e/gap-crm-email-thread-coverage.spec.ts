/**
 * CRM email thread read API @gap @crm-email-thread
 * Phase 1 of [[Spec - CRM Email Sync + Sequences]].
 *
 * GET /api/portal/crm/contacts/[id]/thread returns the unified inbound+outbound
 * email thread for a contact, chronological, tenant-scoped. Thread rows are
 * seeded via psql (the write paths — Gmail ingest + send-email — are exercised
 * elsewhere; this proves the read surface + tenancy).
 */
import { test, expect } from './setup/fixtures';
import { runCleanups, createTestContact } from './setup/helpers';
import { execSync } from 'child_process';

const DB = `postgresql://${process.env.USER ?? ''}@localhost:5432/simplerdev_test`;
function sql(q: string): string {
  return execSync(`psql "${DB}" -At -c "${q.replace(/"/g, '\\"')}"`, { encoding: 'utf8' }).trim();
}
function seedMsg(clientId: number, contactId: number, direction: string, providerId: string, minutesAgo: number): number {
  return parseInt(
    sql(
      `INSERT INTO crm_email_messages (client_id, contact_id, direction, provider_message_id, thread_key, from_email, to_email, subject, snippet, sent_at) ` +
        `VALUES (${clientId}, ${contactId}, '${direction}', '${providerId}', 'thread-key-1', 'a@example.com', 'b@example.com', 'Re: hello', 'snippet', now() - interval '${minutesAgo} minutes') RETURNING id`,
    ),
    10,
  );
}

// Serial: the describe shares a seeded contact + throwaway tenant across tests,
// so it must run in one worker (avoids parallel beforeAll collisions).
test.describe.configure({ mode: 'serial' });

test.describe('CRM email thread @gap @crm-email-thread', () => {
  const cleanups: Array<() => Promise<void>> = [];
  let clientId: number;
  let contactId: number;
  // throwaway tenant for cross-tenant check
  let otherUserId: number;
  let otherClientId: number;
  let otherContactId: number;

  test.beforeAll(async ({ clientApi }) => {
    const { contact, cleanup } = await createTestContact(clientApi);
    contactId = contact.id;
    cleanups.push(cleanup);
    clientId = parseInt(sql(`SELECT client_id FROM crm_contacts WHERE id=${contactId}`), 10);

    const tag = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e9).toString(36)}`;
    otherUserId = parseInt(sql(`INSERT INTO users (name, email, password) VALUES ('Other','gapcet-${tag}@example.com','x') RETURNING id`), 10);
    otherClientId = parseInt(sql(`INSERT INTO clients (user_id, company) VALUES (${otherUserId},'Other') RETURNING id`), 10);
    otherContactId = parseInt(sql(`INSERT INTO crm_contacts (client_id, first_name, email) VALUES (${otherClientId},'X','x-${tag}@example.com') RETURNING id`), 10);
  });

  test.afterAll(async () => {
    sql(`DELETE FROM crm_email_messages WHERE client_id IN (${clientId}, ${otherClientId})`);
    sql(`DELETE FROM crm_contacts WHERE id=${otherContactId}`);
    sql(`DELETE FROM clients WHERE id=${otherClientId}`);
    sql(`DELETE FROM users WHERE id=${otherUserId}`);
    await runCleanups(cleanups);
  });

  test('GET thread returns inbound+outbound messages chronologically', async ({ clientApi }) => {
    const tag = Date.now().toString(36);
    seedMsg(clientId, contactId, 'inbound', `in-${tag}`, 10);
    seedMsg(clientId, contactId, 'outbound', `out-${tag}`, 5);

    const res = await clientApi.get(`/api/portal/crm/contacts/${contactId}/thread`);
    expect(res.status).toBe(200);
    const rows = res.data.data as Array<{ direction: string; sentAt: string }>;
    expect(rows.length).toBeGreaterThanOrEqual(2);
    // chronological (asc by sentAt) — inbound (10m ago) before outbound (5m ago)
    const mine = rows.filter((r) => r.direction === 'inbound' || r.direction === 'outbound');
    const idxIn = mine.findIndex((r) => r.direction === 'inbound');
    const idxOut = mine.findIndex((r) => r.direction === 'outbound');
    expect(idxIn).toBeLessThan(idxOut);
  });

  test('GET thread 404 for unknown contact id', async ({ clientApi }) => {
    expect((await clientApi.get('/api/portal/crm/contacts/999999/thread')).status).toBe(404);
  });

  test('GET thread 404 for a contact owned by another tenant (no leak)', async ({ clientApi }) => {
    // seed a message on the other tenant's contact, then confirm we can't read it
    seedMsg(otherClientId, otherContactId, 'inbound', `other-${Date.now().toString(36)}`, 3);
    const res = await clientApi.get(`/api/portal/crm/contacts/${otherContactId}/thread`);
    expect(res.status).toBe(404);
  });

  test('GET thread 401 unauthenticated', async ({ unauthApi }) => {
    expect((await unauthApi.get(`/api/portal/crm/contacts/${contactId}/thread`)).status).toBe(401);
  });
});
