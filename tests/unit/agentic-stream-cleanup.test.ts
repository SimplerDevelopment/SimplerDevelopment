// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), query: vi.fn(),
  entry: { outputBuf: '', taps: new Set<(chunk: string) => void>() },
}));
vi.mock('@/lib/auth', () => ({ auth: mocks.auth }));
vi.mock('@/lib/agentic-os/local-only', () => ({ isLocalDev: () => true }));
vi.mock('@/lib/agentic-os/executor', () => ({ getChild: () => mocks.entry }));
vi.mock('@/lib/db/schema', () => ({ agenticOsRuns: { id: 'id' } }));
vi.mock('drizzle-orm', () => ({ eq: () => ({}) }));
vi.mock('@/lib/db', () => ({ db: { select: () => ({ from: () => ({ where: () => ({ limit: mocks.query }) }) }) } }));
import { GET } from '@/app/api/admin/agentic-os/runs/[id]/stream/route';

beforeEach(() => {
  vi.useFakeTimers();
  mocks.auth.mockResolvedValue({ user: { id: '1', role: 'admin' } });
  mocks.query.mockReset().mockResolvedValue([{ id: 1, status: 'running', output: '' }]);
  mocks.entry.taps.clear();
  mocks.entry.outputBuf = '';
});
afterEach(() => vi.useRealTimers());
const open = (signal?: AbortSignal) => GET(new Request('http://localhost/stream', { signal }), { params: Promise.resolve({ id: '1' }) });

describe('agentic output resource teardown', () => {
  it('removes child taps and both timers on reader cancellation', async () => {
    const response = await open();
    expect(mocks.auth).toHaveBeenCalled();
    expect(mocks.entry.taps.size).toBe(1);
    expect(vi.getTimerCount()).toBe(2);
    await response.body!.cancel();
    expect(mocks.entry.taps.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(mocks.query).toHaveBeenCalledTimes(1);
  });
  it('removes resources on request abort without a reader cancel', async () => {
    const abort = new AbortController();
    await open(abort.signal);
    abort.abort();
    expect(mocks.entry.taps.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('never overlaps slow polls and recovers after a rejected poll', async () => {
    const response = await open();
    let reject!: (error: Error) => void;
    mocks.query.mockImplementationOnce(() => new Promise((_, fail) => { reject = fail; }));
    await vi.advanceTimersByTimeAsync(5_000);
    expect(mocks.query).toHaveBeenCalledTimes(2);
    reject(new Error('transient'));
    await vi.advanceTimersByTimeAsync(1_000);
    expect(mocks.query).toHaveBeenCalledTimes(3);
    await response.body!.cancel();
    expect(vi.getTimerCount()).toBe(0);
  });
  it('preserves large captured replay but terminates a stalled live consumer', async () => {
    mocks.entry.outputBuf = 'r'.repeat(200_000);
    const response = await open();
    const tap = [...mocks.entry.taps][0];
    expect(tap).toBeTypeOf('function');
    for (let i = 0; i < 10; i++) tap('n'.repeat(32_000));
    expect(mocks.entry.taps.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
    await expect(response.body!.getReader().read()).rejects.toThrow('SSE consumer is too slow');
  });
  it('does not truncate a large terminal replay', async () => {
    const output = 'r'.repeat(200_000);
    mocks.query.mockResolvedValueOnce([{ id: 1, status: 'succeeded', output }]);
    const response = await open();
    const text = await response.text();
    expect(text).toContain(output);
    expect(text).toContain('event: done');
    expect(vi.getTimerCount()).toBe(0);
  });

});
