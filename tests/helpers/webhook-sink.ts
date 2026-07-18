/**
 * Local HTTP sink for webhook delivery tests. Binds to a random port on
 * 127.0.0.1 and records every inbound request so the test can verify
 * headers, raw body, and HMAC signatures.
 *
 * Because the sink lives on loopback (127.0.0.1), callers must either mock
 * `assertSafeUrl` or disable the SSRF guard for the test — the real guard
 * rejects loopback at dispatch time (as designed).
 */
import * as http from 'node:http';
import { once } from 'node:events';

export interface SinkDelivery {
  method: string;
  url: string;
  headers: Record<string, string>;
  rawBody: string;
  bodyJson: unknown;
  receivedAt: number;
}

export interface WebhookSink {
  url: string;
  port: number;
  deliveries: SinkDelivery[];
  /** Next inbound request will respond with this status (default 200). Reset each call. */
  setNextResponse(status: number): void;
  close(): Promise<void>;
}

export async function startWebhookSink(): Promise<WebhookSink> {
  let nextStatus = 200;
  const deliveries: SinkDelivery[] = [];

  const server = http.createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', c => chunks.push(c as Buffer));
    req.on('end', () => {
      const rawBody = Buffer.concat(chunks).toString('utf8');
      let bodyJson: unknown = null;
      try { bodyJson = JSON.parse(rawBody); } catch { /* keep as raw */ }
      const headers: Record<string, string> = {};
      for (const [k, v] of Object.entries(req.headers)) {
        if (typeof v === 'string') headers[k] = v;
        else if (Array.isArray(v)) headers[k] = v.join(',');
      }
      deliveries.push({
        method: req.method ?? 'GET',
        url: req.url ?? '/',
        headers,
        rawBody,
        bodyJson,
        receivedAt: Date.now(),
      });
      const status = nextStatus;
      nextStatus = 200;
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: status < 400 }));
    });
  });

  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const addr = server.address();
  if (!addr || typeof addr === 'string') throw new Error('webhook sink: no address');

  return {
    url: `http://127.0.0.1:${addr.port}/hook`,
    port: addr.port,
    deliveries,
    setNextResponse: (s) => { nextStatus = s; },
    close: async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

/** Polls `check` until it returns a truthy value, or throws on timeout. */
export async function waitUntil<T>(
  check: () => T | Promise<T>,
  opts: { timeout?: number; interval?: number } = {},
): Promise<NonNullable<T>> {
  const timeout = opts.timeout ?? 5000;
  const interval = opts.interval ?? 25;
  const deadline = Date.now() + timeout;
  let last: T | undefined;
  while (Date.now() < deadline) {
    const v = await check();
    if (v) return v as NonNullable<T>;
    last = v;
    await new Promise(r => setTimeout(r, interval));
  }
  throw new Error(`waitUntil: condition did not become truthy within ${timeout}ms (last value: ${String(last)})`);
}
