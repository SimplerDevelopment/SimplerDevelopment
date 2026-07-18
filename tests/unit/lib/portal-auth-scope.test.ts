import { describe, it, expect } from 'vitest';
import { requiredScopeFor } from '@/lib/oauth/required-scope';

describe('requiredScopeFor (AUTH79-011 scope derivation)', () => {
  it('derives resource:read for a read action', () => {
    expect(requiredScopeFor({ requireService: 'crm', action: 'read' })).toBe('crm:read');
  });

  it('maps write/admin/owner actions to :write', () => {
    expect(requiredScopeFor({ requireService: 'crm', action: 'write' })).toBe('crm:write');
    expect(requiredScopeFor({ requireService: 'crm', action: 'admin' })).toBe('crm:write');
    expect(requiredScopeFor({ requireService: 'crm', action: 'owner' })).toBe('crm:write');
  });

  it('defaults action to read', () => {
    expect(requiredScopeFor({ requireService: 'email' })).toBe('email:read');
  });

  it('applies the slug map for mismatched service names', () => {
    expect(requiredScopeFor({ requireService: 'booking', action: 'write' })).toBe('bookings:write');
    expect(requiredScopeFor({ requireService: 'pitch-decks', action: 'read' })).toBe('decks:read');
    expect(requiredScopeFor({ requireService: 'help-desk', action: 'read' })).toBe('tickets:read');
    expect(requiredScopeFor({ requireService: 'websites', action: 'write' })).toBe('sites:write');
  });

  it('honors an explicit scope override', () => {
    expect(requiredScopeFor({ scope: 'brain:write', action: 'read' })).toBe('brain:write');
  });

  it('returns null when there is no requireService and no explicit scope', () => {
    expect(requiredScopeFor({ action: 'write' })).toBeNull();
    expect(requiredScopeFor()).toBeNull();
  });
});
