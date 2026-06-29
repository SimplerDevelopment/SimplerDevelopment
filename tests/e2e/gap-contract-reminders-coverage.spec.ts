/**
 * Contract signature-reminder cron @gap @contract-reminders
 *
 * process-contract-signature-reminders nudges contracts still awaiting
 * signature past the interval, records the reminder, and never touches terminal
 * or recently-reminded contracts. The DropboxSign call is best-effort (external,
 * neutralized in test) — the reminder is recorded regardless, which is asserted.
 */
import { test, expect } from './setup/fixtures';
import { execSync } from 'child_process';

const DB = `postgresql://${process.env.USER ?? ''}@localhost:5432/simplerdev_test`;
function sql(q: string): string {
  return execSync(`psql "${DB}" -At -c "${q.replace(/"/g, '\\"')}"`, { encoding: 'utf8' }).trim();
}
function seedContract(opts: { esignStatus: string; sentDaysAgo: number; lastReminderDaysAgo?: number }): number {
  const tag = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e9).toString(36)}`;
  const lastRem = opts.lastReminderDaysAgo === undefined ? 'NULL' : `now() - interval '${opts.lastReminderDaysAgo} days'`;
  return parseInt(
    sql(
      `INSERT INTO crm_contracts (client_id, title, client_token, esign_status, esign_provider_request_id, esign_signer_email, esign_sent_at, esign_last_reminder_at, esign_reminder_count) ` +
        `VALUES (1, 'Reminder Test', 'tok-${tag}', '${opts.esignStatus}', 'req-${tag}', 'signer-${tag}@example.com', now() - interval '${opts.sentDaysAgo} days', ${lastRem}, 0) RETURNING id`,
    ),
    10,
  );
}

test.describe.configure({ mode: 'serial' });

test.describe('Contract signature reminders @gap @contract-reminders', () => {
  let dueId: number;
  let recentId: number;
  let signedId: number;
  const ids: number[] = [];

  test.afterAll(async () => {
    if (ids.length) sql(`DELETE FROM crm_contracts WHERE id IN (${ids.join(',')})`);
  });

  test('cron reminds a due pending contract, skips recent + terminal ones', async ({ request }) => {
    dueId = seedContract({ esignStatus: 'sent', sentDaysAgo: 10 }); // due (no prior reminder, sent 10d ago)
    recentId = seedContract({ esignStatus: 'viewed', sentDaysAgo: 1 }); // not due (sent 1d ago < 3d)
    signedId = seedContract({ esignStatus: 'signed', sentDaysAgo: 10 }); // terminal — ignored
    ids.push(dueId, recentId, signedId);

    const tick = await request.get('/api/cron/process-contract-signature-reminders', {
      headers: { 'x-vercel-cron': '1' },
    });
    expect(tick.status()).toBe(200);

    expect(sql(`SELECT esign_last_reminder_at IS NOT NULL FROM crm_contracts WHERE id=${dueId}`)).toBe('t');
    expect(sql(`SELECT esign_reminder_count FROM crm_contracts WHERE id=${dueId}`)).toBe('1');
    expect(sql(`SELECT esign_last_reminder_at IS NULL FROM crm_contracts WHERE id=${recentId}`)).toBe('t');
    expect(sql(`SELECT esign_last_reminder_at IS NULL FROM crm_contracts WHERE id=${signedId}`)).toBe('t');
  });

  test('cron does not re-remind a just-reminded contract (interval not elapsed)', async ({ request }) => {
    // dueId was reminded "now" in the previous test → not due again for 3 days.
    const before = sql(`SELECT esign_reminder_count FROM crm_contracts WHERE id=${dueId}`);
    await request.get('/api/cron/process-contract-signature-reminders', { headers: { 'x-vercel-cron': '1' } });
    expect(sql(`SELECT esign_reminder_count FROM crm_contracts WHERE id=${dueId}`)).toBe(before);
  });

  test('a pending contract reminded long ago IS reminded again', async ({ request }) => {
    const staleId = seedContract({ esignStatus: 'sent', sentDaysAgo: 30, lastReminderDaysAgo: 5 });
    ids.push(staleId);
    await request.get('/api/cron/process-contract-signature-reminders', { headers: { 'x-vercel-cron': '1' } });
    expect(sql(`SELECT esign_reminder_count FROM crm_contracts WHERE id=${staleId}`)).toBe('1');
  });

  test('cron requires auth', async ({ request }) => {
    expect((await request.get('/api/cron/process-contract-signature-reminders')).status()).toBe(401);
  });
});
