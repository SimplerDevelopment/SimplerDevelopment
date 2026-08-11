/**
 * Separation of duties for MCP approvals (QAD-049 / MEB-003).
 *
 * The identity that STAGED a pending change may not approve it. Scope alone is
 * not a boundary — a `*`-scoped credential holds both the write scope and
 * `approvals:manage`, so it could otherwise stage AND self-approve. Pure +
 * dependency-free so it unit-tests without a DB.
 */
export function isSelfApproval(
  change: { userId: number | null; keyId: number | null; credentialKind?: string | null },
  approver: { userId: number | null; keyId: number | null; credentialKind?: string | null },
): boolean {
  if (change.userId != null && change.userId === approver.userId) return true;
  if (change.keyId == null || change.keyId !== approver.keyId) return false;

  // `key_id` is polymorphic across portal_api_keys and oauth_access_tokens, so
  // credential identity is the PAIR (kind, id) — id 332 in one space is a
  // different credential from id 332 in the other (QAD-048).
  const changeKind = change.credentialKind ?? null;
  const approverKind = approver.credentialKind ?? null;

  // Unknown kind on either side (rows staged before the discriminator existed):
  // fall back to id-only matching. That over-blocks at worst; treating an
  // unknown kind as "different credential" would ALLOW a self-approval we
  // can't rule out, and this control must fail closed.
  if (changeKind == null || approverKind == null) return true;

  return changeKind === approverKind;
}
