# sd-email-inbound

Cloudflare Email Worker for `*@simplerdevelopment.com`. Catches inbound mail,
parses MIME, streams attachments to R2, and forwards a JSON payload to the
Next.js API at `/api/email/inbound`. The API dispatches on the recipient
address — `brain+<token>@…` ingests into Company Brain; everything else flows
through the existing AI chat assistant.

## Architecture

```
sender → Cloudflare Email Routing (MX) → this worker
                                          ├─ extracts text + attachments from MIME
                                          ├─ streams attachments to R2 bucket
                                          └─ POSTs JSON (with R2 keys) to
                                             https://simplerdevelopment.com/api/email/inbound
```

`brain_meetings.source_metadata` records the R2 keys so the portal can
display + download attachments later.

## First-time deploy

These steps assume `wrangler` is authenticated (`wrangler login`) against
the Cloudflare account that owns the `simplerdevelopment.com` zone.

```bash
cd workers/email-inbound
npm install

# 1. Create the R2 bucket the worker writes attachments into.
npx wrangler r2 bucket create brain-email-attachments

# 2. Set the shared secret used between this worker and the API. Must match
#    INBOUND_EMAIL_SECRET on the Next.js side.
npx wrangler secret put INBOUND_EMAIL_SECRET

# 3. Deploy the worker.
npx wrangler deploy

# 4. In the Cloudflare dashboard → Email → Email Routing → Routing rules,
#    set the catch-all rule to "Send to a Worker" → sd-email-inbound.
#    (Or via CLI: wrangler email routing rules set-catch-all worker sd-email-inbound)
```

## Updating

```bash
cd workers/email-inbound
npx wrangler deploy        # picks up src/index.ts changes
```

Schema/secret changes that affect the API (e.g. new fields in the JSON
payload) need to ship before the worker version that emits them — otherwise
the API will reject or ignore unknown fields.

## Brain ingestion address per tenant

Each tenant's brain inbox lives at:

    brain+<emailIngestToken>@simplerdevelopment.com

Tokens are auto-generated when a tenant opens `/portal/brain/settings`
for the first time, and surfaced in the **Inbound email** section of that
page with a copy button.

To rotate a tenant's token (revoke old aliases), call
`rotateEmailIngestToken(clientId)` from `lib/brain/profiles.ts` — there's
no UI for this yet.

## Testing locally

The worker can't be tested locally end-to-end because Email Routing only
delivers to deployed workers. To test the API ingest path without going
through Cloudflare:

```bash
TOKEN=$(psql $DATABASE_URL -tAc \
  "SELECT email_ingest_token FROM brain_profiles WHERE client_id = 1")

curl -X POST http://localhost:3000/api/email/inbound \
  -H 'Content-Type: application/json' \
  -d "{
    \"secret\": \"$INBOUND_EMAIL_SECRET\",
    \"from\": \"alice@example.com\",
    \"to\": \"brain+${TOKEN}@simplerdevelopment.com\",
    \"subject\": \"Test meeting\",
    \"body\": \"Discussion notes go here.\",
    \"messageId\": \"<test-$(date +%s)@local>\",
    \"attachments\": []
  }"
```

A `brain_meetings` row should appear with `source = 'email'`.
