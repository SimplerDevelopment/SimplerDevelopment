import { ApiClient } from './api-client';

/** Run cleanup functions in reverse order, ignoring errors */
export async function runCleanups(cleanups: Array<() => Promise<void>>) {
  for (const fn of cleanups.reverse()) {
    try {
      await fn();
    } catch {}
  }
}

/** Create a test website for a client, returns the website and cleanup fn */
export async function createTestWebsite(api: ApiClient) {
  const name = `Test Site ${Date.now()}`;
  const res = await api.post('/api/portal/cms/websites', {
    name,
    domain: `test-${Date.now()}.example.com`,
    description: 'E2E test website',
  });
  if (!res.data?.success) throw new Error(`Failed to create test website: ${res.data?.message}`);
  const website = res.data.data;
  const cleanup = async () => {
    // No delete endpoint for websites yet — acceptable leak for tests
  };
  return { website, cleanup };
}

/** Create a test category scoped to a website */
export async function createTestCategory(api: ApiClient, siteId: number, overrides?: Record<string, string>) {
  const slug = `test-cat-${Date.now()}`;
  const res = await api.post(`/api/portal/cms/websites/${siteId}/categories`, {
    name: overrides?.name || `Test Category ${Date.now()}`,
    slug: overrides?.slug || slug,
    description: overrides?.description || 'E2E test category',
    color: overrides?.color || '#6366f1',
  });
  if (!res.data?.success) throw new Error(`Failed to create test category: ${res.data?.message}`);
  const category = res.data.data;
  const cleanup = async () => {
    await api.delete(`/api/portal/cms/websites/${siteId}/categories/${category.id}`).catch(() => {});
  };
  return { category, cleanup };
}

/** Create a test tag scoped to a website */
export async function createTestTag(api: ApiClient, siteId: number, overrides?: Record<string, string>) {
  const slug = `test-tag-${Date.now()}`;
  const res = await api.post(`/api/portal/cms/websites/${siteId}/tags`, {
    name: overrides?.name || `Test Tag ${Date.now()}`,
    slug: overrides?.slug || slug,
  });
  if (!res.data?.success) throw new Error(`Failed to create test tag: ${res.data?.message}`);
  const tag = res.data.data;
  const cleanup = async () => {
    await api.delete(`/api/portal/cms/websites/${siteId}/tags/${tag.id}`).catch(() => {});
  };
  return { tag, cleanup };
}

/** Create a test post scoped to a website */
export async function createTestPost(api: ApiClient, siteId: number, overrides?: Record<string, unknown>) {
  const slug = `test-post-${Date.now()}`;
  const res = await api.post(`/api/portal/cms/websites/${siteId}/posts`, {
    title: `Test Post ${Date.now()}`,
    slug,
    content: JSON.stringify({ blocks: [], version: '1.0' }),
    postType: 'page',
    published: false,
    ...overrides,
  });
  if (!res.data?.success) throw new Error(`Failed to create test post: ${res.data?.message}`);
  const post = res.data.data;
  const cleanup = async () => {
    await api.delete(`/api/portal/cms/websites/${siteId}/posts/${post.id}`).catch(() => {});
  };
  return { post, cleanup };
}

// ── CRM helpers ──

/** Create a CRM contact */
export async function createTestContact(api: ApiClient, overrides?: Record<string, unknown>) {
  const ts = Date.now();
  const res = await api.post('/api/portal/crm/contacts', {
    firstName: `Test`,
    lastName: `Contact-${ts}`,
    email: `test-contact-${ts}@example.com`,
    phone: '(555) 000-0001',
    ...overrides,
  });
  if (!res.data?.success) throw new Error(`Failed to create contact: ${res.data?.message}`);
  const contact = res.data.data;
  const cleanup = async () => {
    await api.delete(`/api/portal/crm/contacts/${contact.id}`).catch(() => {});
  };
  return { contact, cleanup };
}

