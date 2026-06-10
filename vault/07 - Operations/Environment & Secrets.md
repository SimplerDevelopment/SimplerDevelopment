---
type: runbook
domain: operations
status: active
date: 2026-06-09
sources:
  - .env.example
  - lib/ (grep process.env)
  - next.config.ts
  - packages/realtime-server/railway.toml
  - workers/email-inbound/wrangler.toml
---

# Environment & Secrets

> WARNING: `.env.example` is intentionally minimal — it documents only the
> plugin-registry vars and `ANTHROPIC_API_KEY`. The full set of consumed vars
> is much larger. This runbook is the authoritative inventory.

## File precedence (local development)

```
.env.local  (wins — per-developer override, gitignored)
.env        (shared defaults, may contain staging values, gitignored)
```

`drizzle.config.ts` and `scripts/verify-db-target.ts` both load these files with `override: true` on `.env.local` so the local value always beats a staging URL injected by Next.js from `.env`.

Never commit `.env` or `.env.local`.

## Variable inventory

### Core infrastructure

| Variable | Consumed by | How to generate |
|---|---|---|
| `DATABASE_URL` | `drizzle.config.ts`, `lib/db/index.ts`, `packages/realtime-server` | Railway Postgres connection string |
| `NEXTAUTH_SECRET` | NextAuth v5 session signing | `openssl rand -base64 32` |
| `AUTH_SECRET` | NextAuth v5 (alias — same value as `NEXTAUTH_SECRET`) | same as above |
| `NEXTAUTH_URL` | NextAuth redirect base | Set to `https://www.simplerdevelopment.com` in prod |
| `NEXT_PUBLIC_APP_URL` | client-side API calls | `https://www.simplerdevelopment.com` |
| `NEXT_PUBLIC_SITE_URL` | client-side tenant site base URL | `https://simplerdevelopment.com` |
| `NEXT_PUBLIC_URL` | client-side misc | same as `NEXT_PUBLIC_APP_URL` |
| `CRON_SECRET` | `app/api/cron/*` — verifies Vercel cron caller | `openssl rand -base64 32` |
| `ENCRYPTION_KEY` | `lib/encryption.ts` — AES-GCM for sensitive DB columns | `openssl rand -base64 32` |
| `PORTAL_KMS_KEY` | plugin JWT signing keys (`registered_app_signing_keys.secretEncrypted`) | `openssl rand -base64 32` |
| `REVALIDATE_SECRET` | ISR revalidation endpoint | `openssl rand -base64 32` |

### AI / LLM

| Variable | Consumed by | How to generate |
|---|---|---|
| `ANTHROPIC_API_KEY` | `lib/ai/` — Company Brain, plugin runners | Anthropic console |
| `OPENAI_API_KEY` | `lib/ai/` — embeddings, fallback LLM | OpenAI platform |
| `REPLICATE_API_TOKEN` | `lib/ai/` — image generation | replicate.com |
| `CLAUDE_INPUT_COST_PER_MTOK_USD` | cost tracking | Optional float override, e.g. `3.0` |

### Stripe

| Variable | Consumed by | How to generate |
|---|---|---|
| `STRIPE_SECRET_KEY` | `lib/billing/` — charges, subscriptions | Stripe dashboard |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | client-side Stripe.js | Stripe dashboard |

### Email

| Variable | Consumed by | How to generate |
|---|---|---|
| `RESEND_API_KEY` | `lib/email/` — transactional email | resend.com |
| `RESEND_FROM_EMAIL` | sender address | e.g. `noreply@simplerdevelopment.com` |
| `INBOUND_EMAIL_SECRET` | `workers/email-inbound` + `app/api/email/inbound` | `openssl rand -base64 32`; set via `wrangler secret put INBOUND_EMAIL_SECRET` on the worker side |

### Google Workspace

| Variable | Consumed by | How to generate |
|---|---|---|
| `GOOGLE_CLIENT_ID` | OAuth sign-in | Google Cloud Console OAuth 2.0 credentials |
| `GOOGLE_CLIENT_SECRET` | OAuth sign-in | same |
| `GOOGLE_WORKSPACE_CLIENT_ID` | Workspace API (Gmail/Drive watches) | separate service-account OAuth app |
| `GOOGLE_WORKSPACE_CLIENT_SECRET` | Workspace API | same |
| `GOOGLE_WORKSPACE_REDIRECT_URI` | OAuth redirect | must match Google Cloud Console |
| `WORKSPACE_TENANT_SECRETS_KEY` | encrypt per-tenant Workspace tokens at rest | `openssl rand -base64 32` |

