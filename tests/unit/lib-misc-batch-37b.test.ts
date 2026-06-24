// @vitest-environment node
/**
 * Unit tests — batch 37b — 4 automation lib files.
 *
 * Covers:
 *   - lib/automation/engine.ts
 *   - lib/automation/nlp-parser.ts
 *   - lib/automation/survey-notifications.ts
 *   - lib/automation/product-presets.ts
 *
 * Strategy: each file imported in its own `describe` block via dynamic
 * `import()` after the relevant mocks are registered. DB/Anthropic/Resend
 * are stubbed; the event-bus module is exercised lightly so the engine's
 * registration path works without firing real handlers.
 */

process.env.DATABASE_URL ??= 'postgresql://placeholder@localhost:5432/placeholder';
process.env.NEXTAUTH_URL ??= 'http://localhost:3000';

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─────────────────────────────────────────────────────────────────────────────
// Shared mock state
// ─────────────────────────────────────────────────────────────────────────────

interface SelectChainResult {
  rows: Record<string, unknown>[];
}

const dbMockState = {
  selectQueue: [] as SelectChainResult[],
  insertRows: [] as Record<string, unknown>[],
  updateRows: [] as Record<string, unknown>[],
};

function makeSelectChain() {
  const rows = dbMockState.selectQueue.shift()?.rows ?? [];
  const chain: Record<string, unknown> = {};
  for (const k of ['from', 'where', 'leftJoin', 'innerJoin', 'orderBy', 'groupBy', 'having']) {
    chain[k] = vi.fn(() => chain);
  }
  chain.limit = vi.fn(async () => rows);
  // Allow `await db.select().from().where()` to resolve to rows
  (chain as { then?: unknown }).then = (onFulfilled: (v: unknown) => unknown) =>
    Promise.resolve(rows).then(onFulfilled);
  return chain;
}

vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn(() => makeSelectChain()),
    insert: vi.fn(() => ({
      values: vi.fn(async (v: Record<string, unknown>) => {
        dbMockState.insertRows.push(v);
        return undefined;
      }),
    })),
    update: vi.fn(() => ({
      set: vi.fn((patch: Record<string, unknown>) => {
        dbMockState.updateRows.push(patch);
        return {
          where: vi.fn(async () => undefined),
        };
      }),
    })),
  },
}));

vi.mock('@/lib/db/schema', () => {
  const wrap = (tableName: string) =>
    new Proxy(
      { __table: tableName },
      {
        get(_t, prop: string) {
          if (prop === '__table') return tableName;
          return { __col: prop, __table: tableName };
        },
      },
    );
  return new Proxy({
    automationRules: wrap('automationRules'),
    automationLogs: wrap('automationLogs'),
    surveys: wrap('surveys'),
    clients: wrap('clients'),
    users: wrap('users'),
  }, { has: (t, p) => (p in t) || !(p === "then" || p === "__esModule" || p === "default" || typeof p !== "string"), get: (t, p) => (p in t) ? t[p] : ((p === "then" || p === "__esModule" || p === "default" || typeof p !== "string") ? undefined : wrap(p)) });
});

vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ op: 'and', args: args.filter(Boolean) }),
  sql: Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => ({ op: 'sql', strings, values }),
    {},
  ),
  isNull: (a: unknown) => ({ op: 'isNull', a }),
  or: (...args: unknown[]) => ({ op: 'or', args: args.filter(Boolean) }),
  inArray: (a: unknown, list: unknown[]) => ({ op: 'inArray', a, list }),
}));

const executePortalToolMock = vi.fn(async () => ({ ok: true }));
vi.mock('@/lib/ai/portal-tools', () => ({
  executePortalTool: executePortalToolMock,
  PORTAL_TOOLS: [
    { name: 'create_support_ticket', description: 'Create a support ticket' },
    { name: 'send_email', description: 'Send an email' },
    { name: 'get_contact', description: 'Read a CRM contact' },
    { name: 'navigate_to', description: 'Navigate' },
  ],
}));

