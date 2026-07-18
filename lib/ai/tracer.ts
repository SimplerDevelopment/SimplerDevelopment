// Span helper for the AI agent routes (Brain agent + portal chatbot).
//
// Backed by real Sentry performance spans when a DSN is configured (prod —
// `sentry.server.config.ts`, tracesSampleRate 0.1); in dev, where the SDK is a
// no-op, it also emits a structured JSON line to the console so local runs stay
// debuggable. The tiny `startSpan` / `withSpan` API is unchanged from the
// original console shim, so existing call sites keep working untouched.

import * as Sentry from '@sentry/nextjs';

export interface Span {
  end(attrs?: Record<string, unknown>): void;
}

// Sentry span attributes must be primitives (or arrays of them). Coerce
// anything richer to a JSON string so a stray object can't drop the span.
type SentryAttrs = Record<string, string | number | boolean>;

function normalize(attrs?: Record<string, unknown>): SentryAttrs {
  const out: SentryAttrs = {};
  if (!attrs) return out;
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined) continue;
    out[k] =
      typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean'
        ? v
        : JSON.stringify(v);
  }
  return out;
}

function devLog(name: string, durationMs: number, attrs: Record<string, unknown>): void {
  // Suppressed in prod, where the real Sentry span carries the data instead.
  if (process.env.NODE_ENV !== 'production') {
    console.warn(JSON.stringify({ span: name, duration_ms: durationMs, ...attrs }));
  }
}

export function startSpan(name: string, attrs?: Record<string, unknown>): Span {
  const span = Sentry.startInactiveSpan({ name, attributes: normalize(attrs) });
  const start = Date.now();
  return {
    end(endAttrs?: Record<string, unknown>) {
      if (endAttrs) span.setAttributes(normalize(endAttrs));
      span.end();
      devLog(name, Date.now() - start, { ...(attrs ?? {}), ...(endAttrs ?? {}) });
    },
  };
}

export async function withSpan<T>(
  name: string,
  attrs: Record<string, unknown>,
  fn: () => Promise<T>,
): Promise<T> {
  const start = Date.now();
  return Sentry.startSpan({ name, attributes: normalize(attrs) }, async (span) => {
    try {
      const result = await fn();
      span.setAttribute('ok', true);
      devLog(name, Date.now() - start, { ...attrs, ok: true });
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      span.setAttribute('ok', false);
      span.setAttribute('error', message);
      devLog(name, Date.now() - start, { ...attrs, ok: false, error: message });
      throw err;
    }
  });
}
