type Subscription = { ready: Promise<void>; unsubscribe: () => Promise<void> };
type Subscribe = (emit: (event: string, data: unknown) => void) => Subscription;

/** SSE lifecycle shared by visitor and inbox feeds; no DB/auth work lives here. */
export function createEventStream(
  signal: AbortSignal,
  hello: unknown,
  subscribe: Subscribe,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let closed = false;
  let timer: ReturnType<typeof setInterval> | undefined;
  let subscription: Subscription | undefined;
  let cleanupPromise: Promise<void> | undefined;
  let controller: ReadableStreamDefaultController<Uint8Array>;

  function unsubscribe(): Promise<void> {
    const current = subscription;
    if (!current) return Promise.resolve();
    return cleanupPromise ??= Promise.resolve().then(() => current.unsubscribe()).catch(() => {});
  }

  function stop(closeController = true): Promise<void> {
    if (!closed) {
      closed = true;
      clearInterval(timer);
      signal.removeEventListener('abort', abort);
      if (closeController) {
        try { controller.close(); } catch { /* reader already cancelled */ }
      }
    }
    return unsubscribe();
  }

  function abort(): void { void stop(); }

  function send(frame: string): void {
    if (closed) return;
    const bytes = encoder.encode(frame);
    // A stalled socket must not accumulate an unlimited notification/heartbeat queue.
    if (bytes.byteLength > (controller.desiredSize ?? 0)) {
      controller.error(new Error('SSE consumer is too slow'));
      void stop(false);
      return;
    }
    try { controller.enqueue(bytes); } catch { void stop(false); }
  }

  return new ReadableStream<Uint8Array>({
    start(target) {
      controller = target;
      if (signal.aborted) { void stop(); return; }
      signal.addEventListener('abort', abort, { once: true });
      const emit = (event: string, data: unknown) => send(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      emit('hello', hello);
      if (closed) return;
      try {
        subscription = subscribe(emit);
        void subscription.ready.catch(() => stop());
        // subscribe may synchronously abort or emit enough to close the stream.
        if (closed) { void unsubscribe(); return; }
        timer = setInterval(() => send(': ping\n\n'), 25_000);
        timer.unref?.();
      } catch { void stop(); }
    },
    cancel() { return stop(false); },
  }, { highWaterMark: 64 * 1024, size: chunk => chunk.byteLength });
}
