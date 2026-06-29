/**
 * Portal CRM "Extras" E2E Tests
 *
 * Coverage for CRM portal routes NOT exercised by portal-crm.spec.ts:
 *   - analytics, contacts/duplicates, contacts/merge, contacts/titles,
 *     custom-fields (definitions + values), export, import + import/preview,
 *     mentions, notifications.
 *
 * All tests are rerunnable — they create and clean up their own data.
 * Routes for dashboard, proposal-templates, contracts/[id] and proposal-templates/[id]
 * are intentionally skipped here because portal-crm.spec.ts already covers them.
 */
import { test, expect } from './setup/fixtures';
import {
  runCleanups,
  createTestContact,
  createTestCompany,
  createTestPipeline,
} from './setup/helpers';

// ── Analytics ──

test.describe('Portal CRM — Analytics @crm @analytics', () => {
  test('GET /analytics returns aggregate metrics @critical', async ({ clientApi }) => {
    const res = await clientApi.get('/api/portal/crm/analytics');
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.data).toHaveProperty('winLoss');
    expect(res.data.data).toHaveProperty('revenueByMonth');
    expect(res.data.data).toHaveProperty('pipelineFunnel');
    expect(res.data.data).toHaveProperty('avgDaysToClose');
    expect(res.data.data).toHaveProperty('activitySummary');
    expect(res.data.data).toHaveProperty('topDeals');
    expect(res.data.data).toHaveProperty('mrr');
    expect(res.data.data).toHaveProperty('arr');
  });

  test('GET /analytics?period=30d honors period filter', async ({ clientApi }) => {
    const res = await clientApi.get('/api/portal/crm/analytics?period=30d');
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
  });

  test('GET /analytics?pipelineId=<id> resolves the supplied pipeline', async ({ clientApi }) => {
    const { pipeline } = await createTestPipeline(clientApi);
    const res = await clientApi.get(`/api/portal/crm/analytics?pipelineId=${pipeline.id}`);
    expect(res.status).toBe(200);
    expect(res.data.data.pipelineId).toBe(pipeline.id);
  });

  test('rejects unauthenticated', async ({ unauthApi }) => {
    const res = await unauthApi.get('/api/portal/crm/analytics');
    expect(res.status).toBe(401);
  });
});

// ── Contact Duplicates ──

test.describe('Portal CRM — Contact Duplicates @crm @duplicates', () => {
  let cleanups: Array<() => Promise<void>> = [];

  test.afterEach(async () => {
    await runCleanups(cleanups);
    cleanups = [];
  });

  test('GET /contacts/duplicates?email finds an exact email match', async ({ clientApi }) => {
    const ts = Date.now();
    const email = `dupe-${ts}@example.com`;
    const { contact, cleanup } = await createTestContact(clientApi, { email });
    cleanups.push(cleanup);

    const res = await clientApi.get(
      `/api/portal/crm/contacts/duplicates?email=${encodeURIComponent(email)}`
    );
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(Array.isArray(res.data.data)).toBe(true);
    const found = res.data.data.find((c: { id: number }) => c.id === contact.id);
    expect(found).toBeTruthy();
    expect(found.matchReasons).toContain('exact_email');
  });

  test('GET /contacts/duplicates?phone finds an exact phone match', async ({ clientApi }) => {
    const ts = Date.now();
    const phone = `(555) 010-${String(ts).slice(-4)}`;
    const { contact, cleanup } = await createTestContact(clientApi, { phone });
    cleanups.push(cleanup);

    const res = await clientApi.get(
      `/api/portal/crm/contacts/duplicates?phone=${encodeURIComponent(phone)}`
    );
    expect(res.status).toBe(200);
    const found = res.data.data.find((c: { id: number }) => c.id === contact.id);
    expect(found).toBeTruthy();
    expect(found.matchReasons).toContain('exact_phone');
  });

  test('GET /contacts/duplicates with no params returns 400', async ({ clientApi }) => {
    const res = await clientApi.get('/api/portal/crm/contacts/duplicates');
    expect(res.status).toBe(400);
  });

  test('rejects unauthenticated', async ({ unauthApi }) => {
    const res = await unauthApi.get('/api/portal/crm/contacts/duplicates?email=x@x.com');
    expect(res.status).toBe(401);
  });
});

