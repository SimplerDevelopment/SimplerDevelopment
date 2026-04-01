/**
 * Portal CRM API E2E Tests
 *
 * Tests for contacts, companies, deals, pipelines, tags, activities, proposals, contracts.
 * All tests are rerunnable — they create and clean up their own data.
 */
import { test, expect } from './setup/fixtures';
import {
  runCleanups,
  createTestContact,
  createTestCompany,
  createTestPipeline,
  createTestDeal,
  createTestCrmTag,
  createTestProposal,
  createTestContract,
} from './setup/helpers';

// ── Contacts ──

test.describe('Portal CRM — Contacts @crm @contacts', () => {
  let cleanups: Array<() => Promise<void>> = [];

  test.afterEach(async () => {
    await runCleanups(cleanups);
    cleanups = [];
  });

  test('POST creates a contact', async ({ clientApi }) => {
    const { contact, cleanup } = await createTestContact(clientApi);
    cleanups.push(cleanup);

    expect(contact).toHaveProperty('id');
    expect(contact.firstName).toBe('Test');
    expect(contact.email).toContain('@example.com');
  });

  test('GET /contacts lists contacts', async ({ clientApi }) => {
    const { cleanup } = await createTestContact(clientApi);
    cleanups.push(cleanup);

    const res = await clientApi.get('/api/portal/crm/contacts');
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.data).toHaveProperty('contacts');
    expect(Array.isArray(res.data.data.contacts)).toBe(true);
    expect(res.data.data).toHaveProperty('total');
  });

  test('GET /contacts supports search', async ({ clientApi }) => {
    const ts = Date.now();
    const { contact, cleanup } = await createTestContact(clientApi, {
      firstName: 'Searchable',
      lastName: `User-${ts}`,
    });
    cleanups.push(cleanup);

    const res = await clientApi.get(`/api/portal/crm/contacts?search=Searchable`);
    expect(res.status).toBe(200);
    const found = res.data.data.contacts.some((c: { id: number }) => c.id === contact.id);
    expect(found).toBe(true);
  });

  test('GET /contacts/[id] returns contact detail', async ({ clientApi }) => {
    const { contact, cleanup } = await createTestContact(clientApi);
    cleanups.push(cleanup);

    const res = await clientApi.get(`/api/portal/crm/contacts/${contact.id}`);
    expect(res.status).toBe(200);
    expect(res.data.data.id).toBe(contact.id);
    expect(res.data.data).toHaveProperty('tags');
  });

  test('PUT /contacts/[id] updates a contact', async ({ clientApi }) => {
    const { contact, cleanup } = await createTestContact(clientApi);
    cleanups.push(cleanup);

    const res = await clientApi.put(`/api/portal/crm/contacts/${contact.id}`, {
      firstName: 'Updated',
      phone: '(555) 999-9999',
    });
    expect(res.status).toBe(200);

    const verify = await clientApi.get(`/api/portal/crm/contacts/${contact.id}`);
    expect(verify.data.data.firstName).toBe('Updated');
    expect(verify.data.data.phone).toBe('(555) 999-9999');
  });

  test('PUT /contacts/[id] syncs tagIds', async ({ clientApi }) => {
    const { contact, cleanup: cCleanup } = await createTestContact(clientApi);
    cleanups.push(cCleanup);
    const { tag, cleanup: tCleanup } = await createTestCrmTag(clientApi);
    cleanups.push(tCleanup);

    await clientApi.put(`/api/portal/crm/contacts/${contact.id}`, { tagIds: [tag.id] });
    const verify = await clientApi.get(`/api/portal/crm/contacts/${contact.id}`);
    expect(verify.data.data.tags.some((t: { id: number }) => t.id === tag.id)).toBe(true);
  });

  test('DELETE /contacts/[id] removes a contact', async ({ clientApi }) => {
    const { contact } = await createTestContact(clientApi);
    const res = await clientApi.delete(`/api/portal/crm/contacts/${contact.id}`);
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
  });

  test('POST rejects missing firstName', async ({ clientApi }) => {
    const res = await clientApi.post('/api/portal/crm/contacts', { firstName: '' });
    expect(res.status).toBe(400);
  });

  test('rejects unauthenticated', async ({ unauthApi }) => {
    const res = await unauthApi.get('/api/portal/crm/contacts');
    expect(res.status).toBe(401);
  });
});

