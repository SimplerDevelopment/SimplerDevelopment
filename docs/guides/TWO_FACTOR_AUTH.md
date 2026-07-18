# Two-Factor Authentication (2FA / TOTP)

Authenticator-app two-factor auth for the **credentials** (email + password) login
path. Implemented on `node:crypto` — no third-party dependency. This is the
reference for how the flow works and how to test it (AUTH79-005).

> Scope: 2FA applies to the **Credentials provider only**. "Sign in with Google"
> delegates the second factor to Google's own account security, so a Google
> sign-in does not prompt for a TOTP code here.

## What it is

- **TOTP, RFC 6238** — the 6-digit rolling codes from Google Authenticator, 1Password,
  Authy, etc. 30-second period, 6 digits, SHA-1 HMAC.
- Verification allows **±1 time step** (a 90-second window) for clock skew and
  compares in **constant time** (`lib/totp.ts`).
- The per-user secret is a 160-bit base32 string, stored **AES-256-GCM-encrypted
  at rest** via the `encryptedText` column type (`users.totp_secret`). A null
  secret means the user never enrolled.
- `users.mfa_enabled` is the gate: when `true` (and a secret exists), a valid code
  is **mandatory** at login.

## Key files

| File | Role |
|---|---|
| `lib/totp.ts` | `generateTOTPSecret`, `generateTOTP`, `verifyTOTP`, `getTOTPUri` |
| `app/api/portal/settings/mfa/setup/route.ts` | Begin enrollment — mint + stage secret, return QR `otpauth://` URI |
| `app/api/portal/settings/mfa/verify-and-enable/route.ts` | Prove a code, then flip `mfa_enabled=true` |
| `app/api/portal/settings/mfa/disable/route.ts` | Turn 2FA off (re-verifies account password) |
| `app/portal/settings/security/MfaSettings.tsx` | Enrollment / disable UI |
| `app/portal/settings/security/page.tsx` | Security settings page hosting the above |
| `lib/auth.ts` (Credentials `authorize`) | Enforces the code at login |
| `app/portal/login/page.tsx` | Login form with the optional "Two-factor code" field |

## The flow

### Enrollment (opt-in, from Settings → Security)

1. User clicks **Enable** → `POST /api/portal/settings/mfa/setup`.
   - Server mints a fresh secret, writes it to `users.totp_secret` (encrypted),
     leaves `mfa_enabled=false`, and returns `{ secret, otpauthUri }`.
   - `otpauthUri` is `otpauth://totp/SimplerDevelopment:<email>?secret=...&issuer=SimplerDevelopment`
     — render it as a QR code, or the user types the `secret` into their app manually.
2. User scans the QR, then enters the current 6-digit code →
   `POST /api/portal/settings/mfa/verify-and-enable { code }`.
   - Server verifies the code against the staged secret. On success it sets
     `mfa_enabled=true`. The secret is only "armed" once a code is proven, so a
     failed enrollment never locks anyone out.

### Login (once enabled)

- The login form (`/portal/login`) always shows a **"Two-factor code (only if
  enabled)"** field. Users without 2FA leave it blank.
- The code is submitted alongside email + password in the same request
  (`signIn('credentials', { email, password, totpCode })`).
- In `authorize()`: after the password check passes, if `mfa_enabled && totpSecret`,
  the code must pass `verifyTOTP` or the sign-in is rejected.
- **Fail-closed & non-enumerating:** a missing or wrong code returns the same
  `null` as a bad password. Login never reveals whether 2FA is on for an account.
  The form surfaces a generic hint: *"Invalid email or password — if you have
  two-factor enabled, include your authenticator code."*

### Disable

- `POST /api/portal/settings/mfa/disable { password }` — **re-verifies the account
  password** first, so a hijacked *session* (cookie without the password) cannot
  strip the second factor. On success it clears `mfa_enabled` and `totp_secret`.

## How to test it

### Manual (fastest end-to-end check)

1. Sign in to the portal, go to **Settings → Security**, click **Enable two-factor**.
2. Scan the QR with an authenticator app (or add the shown secret manually).
3. Enter the current 6-digit code to confirm — the panel flips to "Enabled".
4. Sign out. Sign back in with **email + password only** → sign-in is rejected.
5. Sign in again with **email + password + the current code** → success.
6. Settings → Security → **Disable**, enter your password → 2FA is off; plain
   email + password login works again.

### Scripted (no phone needed — generate the code in Node)

Because `lib/totp.ts` is pure `node:crypto`, you can compute the expected code
for a known secret in a REPL / script:

```ts
import { generateTOTP, verifyTOTP, generateTOTPSecret } from '@/lib/totp';

const secret = generateTOTPSecret();          // or read users.totp_secret (decrypted)
const code = generateTOTP(secret);            // the code for "now"
console.log(code, verifyTOTP(secret, code));  // -> "123456", true
```

- `generateTOTP(secret, stepOffset)` — pass `stepOffset` (e.g. `-1`, `1`) to
  produce a code for an adjacent window and confirm the ±1 drift tolerance.
- `generateTOTP(secret, 0, atMs)` — pass an explicit `atMs` to test a fixed time.

### Unit tests

`lib/totp.ts` is unit-testable directly (round-trip a secret → code → verify,
plus drift-window and constant-time behavior). The login enforcement path is
exercised in the auth integration suite. Run:

```
scripts/test.sh --layer=unit --no-coverage        # totp + auth unit specs
```

## Known gaps / follow-ups

- **No backup / recovery codes.** If a user loses their authenticator they cannot
  log in, and `disable` requires being logged in — so recovery today means an
  admin resets the account (clear `mfa_enabled` + `totp_secret` in the DB, or via
  admin user management). A one-time recovery-code set issued at enrollment is the
  standard fix and is tracked as a follow-up.
- **No rate limit on `verify-and-enable` / `disable`.** Both are session-gated so
  the blast radius is small, but a code-guessing guard on `verify-and-enable`
  would harden enrollment. (See the auth audit.)
- **Credentials-only.** 2FA does not apply to the Google sign-in path by design.