// ── Contact Merge ──

test.describe('Portal CRM — Contact Merge @crm @merge', () => {
  let cleanups: Array<() => Promise<void>> = [];

  test.afterEach(async () => {
    await runCleanups(cleanups);
    cleanups = [];
  });

  test('POST /contacts/merge merges secondary into primary @critical', async ({ clientApi }) => {
    const ts = Date.now();
    const { contact: primary } = await createTestContact(clientApi, {
      firstName: 'Primary',
      lastName: `Keep-${ts}`,
      email: `primary-${ts}@example.com`,
      // Leave primary's phone empty so the merge absorbs secondary's phone —
      // createTestContact otherwise defaults a phone, which makes the merge
      // correctly keep primary's own number and fail the assertion below.
      phone: null,
    });
    const { contact: secondary } = await createTestContact(clientApi, {
      firstName: 'Secondary',
      lastName: `Drop-${ts}`,
      email: `secondary-${ts}@example.com`,
      phone: '(555) 222-2222',
    });
    // Primary is what survives — clean up only that one
    cleanups.push(async () => {
      await clientApi.delete(`/api/portal/crm/contacts/${primary.id}`).catch(() => {});
    });

    const res = await clientApi.post('/api/portal/crm/contacts/merge', {
      primaryId: primary.id,
      secondaryId: secondary.id,
    });
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.data.id).toBe(primary.id);

    // Secondary should no longer exist
    const verifySecondary = await clientApi.get(`/api/portal/crm/contacts/${secondary.id}`);
    expect(verifySecondary.status).toBe(404);

    // Primary should have absorbed missing fields (phone)
    const verifyPrimary = await clientApi.get(`/api/portal/crm/contacts/${primary.id}`);
    expect(verifyPrimary.status).toBe(200);
    expect(verifyPrimary.data.data.phone).toBe('(555) 222-2222');
  });

  test('POST /contacts/merge rejects identical primary and secondary', async ({ clientApi }) => {
    const { contact, cleanup } = await createTestContact(clientApi);
    cleanups.push(cleanup);
    const res = await clientApi.post('/api/portal/crm/contacts/merge', {
      primaryId: contact.id,
      secondaryId: contact.id,
    });
    expect(res.status).toBe(400);
  });

  test('POST /contacts/merge rejects missing ids', async ({ clientApi }) => {
    const res = await clientApi.post('/api/portal/crm/contacts/merge', {});
    expect(res.status).toBe(400);
  });

  test('POST /contacts/merge returns 404 for unknown contact', async ({ clientApi }) => {
    const { contact, cleanup } = await createTestContact(clientApi);
    cleanups.push(cleanup);
    const res = await clientApi.post('/api/portal/crm/contacts/merge', {
      primaryId: contact.id,
      secondaryId: 999999,
    });
    expect(res.status).toBe(404);
  });

  test('rejects unauthenticated', async ({ unauthApi }) => {
    const res = await unauthApi.post('/api/portal/crm/contacts/merge', {
      primaryId: 1,
      secondaryId: 2,
    });
    expect(res.status).toBe(401);
  });
});

// ── Contact Titles ──

