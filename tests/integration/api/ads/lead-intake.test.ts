/**
 * Ads lead intake — tenancy + journaling.
 *
 * Covers: contact creation scoped to the caller client, per-client email
 * uniqueness (same email in two clients → two contacts), idempotent repeat,
 * first-touch attribution, and automation-bus journaling under the right
 * clientId for both `crm.contact.created` and `ads.lead.received`.
 *
 * Tagged `@ads @crm @tenancy` so `bun test:tenancy` picks it up.
 */
import { describe, it, expect, beforeEach } from 'vitest';

import { sessionForNewClientUser, type TenantCtx } from '../../../helpers/session';
import { getTestSql, TEST_SCHEMA } from '../../../helpers/test-db';
import { intakeAdLead } from '@/lib/ads/lead-intake';

const LEAD = {
  provider: 'mock' as const,
  campaignRef: 'promo-enero',
  contact: { email: 'Lead@Acme.test', displayName: 'Ana López' },
};

async function contactRow(id: number) {
  const sql = getTestSql();
  const [row] = await sql<
    { id: number; clientId: number; email: string; attribution: Record<string, string> | null }[]
  >`
    SELECT id, client_id AS "clientId", email, attribution
    FROM ${sql(TEST_SCHEMA)}.crm_contacts WHERE id = ${id}
  `;
  return row;
}

async function jobEvents(clientId: number) {
  const sql = getTestSql();
  return sql<{ event: string }[]>`
    SELECT event FROM ${sql(TEST_SCHEMA)}.automation_jobs WHERE client_id = ${clientId} ORDER BY id
  `;
}

describe('Ads lead intake @ads @crm @tenancy', () => {
  let A: TenantCtx;
  let B: TenantCtx;

  beforeEach(async () => {
    A = await sessionForNewClientUser('ads-intake-a');
    B = await sessionForNewClientUser('ads-intake-b');
  });

  it('creates the contact under the caller tenant with normalized email', async () => {
    const result = await intakeAdLead({ clientId: A.client.id, userId: 0, lead: LEAD });
    expect(result.created).toBe(true);
    const row = await contactRow(result.contactId);
    expect(row.clientId).toBe(A.client.id);
    expect(row.email).toBe('lead@acme.test');
  });

  it('stamps first-touch attribution (provider/campaign)', async () => {
    const result = await intakeAdLead({ clientId: A.client.id, userId: 0, lead: LEAD });
    const row = await contactRow(result.contactId);
    expect(row.attribution).toMatchObject({ s: 'mock', m: 'ads', c: 'promo-enero' });
  });

  it('scopes email uniqueness per client (same email, two contacts)', async () => {
    const a = await intakeAdLead({ clientId: A.client.id, userId: 0, lead: LEAD });
    const b = await intakeAdLead({ clientId: B.client.id, userId: 0, lead: LEAD });
    expect(a.created).toBe(true);
    expect(b.created).toBe(true);
    expect(a.contactId).not.toBe(b.contactId);
    expect((await contactRow(b.contactId)).clientId).toBe(B.client.id);
  });

  it('repeat intake is idempotent (no duplicate contact)', async () => {
    const first = await intakeAdLead({ clientId: A.client.id, userId: 0, lead: LEAD });
    const second = await intakeAdLead({ clientId: A.client.id, userId: 0, lead: LEAD });
    expect(second.created).toBe(false);
    expect(second.contactId).toBe(first.contactId);
  });

  it('journals both automation events under the caller tenant', async () => {
    await intakeAdLead({ clientId: A.client.id, userId: 0, lead: LEAD });
    // The journal insert is awaited inside emitEvent; a tick covers dispatch.
    await new Promise((r) => setTimeout(r, 50));
    const aEvents = (await jobEvents(A.client.id)).map((j) => j.event);
    expect(aEvents).toContain('crm.contact.created');
    expect(aEvents).toContain('ads.lead.received');
    const bEvents = await jobEvents(B.client.id);
    expect(bEvents).toHaveLength(0);
  });
});
