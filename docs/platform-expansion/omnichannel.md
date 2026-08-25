# Omnichannel

## Status

**Implemented (Phase 2–3 foundation):**

- `lib/db/schema/channels.ts` — `channel_connections`, `contact_identities`,
  `suggested_merges`, `channel_consent`, `channel_outbox`.
- `lib/db/schema/chat.ts` — `chat_conversations`/`chat_messages` extended to the
  unified model (channel, provider, connectionId, contactId, external ids,
  direction, messageType, media, status, metadata, timestamps).
- `lib/channels/` — Channel Gateway:
  - `types.ts` — `ChannelAdapter`, `NormalizedMessage`, capabilities, identities.
  - `capabilities.ts` — per-provider capability table + `supportsAll`.
  - `policies.ts` — `ChannelPolicyEngine` (opt-out, suppression, provider
    window/template, business hours, media capability).
  - `idempotency.ts` — identity normalization (E.164 / email) + idempotency keys.
  - `gateway.ts` — `ChannelGateway.processInbound` / `.send` with injected repos.
  - `adapters/` — registry + reference `WebChatAdapter`.

**Pending (Phase 6–8):** real Meta adapters (`meta-whatsapp`,
`meta-instagram`, `meta-messenger`) and the email (`resend`) adapter. They are
registered as fail-closed `PendingAdapter`s until wired to the Cloud API /
Messenger / Instagram / Resend SDKs.

## The unified message model

One message shape across all channels:

```
channel · provider · connectionId · externalConversationId · externalMessageId
direction (inbound|outbound) · senderIdentity · recipientIdentity
messageType (text|image|audio|video|document|location|contact|button|
             interactive|reaction|template|system)
text · media[] · replyToExternalMessageId · status · metadata
sentAt · receivedAt · deliveredAt · readAt · failedAt
```

`chat_conversations` + `chat_messages` are the store. WebChat keeps
`widgetId`/`visitorId`; WhatsApp/Instagram/Messenger set `channel` +
`externalConversationId` + `contactId`; email uses `crm_email_messages`
for the thread and the same conversation for the inbox.

## Contact resolution

`contact_identities` maps `(kind, value)` → `crm_contacts.id`, scoped by
`clientId`, unique on `(clientId, kind, value)`. Kinds: `phone | email |
whatsapp | instagram | facebook | webchat`. Resolution normalizes phone to
E.164 and email to lowercase (`lib/channels/idempotency.ts`). Never merge two
contacts automatically — weak evidence only creates a `suggested_merges` row for
manual accept/reject.

## Idempotency

- Inbound: unique `(connectionId, externalMessageId)` on `chat_messages`.
  `processInbound` returns `duplicate` and performs no writes on a re-delivery.
- Outbound: `channel_outbox` unique `(connectionId, externalMessageId)`; a retry
  updates the same row (never inserts a second one).

## Outbox

`channel_outbox` states: `queued | processing | sent | delivered | read |
retrying | failed`. A cron (to be added) drains `queued/retrying` rows whose
`nextAttemptAt <= now()` with exponential backoff and a `maxAttempts` cap;
terminal failures are dead-lettered with a persisted `lastError`.

## Policies

`evaluatePolicy` gates every send in a fixed order: consent opt-out → tenant
suppression → provider window/template → business hours → media capability.
The caller supplies *facts* (`withinReplyWindow`, `withinBusinessHours`); the
engine makes the decision. The LLM never decides sendability.