/** Create a CRM company */
export async function createTestCompany(api: ApiClient, overrides?: Record<string, unknown>) {
  const ts = Date.now();
  const res = await api.post('/api/portal/crm/companies', {
    name: `Test Company ${ts}`,
    domain: `test-${ts}.example.com`,
    industry: 'Technology',
    ...overrides,
  });
  if (!res.data?.success) throw new Error(`Failed to create company: ${res.data?.message}`);
  const company = res.data.data;
  const cleanup = async () => {
    await api.delete(`/api/portal/crm/companies/${company.id}`).catch(() => {});
  };
  return { company, cleanup };
}

/** Create a CRM pipeline (comes with default stages) */
export async function createTestPipeline(api: ApiClient, overrides?: Record<string, unknown>) {
  const ts = Date.now();
  const res = await api.post('/api/portal/crm/pipelines', {
    name: `Test Pipeline ${ts}`,
    ...overrides,
  });
  if (!res.data?.success) throw new Error(`Failed to create pipeline: ${res.data?.message}`);
  const pipeline = res.data.data;
  // No delete endpoint for pipelines — acceptable test leak
  const cleanup = async () => {};
  return { pipeline, cleanup };
}

/** Create a CRM deal (requires pipelineId and stageId) */
export async function createTestDeal(api: ApiClient, pipelineId: number, stageId: number, overrides?: Record<string, unknown>) {
  const ts = Date.now();
  const res = await api.post('/api/portal/crm/deals', {
    title: `Test Deal ${ts}`,
    pipelineId,
    stageId,
    value: 5000,
    currency: 'USD',
    ...overrides,
  });
  if (!res.data?.success) throw new Error(`Failed to create deal: ${res.data?.message}`);
  const deal = res.data.data;
  const cleanup = async () => {
    await api.delete(`/api/portal/crm/deals/${deal.id}`).catch(() => {});
  };
  return { deal, cleanup };
}

/** Create a CRM tag */
export async function createTestCrmTag(api: ApiClient, overrides?: Record<string, unknown>) {
  const ts = Date.now();
  const res = await api.post('/api/portal/crm/tags', {
    name: `Test Tag ${ts}`,
    color: '#ef4444',
    ...overrides,
  });
  if (!res.data?.success) throw new Error(`Failed to create CRM tag: ${res.data?.message}`);
  const tag = res.data.data;
  const cleanup = async () => {
    await api.delete(`/api/portal/crm/tags/${tag.id}`).catch(() => {});
  };
  return { tag, cleanup };
}

/** Create a CRM proposal */
export async function createTestProposal(api: ApiClient, overrides?: Record<string, unknown>) {
  const ts = Date.now();
  const res = await api.post('/api/portal/crm/proposals', {
    title: `Test Proposal ${ts}`,
    summary: 'E2E test proposal',
    lineItems: [{ description: 'Service A', quantity: 1, unitPrice: 1000 }],
    ...overrides,
  });
  if (!res.data?.success) throw new Error(`Failed to create proposal: ${res.data?.message}`);
  const proposal = res.data.data;
  const cleanup = async () => {
    await api.delete(`/api/portal/crm/proposals/${proposal.id}`).catch(() => {});
  };
  return { proposal, cleanup };
}

/** Create a CRM contract */
export async function createTestContract(api: ApiClient, overrides?: Record<string, unknown>) {
  const ts = Date.now();
  const res = await api.post('/api/portal/crm/contracts', {
    title: `Test Contract ${ts}`,
    summary: 'E2E test contract',
    ...overrides,
  });
  if (!res.data?.success) throw new Error(`Failed to create contract: ${res.data?.message}`);
  const contract = res.data.data;
  const cleanup = async () => {
    await api.delete(`/api/portal/crm/contracts/${contract.id}`).catch(() => {});
  };
  return { contract, cleanup };
}

// ── Survey helpers ──

