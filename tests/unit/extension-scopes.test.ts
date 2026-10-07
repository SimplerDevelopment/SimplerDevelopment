import { describe, expect, it } from 'vitest';
import { extensionRequirements } from '@/lib/security/extension-scopes';

describe('extension consent requirements', () => {
  it('separates read and write and requires both resources for combined search', () => {
    expect(extensionRequirements('/api/extension/v1/notes', 'POST')).toEqual({ scopes: ['brain:write'], write: true });
    expect(extensionRequirements('/api/extension/v1/crm/contacts', 'GET')).toEqual({ scopes: ['crm:read'], write: false });
    expect(extensionRequirements('/api/extension/v1/search', 'GET')?.scopes).toEqual(['brain:read', 'crm:read']);
    expect(extensionRequirements('/api/extension/v1/auth/test', 'POST')?.write).toBe(false);
  });
  it('denies an undeclared endpoint', () => {
    expect(extensionRequirements('/api/extension/v1/unknown', 'POST')).toBeNull();
  });
});