// ── Companies ──

test.describe('Portal CRM — Companies @crm @companies', () => {
  let cleanups: Array<() => Promise<void>> = [];

  test.afterEach(async () => {
    await runCleanups(cleanups);
    cleanups = [];
  });

  test('POST creates a company', async ({ clientApi }) => {
    const { company, cleanup } = await createTestCompany(clientApi);
    cleanups.push(cleanup);

    expect(company).toHaveProperty('id');
    expect(company.name).toContain('Test Company');
    expect(company.industry).toBe('Technology');
  });

  test('GET /companies lists companies', async ({ clientApi }) => {
    const { cleanup } = await createTestCompany(clientApi);
    cleanups.push(cleanup);

    const res = await clientApi.get('/api/portal/crm/companies');
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(Array.isArray(res.data.data)).toBe(true);
  });

  test('GET /companies supports search', async ({ clientApi }) => {
    const ts = Date.now();
    const { company, cleanup } = await createTestCompany(clientApi, { name: `SearchCo-${ts}` });
    cleanups.push(cleanup);

    const res = await clientApi.get(`/api/portal/crm/companies?search=SearchCo-${ts}`);
    expect(res.status).toBe(200);
    const found = res.data.data.some((c: { id: number }) => c.id === company.id);
    expect(found).toBe(true);
  });

  test('GET /companies/[id] returns detail with counts', async ({ clientApi }) => {
    const { company, cleanup } = await createTestCompany(clientApi);
    cleanups.push(cleanup);

    const res = await clientApi.get(`/api/portal/crm/companies/${company.id}`);
    expect(res.status).toBe(200);
    expect(res.data.data.id).toBe(company.id);
    expect(res.data.data).toHaveProperty('contactsCount');
    expect(res.data.data).toHaveProperty('dealsCount');
  });

  test('PUT /companies/[id] updates a company', async ({ clientApi }) => {
    const { company, cleanup } = await createTestCompany(clientApi);
    cleanups.push(cleanup);

    const res = await clientApi.put(`/api/portal/crm/companies/${company.id}`, {
      industry: 'Healthcare',
      size: '50-100',
    });
    expect(res.status).toBe(200);

    const verify = await clientApi.get(`/api/portal/crm/companies/${company.id}`);
    expect(verify.data.data.industry).toBe('Healthcare');
  });

  test('DELETE /companies/[id] removes a company', async ({ clientApi }) => {
    const { company } = await createTestCompany(clientApi);
    const res = await clientApi.delete(`/api/portal/crm/companies/${company.id}`);
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
  });

  test('POST rejects missing name', async ({ clientApi }) => {
    const res = await clientApi.post('/api/portal/crm/companies', { name: '' });
    expect(res.status).toBe(400);
  });
});

// ── Pipelines & Stages ──

test.describe('Portal CRM — Pipelines @crm @pipelines', () => {
  let cleanups: Array<() => Promise<void>> = [];

  test.afterEach(async () => {
    await runCleanups(cleanups);
    cleanups = [];
  });

  test('POST creates a pipeline with default stages', async ({ clientApi }) => {
    const { pipeline, cleanup } = await createTestPipeline(clientApi);
    cleanups.push(cleanup);

    expect(pipeline).toHaveProperty('id');
    expect(pipeline).toHaveProperty('stages');
    expect(Array.isArray(pipeline.stages)).toBe(true);
    expect(pipeline.stages.length).toBeGreaterThanOrEqual(1);

    // Each stage should have expected fields
    const stage = pipeline.stages[0];
    expect(stage).toHaveProperty('id');
    expect(stage).toHaveProperty('name');
    expect(stage).toHaveProperty('sortOrder');
  });

  test('GET /pipelines lists pipelines with stages', async ({ clientApi }) => {
    const { cleanup } = await createTestPipeline(clientApi);
    cleanups.push(cleanup);

    const res = await clientApi.get('/api/portal/crm/pipelines');
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(Array.isArray(res.data.data)).toBe(true);
    expect(res.data.data.length).toBeGreaterThanOrEqual(1);
  });

  test('PUT /pipelines/[id]/stages updates stages', async ({ clientApi }) => {
    const { pipeline, cleanup } = await createTestPipeline(clientApi);
    cleanups.push(cleanup);

    const existingStage = pipeline.stages[0];
    const res = await clientApi.put(`/api/portal/crm/pipelines/${pipeline.id}/stages`, {
      stages: [
        { id: existingStage.id, name: 'Renamed Stage', sortOrder: 0 },
        { name: 'Brand New Stage', sortOrder: 1, color: '#22c55e' },
      ],
    });
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
  });
});