test.describe('Portal CRM — Contact Titles @crm @titles', () => {
  let cleanups: Array<() => Promise<void>> = [];

  test.afterEach(async () => {
    await runCleanups(cleanups);
    cleanups = [];
  });

  test('GET /contacts/titles returns distinct titles', async ({ clientApi }) => {
    const ts = Date.now();
    const title = `QA Engineer ${ts}`;
    const { cleanup } = await createTestContact(clientApi, { title });
    cleanups.push(cleanup);

    const res = await clientApi.get('/api/portal/crm/contacts/titles');
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(Array.isArray(res.data.data)).toBe(true);
    expect(res.data.data).toContain(title);
  });

  test('GET /contacts/titles?companyId scopes to a company', async ({ clientApi }) => {
    const ts = Date.now();
    const { company, cleanup: compCleanup } = await createTestCompany(clientApi);
    cleanups.push(compCleanup);
    const title = `Company-Scoped ${ts}`;
    const { cleanup } = await createTestContact(clientApi, {
      title,
      companyId: company.id,
    });
    cleanups.push(cleanup);

    const res = await clientApi.get(
      `/api/portal/crm/contacts/titles?companyId=${company.id}`
    );
    expect(res.status).toBe(200);
    expect(res.data.data).toContain(title);
  });

  test('rejects unauthenticated', async ({ unauthApi }) => {
    const res = await unauthApi.get('/api/portal/crm/contacts/titles');
    expect(res.status).toBe(401);
  });
});

// ── Custom Fields (definitions) ──

test.describe('Portal CRM — Custom Fields @crm @crm-custom-fields', () => {
  let cleanups: Array<() => Promise<void>> = [];

  test.afterEach(async () => {
    await runCleanups(cleanups);
    cleanups = [];
  });

  test('POST creates a custom field for contacts @critical', async ({ clientApi }) => {
    const ts = Date.now();
    const res = await clientApi.post('/api/portal/crm/custom-fields', {
      entityType: 'contact',
      fieldName: `LinkedIn ${ts}`,
      fieldType: 'url',
      required: false,
    });
    expect(res.status).toBe(201);
    expect(res.data.success).toBe(true);
    expect(res.data.data).toHaveProperty('id');
    expect(res.data.data.entityType).toBe('contact');
    cleanups.push(async () => {
      await clientApi.delete(`/api/portal/crm/custom-fields/${res.data.data.id}`).catch(() => {});
    });
  });

  test('GET /custom-fields lists fields', async ({ clientApi }) => {
    const ts = Date.now();
    const create = await clientApi.post('/api/portal/crm/custom-fields', {
      entityType: 'company',
      fieldName: `Region ${ts}`,
      fieldType: 'text',
    });
    expect(create.status).toBe(201);
    cleanups.push(async () => {
      await clientApi.delete(`/api/portal/crm/custom-fields/${create.data.data.id}`).catch(() => {});
    });

    const res = await clientApi.get('/api/portal/crm/custom-fields');
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(Array.isArray(res.data.data)).toBe(true);
    expect(res.data.data.some((f: { id: number }) => f.id === create.data.data.id)).toBe(true);
  });

  test('GET /custom-fields?entityType=deal filters by entity type', async ({ clientApi }) => {
    const ts = Date.now();
    const create = await clientApi.post('/api/portal/crm/custom-fields', {
      entityType: 'deal',
      fieldName: `RFP Number ${ts}`,
      fieldType: 'text',
    });
    cleanups.push(async () => {
      await clientApi.delete(`/api/portal/crm/custom-fields/${create.data.data.id}`).catch(() => {});
    });

    const res = await clientApi.get('/api/portal/crm/custom-fields?entityType=deal');
    expect(res.status).toBe(200);
    for (const f of res.data.data as Array<{ entityType: string }>) {
      expect(f.entityType).toBe('deal');
    }
  });

  test('PUT /custom-fields/[id] updates a field', async ({ clientApi }) => {
    const ts = Date.now();
    const create = await clientApi.post('/api/portal/crm/custom-fields', {
      entityType: 'contact',
      fieldName: `Updatable ${ts}`,
      fieldType: 'text',
    });
    const fieldId = create.data.data.id;
    cleanups.push(async () => {
      await clientApi.delete(`/api/portal/crm/custom-fields/${fieldId}`).catch(() => {});
    });

    const res = await clientApi.put(`/api/portal/crm/custom-fields/${fieldId}`, {
      fieldName: `Renamed ${ts}`,
      sortOrder: 5,
    });
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.data.fieldName).toBe(`Renamed ${ts}`);
    expect(res.data.data.sortOrder).toBe(5);
  });

  test('DELETE /custom-fields/[id] removes a field', async ({ clientApi }) => {
    const ts = Date.now();
    const create = await clientApi.post('/api/portal/crm/custom-fields', {
      entityType: 'contact',
      fieldName: `Deletable ${ts}`,
      fieldType: 'text',
    });
    const fieldId = create.data.data.id;
    const res = await clientApi.delete(`/api/portal/crm/custom-fields/${fieldId}`);
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
  });

  test('POST rejects invalid entityType', async ({ clientApi }) => {
    const res = await clientApi.post('/api/portal/crm/custom-fields', {
      entityType: 'bogus',
      fieldName: 'X',
      fieldType: 'text',
    });
    expect(res.status).toBe(400);
  });

  test('POST rejects invalid fieldType', async ({ clientApi }) => {
    const res = await clientApi.post('/api/portal/crm/custom-fields', {
      entityType: 'contact',
      fieldName: 'X',
      fieldType: 'bogus',
    });
    expect(res.status).toBe(400);
  });

  test('POST rejects missing fieldName', async ({ clientApi }) => {
    const res = await clientApi.post('/api/portal/crm/custom-fields', {
      entityType: 'contact',
      fieldName: '',
      fieldType: 'text',
    });
    expect(res.status).toBe(400);
  });

  test('POST rejects duplicate fieldName for same entityType', async ({ clientApi }) => {
    const ts = Date.now();
    const fieldName = `Unique ${ts}`;
    const first = await clientApi.post('/api/portal/crm/custom-fields', {
      entityType: 'contact',
      fieldName,
      fieldType: 'text',
    });
    expect(first.status).toBe(201);
    cleanups.push(async () => {
      await clientApi.delete(`/api/portal/crm/custom-fields/${first.data.data.id}`).catch(() => {});
    });

    const dup = await clientApi.post('/api/portal/crm/custom-fields', {
      entityType: 'contact',
      fieldName,
      fieldType: 'text',
    });
    expect(dup.status).toBe(409);
  });

  test('PUT returns 404 for non-existent field', async ({ clientApi }) => {
    const res = await clientApi.put('/api/portal/crm/custom-fields/999999', {
      fieldName: 'Ghost',
    });
    expect(res.status).toBe(404);
  });

  test('DELETE returns 404 for non-existent field', async ({ clientApi }) => {
    const res = await clientApi.delete('/api/portal/crm/custom-fields/999999');
    expect(res.status).toBe(404);
  });

  test('rejects unauthenticated', async ({ unauthApi }) => {
    const res = await unauthApi.get('/api/portal/crm/custom-fields');
    expect(res.status).toBe(401);
  });
});

