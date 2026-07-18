# Live Chat API (Public)

These endpoints power the visitor-facing side of the SimplerDevelopment live chat widget. Use them to start a conversation session, send messages as a visitor, and subscribe to a real-time stream of agent replies. All three endpoints are public — no platform API key is required — but message and stream calls require the short-lived `ephemeralToken` you receive when starting a conversation.

**Base URL:** `https://<your-tenant-domain>/api/public/chat`

**Authentication:** These are public endpoints. See [authentication.md](./authentication.md) for platform-level auth. The visitor-scoped `ephemeralToken` (returned by `POST /start`) is the only credential used here — it is scoped to a single conversation and cannot be used to access any other tenant's data.

---

## Endpoints

### `POST /api/public/chat/start`

Start (or resume) a visitor conversation for a given chat widget.

The call is idempotent on `(widgetId, visitorId)`: if the visitor already has an open or assigned conversation on this widget, the existing conversation is returned and contact details are patched if they were previously missing.

- **Auth:** Public — no API key needed.

**Request body**

| Field | Type | Required | Description |
|---|---|---|---|
| `widgetId` | `number \| string` | Yes | ID of the chat widget, as configured in the portal. |
| `visitorId` | `string` | Yes | Stable, client-generated visitor identifier (max 64 chars). You are responsible for generating and persisting this (e.g. `localStorage` UUID). |
| `name` | `string` | No | Visitor's display name (max 255 chars). Stored on first supply; ignored if the conversation already has a name. |
| `email` | `string` | No | Visitor's email address (max 255 chars). Stored on first supply; ignored if the conversation already has an email. |

```json
{
  "widgetId": 42,
  "visitorId": "anon-a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "name": "Jane Smith",
  "email": "jane@example.com"
}
```

**Response**

```json
{
  "success": true,
  "data": {
    "conversationId": 1017,
    "widgetId": 42,
    "ephemeralToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9…",
    "greetingMessage": "Hi there! How can we help you today?",
    "primaryColor": "#6366f1",
    "position": "bottom-right",
    "awayMessage": "We're away right now — leave a message and we'll be in touch soon."
  }
}
```

Store `conversationId` and `ephemeralToken` — both are required for all subsequent calls.

**Errors**

| Status | Message | Cause |
|---|---|---|
| `400` | `Invalid JSON body` | Request body could not be parsed as JSON. |
| `400` | `widgetId is required` | `widgetId` is missing, non-numeric, or `<= 0`. |
| `400` | `visitorId is required` | `visitorId` is missing, empty, or longer than 64 chars. |
| `404` | `Widget not available` | No widget found with that ID, or the widget is disabled. |

**curl example**

```bash
curl -X POST https://<your-tenant-domain>/api/public/chat/start \
  -H "Content-Type: application/json" \
  -d '{
    "widgetId": 42,
    "visitorId": "anon-a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "name": "Jane Smith",
    "email": "jane@example.com"
  }'
```

---

### `POST /api/public/chat/messages`

Send a message from the visitor into the conversation.

- **Auth:** Ephemeral token — pass the `ephemeralToken` from `POST /start` in the request body.

**Request body**

| Field | Type | Required | Description |
|---|---|---|---|
| `conversationId` | `number` | Yes | ID returned by `POST /start`. |
| `ephemeralToken` | `string` | Yes | Token returned by `POST /start`. Must match the `conversationId` — mismatches are rejected. |
| `body` | `string` | Yes | Message text. Max 4,000 characters. |

```json
{
  "conversationId": 1017,
  "ephemeralToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9…",
  "body": "Hi, I have a question about my recent invoice."
}
```

**Response**

Returns the inserted message record.

```json
{
  "success": true,
  "data": {
    "id": 8821,
    "conversationId": 1017,
    "clientId": 7,
    "authorKind": "visitor",
    "authorName": "Jane Smith",
    "body": "Hi, I have a question about my recent invoice.",
    "occurredAt": "2026-06-04T12:34:56.000Z"
  }
}
```

**Errors**

