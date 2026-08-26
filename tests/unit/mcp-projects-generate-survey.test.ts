// @vitest-environment node
/**
 * Unit tests for the `projects_generate_survey` MCP tool
 * (lib/mcp/tools/projects.ts, PUX-033 step 3).
 *
 * The tool is registered only when BOTH `projects:write` and `surveys:write`
 * are granted (mirrors the `projects_propose_artifact_link` dual-scope
 * pattern in the same file). Its handler resolves `clientId` from
 * `ctx.client.id` and composes the step-2 service
 * (`@/lib/projects/generate-survey-service`), which is mocked here — this
 * suite is only responsible for the registration/scope-gating/echo contract,
 * not the service's DB behavior (that's covered where the service itself is
 * tested).
 *
 * Strategy mirrors tests/unit/mcp-tools-surveys.test.ts: a fake McpServer
 * stub captures `{ name -> handler }` so each handler can be invoked
 * directly without standing up a real MCP transport.
 */

process.env.DATABASE_URL ??= 'postgresql://placeholder@localhost:5432/placeholder';

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PortalMcpContext } from '@/lib/mcp-auth';

// ── mocks ───────────────────────────────────────────────────────────────────

// @/lib/db is imported transitively by lib/mcp/tools/projects.ts but never
// hit in these tests (the handler under test delegates to the mocked
// generate-survey-service instead of querying directly).
vi.mock('@/lib/db', () => ({ db: {} }));

// schema objects — opaque column-like refs are fine; the handler under test
// never touches these directly, but sibling tools in the same registrar file
// reference them at module-eval time.
vi.mock('@/lib/db/schema', () => {
  const col = (name: string) => ({ name });
  const make = (...cols: string[]) =>
    Object.fromEntries(cols.map((c) => [c, col(c)])) as Record<string, unknown>;
  return new Proxy(
    {
      projects: make('id', 'clientId'),
      kanbanCards: make('id'),
      kanbanColumns: make('id'),
      kanbanLabels: make('id'),
      kanbanCardAssignees: make('id'),
      users: make('id'),
      projectMembers: make('id'),
      cardTemplates: make('id'),
      projectArtifacts: make('id'),
      brainNotes: make('id'),
      brainAiReviewItems: make('id'),
    },
    {
      has: (t, p) => p in t || !(p === 'then' || p === '__esModule' || p === 'default' || typeof p !== 'string'),
      get: (t, p) =>
        p in t
          ? (t as Record<string, unknown>)[p as string]
          : p === 'then' || p === '__esModule' || p === 'default' || typeof p !== 'string'
            ? undefined
            : new Proxy(
                { __table: String(p) },
                { get: (_x, c) => (c === '__table' ? String(p) : typeof c === 'string' ? { __col: c, __table: String(p) } : undefined) },
              ),
    },
  );
});

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(() => ({})),
  and: vi.fn(() => ({})),
  or: vi.fn(() => ({})),
  desc: vi.fn(() => ({})),
}));

// auth helpers — hasScope reflects ctx.scopes; requireScope is mirrored.
vi.mock('@/lib/mcp-auth', () => ({
  hasScope: (granted: string[], required: string) =>
    granted.includes('*') || granted.includes(required) || granted.includes(`${required.split(':')[0]}:*`),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  unstable_cache: (fn: (...a: unknown[]) => unknown) => fn,
}));

// The service composed by the tool under test — this is the boundary this
// suite verifies, not the service's own DB behavior.
const generateProjectSurveyMock = vi.fn();
vi.mock('@/lib/projects/generate-survey-service', () => ({
  generateProjectSurvey: (...args: unknown[]) => generateProjectSurveyMock(...args),
}));

// ── helpers ─────────────────────────────────────────────────────────────────

import { registerProjectsTools } from '@/lib/mcp/tools/projects';

interface CapturedTool {
  name: string;
  config: { title?: string; description?: string; inputSchema?: Record<string, unknown> };
  handler: (args: Record<string, unknown>) => Promise<{ content: { text: string; type: string }[]; isError?: boolean }>;
}

function makeServer() {
  const tools = new Map<string, CapturedTool>();
  const stub = {
    registerTool: vi.fn((name: string, config: CapturedTool['config'], handler: CapturedTool['handler']) => {
      tools.set(name, { name, config, handler });
      return { update: vi.fn(), enable: vi.fn(), disable: vi.fn() };
    }),
    registerResource: vi.fn(),
  };
  return { stub, tools };
}

function ctxFor(scopes: string[]): PortalMcpContext {
  return {
    userId: 11,
    keyId: 1,
    scopes,
    client: { id: 7, company: 'Acme' } as PortalMcpContext['client'],
  };
}

function parseJson(res: { content: { text: string }[] }): unknown {
  return JSON.parse(res.content[0].text);
}

function registerAll(scopes: string[]) {
  const { stub, tools } = makeServer();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  registerProjectsTools(stub as any, ctxFor(scopes));
  return tools;
}

beforeEach(() => {
  generateProjectSurveyMock.mockReset();
});

