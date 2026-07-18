/**
 * SD Chat — AI chat streaming client
 *
 * Speaks the SSE protocol exposed by sd2026's
 * `POST /api/portal/ai/chat/stream` (added in Phase 3). Auth is the same
 * `Bearer sd_mcp_…` token the rest of the mobile API uses — pulled from
 * `getToken()` so the user never sees it in the bundle.
 *
 * Why react-native-sse? React Native's built-in `fetch` does not expose
 * `response.body` on iOS in Hermes (and the streaming readable in 0.85 is
 * still polyfilled). `react-native-sse` wraps a polyfilled EventSource on
 * top of XHR's `onprogress` — handles framing, reconnect, and POST bodies
 * with custom headers cleanly.
 *
 * Public surface:
 *   - `StreamEvent` — discriminated union of every event the server emits
 *   - `streamChat({ messages, conversationId, signal? })` — async generator
 *     that yields `StreamEvent`s as they arrive. Throws on auth / network
 *     errors before any frame is yielded; surfaces mid-stream errors as
 *     an `{ type: 'error' }` event (the caller can decide whether to
 *     re-throw or show a "(connection lost)" affordance).
 *
 * Consumer is `app/chat/[id].tsx`. See `lib/api/auth.ts` for token wiring.
 */

import EventSource, {
  type ErrorEvent,
  type ExceptionEvent,
  type MessageEvent,
  type TimeoutEvent,
} from 'react-native-sse';

import { getToken } from './auth';

// ─── Public types ──────────────────────────────────────────────────────────

export type StreamEvent =
  | { type: 'token'; text: string }
  | { type: 'tool_call'; tool: string; args: unknown; id: string }
  | { type: 'tool_result'; id: string; output: unknown }
  | {
      type: 'done';
      conversationId: number;
      tokensUsed?: number;
      creditsRemaining?: number | null;
    }
  | {
      type: 'error';
      message: string;
      /** Stable machine-readable code from the portal when the underlying
       *  response was a JSON envelope (e.g. 402 "Insufficient AI credits"
       *  serves `{ success:false, code:'AI_CREDITS_EXHAUSTED', ... }`).
       *  Absent for transport-level errors. Used by the chat screen to
       *  render a credits-upsell card instead of a generic error bubble. */
      code?: string;
      /** Portal URL the upsell card should open. */
      upsellUrl?: string;
    };

export interface StreamChatOptions {
  messages: { role: 'user' | 'assistant'; content: string }[];
  conversationId?: number;
  signal?: AbortSignal;
}

// ─── Internals ─────────────────────────────────────────────────────────────

const DEFAULT_BASE_URL = 'https://staging.simplerdevelopment.com';
const BASE_URL =
  process.env.EXPO_PUBLIC_API_URL && process.env.EXPO_PUBLIC_API_URL.length > 0
    ? process.env.EXPO_PUBLIC_API_URL
    : DEFAULT_BASE_URL;

const STREAM_PATH = '/api/portal/ai/chat/stream';

/**
 * Parse one SSE payload string (`{"type":"token",...}`) into a typed event.
 * Returns null for anything that doesn't look like our protocol so we can
 * silently skip pings / unrecognized frames instead of crashing.
 */
function parseFrame(raw: string | null): StreamEvent | null {
  if (!raw) return null;
  try {
    const obj = JSON.parse(raw) as unknown;
    if (!obj || typeof obj !== 'object') return null;
    const type = (obj as { type?: unknown }).type;
    if (typeof type !== 'string') return null;
    switch (type) {
      case 'token':
      case 'tool_call':
      case 'tool_result':
      case 'done':
      case 'error':
        return obj as StreamEvent;
      default:
        return null;
    }
  } catch {
    return null;
  }
}

/**
 * Stream chat tokens from the portal AI endpoint.
 *
 * Usage:
 * ```ts
 * for await (const ev of streamChat({ messages: [{ role: 'user', content: 'hi' }] })) {
 *   if (ev.type === 'token') append(ev.text);
 *   if (ev.type === 'done')  finalize(ev.conversationId);
 *   if (ev.type === 'error') showRetry(ev.message);
 * }
 * ```
 *
 * The generator completes (returns) after the `done` frame, after a
 * terminal `error` frame, on transport failure, or when `signal.aborted`
 * fires. Mid-stream socket failures are surfaced as a synthesized
 * `{ type: 'error' }` event so callers have a single error path.
 */
