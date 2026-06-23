import * as Sentry from '@sentry/nextjs';

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
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
          ![
            'BrowserTracing',
            'Replay',
            'ReplayCanvas',
            'BrowserProfiling',
          ].includes(integration.name),
      ),
    enabled: process.env.NODE_ENV === 'production',
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