// ── Custom Field Values ──

test.describe('Portal CRM — Custom Field Values @crm @crm-custom-field-values', () => {
  let cleanups: Array<() => Promise<void>> = [];

  test.afterEach(async () => {
    await runCleanups(cleanups);
    cleanups = [];
  });

  test('PUT upserts values then GET returns them @critical', async ({ clientApi }) => {
    const ts = Date.now();
    // Create a contact and a custom field for contacts
    const { contact, cleanup: contactCleanup } = await createTestContact(clientApi);
    cleanups.push(contactCleanup);

    const fieldRes = await clientApi.post('/api/portal/crm/custom-fields', {
      entityType: 'contact',
      fieldName: `Pref Channel ${ts}`,
      fieldType: 'text',
    });
    expect(fieldRes.status).toBe(201);
    const fieldId = fieldRes.data.data.id;
    cleanups.push(async () => {
      await clientApi.delete(`/api/portal/crm/custom-fields/${fieldId}`).catch(() => {});
    });

    // Insert
    const put1 = await clientApi.put('/api/portal/crm/custom-fields/values', {
      entityType: 'contact',
      entityId: contact.id,
      values: { [String(fieldId)]: 'email' },
    });
    expect(put1.status).toBe(200);
    expect(put1.data.success).toBe(true);

    // GET
    const get1 = await clientApi.get(
      `/api/portal/crm/custom-fields/values?entityType=contact&entityId=${contact.id}`
    );
    expect(get1.status).toBe(200);
    const found = get1.data.data.find((v: { customFieldId: number }) => v.customFieldId === fieldId);
    expect(found).toBeTruthy();
    expect(found.value).toBe('email');

    // Update via upsert
    const put2 = await clientApi.put('/api/portal/crm/custom-fields/values', {
      entityType: 'contact',
      entityId: contact.id,
      values: { [String(fieldId)]: 'phone' },
    });
    expect(put2.status).toBe(200);

    const get2 = await clientApi.get(
      `/api/portal/crm/custom-fields/values?entityType=contact&entityId=${contact.id}`
    );
    const found2 = get2.data.data.find((v: { customFieldId: number }) => v.customFieldId === fieldId);
    expect(found2.value).toBe('phone');
  });

  test('GET rejects invalid entityType', async ({ clientApi }) => {
    const res = await clientApi.get(
      '/api/portal/crm/custom-fields/values?entityType=bogus&entityId=1'
    );
    expect(res.status).toBe(400);
  });

  test('GET rejects missing entityId', async ({ clientApi }) => {
    const res = await clientApi.get(
      '/api/portal/crm/custom-fields/values?entityType=contact'
    );
    expect(res.status).toBe(400);
  });

  test('GET returns 404 for cross-tenant / unknown entityId', async ({ clientApi }) => {
    const res = await clientApi.get(
      '/api/portal/crm/custom-fields/values?entityType=contact&entityId=999999'
    );
    expect(res.status).toBe(404);
  });

  test('PUT rejects missing values object', async ({ clientApi }) => {
    const { contact, cleanup } = await createTestContact(clientApi);
    cleanups.push(cleanup);
    const res = await clientApi.put('/api/portal/crm/custom-fields/values', {
      entityType: 'contact',
      entityId: contact.id,
    });
    expect(res.status).toBe(400);
  });

  test('rejects unauthenticated', async ({ unauthApi }) => {
    const res = await unauthApi.get(
      '/api/portal/crm/custom-fields/values?entityType=contact&entityId=1'
    );
    expect(res.status).toBe(401);
  });
});

