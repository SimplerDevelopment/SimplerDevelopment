// @vitest-environment jsdom
// PUX-241 — instrumentation-client must not statically load the Sentry SDK (~180 KB raw in
// every page's entry chunks). It loads it on idle, and replays errors thrown before then.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const init = vi.fn();
const captureException = vi.fn();
const captureRouterTransitionStart = vi.fn();
const sentryFactory = vi.fn(() => ({ init, captureException, captureRouterTransitionStart }));

vi.mock('@/lib/bugcast', () => ({ markBuild: vi.fn() }));

beforeEach(() => {
  vi.resetModules();
  init.mockClear();
  captureException.mockClear();
  captureRouterTransitionStart.mockClear();
  sentryFactory.mockClear();
  vi.doMock('@sentry/nextjs', sentryFactory);
  // jsdom has no requestIdleCallback; the module falls back to setTimeout.
  vi.useFakeTimers();
  Object.defineProperty(document, 'readyState', { value: 'complete', configurable: true });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.doUnmock('@sentry/nextjs');
});

describe('instrumentation-client', () => {
  it('never loads Sentry when no DSN is configured', async () => {
    vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', '');
    const mod = await import('@/instrumentation-client');
    await vi.advanceTimersByTimeAsync(10_000);
    expect(sentryFactory).not.toHaveBeenCalled();
    // The router hook must stay callable (Next invokes it on every navigation).
    expect(() => mod.onRouterTransitionStart('/x', 'push')).not.toThrow();
  });

  it('does not load Sentry synchronously at startup, only once idle', async () => {
    vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', 'https://k@o.ingest.sentry.io/1');
    await import('@/instrumentation-client');
    expect(sentryFactory).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(3_100);
    expect(sentryFactory).toHaveBeenCalledTimes(1);
    expect(init).toHaveBeenCalledTimes(1);
    expect(init.mock.calls[0][0]).toMatchObject({ dsn: 'https://k@o.ingest.sentry.io/1', tracesSampleRate: 0 });
  });

  it('loads immediately on the first error and replays it through captureException', async () => {
    vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', 'https://k@o.ingest.sentry.io/1');
    await import('@/instrumentation-client');
    const boom = new Error('hydration blew up');
    window.dispatchEvent(new ErrorEvent('error', { error: boom, message: 'hydration blew up' }));
    await vi.advanceTimersByTimeAsync(0);
    expect(sentryFactory).toHaveBeenCalledTimes(1);
    expect(captureException).toHaveBeenCalledWith(boom);
  });

  it('forwards router transitions once the SDK is up', async () => {
    vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', 'https://k@o.ingest.sentry.io/1');
    const mod = await import('@/instrumentation-client');
    mod.onRouterTransitionStart('/before', 'push'); // dropped: SDK not loaded yet
    await vi.advanceTimersByTimeAsync(3_100);
    mod.onRouterTransitionStart('/after', 'push');
    expect(captureRouterTransitionStart).toHaveBeenCalledTimes(1);
    expect(captureRouterTransitionStart).toHaveBeenCalledWith('/after', 'push');
  });

  it('captureLazily (used by app/error.tsx + global-error.tsx) buffers, loads the SDK, then replays', async () => {
    vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', 'https://k@o.ingest.sentry.io/1');
    const { captureLazily } = await import('@/lib/sentry-lazy');
    const boom = new Error('render crash');
    captureLazily(boom);
    await vi.advanceTimersByTimeAsync(0);
    expect(sentryFactory).toHaveBeenCalledTimes(1);
    expect(captureException).toHaveBeenCalledWith(boom);
    // once up, later errors go straight through without re-importing
    const later = new Error('later');
    captureLazily(later);
    expect(captureException).toHaveBeenCalledWith(later);
    expect(sentryFactory).toHaveBeenCalledTimes(1);
  });

  it('captureLazily is a no-op (and never loads the SDK) without a DSN', async () => {
    vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', '');
    const { captureLazily } = await import('@/lib/sentry-lazy');
    captureLazily(new Error('x'));
    await vi.advanceTimersByTimeAsync(10_000);
    expect(sentryFactory).not.toHaveBeenCalled();
  });
});
