import * as Sentry from '@sentry/nextjs';

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const onRequestError = (error: unknown, request: any, errorContext: any): void => {
  // notFound() and redirect() throw Next.js-internal signals (digest:
  // 'NEXT_NOT_FOUND' / 'NEXT_REDIRECT*') that the framework catches and
  // converts to 404/3xx responses. They are not real errors; skip them so
  // Sentry doesn't surface them as production incidents.
  const digest = (error as { digest?: string })?.digest;
  if (digest === 'NEXT_NOT_FOUND' || digest?.startsWith('NEXT_REDIRECT')) {
    return;
  }
  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
  Sentry.captureRequestError(error, request, errorContext);
};