### Microsoft / Zoom / GitHub

| Variable | Consumed by | How to generate |
|---|---|---|
| `MICROSOFT_TEAMS_CLIENT_ID` | `lib/integrations/microsoft` | Azure AD app registration |
| `MICROSOFT_TEAMS_CLIENT_SECRET` | same | same |
| `MICROSOFT_TEAMS_TENANT` | same | Azure tenant ID |
| `ZOOM_CLIENT_ID` | `lib/integrations/zoom` | Zoom marketplace app |
| `ZOOM_CLIENT_SECRET` | same | same |
| `GITHUB_APP_ID` | site provisioner | GitHub App settings |
| `GITHUB_APP_INSTALLATION_ID` | site provisioner | GitHub App installation |
| `GITHUB_APP_PRIVATE_KEY` | site provisioner | GitHub App private key (PEM) |
| `GITHUB_TEMPLATE_REPO` | site provisioner | e.g. `org/template-repo` |

### Cloudflare / Vercel platform

| Variable | Consumed by | How to generate |
|---|---|---|
| `CLOUDFLARE_API_TOKEN` | `lib/website-provisioner.ts` — DNS record management | Cloudflare dashboard token |
| `CLOUDFLARE_ZONE_ID` | same | Cloudflare dashboard |
| `VERCEL_API_TOKEN` | platform provisioning | Vercel dashboard |
| `VERCEL_TEAM_ID` | platform provisioning | Vercel team settings |
| `PLATFORM_VERCEL_PROJECT_ID` | platform provisioning | Vercel project ID |

### Realtime server (Railway)

| Variable | Set on | How to generate |
|---|---|---|
| `REALTIME_INTERNAL_URL` | Next.js app (Vercel) | Railway public URL of `packages/realtime-server` |
| `REALTIME_INTERNAL_SECRET` | Next.js app + Railway service | `openssl rand -base64 32` (must match both sides) |
| `NEXT_PUBLIC_REALTIME_URL` | client-side WebSocket | same Railway public URL |
| `REALTIME_JWT_SECRET` | Railway service only | `openssl rand -base64 32` (shared between app and realtime server) |

### e-Sign / misc

| Variable | Consumed by | How to generate |
|---|---|---|
| `DROPBOX_SIGN_API_KEY` | `lib/esign/` — HelloSign/Dropbox Sign | Dropbox Sign dashboard |
| `DROPBOX_SIGN_CLIENT_ID` | same | same |
| `DROPBOX_SIGN_WEBHOOK_SECRET` | webhook verification | Dropbox Sign dashboard |
| `OAUTH_STATE_SECRET` | OAuth CSRF state token | `openssl rand -base64 32` |
| `CHAT_TOKEN_SECRET` | portal chat JWT | `openssl rand -base64 32` |
| `NOTIFY_UNSUBSCRIBE_SECRET` | email unsubscribe HMAC | `openssl rand -base64 32` |

### Sentry (optional)

| Variable | Consumed by | Notes |
|---|---|---|
| `SENTRY_AUTH_TOKEN` | `next.config.ts` — source map upload | If unset, Sentry plugin is skipped silently |
| `SENTRY_ORG` | same | Sentry org slug |
| `SENTRY_PROJECT` | same | Sentry project slug |

### Dev/test bypasses (never set in production)

| Variable | Effect |
|---|---|
| `PLUGINS_ENTITLEMENT_BYPASS=1` | skip entitlement checks |
| `PLUGINS_CALLBACK_ORIGIN_BYPASS=1` | skip Origin check on plugin callbacks |
| `BRAIN_ENTITLEMENT_BYPASS=1` | skip brain feature gate |
| `AGENTIC_OS_EXECUTOR_ENABLED=1` | enable agentic OS executor |
| `MCP_TELEMETRY_DISABLED=1` | suppress MCP telemetry |

## Adding a new secret

1. Generate the value locally.
2. Add to `.env.local` for local dev.
3. Add to Vercel project environment variables (staging + production environments).
4. If consumed by the Railway realtime server, add in the Railway service environment panel.
5. If consumed by the Cloudflare email worker, run `wrangler secret put VAR_NAME` from `workers/email-inbound/`.
6. Document it in this table.
