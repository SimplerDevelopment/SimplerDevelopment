import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { aiCreditBalances, aiCreditLedger } from '@/lib/db/schema';
import { addPurchasedCredits, deductCredits, grantSignupCredits, reserveCredits, settleCredits } from '@/lib/ai-credits';
import { sessionForNewClientUser, twoTenants } from '@/tests/helpers/session';

async function seed(balance: number) {
  const tenant = await sessionForNewClientUser('credit-reservation');
  await db.insert(aiCreditBalances).values({ clientId: tenant.client.id, balance });
  return tenant.client.id;
}

describe('AI credit reservations @tenancy @ai', () => {
  it('concurrent callers cannot reserve more than the available balance', async () => {
    const clientId = await seed(1000);
    const results = await Promise.all(Array.from({ length: 10 }, (_, i) => reserveCredits(clientId, 300, 'ai', `call-${i}`)));
    expect(results.filter(result => result.success)).toHaveLength(3);
    const [balance] = await db.select().from(aiCreditBalances).where(eq(aiCreditBalances.clientId, clientId));
    expect(balance.balance).toBe(100);
    const entries = await db.select().from(aiCreditLedger).where(eq(aiCreditLedger.clientId, clientId));
    expect(entries).toHaveLength(3);
    expect(new Set(entries.map(entry => entry.balanceAfter))).toEqual(new Set([700, 400, 100]));
  });

  it('parallel repeated reservation and settlement debit exactly once', async () => {
    const clientId = await seed(1000);
    await Promise.all(Array.from({ length: 6 }, () => reserveCredits(clientId, 800, 'ai', 'same-call')));
    const settled = await Promise.all(Array.from({ length: 6 }, () => settleCredits(clientId, 125, 'ai', 'same-call')));
    expect(settled.every(result => result.success)).toBe(true);
    const [balance] = await db.select().from(aiCreditBalances).where(eq(aiCreditBalances.clientId, clientId));
    expect(balance.balance).toBe(875);
    const entries = await db.select().from(aiCreditLedger).where(eq(aiCreditLedger.clientId, clientId));
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ type: 'usage', amount: -125, balanceAfter: 875 });
  });

  it('rolls the balance back if the reservation ledger cannot be written', async () => {
    const clientId = await seed(1000);
    await expect(reserveCredits(clientId, 300, 'x'.repeat(51), 'invalid-category')).rejects.toThrow();
    const [balance] = await db.select().from(aiCreditBalances).where(eq(aiCreditBalances.clientId, clientId));
    expect(balance.balance).toBe(1000);
    expect(await db.select().from(aiCreditLedger).where(eq(aiCreditLedger.clientId, clientId))).toHaveLength(0);
  });

  it('never settles a reservation belonging to another tenant', async () => {
    const { A, B } = await twoTenants();
    await db.insert(aiCreditBalances).values([{ clientId: A.client.id, balance: 1000 }, { clientId: B.client.id, balance: 1000 }]);
    await reserveCredits(A.client.id, 500, 'ai', 'shared-name');
    expect((await settleCredits(B.client.id, 10, 'ai', 'shared-name')).success).toBe(false);
    const rows = await db.select().from(aiCreditBalances);
    expect(rows.find(row => row.clientId === A.client.id)?.balance).toBe(500);
    expect(rows.find(row => row.clientId === B.client.id)?.balance).toBe(1000);
  });

  it('a settled operation cannot be reserved again or changed by a retry', async () => {
    const clientId = await seed(1000);
    await reserveCredits(clientId, 500, 'ai', 'once');
    await settleCredits(clientId, 20, 'ai', 'once');
    expect((await reserveCredits(clientId, 500, 'ai', 'once')).success).toBe(false);
    expect((await settleCredits(clientId, 21, 'ai', 'once')).success).toBe(false);
    const [balance] = await db.select().from(aiCreditBalances).where(eq(aiCreditBalances.clientId, clientId));
    expect(balance.balance).toBe(980);
  });

  it('legacy deductions also serialize the balance check and ledger commit', async () => {
    const clientId = await seed(1000);
    const results = await Promise.all(Array.from({ length: 5 }, (_, i) => deductCredits(clientId, 400, 'legacy', String(i))));
    expect(results.filter(result => result.success)).toHaveLength(2);
    const [balance] = await db.select().from(aiCreditBalances).where(eq(aiCreditBalances.clientId, clientId));
    expect(balance.balance).toBe(200);
  });

  it('repeated payment and signup grants cannot mint duplicate credits', async () => {
    const clientId = await seed(0);
    await Promise.all(Array.from({ length: 5 }, () => addPurchasedCredits(clientId, 1000, 'pi_once', 'Pack')));
    await Promise.all(Array.from({ length: 5 }, () => grantSignupCredits(clientId)));
    const [balance] = await db.select().from(aiCreditBalances).where(eq(aiCreditBalances.clientId, clientId));
    expect(balance.balance).toBe(251_000);
    expect(await db.select().from(aiCreditLedger).where(eq(aiCreditLedger.clientId, clientId))).toHaveLength(2);
  });

  it('releases a definite rejection once and refuses unfunded settlement overruns', async () => {
    const clientId = await seed(1000);
    await reserveCredits(clientId, 900, 'ai', 'rejected');
    await Promise.all([settleCredits(clientId, 0, 'ai', 'rejected'), settleCredits(clientId, 0, 'ai', 'rejected')]);
    await reserveCredits(clientId, 1000, 'ai', 'overrun');
    expect((await settleCredits(clientId, 1001, 'ai', 'overrun')).success).toBe(false);
    const [balance] = await db.select().from(aiCreditBalances).where(eq(aiCreditBalances.clientId, clientId));
    expect(balance.balance).toBe(0);
    const entries = await db.select().from(aiCreditLedger).where(eq(aiCreditLedger.clientId, clientId));
    expect(entries.find(entry => entry.referenceId === 'overrun')?.type).toBe('reservation');
  });
});
