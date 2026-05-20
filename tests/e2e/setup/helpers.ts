import { ApiClient } from './api-client';
import { request, APIRequestContext } from '@playwright/test';

/** Run cleanup functions in reverse order, ignoring errors */
export async function runCleanups(cleanups: Array<() => Promise<void>>) {
  for (const fn of cleanups.reverse()) {
    try {
      await fn();
    } catch {}
  }
}

// ── MCP approval workflow helpers ──────────────────────────────────────────

/** Invite a fresh team member (always a new email). Returns an authed ApiClient
 *  for the member plus the member record. Use `role` to promote via MCP if
 *  the test needs owner/admin privileges. */
export async function createTestTeamMember(
  ownerApi: ApiClient,
  overrides?: { role?: 'owner' | 'admin' | 'member' | 'viewer'; mcpKey?: string },
) {
  const ts = Date.now();
  const rand = Math.random().toString(36).slice(2, 8);
  const email = `member-${ts}-${rand}@example.com`;
  const name = `Test Member ${ts}`;

  const inviteRes = await ownerApi.post('/api/portal/settings/team', { name, email });
  if (!inviteRes.data?.success) throw new Error(`Invite failed: ${inviteRes.data?.message}`);
  const member = inviteRes.data.data as { memberId?: number; id?: number; userId?: number; tempPassword: string };
  const memberId = member.memberId ?? member.id!;
  const userId = member.userId!;
  const tempPassword = member.tempPassword;
  if (!tempPassword) throw new Error('Expected tempPassword from invite response');

  // Optionally promote via MCP (needs an MCP bearer with `*` or team:write scope).
  if (overrides?.role && overrides.role !== 'member' && overrides.mcpKey) {
    const mcp = await new McpTestClient(overrides.mcpKey).init();
    try {
      await mcp.callTool('team_update_role', { memberId, role: overrides.role });
    } finally {
      await mcp.dispose();
    }
  }

  const memberApi = new ApiClient(email, tempPassword);
  await memberApi.ensure();

  const cleanup = async () => {
    await memberApi.dispose().catch(() => {});
    await ownerApi.delete(`/api/portal/settings/team/${memberId}`).catch(() => {});
  };
  return { memberApi, email, name, memberId, userId, cleanup };
}

/** Create a portal API key and return the raw key string + metadata. Deletes on cleanup. */
export async function createTestApiKey(
  api: ApiClient,
  overrides?: { scopes?: string[]; requireCmsApproval?: boolean; name?: string },
) {
  const ts = Date.now();
  const res = await api.post('/api/portal/api-keys', {
    name: overrides?.name ?? `Test MCP Key ${ts}`,
    scopes: overrides?.scopes ?? ['*'],
    requireCmsApproval: overrides?.requireCmsApproval ?? false,
  });
  if (!res.data?.success) throw new Error(`Failed to create API key: ${res.data?.message}`);
  const keyRecord = res.data.data;
  const cleanup = async () => {
    await api.delete(`/api/portal/api-keys?id=${keyRecord.id}`).catch(() => {});
  };
  return { keyRecord, cleanup };
}

/** Lightweight MCP client for tests. Wraps raw Playwright request with bearer auth. */
export class McpTestClient {
  private ctx!: APIRequestContext;

  constructor(private bearer: string, private baseUrl = process.env.BASE_URL || 'http://localhost:3000') {}

  async init() {
    this.ctx = await request.newContext({ baseURL: this.baseUrl });
    return this;
  }

  async listTools(): Promise<{ tools: Array<{ name: string; description?: string }> }> {
    const res = await this.ctx.post('/api/mcp', {
      headers: {
        Authorization: `Bearer ${this.bearer}`,
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
      },
      data: {
        jsonrpc: '2.0',
        id: Math.floor(Math.random() * 1000000),
        method: 'tools/list',
        params: {},
      },
    });
    const body = await res.json();
    return body?.result ?? { tools: [] };
  }