// ── Deals ──

test.describe('Portal CRM — Deals @crm @deals', () => {
  let cleanups: Array<() => Promise<void>> = [];
  let pipelineId: number;
  let stageId: number;

  test.beforeAll(async ({ clientApi }) => {
    const { pipeline } = await createTestPipeline(clientApi);
    pipelineId = pipeline.id;
    stageId = pipeline.stages[0].id;
  });

  test.afterEach(async () => {
    await runCleanups(cleanups);
    cleanups = [];
  });

  test('POST creates a deal', async ({ clientApi }) => {
    const { deal, cleanup } = await createTestDeal(clientApi, pipelineId, stageId);
    cleanups.push(cleanup);

    expect(deal).toHaveProperty('id');
    expect(deal.title).toContain('Test Deal');
    expect(deal.value).toBe(5000);
    expect(deal.currency).toBe('USD');
  });

  test('GET /deals lists deals', async ({ clientApi }) => {
    const { cleanup } = await createTestDeal(clientApi, pipelineId, stageId);
    cleanups.push(cleanup);

    const res = await clientApi.get('/api/portal/crm/deals');
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(Array.isArray(res.data.data)).toBe(true);
  });

  test('GET /deals filters by pipelineId', async ({ clientApi }) => {
    const { deal, cleanup } = await createTestDeal(clientApi, pipelineId, stageId);
    cleanups.push(cleanup);

    const res = await clientApi.get(`/api/portal/crm/deals?pipelineId=${pipelineId}`);
    expect(res.status).toBe(200);
    const found = res.data.data.some((d: { id: number }) => d.id === deal.id);
    expect(found).toBe(true);
  });

  test('GET /deals/[id] returns deal detail', async ({ clientApi }) => {
    const { deal, cleanup } = await createTestDeal(clientApi, pipelineId, stageId);
    cleanups.push(cleanup);

    const res = await clientApi.get(`/api/portal/crm/deals/${deal.id}`);
    expect(res.status).toBe(200);
    expect(res.data.data.id).toBe(deal.id);
  });

  test('PUT /deals/[id] updates a deal', async ({ clientApi }) => {
    const { deal, cleanup } = await createTestDeal(clientApi, pipelineId, stageId);
    cleanups.push(cleanup);

    const res = await clientApi.put(`/api/portal/crm/deals/${deal.id}`, {
      value: 10000,
      priority: 'high',
    });
    expect(res.status).toBe(200);

    const verify = await clientApi.get(`/api/portal/crm/deals/${deal.id}`);
    expect(verify.data.data.value).toBe(10000);
  });

  test('PUT /deals/[id] sets closedAt when status is won', async ({ clientApi }) => {
    const { deal, cleanup } = await createTestDeal(clientApi, pipelineId, stageId);
    cleanups.push(cleanup);

    await clientApi.put(`/api/portal/crm/deals/${deal.id}`, { status: 'won' });
    const verify = await clientApi.get(`/api/portal/crm/deals/${deal.id}`);
    expect(verify.data.data.status).toBe('won');
    expect(verify.data.data.closedAt).toBeTruthy();
  });

  test('DELETE /deals/[id] removes a deal', async ({ clientApi }) => {
    const { deal } = await createTestDeal(clientApi, pipelineId, stageId);
    const res = await clientApi.delete(`/api/portal/crm/deals/${deal.id}`);
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
  });

  test('POST rejects missing required fields', async ({ clientApi }) => {
    const res = await clientApi.post('/api/portal/crm/deals', { title: '' });
    expect(res.status).toBe(400);
  });
});

// ── CRM Tags ──