const resolveClientApiKeyMock = vi.fn(async () => ({ key: 'sk-test', source: 'platform' as const }));
vi.mock('@/lib/ai/resolve-client-key', () => ({
  resolveClientApiKey: resolveClientApiKeyMock,
}));

const recordAiUsageMock = vi.fn();
vi.mock('@/lib/ai/audit', () => ({
  recordAiUsage: recordAiUsageMock,
}));

const anthropicCreateMock = vi.fn();
vi.mock('@anthropic-ai/sdk', () => {
  class Anthropic {
    public messages: { create: typeof anthropicCreateMock };
    constructor(_opts: { apiKey: string }) {
      this.messages = { create: anthropicCreateMock };
    }
  }
  return { default: Anthropic };
});

// AI seam mock — nlp-parser.ts (and any future file in this batch) now calls
// @/lib/ai/llm#complete instead of the Anthropic SDK directly.
const completeMock = vi.fn();
vi.mock('@/lib/ai/llm', () => ({
  complete: (...args: unknown[]) => completeMock(...args),
  completeObject: vi.fn(),
  streamComplete: vi.fn(),
}));

const resendSendMock = vi.fn(async () => ({ id: 'mail_1' }));
vi.mock('@/lib/email', () => ({
  resend: {
    emails: { send: resendSendMock },
  },
}));

// Mock the components module purely to satisfy the `import type` re-export
// path used by product-presets.ts. Type-only imports shouldn't pull the
// file at runtime, but if vitest transforms the dts-erased import they'd
// hit jsx/client code. Stub it as an empty module.
vi.mock('@/components/portal/ProductAutomationSettings', () => ({
  default: () => null,
}));

beforeEach(() => {
  dbMockState.selectQueue = [];
  dbMockState.insertRows = [];
  dbMockState.updateRows = [];
  executePortalToolMock.mockClear();
  executePortalToolMock.mockResolvedValue({ ok: true });
  resolveClientApiKeyMock.mockClear();
  resolveClientApiKeyMock.mockResolvedValue({ key: 'sk-test', source: 'platform' });
  recordAiUsageMock.mockClear();
  anthropicCreateMock.mockReset();
  completeMock.mockReset();
  resendSendMock.mockClear();
  resendSendMock.mockResolvedValue({ id: 'mail_1' });
  delete process.env.ANTHROPIC_API_KEY;
});

// ─────────────────────────────────────────────────────────────────────────────
// engine.ts
// ─────────────────────────────────────────────────────────────────────────────