// ── Export ──

test.describe('Portal CRM — Export @crm @export', () => {
  test('GET /export?entityType=contact returns CSV', async ({ clientApi }) => {
    const res = await clientApi.get('/api/portal/crm/export?entityType=contact');
    // CSV body is not JSON — api-client returns null `data` but status 200
    expect(res.status).toBe(200);
  });

  test('GET /export?entityType=company returns CSV', async ({ clientApi }) => {
    const res = await clientApi.get('/api/portal/crm/export?entityType=company');
    expect(res.status).toBe(200);
  });

  test('GET /export?entityType=deal returns CSV', async ({ clientApi }) => {
    const res = await clientApi.get('/api/portal/crm/export?entityType=deal');
    expect(res.status).toBe(200);
  });

  test('GET /export rejects missing entityType', async ({ clientApi }) => {
    const res = await clientApi.get('/api/portal/crm/export');
    expect(res.status).toBe(400);
  });

  test('GET /export rejects invalid entityType', async ({ clientApi }) => {
    const res = await clientApi.get('/api/portal/crm/export?entityType=bogus');
    expect(res.status).toBe(400);
  });

  test('rejects unauthenticated', async ({ unauthApi }) => {
    const res = await unauthApi.get('/api/portal/crm/export?entityType=contact');
    expect(res.status).toBe(401);
  });
});

// ── Import Preview ──

