/**
 * Separation of duties for MCP approvals (QAD-049 / MEB-003).
 *
 * The identity that STAGED a pending change may not approve it. Scope alone is
 * not a boundary — a `*`-scoped credential holds both the write scope and
 * `approvals:manage`, so it could otherwise stage AND self-approve. Pure +
 * dependency-free so it unit-tests without a DB.
 */
export function isSelfApproval(
  change: { userId: number | null; keyId: number | null },
  approver: { userId: number | null; keyId: number | null },
): boolean {
  return (
    (change.userId != null && change.userId === approver.userId) ||
    (change.keyId != null && change.keyId === approver.keyId)
  );
}
