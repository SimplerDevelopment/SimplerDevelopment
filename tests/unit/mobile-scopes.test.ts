import { describe, expect, it } from 'vitest';
import { mobileScopesForRole } from '@/lib/security/mobile-scopes';

describe('mobile credential capabilities', () => {
  it('never grants wildcard or CMS publishing', () => {
    for (const role of ['owner', 'admin', 'member', 'viewer'] as const) {
      const scopes = mobileScopesForRole(role);
      expect(scopes).not.toContain('*');
      expect(scopes).not.toContain('sites:write');
    }
  });
  it('viewers remain read-only for tenant content; only admins manage approvals', () => {
    expect(mobileScopesForRole('viewer')).not.toContain('brain:write');
    expect(mobileScopesForRole('viewer')).not.toContain('chat:write');
    expect(mobileScopesForRole('member')).toContain('chat:write');
    expect(mobileScopesForRole('member')).not.toContain('approvals:manage');
    expect(mobileScopesForRole('admin')).toContain('approvals:manage');
  });
});
