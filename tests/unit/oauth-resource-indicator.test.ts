import { describe, it, expect } from 'vitest';
import { resourceIndicatorMatches } from '@/lib/oauth/server';

/**
 * RFC 8707 audience enforcement — the matcher that decides whether a bearer
 * token's bound `resource` indicator is acceptable at a given protected
 * resource. Security-critical: a false positive accepts a token at the wrong
 * audience; a false negative locks out a legitimate MCP client.
 */
describe('resourceIndicatorMatches', () => {
  const MCP = 'https://app.simplerdevelopment.com/api/mcp';

  it('matches an identical resource', () => {
    expect(resourceIndicatorMatches(MCP, MCP)).toBe(true);
  });

  it('ignores a trailing slash difference', () => {
    expect(resourceIndicatorMatches(`${MCP}/`, MCP)).toBe(true);
    expect(resourceIndicatorMatches(MCP, `${MCP}/`)).toBe(true);
  });

  it('is case-insensitive on host but matches path exactly', () => {
    expect(resourceIndicatorMatches('https://APP.SimplerDevelopment.com/api/mcp', MCP)).toBe(true);
  });

  it('ignores query string and fragment', () => {
    expect(resourceIndicatorMatches(`${MCP}?foo=bar#frag`, MCP)).toBe(true);
  });

  it('rejects a different host (cross-environment token reuse)', () => {
    expect(resourceIndicatorMatches('https://staging.simplerdevelopment.com/api/mcp', MCP)).toBe(false);
  });

  it('rejects a different path (audience confusion)', () => {
    expect(resourceIndicatorMatches('https://app.simplerdevelopment.com/api/admin', MCP)).toBe(false);
    expect(resourceIndicatorMatches('https://app.simplerdevelopment.com/', MCP)).toBe(false);
  });

  it('rejects a protocol downgrade (http vs https)', () => {
    expect(resourceIndicatorMatches('http://app.simplerdevelopment.com/api/mcp', MCP)).toBe(false);
  });

  it('rejects a port mismatch', () => {
    expect(resourceIndicatorMatches('https://app.simplerdevelopment.com:8443/api/mcp', MCP)).toBe(false);
  });

  it('fails closed on a malformed token resource', () => {
    expect(resourceIndicatorMatches('not-a-url', MCP)).toBe(false);
    expect(resourceIndicatorMatches('', MCP)).toBe(false);
  });

  it('matches localhost dev resources including port', () => {
    const dev = 'http://localhost:3000/api/mcp';
    expect(resourceIndicatorMatches(dev, dev)).toBe(true);
    expect(resourceIndicatorMatches('http://localhost:3001/api/mcp', dev)).toBe(false);
  });
});
