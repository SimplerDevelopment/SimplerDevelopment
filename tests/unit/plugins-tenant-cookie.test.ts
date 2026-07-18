import { afterEach, describe, expect, it, vi } from 'vitest';
import { pluginTenantCookieOptions } from '@/lib/plugins/tenant-cookie';

// QAD-043: the plugin handoff cookie must SET across environments, not just the
// production apex. Prod behavior must stay byte-identical to the old hard-coded
// values (secure:true, domain:'.simplerdevelopment.com').

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('pluginTenantCookieOptions', () => {
  it('production deploy: secure + apex domain (byte-identical to the old hard-coded values)', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('VERCEL_ENV', 'production');
    vi.stubEnv('AUTH_COOKIE_DOMAIN', '');
    vi.stubEnv('AUTH_INSECURE_COOKIES', '');
    const opts = pluginTenantCookieOptions(true);
    expect(opts).toMatchObject({
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      domain: '.simplerdevelopment.com',
      path: '/',
      maxAge: 600,
    });
  });

  it('local dev: host-only (undefined domain) + insecure so the cookie sets over http', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('VERCEL_ENV', '');
    vi.stubEnv('AUTH_COOKIE_DOMAIN', '');
    const opts = pluginTenantCookieOptions(true);
    expect(opts.secure).toBe(false);
    expect(opts.domain).toBeUndefined();
  });

  it('preview deploy: host-only domain (never pin apex off the production deploy)', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('VERCEL_ENV', 'preview');
    vi.stubEnv('AUTH_COOKIE_DOMAIN', '');
    expect(pluginTenantCookieOptions(true).domain).toBeUndefined();
  });

  it('self-host: AUTH_COOKIE_DOMAIN overrides the apex on any environment', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('VERCEL_ENV', '');
    vi.stubEnv('AUTH_COOKIE_DOMAIN', '.example.com');
    expect(pluginTenantCookieOptions(true).domain).toBe('.example.com');
  });

  it('e2e: AUTH_INSECURE_COOKIES=1 forces insecure even in production NODE_ENV', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('AUTH_INSECURE_COOKIES', '1');
    expect(pluginTenantCookieOptions(true).secure).toBe(false);
  });

  it('slug cookie is readable client-side (httpOnly=false) but shares the scope', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('VERCEL_ENV', 'production');
    const jwtCookie = pluginTenantCookieOptions(true);
    const slugCookie = pluginTenantCookieOptions(false);
    expect(slugCookie.httpOnly).toBe(false);
    expect(jwtCookie.httpOnly).toBe(true);
    expect(slugCookie.domain).toBe(jwtCookie.domain);
    expect(slugCookie.secure).toBe(jwtCookie.secure);
  });
});
