# Enterprise Workspace Onboarding Runbook

> Audience: SimplerDevelopment ops/admin team, working with an enterprise client's Google Workspace admin.
>
> Use this when: a new enterprise-tier client is going live with the Workspace integration (Brain / CRM features). Standard-tier clients use MX-based email ingestion and **do not** follow this runbook.
>
> Time required: 30–60 minutes, with the client's Workspace admin available on a screen-share.

---

## Why this runbook exists

The Workspace integration uses one of two tiers:

| Tier | Email source | OAuth client | Verification |
|---|---|---|---|
| **Standard** | MX → Cloudflare Workers (existing) | none | none |
| **Enterprise** | Gmail API per-user OAuth | **client owns** the OAuth client in their own GCP project | Internal to client's org → no Google CASA audit |

The enterprise tier exists because **standard tier can only see inbound to SimplerDevelopment-controlled domains**. To track sent mail, multi-user Workspace activity, and history across an enterprise client's own domain, that client must connect their own Workspace.

We deliberately avoid the "shared OAuth client + Google verification" path because it requires CASA Tier 2 (third-party security audit, $5–15k/year, 2–3 month verification timeline). By having each enterprise tenant create their own OAuth client under their own Workspace, each consent screen is **Internal** to that org — Google does not require verification for Internal apps.

The cost we pay: a 30–60 min onboarding procedure per enterprise client (this runbook).

---

## What you'll have at the end

- A new GCP project under the client's Workspace org
- 5 APIs enabled (Gmail, Calendar, Drive, People, Pub/Sub) + Picker (for Phase 3 UI)
- An OAuth consent screen marked **Internal** to the client's Workspace
- An OAuth client configured for the client's portal subdomain
- A Pub/Sub topic + push subscription pointing at SimplerDevelopment's webhook with a unique verification token
- A row in `google_workspace_tenant_credentials` linking it all to the client

The client's individual employees can then connect their own `@theirdomain.com` accounts via the standard portal "Connect Workspace" flow, which will mint refresh tokens against **their own org's OAuth client** (not SimplerDevelopment's).

---

## Pre-onboarding checklist

Before you start the call:

- [ ] Confirm the client is on the **enterprise tier** in their billing/contract record
- [ ] Confirm their portal subdomain is live (e.g., `noraanger.simplerdevelopment.com` resolves)
- [ ] Confirm their Workspace admin has **Super Admin** role in their Google Workspace (required to set up the consent screen as Internal)
- [ ] Confirm their org has billing enabled in GCP, or they have a billing account they can attach to a new project
- [ ] Have a 32-byte hex Pub/Sub verification token ready: `openssl rand -hex 32`
- [ ] Have the client's portal `siteId` from the `clients` table (you'll need it for the credentials row)

---

## Step 1 — Create the GCP project (5 min)

The client's admin does this in **their own Google Cloud Console** while you watch.

1. Open https://console.cloud.google.com/
2. Top bar → project picker → **New Project**
3. **Project name:** `<theirslug>-simplerdev-workspace` (e.g., `noraanger-simplerdev-workspace`)
4. **Organization:** their Workspace org. **CRITICAL — must NOT be "No organization."** If "No organization" is the only option, the admin's Google account isn't in a Workspace tenant and Internal consent won't be possible.
5. **Billing account:** any active billing account in their org (typical Workspace integration usage stays within free-tier quotas)
6. Click **Create**, wait ~30s for the project to provision, switch to it in the project picker.

Record:
- Project ID (string, like `noraanger-simplerdev-workspace-462913`)
- Project Number (numeric, like `123456789012`)
- Owning org (their domain, like `noraanger.com`)

## Step 2 — Enable APIs (3 min)

In the new project: **APIs & Services → Library**. Enable each (search, click, **Enable**, repeat):

1. Gmail API
2. Google Calendar API
3. Google Drive API
4. People API (Contacts)
5. Cloud Pub/Sub API
6. Google Picker API

Verify under **APIs & Services → Enabled APIs**: all six listed.

## Step 3 — Configure OAuth consent screen as Internal (5 min)

**APIs & Services → OAuth consent screen.**

1. **User type:** **Internal** ← absolutely critical. If the option is greyed out, the project is not under a Workspace org — go back to Step 1.
2. **App name:** `<Their Company> Workspace Integration` (or whatever they prefer their employees see — this is what shows on the consent screen for their team)
3. **User support email:** the admin's email or a shared mailbox at their org
4. **App logo:** optional, can skip
5. **Application home page:** their portal URL (e.g., `https://noraanger.simplerdevelopment.com`)
6. **Application privacy policy:** their privacy policy URL (any URL on their domain works for Internal apps)
7. **Application terms of service:** their TOS URL (same as above)
8. **Authorized domains:** their primary domain (e.g., `noraanger.com`) AND `simplerdevelopment.com` (because the redirect URI is on this domain)
9. **Developer contact:** same as user support email
10. Click **Save and Continue**

