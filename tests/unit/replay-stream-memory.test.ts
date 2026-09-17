// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ query: vi.fn(), auth: vi.fn(), pathAuth: vi.fn(), unsubscribe: vi.fn(), notify: null as (() => void) | null }));
vi.mock('@/lib/auth', () => ({ auth: mocks.auth }));
vi.mock('@/lib/portal', () => ({ isPortalStaff: async () => true }));
vi.mock('@/lib/portal-client', () => ({ getPortalClient: async () => ({ id: 1 }) }));
vi.mock('@/app/api/portal/path-charts/_lib', () => ({ getAuthedPathChart: mocks.pathAuth }));
vi.mock('@/lib/db/schema', () => ({ agentFlowRuns: {}, agentFlowRunEvents: {}, projects: {}, pathChartEvents: {} }));
vi.mock('drizzle-orm', () => ({ eq: () => ({}), and: () => ({}), gt: () => ({}), asc: () => ({}), desc: () => ({}) }));
vi.mock('@/lib/db', () => ({ db: { select: () => ({ from: () => ({ where: () => ({ limit: mocks.query, orderBy: () => ({ limit: mocks.query }) }) }) }) } }));
vi.mock('@/lib/agent-flows/stream', () => ({ subscribeRunChannel: (_id: number, notify: () => void) => {
  mocks.notify = notify;
  return { ready: Promise.resolve(), unsubscribe: mocks.unsubscribe };
} }));
vi.mock('@/lib/pathviz/stream', () => ({ subscribeChartChannel: (_id: number, notify: () => void) => {
  mocks.notify = notify;
  return { ready: Promise.resolve(), unsubscribe: mocks.unsubscribe };
} }));
import { GET as runStream } from '@/app/api/portal/projects/[id]/flow-runs/[runId]/stream/route';
import { GET as chartStream } from '@/app/api/portal/path-charts/[id]/stream/route';

beforeEach(() => {
  vi.useFakeTimers();
  mocks.query.mockReset();
  mocks.auth.mockResolvedValue({ user: { id: '1', role: 'admin' } });
  mocks.pathAuth.mockResolvedValue({ chart: { id: 1 } });
  mocks.unsubscribe.mockReset().mockResolvedValue(undefined);
  mocks.notify = null;
});
afterEach(() => vi.useRealTimers());

for (const kind of ['run', 'chart'] as const) describe(`${kind} replay/live memory`, () => {
  async function open(signal?: AbortSignal) {
    if (kind === 'run') {
      mocks.query.mockResolvedValueOnce([{ id: 1, clientId: 1 }]);
      mocks.query.mockResolvedValueOnce([{ id: 1, status: 'running' }]);
    }
    mocks.query.mockResolvedValueOnce([{ id: 1, summary: 'r'.repeat(200_000), payload: 'r'.repeat(200_000) }]);
    mocks.query.mockResolvedValue([{ id: 2, summary: 'n'.repeat(70_000), payload: 'n'.repeat(70_000) }]);
    const request = new Request('http://localhost/stream?since=0', { signal });
    const response = kind === 'run'
      ? await runStream(request, { params: Promise.resolve({ id: '1', runId: '1' }) })
      : await chartStream(request, { params: Promise.resolve({ id: '1' }) });
    await vi.advanceTimersByTimeAsync(0);
    expect(kind === 'run' ? mocks.auth : mocks.pathAuth).toHaveBeenCalled();
    return response;
  }
  it('keeps a finite initial replay above 64 KiB, caps further stalled live output', async () => {
    const response = await open();
    expect(mocks.unsubscribe).not.toHaveBeenCalled();
    expect(mocks.notify).toBeTypeOf('function');
    mocks.notify!();
    await vi.advanceTimersByTimeAsync(0);
    expect(mocks.unsubscribe).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    await expect(response.body!.getReader().read()).rejects.toThrow('SSE consumer is too slow');
  });
  it('delivers large initial replay and subsequent id-framed events to an active reader', async () => {
    const response = await open();
    const reader = response.body!.getReader();
    const first = new TextDecoder().decode((await reader.read()).value);
    expect(first).toContain('id: 1\ndata:');
    expect(first).toContain('r'.repeat(200_000));
    mocks.notify!();
    const next = new TextDecoder().decode((await reader.read()).value);
    expect(next).toContain('id: 2\ndata:');
    expect(mocks.unsubscribe).not.toHaveBeenCalled();
    await reader.cancel();
  });
  it('cleans live resources on cancellation', async () => {
    const response = await open();
    await response.body!.cancel();
    expect(mocks.unsubscribe).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('cleans live resources on request abort', async () => {
    const abort = new AbortController();
    await open(abort.signal);
    abort.abort();
    await vi.advanceTimersByTimeAsync(0);
    expect(mocks.unsubscribe).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});
