/**
 * MEB-006 — external OAuth tokens default to requiring CMS approval when they
 * can perform a gated write. scopesRequireApproval is the predicate the token
 * issuance uses; read-only tokens stay un-gated so they can answer questions.
 */
import { describe, it, expect } from 'vitest';
import { scopesRequireApproval } from '@/lib/oauth/scopes';

describe('scopesRequireApproval — MEB-006 secure-by-default', () => {
  it('requires approval for a wildcard (full-access) grant', () => {
    expect(scopesRequireApproval(['*'])).toBe(true);
  });

  it('requires approval when any write scope is present', () => {
    expect(scopesRequireApproval(['crm:read', 'crm:write'])).toBe(true);
  });

  it('requires approval for a send scope', () => {
    expect(scopesRequireApproval(['email:read', 'email:send'])).toBe(true);
  });

  it('requires approval for a delete scope (future tier)', () => {
    expect(scopesRequireApproval(['crm:read', 'crm:delete'])).toBe(true);
  });

  it('does NOT require approval for a read-only token', () => {
    expect(scopesRequireApproval(['crm:read', 'projects:read', 'email:read'])).toBe(false);
  });

  it('is false for an empty scope set', () => {
    expect(scopesRequireApproval([])).toBe(false);
  });
});
