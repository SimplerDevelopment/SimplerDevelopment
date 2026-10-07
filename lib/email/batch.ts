// Email batch helpers — chunking + batch-result mapping for Resend's
// batch API (max 100 emails per call, docs: batch-sending#limitations).
//
// Why a separate module: chunk() and batchResultAt() are pure, so the
// batching behavior is unit-tested here while the transports (Resend /
// Mailpit) stay thin adapters in transport.ts.

export const EMAIL_BATCH_SIZE = 100;

export function chunk<T>(items: readonly T[], size: number = EMAIL_BATCH_SIZE): T[][] {
  if (size <= 0) throw new Error('chunk size must be positive');
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

export interface BatchItemResult {
  data: { id: string } | null;
  error: { message: string } | null;
}

/**
 * Map one position of a Resend permissive-validation batch response to a
 * per-recipient result. `ids` is data.data (ordered like the request),
 * `errors` is data.errors (index → message). A whole-call transport error
 * is handled by the caller (the entire chunk counts as failed).
 */
export function batchResultAt(
  ids: Array<{ id: string } | null | undefined>,
  errors: Array<{ index: number; message: string }>,
  index: number,
): BatchItemResult {
  const failure = errors.find((e) => e.index === index);
  if (failure) return { data: null, error: { message: failure.message } };
  const id = ids[index]?.id;
  if (!id) return { data: null, error: { message: 'Batch item returned no id' } };
  return { data: { id }, error: null };
}
