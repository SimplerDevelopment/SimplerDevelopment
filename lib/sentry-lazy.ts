// Lazy Sentry for the BROWSER (PUX-241).
//
// A static `import * as Sentry from '@sentry/nextjs'` in client code puts ~180 KB
// of raw JS (@sentry/core + browser + browser-utils + nextjs — including the
// browserTracing / web-vitals modules our integration filter then discards) in
// the entry chunks of EVERY page. Turbopack module instantiation costs ~2.3 ms/KB
// on a throttled mobile CPU: ~0.4 s of Total Blocking Time on a tenant page with
// zero errors. So client code never imports the SDK statically; it goes through
// this module, which loads it in its own chunk when the browser is idle — or at
// once on the first error — and buffers errors until the SDK is up.
//
// Server/edge Sentry (sentry.server.config.ts, sentry.edge.config.ts) is
// unaffected. Do NOT add a static '@sentry/*' import to any client component
// (app/error.tsx and app/global-error.tsx did, and kept 60 KB in the entry).

type SentryModule = typeof import('@sentry/nextjs');

const MAX_BUFFERED = 20;

let sentry: SentryModule | null = null;
let loading = false;
const buffered: unknown[] = [];
let detach: (() => void) | null = null;

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

function load(): void {
  if (!dsn || loading) return;
  loading = true;
  import('@sentry/nextjs')
    .then((Sentry) => {
      Sentry.init({
        dsn,
        environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
        // CLIENT-SIDE PERFORMANCE TRACING IS OFF. browserTracingIntegration patches
        // fetch/XHR/history and spins up PerformanceObserver + web-vitals reporting
        // on every page load — work that dominated mobile Total Blocking Time on the
        // public marketing pages (the Sentry chunk alone was ~1s of main-thread time
        // on a throttled device) for little practical benefit. Server-side tracing
        // (sentry.server.config.ts) is unaffected and still captures backend perf.
        tracesSampleRate: 0,
        // Session Replay (rrweb) stays off — heavy, and outside the free-tier quota.
        replaysSessionSampleRate: 0,
        replaysOnErrorSampleRate: 0,
        // Keep lightweight error/crash capture, but strip the heavy performance and
        // replay integrations from the default set so they neither instrument the
        // page nor run on load. Global error + unhandled-rejection handlers remain.
        integrations: (defaultIntegrations) =>
          defaultIntegrations.filter(
            (integration) =>
              !['BrowserTracing', 'Replay', 'ReplayCanvas', 'BrowserProfiling'].includes(
                integration.name,
              ),
          ),
        enabled: process.env.NODE_ENV === 'production',
      });
      sentry = Sentry;
      // Sentry's own global handlers are live now; hand over and replay.
      detach?.();
      detach = null;
      for (const err of buffered.splice(0)) Sentry.captureException(err);
    })
    .catch(() => {
      // A blocked/failed chunk must not take the page down; error reporting is
      // best-effort. Allow the next error to retry.
      loading = false;
    });
}

/**
 * Report an error that a React error boundary (or other app code) caught. Safe
 * to call before the SDK has loaded — the error is buffered and replayed.
 */
export function captureLazily(error: unknown): void {
  if (!dsn) return;
  if (sentry) {
    sentry.captureException(error);
    return;
  }
  if (buffered.length < MAX_BUFFERED) buffered.push(error);
  load();
}

/** Forward an App Router transition. Dropped before the SDK loads — it only feeds
 *  Sentry navigation spans, and client tracing is off (tracesSampleRate 0). */
export function captureRouterTransitionStartLazily(
  ...args: Parameters<SentryModule['captureRouterTransitionStart']>
): void {
  sentry?.captureRouterTransitionStart(...args);
}

/**
 * Start the lazy lifecycle (call once, from instrumentation-client): buffer
 * uncaught errors / unhandled rejections until the SDK is up, and load it when
 * the browser is idle. Anything thrown before this runs was never catchable.
 */
export function startLazySentry(): void {
  if (!dsn || typeof window === 'undefined') return;

  const onError = (e: ErrorEvent) => captureLazily(e.error ?? e.message);
  const onRejection = (e: PromiseRejectionEvent) => captureLazily(e.reason);
  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onRejection);
  detach = () => {
    window.removeEventListener('error', onError);
    window.removeEventListener('unhandledrejection', onRejection);
  };

  // Idle load: after hydration and the first interactions, not competing with
  // them. The timeout bounds how long a busy main thread can defer it.
  const ric = (window as unknown as {
    requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
  }).requestIdleCallback;
  const schedule = () => (ric ? ric.call(window, load, { timeout: 5000 }) : setTimeout(load, 3000));
  if (document.readyState === 'complete') schedule();
  else window.addEventListener('load', schedule, { once: true });
}