// ── registration / scope gating ─────────────────────────────────────────────

describe('projects_generate_survey — registration', () => {
  it('registers when both projects:write and surveys:write are granted', () => {
    const tools = registerAll(['projects:write', 'surveys:write']);
    expect(tools.has('projects_generate_survey')).toBe(true);
  });

  it('registers under a wildcard scope', () => {
    const tools = registerAll(['*']);
    expect(tools.has('projects_generate_survey')).toBe(true);
  });

  it('is absent when only projects:write is granted (surveys:write missing)', () => {
    const tools = registerAll(['projects:write']);
    expect(tools.has('projects_generate_survey')).toBe(false);
  });

  it('is absent when only surveys:write is granted (projects:write missing)', () => {
    const tools = registerAll(['surveys:write']);
    expect(tools.has('projects_generate_survey')).toBe(false);
  });

  it('is absent when neither scope is granted', () => {
    const tools = registerAll(['projects:read']);
    expect(tools.has('projects_generate_survey')).toBe(false);
  });

  it('has a title, description, and inputSchema', () => {
    const tools = registerAll(['projects:write', 'surveys:write']);
    const t = tools.get('projects_generate_survey')!;
    expect(t.config.title).toBeTruthy();
    expect((t.config.description ?? '').length).toBeGreaterThan(5);
    expect(t.config.inputSchema).toBeDefined();
  });
});

// ── handler behavior ─────────────────────────────────────────────────────────

describe('projects_generate_survey — handler', () => {
  it('calls the service with clientId from ctx and the given args', async () => {
    generateProjectSurveyMock.mockResolvedValueOnce({
      ok: true,
      survey: { id: 100, slug: 'qa-review-abc', title: 'QA Review', status: 'draft' },
      approvalUrl: 'https://portal.example/approve/tok123',
      publicPath: '/s/qa-review-abc',
      artifactId: 55,
      reviewedCardIds: [1, 2, 3],
    });
    const tools = registerAll(['projects:write', 'surveys:write']);
    await tools.get('projects_generate_survey')!.handler({
      projectId: 42,
      preset: 'qa_review',
      date: '2026-08-25',
    });
    expect(generateProjectSurveyMock).toHaveBeenCalledTimes(1);
    expect(generateProjectSurveyMock).toHaveBeenCalledWith({
      clientId: 7, // from ctxFor's client.id
      projectId: 42,
      preset: 'qa_review',
      createdByUserId: 11, // from ctxFor's userId
      date: '2026-08-25',
    });
  });

  it('echoes the compact shape on success', async () => {
    generateProjectSurveyMock.mockResolvedValueOnce({
      ok: true,
      survey: { id: 100, slug: 'qa-review-abc', title: 'QA Review', status: 'draft' },
      approvalUrl: 'https://portal.example/approve/tok123',
      publicPath: '/s/qa-review-abc',
      artifactId: 55,
      reviewedCardIds: [1, 2, 3],
    });
    const tools = registerAll(['projects:write', 'surveys:write']);
    const res = await tools.get('projects_generate_survey')!.handler({
      projectId: 42,
      preset: 'qa_review',
    });
    const out = parseJson(res) as Record<string, unknown>;
    expect(out).toEqual({
      surveyId: 100,
      slug: 'qa-review-abc',
      status: 'draft',
      approvalUrl: 'https://portal.example/approve/tok123',
      publicPath: '/s/qa-review-abc',
      artifactId: 55,
      reviewedCardIds: [1, 2, 3],
    });
    // Compact echo — never the full survey row (no title/description/fields).
    expect(out.title).toBeUndefined();
    expect(out.survey).toBeUndefined();
  });

  it('maps not_found to an error envelope', async () => {
    generateProjectSurveyMock.mockResolvedValueOnce({ ok: false, reason: 'not_found' });
    const tools = registerAll(['projects:write', 'surveys:write']);
    const res = await tools.get('projects_generate_survey')!.handler({
      projectId: 999,
      preset: 'retro',
    });
    const out = parseJson(res) as { error: string };
    expect(out.error).toMatch(/not found/i);
  });

  it('denies when ctx loses projects:write at call time', async () => {
    const { stub, tools } = makeServer();
    const ctx = ctxFor(['projects:write', 'surveys:write']);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerProjectsTools(stub as any, ctx);
    ctx.scopes = ['surveys:write'];
    const res = await tools.get('projects_generate_survey')!.handler({ projectId: 1, preset: 'retro' });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/Permission denied/);
    expect(generateProjectSurveyMock).not.toHaveBeenCalled();
  });

  it('denies when ctx loses surveys:write at call time', async () => {
    const { stub, tools } = makeServer();
    const ctx = ctxFor(['projects:write', 'surveys:write']);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerProjectsTools(stub as any, ctx);
    ctx.scopes = ['projects:write'];
    const res = await tools.get('projects_generate_survey')!.handler({ projectId: 1, preset: 'retro' });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/Permission denied/);
    expect(generateProjectSurveyMock).not.toHaveBeenCalled();
  });
});
