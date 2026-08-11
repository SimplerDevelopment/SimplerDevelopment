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

/**
 * QAD-048 id-space split — `key_id` is polymorphic across `portal_api_keys` and
 * `oauth_access_tokens`. Comparing the bare id treats portal key #332 and OAuth
 * token #332 as the same credential; they are not. Credential identity is the
 * PAIR (credentialKind, keyId).
 */
describe('isSelfApproval — credential id spaces (QAD-048)', () => {
  it('does NOT treat colliding ids from different id spaces as the same credential', () => {
    expect(
      isSelfApproval(
        { userId: 5, keyId: 332, credentialKind: 'portal_api_key' },
        { userId: 9, keyId: 332, credentialKind: 'oauth_access_token' },
      ),
    ).toBe(false);
  });

  it('still rejects the same credential within one id space', () => {
    expect(
      isSelfApproval(
        { userId: 5, keyId: 332, credentialKind: 'oauth_access_token' },
        { userId: 9, keyId: 332, credentialKind: 'oauth_access_token' },
      ),
    ).toBe(true);
  });

  // Fail-closed guarantee. Rows staged before `credential_kind` existed carry
  // null; treating an unknown kind as "a different credential" would ALLOW a
  // self-approval we cannot rule out. Over-blocking is the safe direction.
  it('falls back to id-only matching when the staged row predates the discriminator', () => {
    expect(
      isSelfApproval(
        { userId: 5, keyId: 332, credentialKind: null },
        { userId: 9, keyId: 332, credentialKind: 'portal_api_key' },
      ),
    ).toBe(true);
  });

  it('falls back to id-only matching when the approver kind is unknown', () => {
    expect(
      isSelfApproval(
        { userId: 5, keyId: 332, credentialKind: 'portal_api_key' },
        { userId: 9, keyId: 332 },
      ),
    ).toBe(true);
  });

  it('preserves legacy behaviour when neither side carries a kind', () => {
    expect(isSelfApproval({ userId: 5, keyId: 10 }, { userId: 9, keyId: 10 })).toBe(true);
  });

  it('userId match still short-circuits regardless of credential kind', () => {
    expect(
      isSelfApproval(
        { userId: 5, keyId: 1, credentialKind: 'portal_api_key' },
        { userId: 5, keyId: 2, credentialKind: 'oauth_access_token' },
      ),
    ).toBe(true);
  });
});