On the **Scopes** screen, click **Add or Remove Scopes** and check each:

| Scope | Sensitive? |
|---|---|
| `openid` | No |
| `https://www.googleapis.com/auth/userinfo.email` | No |
| `https://www.googleapis.com/auth/userinfo.profile` | No |
| `https://www.googleapis.com/auth/gmail.readonly` | **Yes** |
| `https://www.googleapis.com/auth/calendar.readonly` | **Yes** |
| `https://www.googleapis.com/auth/calendar.events.readonly` | **Yes** |
| `https://www.googleapis.com/auth/drive` | **Yes (restricted)** |
| `https://www.googleapis.com/auth/drive.metadata.readonly` | **Yes** |
| `https://www.googleapis.com/auth/contacts.readonly` | **Yes** |

Click **Update** → **Save and Continue** through the remaining screens.

Verify: the consent screen summary shows **User Type = Internal** and all 9 scopes listed. There should be **no** "verification needed" banner. If you see one, the user type is not Internal — fix Step 1.

## Step 4 — Create OAuth client (3 min)

**APIs & Services → Credentials → Create Credentials → OAuth client ID.**

- **Application type:** Web application
- **Name:** `<Their Company> SimplerDev Portal`
- **Authorized JavaScript origins:** leave empty
- **Authorized redirect URIs:** add ONE:
  - `https://<their-subdomain>.simplerdevelopment.com/api/portal/integrations/google/callback`
- Click **Create**

A modal shows the **Client ID** and **Client Secret**. Copy both **immediately** to a secure channel (1Password shared vault, encrypted Slack, whatever you use). You will need them in Step 7.

The Client ID looks like `123456789012-abc...xyz.apps.googleusercontent.com` and is non-secret. The Client Secret looks like `GOCSPX-` followed by 28 chars and **must be treated as a password.**

## Step 5 — Create Pub/Sub topic + IAM grant (3 min)

**Pub/Sub → Topics → Create Topic.**

- **Topic ID:** `gmail-watch`
- **Add a default subscription:** UNCHECK
- Click **Create**

The full topic name is now `projects/<their-project-id>/topics/gmail-watch`. Copy it.

Grant Gmail's push service account permission to publish:

1. Click the new `gmail-watch` topic → **Permissions** tab → **Grant Access**
2. **New principal:** `gmail-api-push@system.gserviceaccount.com`
3. **Role:** Pub/Sub Publisher (`roles/pubsub.publisher`)
4. Save

If this is rejected with **"User ... is not in permitted organization"**, the client's org has the same `iam.allowedPolicyMemberDomains` org policy SimplerDevelopment did. Their admin must override at the project level: Cloud Console → IAM & Admin → Organization Policies → "Domain restricted sharing" → select the project → "Manage Policy" → "Override parent's policy" → "Replace" with "Allow all" → Save. Then retry.

## Step 6 — Create push subscription (3 min)

Same `gmail-watch` topic → **Create Subscription**.

- **Subscription ID:** `gmail-watch-prod`
- **Delivery type:** Push
- **Endpoint URL:** `https://google-webhook.simplerdevelopment.com/pubsub?token=<THE_VERIFICATION_TOKEN_YOU_GENERATED_IN_PREP>`
  - Use the 32-byte hex token you ran `openssl rand -hex 32` to generate
  - This token is how SimplerDevelopment's webhook authenticates the push and resolves it to this specific tenant
- **Enable authentication:** ON
- **Service account:** create a new SA in their project named `pubsub-push` (Pub/Sub Push). Audience: `https://google-webhook.simplerdevelopment.com`
- **Acknowledgement deadline:** 60 seconds
- **Message retention:** 7 days
- Save

Note: the SA they just created needs `roles/iam.serviceAccountTokenCreator` granted to the Pub/Sub service agent (`service-<their-project-number>@gcp-sa-pubsub.iam.gserviceaccount.com`). GCP usually does this automatically when you create the subscription, but if Pub/Sub fails to deliver, check this binding.

## Step 7 — File credentials in SimplerDevelopment (5 min)

Open SimplerDevelopment portal admin → Clients → \<client name\> → Workspace Integration tab → **Configure Enterprise Credentials** (or insert directly via SQL until the admin UI ships).

The `oauth_client_secret_encrypted` column stores ciphertext, NOT the raw secret from the OAuth client modal. Run the secret through `encryptSecret()` from `lib/crypto/secrets.ts` first — quickest path is a one-off Node REPL:

```bash
# from the repo root
node -e "
require('dotenv').config();
const { encryptSecret } = require('./lib/crypto/secrets.ts'); // or transpile/use tsx
console.log(encryptSecret('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4'));
"
```

…then paste the resulting base64 blob as `oauth_client_secret_encrypted`:

