/**
 * Portal CRM mutations — golden-path E2E (@critical).
 *
 * Single rerunnable spec that exercises the create-edit-delete lifecycle for
 * the major CRM resources together. Companion to the per-resource spec files
 * (portal-crm.spec.ts, portal-crm-extras.spec.ts) — this one is intentionally
 * one consolidated flow tagged @critical for the golden-path gate.
 *
 * Resources exercised: company, contact, deal, proposal, contract,
 * deal-comment, scoring-rule, saved-view. All test data is prefixed with
 * `CRM-MUT-` and torn down via `runCleanups`.
 */
import { test, expect } from './setup/fixtures';
import {
  runCleanups,
  createTestCompany,
  createTestContact,
  createTestPipeline,
  createTestDeal,
  createTestProposal,
  createTestContract,
} from './setup/helpers';

const PREFIX = 'CRM-MUT-';

test.describe('Portal CRM — consolidated mutation lifecycle @crm @mutations @critical', () => {
  let cleanups: Array<() => Promise<void>> = [];
  // Many sequential network round-trips; bump from default 60s.
  test.setTimeout(180_000);

  test.afterEach(async () => {
    await runCleanups(cleanups);
    cleanups = [];
  });

  test('create → edit → delete each: company, contact, deal, proposal, contract, comment, scoring-rule, saved-view', async ({ clientApi }) => {
    // ── Pipeline (needed for deal create) ──
    const { pipeline } = await createTestPipeline(clientApi, { name: `${PREFIX}Pipeline-${Date.now()}` });
    const stageId = pipeline.stages[0].id;

    // ── Company: create / edit / delete ──
    const { company, cleanup: companyCleanup } = await createTestCompany(clientApi, {
      name: `${PREFIX}Company-${Date.now()}`,
    });
    cleanups.push(companyCleanup);
    expect(company).toHaveProperty('id');
    expect(company.clientId).toBeTruthy();

    const editCompany = await clientApi.put(`/api/portal/crm/companies/${company.id}`, { industry: 'Healthcare' });
    expect(editCompany.status).toBe(200);

    const delCompany = await clientApi.delete(`/api/portal/crm/companies/${company.id}`);
    expect(delCompany.status).toBe(200);
    // Pop the cleanup since we just deleted it.
    cleanups.pop();

    // ── Contact: create / edit / delete ──
    const { contact, cleanup: contactCleanup } = await createTestContact(clientApi, {
      firstName: `${PREFIX}First`,
      lastName: `Last-${Date.now()}`,
    });
    cleanups.push(contactCleanup);
    expect(contact).toHaveProperty('id');

    const editContact = await clientApi.put(`/api/portal/crm/contacts/${contact.id}`, { phone: '(555) 111-2222' });
    expect(editContact.status).toBe(200);

    const delContact = await clientApi.delete(`/api/portal/crm/contacts/${contact.id}`);
    expect(delContact.status).toBe(200);
    cleanups.pop();

    // ── Deal: create / edit / delete + add comment ──
    const { deal, cleanup: dealCleanup } = await createTestDeal(clientApi, pipeline.id, stageId, {
      title: `${PREFIX}Deal-${Date.now()}`,
    });
    cleanups.push(dealCleanup);
    expect(deal).toHaveProperty('id');

    // Add a comment to the deal (POST), then delete (DELETE).
    const addComment = await clientApi.post(`/api/portal/crm/deals/${deal.id}/comments`, { body: `${PREFIX}comment` });
    expect(addComment.status).toBe(201);
    expect(addComment.data.success).toBe(true);
    const commentId = addComment.data.data.id as number;

    const delComment = await clientApi.delete(`/api/portal/crm/deals/${deal.id}/comments`, { commentId });
    expect(delComment.status).toBe(200);

    const editDeal = await clientApi.put(`/api/portal/crm/deals/${deal.id}`, { value: 99999 });
    expect(editDeal.status).toBe(200);

    const delDeal = await clientApi.delete(`/api/portal/crm/deals/${deal.id}`);
    expect(delDeal.status).toBe(200);
    cleanups.pop();

    // ── Proposal: create / edit / delete ──
    const { proposal, cleanup: proposalCleanup } = await createTestProposal(clientApi, {
      title: `${PREFIX}Proposal-${Date.now()}`,
    });
    cleanups.push(proposalCleanup);
    expect(proposal).toHaveProperty('id');

    const editProposal = await clientApi.put(`/api/portal/crm/proposals/${proposal.id}`, { summary: 'Edited summary' });
    expect(editProposal.status).toBe(200);

    const delProposal = await clientApi.delete(`/api/portal/crm/proposals/${proposal.id}`);
    expect(delProposal.status).toBe(200);
    cleanups.pop();

    // ── Contract: create / edit / delete ──
    const { contract, cleanup: contractCleanup } = await createTestContract(clientApi, {
      title: `${PREFIX}Contract-${Date.now()}`,
    });
    cleanups.push(contractCleanup);
    expect(contract).toHaveProperty('id');

    const editContract = await clientApi.put(`/api/portal/crm/contracts/${contract.id}`, { summary: 'Edited summary' });
    expect(editContract.status).toBe(200);

    const delContract = await clientApi.delete(`/api/portal/crm/contracts/${contract.id}`);
    expect(delContract.status).toBe(200);
    cleanups.pop();

    // ── Scoring rule: create / edit / delete ──
    const ruleCreate = await clientApi.post('/api/portal/crm/scoring-rules', {
      eventType: `${PREFIX}event-${Date.now()}`,
      points: 10,
      description: `${PREFIX}auto-test`,
    });
    expect(ruleCreate.status).toBe(201);
    const ruleId = ruleCreate.data.data.id as number;
    cleanups.push(async () => {
      await clientApi.delete(`/api/portal/crm/scoring-rules/${ruleId}`).catch(() => {});
    });

    const ruleEdit = await clientApi.put(`/api/portal/crm/scoring-rules/${ruleId}`, { points: 25 });
    expect(ruleEdit.status).toBe(200);
    expect(ruleEdit.data.data.points).toBe(25);

    const ruleDelete = await clientApi.delete(`/api/portal/crm/scoring-rules/${ruleId}`);
    expect(ruleDelete.status).toBe(200);
    cleanups.pop();

    // ── Saved view: create / edit / delete ──
    const viewCreate = await clientApi.post('/api/portal/crm/saved-views', {
      name: `${PREFIX}View-${Date.now()}`,
      entityType: 'contact',
      filters: { status: 'lead' },
    });
    expect(viewCreate.status).toBe(201);
    const viewId = viewCreate.data.data.id as number;
    cleanups.push(async () => {
      await clientApi.delete(`/api/portal/crm/saved-views/${viewId}`).catch(() => {});
    });

    const viewEdit = await clientApi.put(`/api/portal/crm/saved-views/${viewId}`, { name: `${PREFIX}Renamed` });
    expect(viewEdit.status).toBe(200);

    const viewDelete = await clientApi.delete(`/api/portal/crm/saved-views/${viewId}`);
    expect(viewDelete.status).toBe(200);
    cleanups.pop();
  });

  test('rejects unauthenticated mutations (401)', async ({ unauthApi }) => {
    const cases = [
      { method: 'post' as const, url: '/api/portal/crm/companies', body: { name: 'X' } },
      { method: 'post' as const, url: '/api/portal/crm/contacts', body: { firstName: 'X' } },
      { method: 'post' as const, url: '/api/portal/crm/proposals', body: { title: 'X' } },
      { method: 'post' as const, url: '/api/portal/crm/contracts', body: { title: 'X' } },
      { method: 'post' as const, url: '/api/portal/crm/scoring-rules', body: { eventType: 'x', points: 1 } },
      { method: 'post' as const, url: '/api/portal/crm/saved-views', body: { name: 'X', entityType: 'contact', filters: {} } },
    ];

    for (const c of cases) {
      const res = await unauthApi[c.method](c.url, c.body);
      expect(res.status, `expected 401 for ${c.method.toUpperCase()} ${c.url}`).toBe(401);
    }
  });
});