| Status | Message | Cause |
|---|---|---|
| `400` | `Invalid JSON body` | Request body could not be parsed as JSON. |
| `400` | `Message body is required` | `body` is missing or blank after trimming. |
| `401` | `Invalid token` | `ephemeralToken` is missing, expired, or malformed. |
| `401` | `Token / conversation mismatch` | The token was valid but was issued for a different conversation. |
| `404` | `Conversation not found` | No conversation exists for the verified `conversationId`. |
| `409` | `Conversation is closed` | The conversation has been closed by an agent; no more messages can be sent. |
| `413` | `Message too long` | `body` exceeds 4,000 characters. |
| `429` | `Too many messages, slow down` | Visitor-level rate limit exceeded. Respect the `Retry-After` response header (seconds) before retrying. |

**curl example**

```bash
curl -X POST https://<your-tenant-domain>/api/public/chat/messages \
  -H "Content-Type: application/json" \
  -d '{
    "conversationId": 1017,
    "ephemeralToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9…",
    "body": "Hi, I have a question about my recent invoice."
  }'
```

---

### `GET /api/public/chat/stream`

Open a Server-Sent Events (SSE) stream to receive real-time messages from the agent.

Connect once after calling `POST /start` and keep the connection open. The server pushes each event as the agent replies. Most browsers handle reconnection automatically via the `EventSource` API; if your client disconnects, simply re-open the stream.

> **Node runtime only.** This endpoint runs on Node (not Edge) because the underlying Postgres `LISTEN/NOTIFY` subscription requires a persistent socket.

- **Auth:** Ephemeral token — pass as the `token` query parameter.

**Query parameters**

| Name | Type | Required | Description |
|---|---|---|---|
| `conversationId` | `number` | Yes | The conversation to subscribe to. |
| `token` | `string` | Yes | The `ephemeralToken` from `POST /start`. Must match `conversationId`. |

**Response headers**

```
Content-Type: text/event-stream
Cache-Control: no-cache, no-transform
Connection: keep-alive
X-Accel-Buffering: no
```

**SSE event format**

Each event follows the standard SSE wire format:

```
event: <kind>
data: <JSON payload>

```

**`hello` event** — sent immediately on connection to confirm the stream is live.

```
event: hello
data: {"conversationId":1017}

```

**`message` event** — sent each time the agent (or anyone else) posts to the conversation. The top-level `kind` field drives the SSE `event:` line; message fields are nested under `data`.

```
event: message
data: {
  "kind": "message",
  "eventId": "lp3k2abc-xy4z9w",
  "occurredAt": "2026-06-04T12:35:10.000Z",
  "data": {
    "id": 8834,
    "conversationId": 1017,
    "authorKind": "agent",
    "authorName": "Support Team",
    "body": "Happy to help — can you share your order number?",
    "occurredAt": "2026-06-04T12:35:10.000Z"
  }
}

```

**Heartbeat** — a comment line (`: ping`) is sent every 25 seconds to prevent proxies and load balancers from dropping idle connections. The `EventSource` API silently ignores comment lines.

```
: ping

```

**Errors**

| Status | Body | Cause |
|---|---|---|
| `401` | `Unauthorized` | `token` is missing, invalid, or does not match `conversationId`. |
| `404` | `Not found` | No conversation found for the verified `conversationId`. |

**Browser `EventSource` example**

```javascript
const conversationId = 1017;
const token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9…";
const url = `https://<your-tenant-domain>/api/public/chat/stream` +
  `?conversationId=${conversationId}&token=${encodeURIComponent(token)}`;

const es = new EventSource(url);

es.addEventListener("hello", (e) => {
  console.log("Stream connected:", JSON.parse(e.data));
});

es.addEventListener("message", (e) => {
  const msg = JSON.parse(e.data);
  // msg.kind === "message"; message fields are under msg.data
  console.log(`[${msg.data.authorKind}] ${msg.data.body}`);
});

es.onerror = () => {
  // EventSource reconnects automatically on transient failures.
};
```

**curl example**

```bash
curl -N "https://<your-tenant-domain>/api/public/chat/stream?conversationId=1017&token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9…"
```