describe('lib/automation/engine.ts', () => {
  it('initAutomationEngine registers exactly once', async () => {
    vi.resetModules();
    const eventBus = await import('@/lib/automation/event-bus');
    const onEventSpy = vi.spyOn(eventBus, 'onEvent');
    const { initAutomationEngine } = await import('@/lib/automation/engine');
    initAutomationEngine();
    initAutomationEngine();
    initAutomationEngine();
    // initAutomationEngine calls onEvent three times per init (processEvent +
    // processEventForPlaybookAutoStart + dispatchSiteWebhooksForEvent)
    // but the initialized guard means only the first call to initAutomationEngine registers.
    expect(onEventSpy).toHaveBeenCalledTimes(3);
  });

  it('processEvent skips rules whose trigger event does not match', async () => {
    vi.resetModules();
    dbMockState.selectQueue.push({
      rows: [
        {
          id: 1,
          clientId: 10,
          enabled: true,
          trigger: { event: 'crm.contact.created' },
          conditions: [],
          actions: [{ tool: 'create_support_ticket', params: { subject: 'hi' } }],
        },
      ],
    });

    const eventBus = await import('@/lib/automation/event-bus');
    const { initAutomationEngine } = await import('@/lib/automation/engine');
    initAutomationEngine();

    // Find the registered handler by re-spying after init
    const handler = (eventBus as unknown as { __testHandler?: unknown }).__testHandler;
    // Engine registers via onEvent — drive via emitEvent and flush
    eventBus.emitEvent('booking.created', 10, 1, { id: 'b1' });
    await new Promise((r) => setTimeout(r, 0));
    // No matching trigger → no insert into automationLogs
    expect(dbMockState.insertRows).toHaveLength(0);
    expect(executePortalToolMock).not.toHaveBeenCalled();
    void handler;
  });

  it('processEvent runs actions, logs success, and bumps stats on a matching rule', async () => {
    vi.resetModules();
    dbMockState.selectQueue.push({
      rows: [
        {
          id: 7,
          clientId: 10,
          enabled: true,
          scopes: ['*'],
          trigger: { event: 'crm.contact.created', filters: { source: 'web' } },
          conditions: [
            { field: 'email', operator: 'contains', value: '@example.com' },
            { field: 'score', operator: 'gt', value: 5 },
          ],
          actions: [
            { tool: 'create_support_ticket', params: { subject: 'New contact {{event.email}}' } },
          ],
        },
      ],
    });

    const eventBus = await import('@/lib/automation/event-bus');
    const { initAutomationEngine } = await import('@/lib/automation/engine');
    initAutomationEngine();

    eventBus.emitEvent('crm.contact.created', 10, 1, {
      email: 'alice@example.com',
      score: 10,
      source: 'web',
    });
    // Allow async handler to run
    await new Promise((r) => setTimeout(r, 10));

    expect(executePortalToolMock).toHaveBeenCalledTimes(1);
    const [tool, params] = executePortalToolMock.mock.calls[0]!;
    expect(tool).toBe('create_support_ticket');
    expect(params).toEqual({ subject: 'New contact alice@example.com' });

    // automationLogs insert + automationRules update both happened
    expect(dbMockState.insertRows).toHaveLength(1);
    expect(dbMockState.insertRows[0]).toMatchObject({ status: 'success', ruleId: 7 });
    expect(dbMockState.updateRows).toHaveLength(1);
  });

  it('processEvent records "failed" status when the only action throws', async () => {
    vi.resetModules();
    dbMockState.selectQueue.push({
      rows: [
        {
          id: 9,
          clientId: 10,
          enabled: true,
          scopes: ['*'],
          trigger: { event: 'crm.contact.created' },
          conditions: [],
          actions: [{ tool: 'create_support_ticket', params: {} }],
        },
      ],
    });
    executePortalToolMock.mockRejectedValueOnce(new Error('boom'));

    const eventBus = await import('@/lib/automation/event-bus');
    const { initAutomationEngine } = await import('@/lib/automation/engine');
    initAutomationEngine();

    eventBus.emitEvent('crm.contact.created', 10, 1, {});
    await new Promise((r) => setTimeout(r, 10));

    expect(dbMockState.insertRows).toHaveLength(1);
    expect(dbMockState.insertRows[0]).toMatchObject({ status: 'failed', errorMessage: 'boom' });
  });

  it('processEvent skips when conditions do not all pass', async () => {
    vi.resetModules();
    dbMockState.selectQueue.push({
      rows: [
        {
          id: 3,
          clientId: 10,
          enabled: true,
          trigger: { event: 'crm.contact.created' },
          conditions: [{ field: 'score', operator: 'gt', value: 100 }],
          actions: [{ tool: 'create_support_ticket', params: {} }],
        },
      ],
    });

    const eventBus = await import('@/lib/automation/event-bus');
    const { initAutomationEngine } = await import('@/lib/automation/engine');
    initAutomationEngine();

    eventBus.emitEvent('crm.contact.created', 10, 1, { score: 1 });
    await new Promise((r) => setTimeout(r, 0));

    expect(executePortalToolMock).not.toHaveBeenCalled();
    expect(dbMockState.insertRows).toHaveLength(0);
  });

  it('processEvent skips rule when a trigger filter mismatches', async () => {
    vi.resetModules();
    dbMockState.selectQueue.push({
      rows: [
        {
          id: 4,
          clientId: 10,
          enabled: true,
          trigger: { event: 'crm.contact.created', filters: { source: 'web' } },
          conditions: [],
          actions: [{ tool: 'create_support_ticket', params: {} }],
        },
      ],
    });

    const eventBus = await import('@/lib/automation/event-bus');
    const { initAutomationEngine } = await import('@/lib/automation/engine');
    initAutomationEngine();

    eventBus.emitEvent('crm.contact.created', 10, 1, { source: 'csv' });
    await new Promise((r) => setTimeout(r, 0));

    expect(executePortalToolMock).not.toHaveBeenCalled();
    expect(dbMockState.insertRows).toHaveLength(0);
  });

  it('resolveTemplate handles nested arrays and missing fields', async () => {
    vi.resetModules();
    dbMockState.selectQueue.push({
      rows: [
        {
          id: 11,
          clientId: 10,
          enabled: true,
          scopes: ['*'],
          trigger: { event: 'crm.deal.created' },
          conditions: [],
          actions: [
            {
              tool: 'create_support_ticket',
              params: {
                title: '{{event.deal.title}}',
                tags: ['{{event.deal.title}}', 'static', 42],
                meta: { who: '{{event.who.missing}}' },
              },
            },
          ],
        },
      ],
    });

    const eventBus = await import('@/lib/automation/event-bus');
    const { initAutomationEngine } = await import('@/lib/automation/engine');
    initAutomationEngine();

    eventBus.emitEvent('crm.deal.created', 10, 1, { deal: { title: 'Big' } });
    await new Promise((r) => setTimeout(r, 10));

    expect(executePortalToolMock).toHaveBeenCalledTimes(1);
    const [, params] = executePortalToolMock.mock.calls[0]!;
    expect(params).toEqual({
      title: 'Big',
      tags: ['Big', 'static', 42],
      meta: { who: '' },
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// nlp-parser.ts
// ─────────────────────────────────────────────────────────────────────────────

describe('lib/automation/nlp-parser.ts', () => {
  it('throws if no clientId and ANTHROPIC_API_KEY is unset', async () => {
    vi.resetModules();
    delete process.env.ANTHROPIC_API_KEY;
    const { parseAutomationDescription } = await import('@/lib/automation/nlp-parser');
    await expect(parseAutomationDescription('do a thing')).rejects.toThrow(
      /ANTHROPIC_API_KEY/,
    );
  });

  it('throws "requires clientId" when env key is set but no clientId is provided', async () => {
    // The source checks ANTHROPIC_API_KEY first (no throw), then enforces clientId
    // as a hard requirement before calling the provider-agnostic seam.
    vi.resetModules();
    process.env.ANTHROPIC_API_KEY = 'sk-env-test';
    const { parseAutomationDescription } = await import('@/lib/automation/nlp-parser');
    await expect(parseAutomationDescription('do a thing')).rejects.toThrow(
      /parseAutomationDescription requires clientId/,
    );
    expect(completeMock).not.toHaveBeenCalled();
    expect(resolveClientApiKeyMock).not.toHaveBeenCalled();
  });

  it('resolves BYOK key and records ai usage when clientId is supplied', async () => {
    vi.resetModules();
    resolveClientApiKeyMock.mockResolvedValueOnce({ key: 'sk-byok', source: 'byok' });
    completeMock.mockResolvedValueOnce({
      text: JSON.stringify({
        name: 'Welcome new sub',
        trigger: { event: 'email.subscriber.added' },
        conditions: [],
        actions: [{ tool: 'send_email', params: { to: '{{event.email}}' } }],
        productScope: 'email',
      }),
      usage: { inputTokens: 5, outputTokens: 7, totalTokens: 12 },
    });

    const { parseAutomationDescription } = await import('@/lib/automation/nlp-parser');
    const result = await parseAutomationDescription('Welcome new subscriber', {
      clientId: 42,
    });

    expect(result.source).toBe('byok');
    expect(resolveClientApiKeyMock).toHaveBeenCalledWith({
      clientId: 42,
      provider: 'anthropic',
    });
    expect(recordAiUsageMock).toHaveBeenCalledWith({
      clientId: 42,
      source: 'byok',
      tokens: 12,
    });
  });

  it('resolves platform key, calls complete() and returns parsed automation', async () => {
    vi.resetModules();
    resolveClientApiKeyMock.mockResolvedValueOnce({ key: 'sk-test', source: 'platform' });
    completeMock.mockResolvedValueOnce({
      text: JSON.stringify({
        name: 'Notify on contact create',
        trigger: { event: 'crm.contact.created' },
        conditions: [],
        actions: [{ tool: 'create_support_ticket', params: { subject: 'hi' } }],
        productScope: 'crm',
      }),
      usage: { inputTokens: 12, outputTokens: 34, totalTokens: 46 },
    });

    const { parseAutomationDescription } = await import('@/lib/automation/nlp-parser');
    const result = await parseAutomationDescription('When a contact is created, ticket me.', {
      clientId: 10,
    });

    expect(result.source).toBe('platform');
    expect(result.inputTokens).toBe(12);
    expect(result.outputTokens).toBe(34);
    expect(result.parsed.name).toBe('Notify on contact create');
    expect(result.parsed.trigger.event).toBe('crm.contact.created');
    expect(completeMock).toHaveBeenCalledWith(
      expect.objectContaining({ task: 'nlpParse', clientId: 10 }),
    );
  });

  it('propagates JSON.parse errors when the model returns malformed text', async () => {
    vi.resetModules();
    resolveClientApiKeyMock.mockResolvedValueOnce({ key: 'sk-test', source: 'platform' });
    completeMock.mockResolvedValueOnce({
      text: 'not json',
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
    });
    const { parseAutomationDescription } = await import('@/lib/automation/nlp-parser');
    await expect(parseAutomationDescription('bad', { clientId: 10 })).rejects.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// survey-notifications.ts
// ─────────────────────────────────────────────────────────────────────────────

describe('lib/automation/survey-notifications.ts', () => {
  it('initSurveyNotifications registers exactly once', async () => {
    vi.resetModules();
    const eventBus = await import('@/lib/automation/event-bus');
    const spy = vi.spyOn(eventBus, 'onEvent');
    const { initSurveyNotifications } = await import(
      '@/lib/automation/survey-notifications'
    );
    initSurveyNotifications();
    initSurveyNotifications();
    initSurveyNotifications();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('no-ops when the event is not a survey response', async () => {
    vi.resetModules();
    const eventBus = await import('@/lib/automation/event-bus');
    const { initSurveyNotifications } = await import(
      '@/lib/automation/survey-notifications'
    );
    initSurveyNotifications();
    eventBus.emitEvent('crm.contact.created', 1, 1, { surveyId: 1 });
    await new Promise((r) => setTimeout(r, 0));
    expect(resendSendMock).not.toHaveBeenCalled();
  });

  it('no-ops when payload is missing surveyId', async () => {
    vi.resetModules();
    const eventBus = await import('@/lib/automation/event-bus');
    const { initSurveyNotifications } = await import(
      '@/lib/automation/survey-notifications'
    );
    initSurveyNotifications();
    eventBus.emitEvent('survey.response_submitted', 1, 1, {});
    await new Promise((r) => setTimeout(r, 0));
    expect(resendSendMock).not.toHaveBeenCalled();
  });

  it('no-ops when survey row is not found', async () => {
    vi.resetModules();
    dbMockState.selectQueue.push({ rows: [] });
    const eventBus = await import('@/lib/automation/event-bus');
    const { initSurveyNotifications } = await import(
      '@/lib/automation/survey-notifications'
    );
    initSurveyNotifications();
    eventBus.emitEvent('survey.response_submitted', 1, 1, {
      surveyId: 99,
      responseId: 1,
      surveyTitle: 'Q',
      respondentEmail: null,
      source: null,
    });
    await new Promise((r) => setTimeout(r, 5));
    expect(resendSendMock).not.toHaveBeenCalled();
  });

  it('no-ops when survey has notifyOnResponse=false', async () => {
    vi.resetModules();
    dbMockState.selectQueue.push({
      rows: [
        {
          id: 1,
          title: 'Q',
          notifyOnResponse: false,
          notifyDigest: 'off',
          clientId: 1,
        },
      ],
    });
    const eventBus = await import('@/lib/automation/event-bus');
    const { initSurveyNotifications } = await import(
      '@/lib/automation/survey-notifications'
    );
    initSurveyNotifications();
    eventBus.emitEvent('survey.response_submitted', 1, 1, {
      surveyId: 1,
      responseId: 1,
      surveyTitle: 'Q',
      respondentEmail: null,
      source: null,
    });
    await new Promise((r) => setTimeout(r, 5));
    expect(resendSendMock).not.toHaveBeenCalled();
  });

  it('no-ops when survey is in digest mode (daily/weekly)', async () => {
    vi.resetModules();
    dbMockState.selectQueue.push({
      rows: [
        {
          id: 1,
          title: 'Q',
          notifyOnResponse: true,
          notifyDigest: 'daily',
          clientId: 1,
        },
      ],
    });
    const eventBus = await import('@/lib/automation/event-bus');
    const { initSurveyNotifications } = await import(
      '@/lib/automation/survey-notifications'
    );
    initSurveyNotifications();
    eventBus.emitEvent('survey.response_submitted', 1, 1, {
      surveyId: 1,
      responseId: 1,
      surveyTitle: 'Q',
      respondentEmail: null,
      source: null,
    });
    await new Promise((r) => setTimeout(r, 5));
    expect(resendSendMock).not.toHaveBeenCalled();
  });

  it('no-ops when client owner email cannot be resolved', async () => {
    vi.resetModules();
    dbMockState.selectQueue.push({
      rows: [
        {
          id: 1,
          title: 'Q',
          notifyOnResponse: true,
          notifyDigest: 'off',
          clientId: 1,
        },
      ],
    });
    dbMockState.selectQueue.push({ rows: [] }); // owner lookup empty
    const eventBus = await import('@/lib/automation/event-bus');
    const { initSurveyNotifications } = await import(
      '@/lib/automation/survey-notifications'
    );
    initSurveyNotifications();
    eventBus.emitEvent('survey.response_submitted', 1, 1, {
      surveyId: 1,
      responseId: 1,
      surveyTitle: 'Q',
      respondentEmail: null,
      source: null,
    });
    await new Promise((r) => setTimeout(r, 5));
    expect(resendSendMock).not.toHaveBeenCalled();
  });

  it('sends an email with escaped HTML on the happy path', async () => {
    vi.resetModules();
    dbMockState.selectQueue.push({
      rows: [
        {
          id: 11,
          title: 'Q&A "Survey" <test>',
          notifyOnResponse: true,
          notifyDigest: 'off',
          clientId: 50,
        },
      ],
    });
    dbMockState.selectQueue.push({
      rows: [{ email: 'owner@example.com', name: 'Owner' }],
    });
    const eventBus = await import('@/lib/automation/event-bus');
    const { initSurveyNotifications } = await import(
      '@/lib/automation/survey-notifications'
    );
    initSurveyNotifications();
    eventBus.emitEvent('survey.response_submitted', 50, 1, {
      surveyId: 11,
      responseId: 222,
      surveyTitle: 'Q&A "Survey" <test>',
      respondentEmail: 'alice@example.com',
      source: 'web',
    });
    await new Promise((r) => setTimeout(r, 10));

    expect(resendSendMock).toHaveBeenCalledTimes(1);
    const call = resendSendMock.mock.calls[0]![0] as {
      from: string;
      to: string;
      subject: string;
      html: string;
    };
    expect(call.to).toBe('owner@example.com');
    expect(call.subject).toContain('Q&A "Survey" <test>');
    // HTML should have escaped values
    expect(call.html).toContain('Q&amp;A &quot;Survey&quot; &lt;test&gt;');
    expect(call.html).toContain('alice@example.com');
    expect(call.html).toContain('Response #:</strong> 222');
  });

  it('swallows resend errors and does not throw', async () => {
    vi.resetModules();
    dbMockState.selectQueue.push({
      rows: [
        {
          id: 12,
          title: 'Q',
          notifyOnResponse: true,
          notifyDigest: null,
          clientId: 50,
        },
      ],
    });
    dbMockState.selectQueue.push({
      rows: [{ email: 'owner@example.com', name: 'Owner' }],
    });
    resendSendMock.mockRejectedValueOnce(new Error('smtp down'));
    const eventBus = await import('@/lib/automation/event-bus');
    const { initSurveyNotifications } = await import(
      '@/lib/automation/survey-notifications'
    );
    initSurveyNotifications();
    eventBus.emitEvent('survey.response_submitted', 50, 1, {
      surveyId: 12,
      responseId: 1,
      surveyTitle: 'Q',
      respondentEmail: null,
      source: null,
    });
    await new Promise((r) => setTimeout(r, 10));
    // No throw — handler must have caught
    expect(resendSendMock).toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// product-presets.ts
// ─────────────────────────────────────────────────────────────────────────────

describe('lib/automation/product-presets.ts', () => {
  it('exports EMAIL_AUTOMATION_PRESETS with the expected keys', async () => {
    vi.resetModules();
    const mod = await import('@/lib/automation/product-presets');
    const keys = mod.EMAIL_AUTOMATION_PRESETS.map((p) => p.key);
    expect(keys).toEqual([
      'welcome_email',
      'unsubscribe_notification',
      'campaign_sent_report',
      'subscriber_to_crm',
      're_engagement',
    ]);
  });

  it('every preset has a non-empty actions array and a trigger event', async () => {
    vi.resetModules();
    const { EMAIL_AUTOMATION_PRESETS } = await import('@/lib/automation/product-presets');
    for (const preset of EMAIL_AUTOMATION_PRESETS) {
      expect(preset.actions.length).toBeGreaterThan(0);
      expect(typeof preset.trigger.event).toBe('string');
      expect(preset.trigger.event.length).toBeGreaterThan(0);
    }
  });

  it('campaign_sent_report has a settings field with mapsTo wiring', async () => {
    vi.resetModules();
    const { EMAIL_AUTOMATION_PRESETS } = await import('@/lib/automation/product-presets');
    const csr = EMAIL_AUTOMATION_PRESETS.find((p) => p.key === 'campaign_sent_report');
    expect(csr).toBeDefined();
    expect(csr!.settings).toBeDefined();
    expect(csr!.settings![0].mapsTo).toEqual({ actionIndex: 0, paramKey: 'delay' });
    expect(csr!.actions[0].delay).toBe(86400);
  });

  it('re_engagement settings options include three labelled values', async () => {
    vi.resetModules();
    const { EMAIL_AUTOMATION_PRESETS } = await import('@/lib/automation/product-presets');
    const re = EMAIL_AUTOMATION_PRESETS.find((p) => p.key === 're_engagement')!;
    expect(re.settings).toBeDefined();
    expect(re.settings![0].options).toHaveLength(3);
    expect(re.settings![0].options!.map((o) => o.value)).toEqual([
      '259200',
      '604800',
      '1209600',
    ]);
  });

  it('PRODUCT_PRESET_GROUPS contains email, booking, and survey groups', async () => {
    vi.resetModules();
    const mod = await import('@/lib/automation/product-presets');
    // Tonight's change added BOOKING and SURVEY preset groups alongside EMAIL.
    expect(mod.PRODUCT_PRESET_GROUPS).toHaveLength(3);
    const [email, booking, survey] = mod.PRODUCT_PRESET_GROUPS;
    expect(email.productScope).toBe('email');
    expect(email.label).toBe('Email Marketing');
    expect(email.presets).toBe(mod.EMAIL_AUTOMATION_PRESETS);
    expect(booking.productScope).toBe('booking');
    expect(booking.label).toBe('Bookings');
    expect(booking.presets).toBe(mod.BOOKING_AUTOMATION_PRESETS);
    expect(survey.productScope).toBe('survey');
    expect(survey.label).toBe('Surveys');
    expect(survey.presets).toBe(mod.SURVEY_AUTOMATION_PRESETS);
  });

  it('all preset action params include at least one template variable', async () => {
    vi.resetModules();
    const { EMAIL_AUTOMATION_PRESETS } = await import('@/lib/automation/product-presets');
    for (const preset of EMAIL_AUTOMATION_PRESETS) {
      const combined = JSON.stringify(preset.actions);
      expect(combined).toMatch(/\{\{event\./);
    }
  });
});