test.describe('Portal CRM — Tags @crm @crm-tags', () => {
  let cleanups: Array<() => Promise<void>> = [];

  test.afterEach(async () => {
    await runCleanups(cleanups);
    cleanups = [];
  });

  test('POST creates a tag', async ({ clientApi }) => {
    const { tag, cleanup } = await createTestCrmTag(clientApi);
    cleanups.push(cleanup);

    expect(tag).toHaveProperty('id');
    expect(tag.name).toContain('Test Tag');
    expect(tag.color).toBe('#ef4444');
  });

  test('GET /tags lists tags', async ({ clientApi }) => {
    const { cleanup } = await createTestCrmTag(clientApi);
    cleanups.push(cleanup);

    const res = await clientApi.get('/api/portal/crm/tags');
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(Array.isArray(res.data.data)).toBe(true);
  });

  test('DELETE /tags/[id] removes a tag', async ({ clientApi }) => {
    const { tag } = await createTestCrmTag(clientApi);
    const res = await clientApi.delete(`/api/portal/crm/tags/${tag.id}`);
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
  });
});

// ── Activities ──

test.describe('Portal CRM — Activities @crm @activities', () => {
  let cleanups: Array<() => Promise<void>> = [];

  test.afterEach(async () => {
    await runCleanups(cleanups);
    cleanups = [];
  });

  test('POST creates an activity linked to a contact', async ({ clientApi }) => {
    const { contact, cleanup: cCleanup } = await createTestContact(clientApi);
    cleanups.push(cCleanup);

    const res = await clientApi.post('/api/portal/crm/activities', {
      type: 'note',
      title: `Test Activity ${Date.now()}`,
      description: 'E2E test activity',
      contactId: contact.id,
    });
    expect(res.status).toBe(201);
    expect(res.data.success).toBe(true);
    expect(res.data.data).toHaveProperty('id');
    expect(res.data.data.type).toBe('note');
  });

  test('GET /activities lists activities', async ({ clientApi }) => {
    const res = await clientApi.get('/api/portal/crm/activities');
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.data).toHaveProperty('activities');
  });

  test('GET /activities filters by contactId', async ({ clientApi }) => {
    const { contact, cleanup } = await createTestContact(clientApi);
    cleanups.push(cleanup);

    await clientApi.post('/api/portal/crm/activities', {
      type: 'call',
      title: 'Filtered activity',
      contactId: contact.id,
    });

    const res = await clientApi.get(`/api/portal/crm/activities?contactId=${contact.id}`);
    expect(res.status).toBe(200);
    expect(res.data.data.activities.length).toBeGreaterThanOrEqual(1);
  });

  test('POST rejects missing required fields', async ({ clientApi }) => {
    const res = await clientApi.post('/api/portal/crm/activities', {
      type: '',
      title: '',
    });
    expect(res.status).toBe(400);
  });
});

// ── Proposals ──

test.describe('Portal CRM — Proposals @crm @proposals', () => {
  let cleanups: Array<() => Promise<void>> = [];

  test.afterEach(async () => {
    await runCleanups(cleanups);
    cleanups = [];
  });

  test('POST creates a proposal', async ({ clientApi }) => {
    const { proposal, cleanup } = await createTestProposal(clientApi);
    cleanups.push(cleanup);

    expect(proposal).toHaveProperty('id');
    expect(proposal.title).toContain('Test Proposal');
    expect(proposal.status).toBe('draft');
  });

  test('GET /proposals lists proposals', async ({ clientApi }) => {
    const { cleanup } = await createTestProposal(clientApi);
    cleanups.push(cleanup);

    const res = await clientApi.get('/api/portal/crm/proposals');
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(Array.isArray(res.data.data)).toBe(true);
  });

  test('GET /proposals/[id] returns proposal detail', async ({ clientApi }) => {
    const { proposal, cleanup } = await createTestProposal(clientApi);
    cleanups.push(cleanup);

    const res = await clientApi.get(`/api/portal/crm/proposals/${proposal.id}`);
    expect(res.status).toBe(200);
    expect(res.data.data.id).toBe(proposal.id);
    expect(res.data.data).toHaveProperty('clientToken');
  });

  test('PUT /proposals/[id] updates a proposal', async ({ clientApi }) => {
    const { proposal, cleanup } = await createTestProposal(clientApi);
    cleanups.push(cleanup);

    const res = await clientApi.put(`/api/portal/crm/proposals/${proposal.id}`, {
      title: 'Updated Proposal Title',
      summary: 'Updated summary',
    });
    expect(res.status).toBe(200);

    const verify = await clientApi.get(`/api/portal/crm/proposals/${proposal.id}`);
    expect(verify.data.data.title).toBe('Updated Proposal Title');
  });

  test('POST with lineItems and fees', async ({ clientApi }) => {
    const { proposal, cleanup } = await createTestProposal(clientApi, {
      lineItems: [
        { description: 'Design', quantity: 1, unitPrice: 3000 },
        { description: 'Development', quantity: 2, unitPrice: 5000 },
      ],
      fees: [{ description: 'Rush fee', amount: 500 }],
    });
    cleanups.push(cleanup);

    const detail = await clientApi.get(`/api/portal/crm/proposals/${proposal.id}`);
    expect(detail.data.data.lineItems.length).toBe(2);
    expect(detail.data.data.fees.length).toBe(1);
  });

  test('DELETE /proposals/[id] removes a proposal', async ({ clientApi }) => {
    const { proposal } = await createTestProposal(clientApi);
    const res = await clientApi.delete(`/api/portal/crm/proposals/${proposal.id}`);
    expect(res.status).toBe(200);
  });
});