test.describe('Portal CRM — Import Preview @crm @import-preview', () => {
  test('POST /import/preview returns headers + sampleRows @critical', async ({ clientApi }) => {
    const csv = 'firstName,lastName,email\nAda,Lovelace,ada@example.com\nGrace,Hopper,grace@example.com\n';
    const res = await clientApi.postForm('/api/portal/crm/import/preview', {
      file: { name: 'preview.csv', mimeType: 'text/csv', buffer: Buffer.from(csv, 'utf-8') },
    });
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.data.headers).toEqual(['firstName', 'lastName', 'email']);
    expect(res.data.data.sampleRows.length).toBe(2);
    expect(res.data.data.sampleRows[0]).toEqual(['Ada', 'Lovelace', 'ada@example.com']);
  });

  test('POST /import/preview rejects missing file', async ({ clientApi }) => {
    const res = await clientApi.post('/api/portal/crm/import/preview', {});
    expect(res.status).toBe(400);
  });

  test('POST /import/preview rejects empty CSV', async ({ clientApi }) => {
    const res = await clientApi.postForm('/api/portal/crm/import/preview', {
      file: { name: 'empty.csv', mimeType: 'text/csv', buffer: Buffer.from('', 'utf-8') },
    });
    expect(res.status).toBe(400);
  });

  test('rejects unauthenticated', async ({ unauthApi }) => {
    const res = await unauthApi.post('/api/portal/crm/import/preview', {});
    expect(res.status).toBe(401);
  });
});

// ── Import ──

test.describe('Portal CRM — Import @crm @import', () => {
  test('POST /import imports contacts from CSV @critical', async ({ clientApi }) => {
    const ts = Date.now();
    const csv =
      `firstName,lastName,email\n` +
      `Imported-${ts}-A,Test,imp-a-${ts}@example.com\n` +
      `Imported-${ts}-B,Test,imp-b-${ts}@example.com\n`;
    const res = await clientApi.postForm('/api/portal/crm/import', {
      file: { name: 'contacts.csv', mimeType: 'text/csv', buffer: Buffer.from(csv, 'utf-8') },
      entityType: 'contact',
    });
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.data.imported).toBe(2);
    expect(res.data.data.skipped).toBe(0);

    // Cleanup: find and delete the imported contacts by email
    const list = await clientApi.get(`/api/portal/crm/contacts?search=imp-a-${ts}`);
    for (const c of (list.data.data?.contacts ?? []) as Array<{ id: number }>) {
      await clientApi.delete(`/api/portal/crm/contacts/${c.id}`).catch(() => {});
    }
    const list2 = await clientApi.get(`/api/portal/crm/contacts?search=imp-b-${ts}`);
    for (const c of (list2.data.data?.contacts ?? []) as Array<{ id: number }>) {
      await clientApi.delete(`/api/portal/crm/contacts/${c.id}`).catch(() => {});
    }
  });

  test('POST /import imports companies from CSV', async ({ clientApi }) => {
    const ts = Date.now();
    const csv = `name,industry\nImpCo-${ts},Technology\n`;
    const res = await clientApi.postForm('/api/portal/crm/import', {
      file: { name: 'companies.csv', mimeType: 'text/csv', buffer: Buffer.from(csv, 'utf-8') },
      entityType: 'company',
    });
    expect(res.status).toBe(200);
    expect(res.data.data.imported).toBe(1);

    const list = await clientApi.get(`/api/portal/crm/companies?search=ImpCo-${ts}`);
    for (const c of (list.data.data ?? []) as Array<{ id: number }>) {
      await clientApi.delete(`/api/portal/crm/companies/${c.id}`).catch(() => {});
    }
  });

  test('POST /import flags rows missing required field', async ({ clientApi }) => {
    const ts = Date.now();
    // First row has firstName, second is empty (missing required `firstName`)
    const csv = `firstName,email\nGood-${ts},good-${ts}@example.com\n,bad-${ts}@example.com\n`;
    const res = await clientApi.postForm('/api/portal/crm/import', {
      file: { name: 'mixed.csv', mimeType: 'text/csv', buffer: Buffer.from(csv, 'utf-8') },
      entityType: 'contact',
    });
    expect(res.status).toBe(200);
    expect(res.data.data.imported).toBe(1);
    expect(res.data.data.skipped).toBe(1);
    expect(Array.isArray(res.data.data.errors)).toBe(true);
    expect(res.data.data.errors.length).toBeGreaterThanOrEqual(1);

    const list = await clientApi.get(`/api/portal/crm/contacts?search=Good-${ts}`);
    for (const c of (list.data.data?.contacts ?? []) as Array<{ id: number }>) {
      await clientApi.delete(`/api/portal/crm/contacts/${c.id}`).catch(() => {});
    }
  });

  test('POST /import rejects missing file', async ({ clientApi }) => {
    const res = await clientApi.post('/api/portal/crm/import', {});
    expect(res.status).toBe(400);
  });

  test('POST /import rejects invalid entityType', async ({ clientApi }) => {
    const csv = `firstName\nNope\n`;
    const res = await clientApi.postForm('/api/portal/crm/import', {
      file: { name: 'x.csv', mimeType: 'text/csv', buffer: Buffer.from(csv, 'utf-8') },
      entityType: 'bogus',
    });
    expect(res.status).toBe(400);
  });

  test('POST /import rejects single-line CSV (no data rows)', async ({ clientApi }) => {
    const csv = `firstName,lastName,email\n`;
    const res = await clientApi.postForm('/api/portal/crm/import', {
      file: { name: 'header-only.csv', mimeType: 'text/csv', buffer: Buffer.from(csv, 'utf-8') },
      entityType: 'contact',
    });
    expect(res.status).toBe(400);
  });

  test('rejects unauthenticated', async ({ unauthApi }) => {
    const res = await unauthApi.post('/api/portal/crm/import', {});
    expect(res.status).toBe(401);
  });
});

