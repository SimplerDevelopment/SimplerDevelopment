import { describe, expect, it } from 'bun:test';
import { resolveSdMcpAuthToken } from './sd-mcp';

// The security invariant from the multi-tenant review: in multi-tenant mode a
// request may NEVER fall back to the static SD_MCP_API_KEY — that key is
// unscoped, so the fallback would silently run the request cross-tenant.
describe('resolveSdMcpAuthToken', () => {
  it('multi-tenant: uses the per-request tenant token', () => {
    expect(resolveSdMcpAuthToken('sd_oauth_abc', true, 'sd_mcp_static')).toBe('sd_oauth_abc');
  });

  it('multi-tenant: fails closed when the tenant token is missing, even with a static key set', () => {
    expect(() => resolveSdMcpAuthToken(undefined, true, 'sd_mcp_static')).toThrow(
      /multi-tenant mode requires a per-request tenant token/,
    );
  });

  it('single-tenant: prefers the context token, falls back to the static key', () => {
    expect(resolveSdMcpAuthToken('sd_oauth_abc', false, 'sd_mcp_static')).toBe('sd_oauth_abc');
    expect(resolveSdMcpAuthToken(undefined, false, 'sd_mcp_static')).toBe('sd_mcp_static');
  });

  it('single-tenant: unauthenticated when nothing is configured', () => {
    expect(resolveSdMcpAuthToken(undefined, false, undefined)).toBeUndefined();
  });
});