// ── Contracts ──

test.describe('Portal CRM — Contracts @crm @contracts', () => {
  let cleanups: Array<() => Promise<void>> = [];
  let tableExists = false;

  test.beforeAll(async ({ clientApi }) => {
    // Check if contracts table is migrated by attempting a GET
    const res = await clientApi.get('/api/portal/crm/contracts');
    tableExists = res.status === 200;
  });

  test.afterEach(async () => {
    await runCleanups(cleanups);
    cleanups = [];
  });

  test('POST creates a contract', async ({ clientApi }) => {
    test.skip(!tableExists, 'Contracts table not migrated');
    const { contract, cleanup } = await createTestContract(clientApi);
    cleanups.push(cleanup);

    expect(contract).toHaveProperty('id');
    expect(contract.title).toContain('Test Contract');
  });

  test('POST creates a contract with signers', async ({ clientApi }) => {
    test.skip(!tableExists, 'Contracts table not migrated');
    const ts = Date.now();
    const { contract, cleanup } = await createTestContract(clientApi, {
      signers: [
        { name: 'Alice', email: `alice-${ts}@example.com`, role: 'signer' },
        { name: 'Bob', email: `bob-${ts}@example.com`, role: 'viewer' },
      ],
    });
    cleanups.push(cleanup);

    const detail = await clientApi.get(`/api/portal/crm/contracts/${contract.id}`);
    expect(detail.data.data.signers.length).toBe(2);
  });

  test('GET /contracts lists contracts', async ({ clientApi }) => {
    test.skip(!tableExists, 'Contracts table not migrated');
    const { cleanup } = await createTestContract(clientApi);
    cleanups.push(cleanup);

    const res = await clientApi.get('/api/portal/crm/contracts');
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(Array.isArray(res.data.data)).toBe(true);
  });

  test('GET /contracts/[id] returns contract detail with signers', async ({ clientApi }) => {
    test.skip(!tableExists, 'Contracts table not migrated');
    const { contract, cleanup } = await createTestContract(clientApi);
    cleanups.push(cleanup);

    const res = await clientApi.get(`/api/portal/crm/contracts/${contract.id}`);
    expect(res.status).toBe(200);
    expect(res.data.data.id).toBe(contract.id);
    expect(res.data.data).toHaveProperty('signers');
  });

  test('PUT /contracts/[id] updates a contract', async ({ clientApi }) => {
    test.skip(!tableExists, 'Contracts table not migrated');
    const { contract, cleanup } = await createTestContract(clientApi);
    cleanups.push(cleanup);

    const res = await clientApi.put(`/api/portal/crm/contracts/${contract.id}`, {
      title: 'Updated Contract',
      summary: 'Updated summary',
    });
    expect(res.status).toBe(200);

    const verify = await clientApi.get(`/api/portal/crm/contracts/${contract.id}`);
    expect(verify.data.data.title).toBe('Updated Contract');
  });

  test('DELETE /contracts/[id] removes a contract', async ({ clientApi }) => {
    test.skip(!tableExists, 'Contracts table not migrated');
    const { contract } = await createTestContract(clientApi);
    const res = await clientApi.delete(`/api/portal/crm/contracts/${contract.id}`);
    expect(res.status).toBe(200);
  });

  test('POST rejects missing title', async ({ clientApi }) => {
    test.skip(!tableExists, 'Contracts table not migrated');
    const res = await clientApi.post('/api/portal/crm/contracts', { title: '' });
    expect(res.status).toBe(400);
  });
});

