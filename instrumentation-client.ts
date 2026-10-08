import { markBuild } from '@/lib/bugcast';
import { captureRouterTransitionStartLazily, startLazySentry } from '@/lib/sentry-lazy';

// Before Sentry, and before anything can throw: this is the earliest client
// code that runs, and a QA recording is most useful when it knows which build
// it captured. Costs one performance.mark and no network call — see
// lib/bugcast.ts for why it is standard User Timing rather than an SDK.
markBuild();

// Sentry is loaded lazily (idle, or on the first error) with early errors
// buffered and replayed — see lib/sentry-lazy.ts for why a static import of
// '@sentry/nextjs' here cost ~0.4 s of mobile TBT on every page.
startLazySentry();

// App Router calls this on every client navigation. It only feeds Sentry's
// (disabled, tracesSampleRate 0) navigation spans, so calls made before the SDK
// has loaded are dropped; afterwards it forwards as before.
export const onRouterTransitionStart = captureRouterTransitionStartLazily;
