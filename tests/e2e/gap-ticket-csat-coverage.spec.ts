/**
 * Ticket CSAT @gap @ticket-csat
 *
 * The client rates a resolved support ticket (1–5 + comment); the help-desk
 * reports endpoint surfaces the CSAT aggregate. CSAT is gated on resolved/closed
 * status and tenant-scoped.
 */
import { test, expect } from './setup/fixtures';
import { runCleanups, createTestTicket } from './setup/helpers';
import { execSync } from 'child_process';

const DB = `postgresql://${process.env.USER ?? ''}@localhost:5432/simplerdev_test`;
function sql(q: string): string {
  return execSync(`psql "${DB}" -At -c "${q.replace(/"/g, '\\"')}"`, { encoding: 'utf8' }).trim();
}

test.describe.configure({ mode: 'serial' });

test.describe('Ticket CSAT @gap @ticket-csat', () => {
  const cleanups: Array<() => Promise<void>> = [];
  let ticketId: number;
  let clientId: number;
  let otherUserId: number;
  let otherClientId: number;
  let otherTicketId: number;

  test.afterAll(async () => {
    await runCleanups(cleanups);
    sql(`DELETE FROM support_tickets WHERE id=${otherTicketId}`);
    sql(`DELETE FROM clients WHERE id=${otherClientId}`);
    sql(`DELETE FROM users WHERE id=${otherUserId}`);
  });

  test('CSAT is rejected on a not-yet-resolved ticket (409)', async ({ clientApi }) => {
    const { ticket, cleanup } = await createTestTicket(clientApi);
    ticketId = ticket.id;
    cleanups.push(cleanup);
    clientId = parseInt(sql(`SELECT client_id FROM support_tickets WHERE id=${ticketId}`), 10);

    const res = await clientApi.post(`/api/portal/tickets/${ticketId}/csat`, { score: 5 });
    expect(res.status).toBe(409);

    // throwaway tenant + a resolved ticket for the cross-tenant check
    const tag = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e9).toString(36)}`;
    otherUserId = parseInt(sql(`INSERT INTO users (name, email, password) VALUES ('O','csat-${tag}@example.com','x') RETURNING id`), 10);
    otherClientId = parseInt(sql(`INSERT INTO clients (user_id, company) VALUES (${otherUserId},'O') RETURNING id`), 10);
    otherTicketId = parseInt(sql(`INSERT INTO support_tickets (number, client_id, subject, status, resolved_at) VALUES (1, ${otherClientId}, 'x', 'resolved', now()) RETURNING id`), 10);
  });

  test('CSAT submits on a resolved ticket and stores the score', async ({ clientApi }) => {
    sql(`UPDATE support_tickets SET status='resolved', resolved_at=now() WHERE id=${ticketId}`);
    const res = await clientApi.post(`/api/portal/tickets/${ticketId}/csat`, { score: 4, comment: 'Good help' });
    expect(res.status).toBe(200);
    expect(res.data.data.csatScore).toBe(4);
    expect(sql(`SELECT csat_score FROM support_tickets WHERE id=${ticketId}`)).toBe('4');
    expect(sql(`SELECT csat_comment FROM support_tickets WHERE id=${ticketId}`)).toBe('Good help');
  });

  test('CSAT rejects an out-of-range / non-integer score (400)', async ({ clientApi }) => {
    expect((await clientApi.post(`/api/portal/tickets/${ticketId}/csat`, { score: 0 })).status).toBe(400);
    expect((await clientApi.post(`/api/portal/tickets/${ticketId}/csat`, { score: 6 })).status).toBe(400);
    expect((await clientApi.post(`/api/portal/tickets/${ticketId}/csat`, { score: 3.5 })).status).toBe(400);
  });

  test('reports surfaces the CSAT aggregate', async ({ clientApi }) => {
    const res = await clientApi.get('/api/portal/tickets/reports?days=90');
    expect(res.status).toBe(200);
    expect(res.data.data.csat).toBeTruthy();
    expect(res.data.data.csat.responses).toBeGreaterThanOrEqual(1);
    expect(res.data.data.csat.averageScore).toBeGreaterThan(0);
    expect(res.data.data.csat.distribution['4']).toBeGreaterThanOrEqual(1);
  });

  test('CSAT 404 for unknown ticket + cross-tenant; 401 unauthenticated', async ({ clientApi, unauthApi }) => {
    expect((await clientApi.post('/api/portal/tickets/999999/csat', { score: 5 })).status).toBe(404);
    // resolved ticket owned by another tenant → not visible
    expect((await clientApi.post(`/api/portal/tickets/${otherTicketId}/csat`, { score: 5 })).status).toBe(404);
    expect(sql(`SELECT csat_score FROM support_tickets WHERE id=${otherTicketId}`)).toBe('');
    expect((await unauthApi.post(`/api/portal/tickets/${ticketId}/csat`, { score: 5 })).status).toBe(401);
  });
});
