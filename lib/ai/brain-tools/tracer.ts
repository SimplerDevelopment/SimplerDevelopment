// Lightweight in-process span logger for the Brain Agent.
// Emits structured JSON lines to console so they can be parsed by log aggregators.
// Designed as a drop-in shim: swap console.warn for real OTEL spans when ready.

export interface Span {
  end(attrs?: Record<string, unknown>): void;
}

export function startSpan(name: string, attrs?: Record<string, unknown>): Span {
  const start = Date.now();
  return {
    end(endAttrs?: Record<string, unknown>) {
      const duration_ms = Date.now() - start;
      console.warn(
        JSON.stringify({
          span: name,
          duration_ms,
          ...(attrs ?? {}),
          ...(endAttrs ?? {}),
        }),
      );
    },
  };
}

export async function withSpan<T>(
  name: string,
  attrs: Record<string, unknown>,
  fn: () => Promise<T>,
): Promise<T> {
  const span = startSpan(name, attrs);
  try {
    const result = await fn();
    span.end({ ok: true });
    return result;
  } catch (err) {
    span.end({ ok: false, error: err instanceof Error ? err.message : String(err) });
    throw err;
  }
}