/** Create a survey */
export async function createTestSurvey(api: ApiClient, overrides?: Record<string, unknown>) {
  const ts = Date.now();
  const res = await api.post('/api/portal/surveys', {
    title: `Test Survey ${ts}`,
    description: 'E2E test survey',
    fields: [
      { id: 'q1', type: 'text', label: 'Your name', required: true },
      { id: 'q2', type: 'rating', label: 'Rate us', required: false },
    ],
    ...overrides,
  });
  if (!res.data?.success) throw new Error(`Failed to create survey: ${res.data?.message}`);
  const survey = res.data.data;
  const cleanup = async () => {
    await api.delete(`/api/portal/surveys/${survey.id}`).catch(() => {});
  };
  return { survey, cleanup };
}

// ── Ticket helpers ──

/** Create a support ticket */
export async function createTestTicket(api: ApiClient, overrides?: Record<string, unknown>) {
  const ts = Date.now();
  const res = await api.post('/api/portal/tickets', {
    subject: `Test Ticket ${ts}`,
    body: 'E2E test ticket body',
    category: 'general',
    priority: 'medium',
    ...overrides,
  });
  if (!res.data?.success) throw new Error(`Failed to create ticket: ${res.data?.message}`);
  const ticket = res.data.data;
  // No delete endpoint for tickets — acceptable test leak
  const cleanup = async () => {};
  return { ticket, cleanup };
}

// ── CMS Taxonomy helpers ──

/** Create a custom taxonomy scoped to a website */
export async function createTestTaxonomy(api: ApiClient, siteId: number, overrides?: Record<string, unknown>) {
  const ts = Date.now();
  const res = await api.post(`/api/portal/cms/websites/${siteId}/taxonomies`, {
    name: `Test Taxonomy ${ts}`,
    slug: `test-tax-${ts}`,
    description: 'E2E test taxonomy',
    ...overrides,
  });
  if (!res.data?.success) throw new Error(`Failed to create taxonomy: ${res.data?.message}`);
  const taxonomy = res.data.data;
  const cleanup = async () => {
    // taxonomies may not have delete — ignore errors
    await api.delete(`/api/portal/cms/websites/${siteId}/taxonomies/${taxonomy.id}`).catch(() => {});
  };
  return { taxonomy, cleanup };
}

/** Create a content type scoped to a website */
export async function createTestContentType(api: ApiClient, siteId: number, overrides?: Record<string, unknown>) {
  const ts = Date.now();
  const res = await api.post(`/api/portal/cms/websites/${siteId}/content-types`, {
    name: `Test Type ${ts}`,
    slug: `test-type-${ts}`,
    description: 'E2E test content type',
    ...overrides,
  });
  if (!res.data?.success) throw new Error(`Failed to create content type: ${res.data?.message}`);
  const contentType = res.data.data;
  const cleanup = async () => {
    await api.delete(`/api/portal/cms/websites/${siteId}/content-types/${contentType.id}`).catch(() => {});
  };
  return { contentType, cleanup };
}

// ── Email helpers ──

/** Create an email segment */
export async function createTestEmailSegment(api: ApiClient, overrides?: Record<string, unknown>) {
  const ts = Date.now();
  const res = await api.post('/api/portal/email/segments', {
    name: `Test Segment ${ts}`,
    description: 'E2E test segment',
    rules: [{ field: 'email', operator: 'contains', value: '@example.com' }],
    matchType: 'all',
    ...overrides,
  });
  if (!res.data?.success) throw new Error(`Failed to create segment: ${res.data?.message}`);
  const segment = res.data.data;
  const cleanup = async () => {
    await api.delete(`/api/portal/email/segments/${segment.id}`).catch(() => {});
  };
  return { segment, cleanup };
}

/** Create an email tag */
export async function createTestEmailTag(api: ApiClient, overrides?: Record<string, unknown>) {
  const ts = Date.now();
  const res = await api.post('/api/portal/email/tags', {
    name: `Test Email Tag ${ts}`,
    color: '#10b981',
    ...overrides,
  });
  if (!res.data?.success) throw new Error(`Failed to create email tag: ${res.data?.message}`);
  const tag = res.data.data;
  const cleanup = async () => {
    await api.delete(`/api/portal/email/tags/${tag.id}`).catch(() => {});
  };
  return { tag, cleanup };
}