export async function* streamChat(
  opts: StreamChatOptions,
): AsyncGenerator<StreamEvent> {
  const token = await getToken();
  if (!token) {
    yield {
      type: 'error',
      message: 'Not signed in — please re-authenticate.',
    };
    return;
  }

  const url = `${BASE_URL}${STREAM_PATH}`;
  const body = JSON.stringify({
    conversationId: opts.conversationId,
    messages: opts.messages,
  });

  // Simple pub-sub queue between the EventSource callbacks and the async
  // iterator. We push events into `pending`; the iterator awaits a Promise
  // that resolves whenever something lands. This avoids dropping events if
  // the consumer is slow.
  const pending: StreamEvent[] = [];
  let resolveNext: (() => void) | null = null;
  let closed = false;

  const notify = () => {
    const r = resolveNext;
    resolveNext = null;
    r?.();
  };

  const enqueue = (ev: StreamEvent) => {
    pending.push(ev);
    notify();
  };

  const finish = () => {
    closed = true;
    notify();
  };

  const es = new EventSource(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    },
    body,
    pollingInterval: 0, // disable auto-reconnect — once the stream ends, it ends
    timeout: 0,
  });

  const onMessage = (event: MessageEvent) => {
    const parsed = parseFrame(event.data);
    if (!parsed) return;
    enqueue(parsed);
    // `done` is the contract terminator. Close eagerly so we stop receiving
    // pings and the iterator returns promptly.
    if (parsed.type === 'done' || parsed.type === 'error') {
      try {
        es.close();
      } catch {
        /* already closed */
      }
      finish();
    }
  };

  const onError = (event: ErrorEvent | TimeoutEvent | ExceptionEvent) => {
    // If the server already sent `done`, we may receive a benign close
    // afterwards — ignore.
    if (closed) return;
    let message = 'Connection error';
    if ('message' in event && event.message) {
      message = String(event.message);
    } else if (event.type === 'timeout') {
      message = 'Stream timed out';
    }
    // When the server short-circuits with a non-SSE response (e.g. 402
    // "Insufficient AI credits", 401 auth, 5xx), the polyfilled EventSource
    // hands us the raw JSON body as the error message. Unwrap the
    // `{ success: false, message | error, code?, upsellUrl? }` envelope so
    // callers see a clean sentence + structured fields (code / upsellUrl)
    // for entitlement-aware UI.
    let code: string | undefined;
    let upsellUrl: string | undefined;
    if (message.startsWith('{') || message.startsWith('[')) {
      try {
        const parsed = JSON.parse(message) as {
          message?: unknown;
          error?: unknown;
          code?: unknown;
          upsellUrl?: unknown;
        };
        if (parsed && typeof parsed === 'object') {
          if (typeof parsed.message === 'string' && parsed.message.length > 0) {
            message = parsed.message;
          } else if (typeof parsed.error === 'string' && parsed.error.length > 0) {
            message = parsed.error;
          }
          if (typeof parsed.code === 'string') code = parsed.code;
          if (typeof parsed.upsellUrl === 'string') upsellUrl = parsed.upsellUrl;
        }
      } catch {
        /* leave as-is */
      }
    }
    // Heuristic: if the unwrapped message mentions insufficient credits but
    // the server didn't (yet) emit a structured code, synthesize one so the
    // chat screen can branch on it for the upsell variant.
    if (!code && /insufficient.*credit/i.test(message)) {
      code = 'AI_CREDITS_EXHAUSTED';
    }
    enqueue({ type: 'error', message, code, upsellUrl });
    try {
      es.close();
    } catch {
      /* already closed */
    }
    finish();
  };

  const onClose = () => {
    finish();
  };

  es.addEventListener('message', onMessage);
  es.addEventListener('error', onError);
  es.addEventListener('close', onClose);

  // Hook abort signal — closing the ES will fire `onClose`, which will
  // resolve the pending Promise so the iterator returns.
  let abortHandler: (() => void) | null = null;
  if (opts.signal) {
    if (opts.signal.aborted) {
      try {
        es.close();
      } catch {
        /* */
      }
      finish();
    } else {
      abortHandler = () => {
        try {
          es.close();
        } catch {
          /* */
        }
        finish();
      };
      opts.signal.addEventListener('abort', abortHandler);
    }
  }

  try {
    while (true) {
      if (pending.length > 0) {
        const ev = pending.shift()!;
        yield ev;
        // Stop iterating after a terminal frame. The transport may still
        // dispatch a `close` after, but we've already given the consumer
        // what they need.
        if (ev.type === 'done' || ev.type === 'error') return;
        continue;
      }
      if (closed) return;
      await new Promise<void>((resolve) => {
        resolveNext = resolve;
      });
    }
  } finally {
    es.removeAllEventListeners();
    try {
      es.close();
    } catch {
      /* */
    }
    if (opts.signal && abortHandler) {
      opts.signal.removeEventListener('abort', abortHandler);
    }
  }
}