  async callTool(name: string, args: Record<string, unknown>) {
    const res = await this.ctx.post('/api/mcp', {
      headers: {
        Authorization: `Bearer ${this.bearer}`,
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
      },
      data: {
        jsonrpc: '2.0',
        id: Math.floor(Math.random() * 1000000),
        method: 'tools/call',
        params: { name, arguments: args },
      },
    });
    const body = await res.json();
    if (body?.error) {
      return { status: res.status(), error: body.error, data: null, raw: body, isError: false, text: null as string | null };
    }
    // MCP tool results wrap payload in content[0].text — usually JSON, but
    // permission denials and other tool-level errors surface as plain strings.
    const text: string | null = body?.result?.content?.[0]?.text ?? null;
    const isError = body?.result?.isError === true;
    let parsed: unknown = null;
    if (typeof text === 'string') {
      try { parsed = JSON.parse(text); } catch { parsed = null; }
    }
    return { status: res.status(), data: parsed, raw: body, isError, text };
  }

  async dispose() {
    await this.ctx?.dispose();
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

/**
 * Resolve the first website id owned by the logged-in portal client.
 *
 * Replaces hard-coded `const SITE_ID = 1` constants that were silently testing
 * against whichever client happens to own site id 1 in the local DB — which
 * isn't necessarily the `client@example.com` seed account, so every request
 * 404'd or 403'd. This helper:
 *
 *   1. Lists the current client's websites via the portal API.
 *   2. Returns the first id if any exist.
 *   3. Otherwise provisions a fresh test website and returns its id.
 *
 * Always succeeds in a fixturable way — callers can use it as the very first
 * line of a spec without coordinating with seed scripts.
 */
export async function resolveClientSiteId(api: ApiClient): Promise<number> {
  const res = await api.get('/api/portal/cms/websites');
  const list = (res.data?.data ?? []) as Array<{ id: number }>;
  if (list.length > 0) return list[0].id;
  const { website } = await createTestWebsite(api);
  return (website as { id: number }).id;
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

// ── Project management / kanban helpers ──

/**
 * Create a private kanban project owned by the current client, with four columns
 * matching the default workflow. Cleanup archives the project (no DELETE endpoint
 * exists) and removes all created columns.
 */
export async function createTestKanbanProject(api: ApiClient, overrides?: Record<string, unknown>) {
  const ts = Date.now();
  const rand = Math.random().toString(36).slice(2, 6);
  const name = `E2E PM Project ${ts}-${rand}`;
  const res = await api.post('/api/portal/projects', {
    name,
    description: 'E2E PM test project',
    ...overrides,
  });
  if (!res.data?.success) throw new Error(`Failed to create project: ${res.data?.message}`);
  const project = res.data.data as { id: number; name: string; projectKey: string | null; status: string; isPrivate: boolean };

  // Seed 4 columns
  const columnNames = ['Backlog', 'In Progress', 'Review', 'Done'];
  const columns: { id: number; name: string; order: number }[] = [];
  for (const colName of columnNames) {
    const colRes = await api.post(`/api/portal/projects/${project.id}/columns`, { name: colName });
    if (!colRes.data?.success) throw new Error(`Failed to create column ${colName}: ${colRes.data?.message}`);
    columns.push(colRes.data.data);
  }

  const cleanup = async () => {
    // Delete empty columns, then archive the project (no project-delete endpoint)
    for (const col of columns) {
      await api.delete(`/api/portal/projects/${project.id}/columns/${col.id}`).catch(() => {});
    }
    await api.patch(`/api/portal/projects/${project.id}`, { status: 'archived', name: `[archived-e2e] ${project.name}` }).catch(() => {});
  };
  return { project, columns, cleanup };
}

/**
 * Create a kanban card in a specific column. Returns the card (with its auto-assigned
 * `number`) and a cleanup that deletes it.
 */
export async function createTestKanbanCard(
  api: ApiClient,
  columnId: number,
  overrides?: Record<string, unknown>,
) {
  const ts = Date.now();
  const res = await api.post('/api/portal/cards', {
    columnId,
    title: `E2E Card ${ts}`,
    description: 'E2E test card',
    priority: 'medium',
    ...overrides,
  });
  if (!res.data?.success) throw new Error(`Failed to create card: ${res.data?.message}`);
  const card = res.data.data as { id: number; number: number | null; title: string; columnId: number; projectId: number };
  const cleanup = async () => {
    await api.delete(`/api/portal/cards/${card.id}`).catch(() => {});
  };
  return { card, cleanup };
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
