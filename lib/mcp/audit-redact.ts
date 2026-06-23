/**
 * Input redaction helper for the agent-action audit log.
 *
 * `redactInputs(args)` produces a copy of the tool-call arguments safe to
 * persist in `agent_action_logs.inputs_summary`:
 *
 *   - Keys whose names match sensitive patterns (password, secret, token, key,
 *     credential, auth, bearer) are replaced with '[REDACTED]', recursively.
 *   - The final JSON serialisation is capped at 4 096 bytes. If the payload
 *     exceeds that, the entire value is replaced with `{ _truncated: true }`.
 *
 * Pure function — no side effects, no I/O. Unit-testable in isolation.
 */

/**
 * Keys matching this pattern are redacted wherever they appear in the tree.
 *
 * Covers auth/credential material. The added terms (passphrase/passcode/cookie/
 * otp/totp/mfa/recovery-or-backup code) are all collision-safe substrings — none
 * appears inside a benign key name. We deliberately do NOT redact contact PII
 * (`email`, `name`): the audit log's whole purpose is to record *what* a tool
 * did, and the contact is usually the action's subject — redacting it would gut
 * the log. Short PII tokens are also unsafe with substring matching anyway
 * (e.g. /pin/ hits "shipping", /ssn/ hits "className").
 */
const SECRET_KEY_RE =
  /password|passphrase|passcode|secret|token|credential|auth|bearer|cookie|otp|totp|mfa|recoverycode|backupcode|key/i;

const MAX_BYTES = 4096;

/**
 * Recursively walk `value` and replace secret-bearing leaf values with
 * `'[REDACTED]'`.  The original value is never mutated.
 */
function redactValue(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value;

  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item));
  }

  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    result[k] = SECRET_KEY_RE.test(k) ? '[REDACTED]' : redactValue(v);
  }
  return result;
}

/**
 * Return a redacted copy of `args` suitable for storage, or
 * `{ _truncated: true }` when the serialised form exceeds 4 KB.
 */
export function redactInputs(args: unknown): unknown {
  const redacted = redactValue(args);
  try {
    const serialised = JSON.stringify(redacted);
    if (Buffer.byteLength(serialised, 'utf8') > MAX_BYTES) {
      return { _truncated: true };
    }
  } catch {
    return { _truncated: true };
  }
  return redacted;
}