```sql
INSERT INTO google_workspace_tenant_credentials (
  client_id,
  google_project_id,
  oauth_client_id,
  oauth_client_secret_encrypted,
  oauth_redirect_uri,
  pubsub_topic,
  pubsub_verification_token,
  consent_screen_user_type,
  status,
  configured_by_user_id,
  notes
) VALUES (
  <their_clients_id>,
  '<their-project-id>',                                    -- e.g., 'noraanger-simplerdev-workspace-462913'
  '<oauth_client_id>',                                     -- ends in .apps.googleusercontent.com
  '<base64_ciphertext>',                                   -- output of encryptSecret('GOCSPX-…')
  'https://<their-subdomain>.simplerdevelopment.com/api/portal/integrations/google/callback',
  'projects/<their-project-id>/topics/gmail-watch',
  '<verification_token>',                                  -- the openssl rand -hex 32 from prep (plaintext by design)
  'internal',
  'configured',
  <your_admin_user_id>,
  'Onboarded with <admin name> on <date>. <any deviations>'
);
```

> ⚠️ **Pre-flight checks before INSERT:**
> - `WORKSPACE_TENANT_SECRETS_KEY` is set in the env where you're encrypting AND in the running portal env (otherwise reads will fail with "wrong key" auth-tag errors)
> - The base64 blob you're inserting was produced from the env key currently in use (if you rotate the key, the row is unrecoverable — old ciphertext can't be decrypted with a new key)
> - The plaintext OAuth secret is destroyed from your shell history after the encrypt step (`history -c` or close the terminal)

## Step 8 — Smoke test (5 min)

With the row in place, validate end-to-end:

1. Build the authorize URL using the tenant's OAuth client ID and redirect URI (substitute their values into the same template SimplerDevelopment used during platform smoke-test).
2. Have the admin (or a test user in their org) sign in and grant consent.
3. Confirm the consent screen shows **their company name** (not "SimplerDevelopment Portal") and all 9 scopes.
4. After redirect, copy the `code=…` and exchange via curl using the tenant's CLIENT_ID + SECRET. Confirm the response contains a `refresh_token` starting with `1//` and the granted `scope` includes all 9.
5. If green: update the row to `status='active'`.
6. If red: status stays `configured`, debug from the error code (most common cause: redirect URI in OAuth client doesn't match exactly what's in `oauth_redirect_uri` — trailing slash, http vs https, subdomain typo).

The tenant is now live. Their employees can use **Connect Workspace** in the portal and the per-tenant OAuth flow will use this row's credentials.

---

## Offboarding

When a client downgrades or churns:

1. Mark `status='revoked'` (do not delete — refresh tokens may still be in `google_workspace_user_connections` rows that need to be revoked separately)
2. For every related `google_workspace_user_connections.refresh_token`, call `oauth2.revokeToken()` against **their** OAuth client to invalidate the grants client-side
3. Notify the client's admin to delete their GCP project (we can't do this — it's their project)

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| "Access blocked: The owner of this app has not approved your account" | Consent screen is External, not Internal | Re-do Step 3, set User Type = Internal |
| "redirect_uri_mismatch" during OAuth | URI in OAuth client ≠ what we pass | Make sure the redirect URI in Step 4 exactly matches the value in `oauth_redirect_uri` |
| "invalid_client" during code exchange | CLIENT_ID or CLIENT_SECRET wrong | Check the values in `google_workspace_tenant_credentials` — most common: secret got truncated/has whitespace |
| Pub/Sub `add-iam-policy-binding` rejected | Org policy `iam.allowedPolicyMemberDomains` blocks system SAs | See Step 5 — apply project-level override |
| Push deliveries failing with 403 from webhook | Token in subscription URL doesn't match `pubsub_verification_token` in DB | Recreate the subscription with the correct token; or update the DB row to match what's in the subscription URL |
| Refresh token starts with `1/0` instead of `1//` | Token was issued in External-Testing mode, not Internal | Confirm consent screen User Type = Internal; refresh tokens issued in Testing mode expire after 7 days |

---

## Appendix — Why each enterprise tenant has their own GCP project

| Alternative | Why we don't use it |
|---|---|
| One shared GCP project + External consent + CASA verification | $5–15k/year for CASA Tier 2 audit; 2–3 month verification timeline; SD becomes target with concentrated blast radius |
| One shared GCP project + Internal consent | Internal apps can only be used by users in the *project's* owning Workspace org. Excludes every client whose users aren't `@simplerdevelopment.com`. |
| Per-tenant deployments | N times the operational cost (DBs, deploys, monitoring); useful only as an enterprise dedicated-tier upsell |
| `<client>@simplerdevelopment.com` shell accounts | The mailbox we'd OAuth-connect would be empty — the actual email is at `@theirdomain.com` |

The "per-tenant GCP, single multi-tenant deploy" model gives:
- Real security isolation (each tenant owns their OAuth client + refresh tokens, can revoke unilaterally)
- No Google verification overhead
- Single SimplerDevelopment codebase + single deploy
- Single shared webhook with token-based tenant routing