// ── Mentions ──

test.describe('Portal CRM — Mentions @crm @mentions', () => {
  test('GET /mentions returns client members', async ({ clientApi }) => {
    const res = await clientApi.get('/api/portal/crm/mentions');
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(Array.isArray(res.data.data)).toBe(true);
    // Members have id + name
    for (const m of res.data.data as Array<{ id: number; name: string | null }>) {
      expect(m).toHaveProperty('id');
      expect(m).toHaveProperty('name');
    }
  });

  test('rejects unauthenticated', async ({ unauthApi }) => {
    const res = await unauthApi.get('/api/portal/crm/mentions');
    expect(res.status).toBe(401);
  });
});

// ── Notifications ──

test.describe('Portal CRM — Notifications @crm @notifications', () => {
  test('GET /notifications returns list + unreadCount @critical', async ({ clientApi }) => {
    const res = await clientApi.get('/api/portal/crm/notifications');
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(Array.isArray(res.data.data)).toBe(true);
    expect(typeof res.data.unreadCount).toBe('number');
  });

  test('PUT /notifications { all: true } marks all read', async ({ clientApi }) => {
    const res = await clientApi.put('/api/portal/crm/notifications', { all: true });
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
  });

  test('PUT /notifications { ids: [] } with empty body returns 400', async ({ clientApi }) => {
    const res = await clientApi.put('/api/portal/crm/notifications', {});
    expect(res.status).toBe(400);
  });

  test('PUT /notifications { ids: [<unknown>] } is a safe no-op', async ({ clientApi }) => {
    // Updating unknown ids scoped by clientId+userId is a no-op but still 200
    const res = await clientApi.put('/api/portal/crm/notifications', { ids: [999999] });
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
  });

  test('rejects unauthenticated GET', async ({ unauthApi }) => {
    const res = await unauthApi.get('/api/portal/crm/notifications');
    expect(res.status).toBe(401);
  });

  test('rejects unauthenticated PUT', async ({ unauthApi }) => {
    const res = await unauthApi.put('/api/portal/crm/notifications', { all: true });
    expect(res.status).toBe(401);
  });
});
