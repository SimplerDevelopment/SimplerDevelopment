/**
 * MEB-003 / QAD-049 — separation of duties on MCP approvals.
 *
 * The identity that stages a pending change must not be able to approve it.
 * Scope alone is not a boundary: a `*`-scoped credential holds both the write
 * scope and approvals:manage, so it could stage AND self-approve. isSelfApproval
 * is the predicate approvals_approve uses to reject that.
 *
 * Unit-layer: the predicate lives in a pure, dependency-free module.
 */
import { describe, it, expect } from 'vitest';

import { isSelfApproval } from '@/lib/mcp/self-approval';

describe('isSelfApproval — separation of duties (QAD-049)', () => {
  it('rejects when the same user staged and approves (even via a different key)', () => {
    expect(isSelfApproval({ userId: 5, keyId: 10 }, { userId: 5, keyId: 20 })).toBe(true);
  });

  it('rejects when the same credential staged and approves', () => {
    expect(isSelfApproval({ userId: 5, keyId: 10 }, { userId: 9, keyId: 10 })).toBe(true);
  });

  it('allows a distinct reviewer (different user AND credential)', () => {
    expect(isSelfApproval({ userId: 5, keyId: 10 }, { userId: 9, keyId: 20 })).toBe(false);
  });

  it('does not treat two null keyIds as a credential match', () => {
    expect(isSelfApproval({ userId: 5, keyId: null }, { userId: 9, keyId: null })).toBe(false);
  });

  it('still matches on userId when keyIds are null', () => {
    expect(isSelfApproval({ userId: 5, keyId: null }, { userId: 5, keyId: null })).toBe(true);
  });
});
