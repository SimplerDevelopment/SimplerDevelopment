/**
 * Shared async-button discipline for portal UI.
 *
 * Every fire-and-forget `fetch` in a click handler needs the same four
 * things this hook provides, and the audit batch found most handlers
 * missing at least one of them:
 *
 *   1. an in-flight guard that works synchronously (a `busy` state check
 *      alone lets two clicks in the same tick through — state lands after
 *      re-render), via `busyRef`;
 *   2. `busy` state for `disabled` props + spinners;
 *   3. a surfaced `error` (no silent catch-and-swallow);
 *   4. `busy` always clearing in `finally` (no eternally stuck buttons).
 *
 * Usage:
 *
 *   const save = useAsyncAction(async (body: SaveBody) => {
 *     const data = await fetchJson<SaveResult>('/api/...', { method: 'POST', ... });
 *     if (!data.success) throw new Error(data.message ?? 'Save failed');
 *     return data.data;
 *   });
 *   <button disabled={save.busy} onClick={() => void save.run(body)}>Save</button>
 *   {save.error && <p role="alert">{save.error}</p>}
 *
 * New UI code should reach for this instead of hand-rolling busy/error
 * refs. (See also lib/api/fetch-json.ts for the transport half.)
 */
import { useCallback, useRef, useState } from 'react';

export interface AsyncAction<TArgs extends unknown[], T> {
  /** Runs fn unless a run is already in flight (second call resolves undefined). */
  run: (...args: TArgs) => Promise<T | undefined>;
  busy: boolean;
  error: string | null;
  reset: () => void;
}

export function useAsyncAction<TArgs extends unknown[], T>(
  fn: (...args: TArgs) => Promise<T>,
): AsyncAction<TArgs, T> {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busyRef = useRef(false);

  const run = useCallback(
    async (...args: TArgs): Promise<T | undefined> => {
      if (busyRef.current) return undefined;
      busyRef.current = true;
      setBusy(true);
      setError(null);
      try {
        return await fn(...args);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Request failed');
        return undefined;
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    },
    [fn],
  );

  const reset = useCallback(() => setError(null), []);

  return { run, busy, error, reset };
}
