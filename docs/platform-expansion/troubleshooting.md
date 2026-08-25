# Troubleshooting

Operational runbook for the platform expansion.

## Migrations (the sharpest edge)

- `bun run db:generate` emits the migration for `lib/db/schema/channels.ts` and
  the `chat.ts` extension. **Never hand-edit `drizzle/*.sql`.**
- Vercel deploys do **not** run migrations — hand-apply the generated SQL to
  metro before merging to `main` (see `lib/db/CLAUDE.md`).
- The chat schema change drops `chat_widgets`-era `NOT NULL`s on
  `chat_conversations.widgetId`/`visitorId`; verify the generated SQL is guarded
  and re-runnable before applying.

## Environment variables (new)

- `WORKSPACE_TENANT_SECRETS_KEY` — 32-byte hex (AES-256-GCM key) for channel
  credentials. Generate with `openssl rand -hex 32`.
- `META_APP_ID`, `META_APP_SECRET`, `META_WEBHOOK_VERIFY_TOKEN` — Phase 6–8
  (Meta Cloud API / Messenger / Instagram).
- `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN` — Phase 6.
- `RESEND_API_KEY` — already used for email.

## Channel connection states

| State | Meaning | Recovery |
|---|---|---|
| `incomplete` | Missing credentials/config | Complete the connection setup |
| `connected` | Healthy | — |
| `token_expired` | OAuth/API token expired | Re-authenticate (Meta OAuth) |
| `error` | Last operation failed | Inspect `lastErrorCode`/`lastErrorAt` |
| `disconnected` | Explicitly disconnected | Reconnect |

## Webhooks

- A duplicate inbound message (same `externalMessageId`) returns `duplicate`
  and writes nothing — this is correct, not a bug.
- If inbound messages never arrive: check webhook signature verification
  (`X-Hub-Signature-256`) and that the connection is `connected`.

## Outbox

- Rows stuck in `queued`/`retrying`: the drain cron is responsible for
  `nextAttemptAt <= now()` rows. If it is not running (serverless cold start),
  the row will be picked up on the next cron tick.
- `failed` rows are dead-lettered after `maxAttempts`; inspect `lastError`.

## Gateway denials

- `consent_opt_out` — contact opted out; do not send.
- `provider_window` — outside the provider reply window; send via approved
  template or wait for the contact to message again.
- `business_hours` — outside tenant hours for a cold/marketing send.
- `suppressed` — tenant-level suppression.
- `unsupported_media` — channel can't carry media.

## Cross-tenant

If a route returns another tenant's data, that is a leak: stop, fix the missing
`clientId` filter, and add a `bun test:tenancy` regression before merging.
