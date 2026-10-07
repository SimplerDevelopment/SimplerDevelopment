/** Every extension endpoint declares the tenant resources its handler reads/writes. */
export function extensionRequirements(path: string, method: string): { scopes: string[]; write: boolean } | null {
  const endpoint = path.replace(/\/$/, '').replace(/^\/api\/extension\/v1\//, '');
  if (endpoint === 'auth/test') return { scopes: ['profile:read'], write: false };
  if (endpoint === 'extract') return { scopes: ['brain:read', 'crm:read', 'chat:write'], write: true };
  if (endpoint === 'search' || endpoint === 'activity/recent') return { scopes: ['brain:read', 'crm:read'], write: false };
  if (endpoint === 'related-records') return { scopes: ['crm:read'], write: false };
  if (['tags', 'notes/related'].includes(endpoint)) return { scopes: ['brain:read'], write: false };
  const resource = ['notes', 'tasks'].includes(endpoint) ? 'brain'
    : ['crm/contacts', 'crm/companies', 'crm/deals'].includes(endpoint) ? 'crm' : null;
  if (!resource) return null;
  const write = method !== 'GET' && method !== 'HEAD';
  return { scopes: [`${resource}:${write ? 'write' : 'read'}`], write };
}
