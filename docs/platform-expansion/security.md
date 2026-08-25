# Security

Security controls for the platform expansion, mapped to the patterns that
already exist in the codebase.

## Multi-tenant isolation

- Every new table is keyed by `clientId`; queries filter on it.
- The gateway derives the tenant from the **connection**, never from a
  `clientId` supplied by the request (`findConnectionById`).
- Cross-tenant access fails closed; verified by the tenancy suite
  (`bun test:tenancy`).

## Server-side authorization

- MCP tools carry scope guards (`requireScope`); new omnichannel/agent/sequence/
  portal tools follow `lib/mcp/CLAUDE.md` (handler + schema + scope in lockstep).
- Agent tool grants are enforced server-side (see `agents.md`); agents cannot
  reach SQL.
- Destructive / money / discount / mass-cancel / sensitive-data actions require
  approval by default (autonomy levels).

## Credentials & secrets

- Channel credentials live in `channel_connections.encryptedCredentials`
  (AES-256-GCM via the `encryptedText` column type + `lib/crypto/secrets.ts`).
- Secrets are never selected for a client response — strip the field before
  serialization.

## Webhooks

- Meta webhooks verify `X-Hub-Signature-256`; the verification pattern mirrors
  Google Drive `driveChannelToken` / Microsoft `subscriptionClientState`.
- Every inbound webhook is idempotent (unique `(connectionId, externalMessageId)`).
- Webhook handlers must respond `200` fast and offload work to the outbox/cron.

## Input & transport

- SSRF: `lib/ssrf-guard.ts` for any outbound URL fetch (media proxy).
- MIME validation + file-size limits on media uploads; signed URLs for downloads.
- Rate limits: `@upstash/ratelimit` + `lib/chat/rate-limit.ts`.
- Output escaping on all rendered message content.

## Audit & consent

- Critical actions (handoff, portal login, sequence stop, connection changes)
  are logged with `actorType (human|agent|automation|system)`, `action`,
  `resourceType`, `resourceId`, `before`/`after`. No secrets in audit rows.
- `channel_consent` records opt-in/opt-out with `source` + `policyVersion`; the
  outbound path consults it before any send. Sales sequences respect it
  (no spam).
- GDPR: the Customer Portal exposes export/delete/consent surfaces where
  applicable; integration with existing retention/access-log mechanisms.
