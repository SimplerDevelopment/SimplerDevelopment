/** First-party mobile capabilities, based on sd-chat-mobile/lib/api consumers. */
export function mobileScopesForRole(role: 'owner' | 'admin' | 'member' | 'viewer'): string[] {
  const scopes = ['profile:read', 'profile:write', 'chat:read', 'brain:read',
    'media:read', 'approvals:read', 'notifications:read', 'notifications:write'];
  if (role !== 'viewer') scopes.push('chat:write', 'brain:write', 'media:write', 'media:delete');
  if (role === 'admin' || role === 'owner') scopes.push('approvals:manage');
  return scopes;
}