// ── Proposal Templates ──

test.describe('Portal CRM — Proposal Templates @crm @proposal-templates', () => {
  let cleanups: Array<() => Promise<void>> = [];

  test.afterEach(async () => {
    await runCleanups(cleanups);
    cleanups = [];
  });

  test('POST creates a proposal template', async ({ clientApi }) => {
    const ts = Date.now();
    const res = await clientApi.post('/api/portal/crm/proposal-templates', {
      name: `Test Template ${ts}`,
      description: 'E2E test template',
      sections: [{ title: 'Overview', content: 'Template overview' }],
      lineItems: [{ description: 'Service', quantity: 1, unitPrice: 1000 }],
      fees: [{ description: 'Setup', amount: 200 }],
    });
    expect(res.status).toBe(201);
    expect(res.data.success).toBe(true);
    expect(res.data.data).toHaveProperty('id');
    expect(res.data.data.name).toContain('Test Template');

    cleanups.push(async () => {
      await clientApi.delete(`/api/portal/crm/proposal-templates/${res.data.data.id}`).catch(() => {});
    });
  });

  test('GET /proposal-templates lists templates', async ({ clientApi }) => {
    const ts = Date.now();
    const create = await clientApi.post('/api/portal/crm/proposal-templates', {
      name: `Listed Template ${ts}`,
    });
    expect(create.status).toBe(201);
    cleanups.push(async () => {
      await clientApi.delete(`/api/portal/crm/proposal-templates/${create.data.data.id}`).catch(() => {});
    });

    const res = await clientApi.get('/api/portal/crm/proposal-templates');
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(Array.isArray(res.data.data)).toBe(true);
    const found = res.data.data.some((t: { id: number }) => t.id === create.data.data.id);
    expect(found).toBe(true);
  });

  test('PUT /proposal-templates/[id] updates a template', async ({ clientApi }) => {
    const ts = Date.now();
    const create = await clientApi.post('/api/portal/crm/proposal-templates', {
      name: `Updatable Template ${ts}`,
    });
    const tmplId = create.data.data.id;
    cleanups.push(async () => {
      await clientApi.delete(`/api/portal/crm/proposal-templates/${tmplId}`).catch(() => {});
    });

    const res = await clientApi.put(`/api/portal/crm/proposal-templates/${tmplId}`, {
      name: 'Renamed Template',
      description: 'Updated description',
      accentColor: '#10b981',
    });
    expect(res.status).toBe(200);
    expect(res.data.data.name).toBe('Renamed Template');
    expect(res.data.data.accentColor).toBe('#10b981');
  });

  test('DELETE /proposal-templates/[id] removes a template', async ({ clientApi }) => {
    const ts = Date.now();
    const create = await clientApi.post('/api/portal/crm/proposal-templates', {
      name: `Deletable Template ${ts}`,
    });
    const res = await clientApi.delete(`/api/portal/crm/proposal-templates/${create.data.data.id}`);
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
  });

  test('POST rejects missing name', async ({ clientApi }) => {
    const res = await clientApi.post('/api/portal/crm/proposal-templates', { name: '' });
    expect(res.status).toBe(400);
  });

  test('PUT returns 404 for non-existent template', async ({ clientApi }) => {
    const res = await clientApi.put('/api/portal/crm/proposal-templates/999999', {
      name: 'Ghost',
    });
    expect(res.status).toBe(404);
  });

  test('DELETE returns 404 for non-existent template', async ({ clientApi }) => {
    const res = await clientApi.delete('/api/portal/crm/proposal-templates/999999');
    expect(res.status).toBe(404);
  });
});

// ── Cross-Entity Relationships ──

