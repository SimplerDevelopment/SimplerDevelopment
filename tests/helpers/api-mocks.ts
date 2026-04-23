/**
 * MSW request handlers for third-party APIs that server code might call during
 * integration tests. Extend as new call sites appear.
 *
 * Rule: every outbound HTTP call from the app during integration-api tests must
 * either be mocked here OR deliberately routed through the test harness
 * (e.g. a local webhook sink). Unhandled requests are treated as test failures
 * (see `onUnhandledRequest: 'error'` in tests/setup-api.ts).
 */
import { http, HttpResponse, passthrough } from 'msw';

// ── Loopback pass-through ───────────────────────────────────────────────
// Tests that spin up a local HTTP sink (e.g. webhook-sink) POST to 127.0.0.1.
// Those calls must reach the real sink, not be intercepted by MSW.
// Regex is used because MSW path-to-regexp doesn't parse `:*` port wildcards.
const loopbackPassthrough = [
  http.all(/^http:\/\/127\.0\.0\.1:\d+\//, () => passthrough()),
  http.all(/^http:\/\/localhost:\d+\//, () => passthrough()),
];

// ── Stripe ───────────────────────────────────────────────────────────────
const stripeHandlers = [
  http.post('https://api.stripe.com/v1/customers', () =>
    HttpResponse.json({ id: 'cus_test_mock', object: 'customer' }),
  ),
  http.post('https://api.stripe.com/v1/checkout/sessions', () =>
    HttpResponse.json({ id: 'cs_test_mock', url: 'https://stripe.test/session/cs_test_mock' }),
  ),
  http.post('https://api.stripe.com/v1/subscriptions', () =>
    HttpResponse.json({ id: 'sub_test_mock', status: 'active' }),
  ),
];

// ── Resend (email) ───────────────────────────────────────────────────────
const resendHandlers = [
  http.post('https://api.resend.com/emails', () =>
    HttpResponse.json({ id: 'resend_mock_' + Date.now() }),
  ),
  http.post('https://api.resend.com/batch', () =>
    HttpResponse.json({ data: [{ id: 'resend_mock_batch' }] }),
  ),
];

// ── Google (OAuth, Calendar) ─────────────────────────────────────────────
const googleHandlers = [
  http.post('https://oauth2.googleapis.com/token', () =>
    HttpResponse.json({ access_token: 'ya29.mock', refresh_token: 'rt.mock', expires_in: 3600 }),
  ),
  http.get('https://www.googleapis.com/calendar/v3/users/me/calendarList', () =>
    HttpResponse.json({ items: [] }),
  ),
];

// ── Zoom ─────────────────────────────────────────────────────────────────
const zoomHandlers = [
  http.post('https://zoom.us/oauth/token', () =>
    HttpResponse.json({ access_token: 'zoom.mock', refresh_token: 'zoom.rt.mock', expires_in: 3600 }),
  ),
];

// ── S3 upload endpoint (only for test mode — real uploads go through @aws-sdk) ──
const s3Handlers: typeof stripeHandlers = [];

// ── Anthropic / OpenAI (keep tests deterministic) ────────────────────────
const llmHandlers = [
  http.post('https://api.anthropic.com/v1/messages', () =>
    HttpResponse.json({
      id: 'msg_mock',
      type: 'message',
      role: 'assistant',
      content: [{ type: 'text', text: 'mock response' }],
      model: 'claude-test-mock',
      stop_reason: 'end_turn',
      usage: { input_tokens: 1, output_tokens: 1 },
    }),
  ),
  http.post('https://api.openai.com/v1/chat/completions', () =>
    HttpResponse.json({
      id: 'chatcmpl_mock',
      object: 'chat.completion',
      choices: [{ index: 0, message: { role: 'assistant', content: 'mock' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    }),
  ),
];

export const apiMocks = [
  ...loopbackPassthrough,   // must come before matchers that could shadow
  ...stripeHandlers,
  ...resendHandlers,
  ...googleHandlers,
  ...zoomHandlers,
  ...s3Handlers,
  ...llmHandlers,
];