test.describe('Portal CRM — Entity Relationships @crm @relationships', () => {
  let cleanups: Array<() => Promise<void>> = [];

  test.afterEach(async () => {
    await runCleanups(cleanups);
    cleanups = [];
  });

  test('contact linked to a company', async ({ clientApi }) => {
    const { company, cleanup: compCleanup } = await createTestCompany(clientApi);
    cleanups.push(compCleanup);
    const { contact, cleanup: contCleanup } = await createTestContact(clientApi, {
      companyId: company.id,
    });
    cleanups.push(contCleanup);

    const detail = await clientApi.get(`/api/portal/crm/contacts/${contact.id}`);
    expect(detail.data.data.companyId).toBe(company.id);
  });

  test('deal linked to contact and company', async ({ clientApi }) => {
    const { company, cleanup: compCleanup } = await createTestCompany(clientApi);
    cleanups.push(compCleanup);
    const { contact, cleanup: contCleanup } = await createTestContact(clientApi, {
      companyId: company.id,
    });
    cleanups.push(contCleanup);
    const { pipeline } = await createTestPipeline(clientApi);
    const stageId = pipeline.stages[0].id;
    const { deal, cleanup: dealCleanup } = await createTestDeal(clientApi, pipeline.id, stageId, {
      contactId: contact.id,
      companyId: company.id,
    });
    cleanups.push(dealCleanup);

    const detail = await clientApi.get(`/api/portal/crm/deals/${deal.id}`);
    expect(detail.data.data.contactId).toBe(contact.id);
    expect(detail.data.data.companyId).toBe(company.id);
  });

  test('proposal linked to deal and contact', async ({ clientApi }) => {
    const { contact, cleanup: contCleanup } = await createTestContact(clientApi);
    cleanups.push(contCleanup);
    const { pipeline } = await createTestPipeline(clientApi);
    const { deal, cleanup: dealCleanup } = await createTestDeal(clientApi, pipeline.id, pipeline.stages[0].id);
    cleanups.push(dealCleanup);

    const { proposal, cleanup: propCleanup } = await createTestProposal(clientApi, {
      contactId: contact.id,
      dealId: deal.id,
    });
    cleanups.push(propCleanup);

    const detail = await clientApi.get(`/api/portal/crm/proposals/${proposal.id}`);
    expect(detail.data.data.contactId).toBe(contact.id);
    expect(detail.data.data.dealId).toBe(deal.id);
  });

  test('activity linked to deal', async ({ clientApi }) => {
    const { pipeline } = await createTestPipeline(clientApi);
    const { deal, cleanup: dealCleanup } = await createTestDeal(clientApi, pipeline.id, pipeline.stages[0].id);
    cleanups.push(dealCleanup);

    const res = await clientApi.post('/api/portal/crm/activities', {
      type: 'meeting',
      title: 'Deal follow-up meeting',
      dealId: deal.id,
    });
    expect(res.status).toBe(201);

    const activities = await clientApi.get(`/api/portal/crm/activities?dealId=${deal.id}`);
    expect(activities.data.data.activities.length).toBeGreaterThanOrEqual(1);
  });
});

// ── 404 / Not Found Edge Cases ──

test.describe('Portal CRM — 404 Edge Cases @crm @edge-cases', () => {
  test('GET /contacts/999999 returns 404', async ({ clientApi }) => {
    const res = await clientApi.get('/api/portal/crm/contacts/999999');
    expect(res.status).toBe(404);
  });

  test('GET /companies/999999 returns 404', async ({ clientApi }) => {
    const res = await clientApi.get('/api/portal/crm/companies/999999');
    expect(res.status).toBe(404);
  });

  test('GET /deals/999999 returns 404', async ({ clientApi }) => {
    const res = await clientApi.get('/api/portal/crm/deals/999999');
    expect(res.status).toBe(404);
  });

  test('GET /proposals/999999 returns 404', async ({ clientApi }) => {
    const res = await clientApi.get('/api/portal/crm/proposals/999999');
    expect(res.status).toBe(404);
  });
});

// ── CRM Dashboard ──

test.describe('Portal CRM — Dashboard @crm @crm-dashboard', () => {
  test('GET /crm/dashboard returns metrics', async ({ clientApi }) => {
    const res = await clientApi.get('/api/portal/crm/dashboard');
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
  });

  test('GET /crm/dashboard rejects unauthenticated', async ({ unauthApi }) => {
    const res = await unauthApi.get('/api/portal/crm/dashboard');
    expect(res.status).toBe(401);
  });
});
