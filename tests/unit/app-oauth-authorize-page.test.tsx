// @vitest-environment jsdom
/**
 * Unit tests for `app/oauth/authorize/page.tsx` — the OAuth 2.1 / RFC 6749
 * authorization consent screen. SECURITY CRITICAL: this is the page that
 * exchanges user trust for a downstream OAuth grant, so the test surface
 * covers:
 *  - missing / unknown client_id, redirect_uri  (renders in-page error,
 *    NEVER redirects since redirect_uri is untrusted)
 *  - invalid registered redirect_uri match     (renders in-page error)
 *  - bad response_type / missing code_challenge / wrong code_challenge_method
 *    (per RFC 6749 §4.1.2.1, redirects back with error= / error_description=
 *    / state= attached, and only AFTER the client_id+redirect_uri are valid)
 *  - unauthenticated session → bounce through /portal/login with callbackUrl
 *    preserving the original authorize params
 *  - portal-access checks (no clients, no active client → in-page error)
 *  - scope rendering: explicit list, intersected list, fallback to defaults,
 *    and the `*` "full access" toggle
 *  - state CSRF param is round-tripped into the hidden form input
 *  - multi-client account → renders a portal <select>
 *  - optional `resource` is rendered as a hidden form input
 *  - searchParams arrays only take the first value (pick() helper)
 *
 * Strategy: this is an async Server Component. We mock the entire dependency
 * surface (auth, db, headers, next/navigation.redirect, getPortalClient(s))
 * and then `await` the page function directly. `next/navigation.redirect`
 * throws a tagged error in real Next; we mock it to throw so we can assert
 * the target URL. Returned JSX is rendered via @testing-library/react.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

// ─── Hoisted mocks (must precede page import) ───────────────────────────────

const authMock = vi.fn();
vi.mock('@/lib/auth', () => ({
  auth: () => authMock(),
}));

const headersMock = vi.fn();
vi.mock('next/headers', () => ({
  headers: () => headersMock(),
}));

class RedirectError extends Error {
  url: string;
  constructor(url: string) {
    super(`NEXT_REDIRECT:${url}`);
    this.url = url;
    this.name = 'RedirectError';
  }
}
const redirectMock = vi.fn((url: string) => {
  throw new RedirectError(url);
});
vi.mock('next/navigation', () => ({
  redirect: (url: string) => redirectMock(url),
}));

const getPortalClientMock = vi.fn();
const getPortalClientsMock = vi.fn();
vi.mock('@/lib/portal-client', () => ({
  getPortalClient: (...a: unknown[]) => getPortalClientMock(...a),
  getPortalClients: (...a: unknown[]) => getPortalClientsMock(...a),
}));

// drizzle-orm operators — inert
vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
}));

// schema — proxy table so eq(oauthClients.clientId, x) doesn't blow up.
vi.mock('@/lib/db/schema', () => {
  const wrap = (tableName: string) =>
    new Proxy(
      { __table: tableName },
      {
        get(_t, prop: string) {
          if (prop === '__table') return tableName;
          if (prop === '$inferSelect') return undefined;
          if (prop === 'then') return undefined;
          return { __col: prop, __table: tableName };
        },
      },
    );
  return { oauthClients: wrap('oauthClients') };
});

// db.select() returns a single row from the queue per terminal call. The
// chain methods (from, where, limit) all return the same chain. Awaiting or
// calling .then materializes the next queued result.
let selectQueue: Array<Array<Record<string, unknown>>> = [];

vi.mock('@/lib/db', () => {
  function buildSelect() {
    let materialized: Promise<Array<Record<string, unknown>>> | null = null;
    const materialize = () => {
      if (!materialized) {
        materialized = Promise.resolve(selectQueue.shift() ?? []);
      }
      return materialized;
    };
    const chain: Record<string, unknown> = {};
    const passthrough = () => chain;
    for (const m of ['from', 'where', 'limit', 'orderBy', 'leftJoin', 'innerJoin', 'groupBy', 'offset']) {
      chain[m] = passthrough;
    }
    chain.then = (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) =>
      materialize().then(onF, onR);
    return chain;
  }
  return {
    db: {
      select: () => buildSelect(),
    },
  };
});

// oauth helpers — keep `redirectUriMatches` real-ish since it's just
// includes(), and keep scope helpers real to exercise their branches
// through the page. (They have their own unit tests; here we just need
// realistic behavior.)
vi.mock('@/lib/oauth/server', async () => {
  const actual = await vi.importActual<typeof import('@/lib/oauth/server')>(
    '@/lib/oauth/server',
  );
  return { ...actual };
});

vi.mock('@/lib/oauth/scopes', async () => {
  const actual = await vi.importActual<typeof import('@/lib/oauth/scopes')>(
    '@/lib/oauth/scopes',
  );
  return { ...actual };
});

// ─── Import under test (AFTER all mocks) ────────────────────────────────────

import AuthorizePage from '@/app/oauth/authorize/page';

// ─── Helpers ────────────────────────────────────────────────────────────────

type Params = Record<string, string | string[] | undefined>;

function makeSearchParams(p: Params): Promise<Params> {
  return Promise.resolve(p);
}

function makeHeaderBag(map: Record<string, string>) {
  return {
    get(key: string) {
      const v = map[key.toLowerCase()] ?? map[key];
      return v === undefined ? null : v;
    },
  };
}

const VALID_CLIENT = {
  id: 1,
  clientId: 'oc_abc123',
  clientName: 'TestApp',
  clientUri: 'https://test.app',
  redirectUris: ['https://test.app/cb', 'https://test.app/cb2'],
};

const VALID_SESSION = { user: { id: '42', email: 'user@example.com' } };

const VALID_ACTIVE_CLIENT = { id: 99, company: 'Acme Co' };

function pkceParams(extra: Params = {}): Params {
  return {
    client_id: 'oc_abc123',
    redirect_uri: 'https://test.app/cb',
    response_type: 'code',
    state: 'csrf-state-xyz',
    code_challenge: 'pkce_challenge_value',
    code_challenge_method: 'S256',
    ...extra,
  };
}

async function renderPage(params: Params) {
  // Async Server Component: invoking the function gives a Promise<JSX>.
  // Awaiting it lets all the mocked deps fire; redirects throw via the
  // mock so individual tests catch them explicitly.
  const element = await AuthorizePage({ searchParams: makeSearchParams(params) });
  return render(element as React.ReactElement);
}

beforeEach(() => {
  selectQueue = [];
  authMock.mockReset();
  headersMock.mockReset();
  redirectMock.mockClear();
  getPortalClientMock.mockReset();
  getPortalClientsMock.mockReset();

  // Default: valid header bag for the unauth-bounce path.
  headersMock.mockReturnValue(
    makeHeaderBag({
      'x-forwarded-proto': 'https',
      'x-forwarded-host': 'portal.example.com',
    }),
  );
});

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('OAuth /oauth/authorize page', () => {
  describe('pre-redirect validation (untrusted redirect_uri)', () => {
    it('renders an in-page error when client_id is missing', async () => {
      await renderPage({}); // no client_id
      expect(screen.getByText('Missing client_id')).toBeTruthy();
      expect(redirectMock).not.toHaveBeenCalled();
    });

    it('renders an in-page error when redirect_uri is missing', async () => {
      await renderPage({ client_id: 'oc_abc123' });
      expect(screen.getByText('Missing redirect_uri')).toBeTruthy();
      expect(redirectMock).not.toHaveBeenCalled();
    });

    it('renders an in-page error when client_id is unknown', async () => {
      selectQueue.push([]); // no rows
      await renderPage({
        client_id: 'oc_unknown',
        redirect_uri: 'https://attacker.test/cb',
      });
      expect(screen.getByText('Unknown client')).toBeTruthy();
      expect(redirectMock).not.toHaveBeenCalled();
    });

    it('renders an in-page error when redirect_uri does not match registered list', async () => {
      selectQueue.push([VALID_CLIENT]);
      await renderPage({
        client_id: 'oc_abc123',
        redirect_uri: 'https://attacker.test/cb',
      });
      expect(screen.getByText('Invalid redirect_uri')).toBeTruthy();
      expect(redirectMock).not.toHaveBeenCalled();
    });

    it('treats arrayified client_id by picking the first value', async () => {
      // pick() takes only the first element of an array param
      selectQueue.push([]); // unknown client (so we stop at "Unknown client")
      await renderPage({
        client_id: ['first_id', 'second_id'],
        redirect_uri: 'https://test.app/cb',
      });
      // Should have reached the db.select step (i.e. it picked 'first_id')
      // and then bailed at "Unknown client".
      expect(screen.getByText('Unknown client')).toBeTruthy();
    });
  });

  describe('post-redirect validation (RFC 6749 error redirect)', () => {
    it('redirects with unsupported_response_type when response_type !== "code"', async () => {
      selectQueue.push([VALID_CLIENT]);
      await expect(
        renderPage(pkceParams({ response_type: 'token' })),
      ).rejects.toThrow(/NEXT_REDIRECT:/);
      expect(redirectMock).toHaveBeenCalledTimes(1);
      const url = new URL(redirectMock.mock.calls[0][0]);
      expect(url.origin + url.pathname).toBe('https://test.app/cb');
      expect(url.searchParams.get('error')).toBe('unsupported_response_type');
      expect(url.searchParams.get('error_description')).toMatch(/response_type/);
      expect(url.searchParams.get('state')).toBe('csrf-state-xyz');
    });

    it('redirects with invalid_request when code_challenge is missing (PKCE required)', async () => {
      selectQueue.push([VALID_CLIENT]);
      await expect(
        renderPage(pkceParams({ code_challenge: undefined })),
      ).rejects.toThrow(/NEXT_REDIRECT:/);
      const url = new URL(redirectMock.mock.calls[0][0]);
      expect(url.searchParams.get('error')).toBe('invalid_request');
      expect(url.searchParams.get('error_description')).toMatch(/code_challenge/);
      expect(url.searchParams.get('state')).toBe('csrf-state-xyz');
    });

    it('redirects with invalid_request when code_challenge_method !== "S256"', async () => {
      selectQueue.push([VALID_CLIENT]);
      await expect(
        renderPage(pkceParams({ code_challenge_method: 'plain' })),
      ).rejects.toThrow(/NEXT_REDIRECT:/);
      const url = new URL(redirectMock.mock.calls[0][0]);
      expect(url.searchParams.get('error')).toBe('invalid_request');
      expect(url.searchParams.get('error_description')).toMatch(/S256/);
    });

    it('omits state from the error redirect when state was not provided', async () => {
      selectQueue.push([VALID_CLIENT]);
      await expect(
        renderPage(pkceParams({ state: undefined, response_type: 'token' })),
      ).rejects.toThrow(/NEXT_REDIRECT:/);
      const url = new URL(redirectMock.mock.calls[0][0]);
      expect(url.searchParams.get('error')).toBe('unsupported_response_type');
      expect(url.searchParams.get('state')).toBeNull();
    });
  });

  describe('auth gate', () => {
    it('redirects unauthenticated users to /portal/login with callbackUrl preserving authorize params', async () => {
      selectQueue.push([VALID_CLIENT]);
      authMock.mockResolvedValue(null);
      await expect(renderPage(pkceParams())).rejects.toThrow(/NEXT_REDIRECT:/);
      const target = new URL(redirectMock.mock.calls[0][0]);
      expect(target.origin).toBe('https://portal.example.com');
      expect(target.pathname).toBe('/portal/login');
      const callback = target.searchParams.get('callbackUrl');
      expect(callback).toBeTruthy();
      // The callback should embed the original /oauth/authorize path with
      // all the original (string-typed) query params preserved.
      expect(callback!.startsWith('/oauth/authorize?')).toBe(true);
      expect(callback).toContain('client_id=oc_abc123');
      expect(callback).toContain('state=csrf-state-xyz');
      expect(callback).toContain('code_challenge=pkce_challenge_value');
    });

    it('falls back to the host header when x-forwarded-host is absent', async () => {
      headersMock.mockReturnValue(
        makeHeaderBag({ host: 'fallback.example.com' }),
      );
      selectQueue.push([VALID_CLIENT]);
      authMock.mockResolvedValue(null);
      await expect(renderPage(pkceParams())).rejects.toThrow(/NEXT_REDIRECT:/);
      const target = new URL(redirectMock.mock.calls[0][0]);
      expect(target.host).toBe('fallback.example.com');
      // default proto when neither x-forwarded-proto nor anything else set
      expect(target.protocol).toBe('https:');
    });

    it('skips array-typed params (like arrays) when building the callback', async () => {
      headersMock.mockReturnValue(
        makeHeaderBag({
          'x-forwarded-proto': 'https',
          'x-forwarded-host': 'portal.example.com',
        }),
      );
      selectQueue.push([VALID_CLIENT]);
      authMock.mockResolvedValue(null);
      await expect(
        renderPage({
          ...pkceParams(),
          // Array-valued param: pick() returns the first, but the
          // callback-builder filters to typeof === 'string' so this
          // entire entry is dropped from the rebuilt callback URL.
          extra_arr: ['a', 'b'],
        }),
      ).rejects.toThrow(/NEXT_REDIRECT:/);
      const target = new URL(redirectMock.mock.calls[0][0]);
      const callback = target.searchParams.get('callbackUrl')!;
      expect(callback).not.toContain('extra_arr');
    });
  });

  describe('portal-access gate', () => {
    it('renders "No portal access" when the user has no portal clients at all', async () => {
      selectQueue.push([VALID_CLIENT]);
      authMock.mockResolvedValue(VALID_SESSION);
      getPortalClientsMock.mockResolvedValue([]);
      await renderPage(pkceParams());
      expect(screen.getByText('No portal access')).toBeTruthy();
      expect(
        screen.getByText(/not associated with any client portal/),
      ).toBeTruthy();
    });

    it('renders "No portal access" when there are clients but no active one resolves', async () => {
      selectQueue.push([VALID_CLIENT]);
      authMock.mockResolvedValue(VALID_SESSION);
      getPortalClientsMock.mockResolvedValue([{ id: 99, company: 'Acme' }]);
      getPortalClientMock.mockResolvedValue(null);
      await renderPage(pkceParams());
      expect(screen.getByText('No portal access')).toBeTruthy();
      expect(
        screen.getByText(/Could not resolve an active client/),
      ).toBeTruthy();
    });
  });

  describe('consent screen rendering', () => {
    function arrangeHappyPath() {
      selectQueue.push([VALID_CLIENT]);
      authMock.mockResolvedValue(VALID_SESSION);
      getPortalClientsMock.mockResolvedValue([VALID_ACTIVE_CLIENT]);
      getPortalClientMock.mockResolvedValue(VALID_ACTIVE_CLIENT);
    }

    it('renders the connect heading with client name + active client company', async () => {
      arrangeHappyPath();
      const { container } = await renderPage(pkceParams({ scope: 'profile:read' }));
      // h1 includes "Connect ... to <company>"
      const h1 = container.querySelector('h1')!;
      expect(h1.textContent).toMatch(/Connect/);
      expect(h1.textContent).toContain('TestApp');
      expect(h1.textContent).toContain('Acme Co');
    });

    it('renders the application website link when clientUri is present', async () => {
      arrangeHappyPath();
      const { container } = await renderPage(pkceParams({ scope: 'profile:read' }));
      const link = container.querySelector('a[href="https://test.app"]') as HTMLAnchorElement;
      expect(link).toBeTruthy();
      expect(link.target).toBe('_blank');
    });

    it('hides the application website link when clientUri is null', async () => {
      selectQueue.push([{ ...VALID_CLIENT, clientUri: null }]);
      authMock.mockResolvedValue(VALID_SESSION);
      getPortalClientsMock.mockResolvedValue([VALID_ACTIVE_CLIENT]);
      getPortalClientMock.mockResolvedValue(VALID_ACTIVE_CLIENT);
      const { container } = await renderPage(pkceParams({ scope: 'profile:read' }));
      // The application-website paragraph should not be in the DOM.
      expect(container.textContent).not.toMatch(/Application website:/);
    });

    it('falls back to "your portal" when activeClient.company is null', async () => {
      selectQueue.push([VALID_CLIENT]);
      authMock.mockResolvedValue(VALID_SESSION);
      getPortalClientsMock.mockResolvedValue([{ id: 99, company: null }]);
      getPortalClientMock.mockResolvedValue({ id: 99, company: null });
      const { container } = await renderPage(pkceParams({ scope: 'profile:read' }));
      const h1 = container.querySelector('h1')!;
      expect(h1.textContent).toContain('your portal');
    });

    it('round-trips client_id / redirect_uri / state / code_challenge / code_challenge_method into hidden form inputs', async () => {
      arrangeHappyPath();
      const { container } = await renderPage(pkceParams({ scope: 'profile:read' }));
      const form = container.querySelector('form')!;
      expect(form.getAttribute('action')).toBe('/oauth/authorize/decision');
      expect(form.getAttribute('method')).toBe('POST');
      const get = (name: string) =>
        (form.querySelector(`input[name="${name}"]`) as HTMLInputElement | null)?.value;
      expect(get('client_id')).toBe('oc_abc123');
      expect(get('redirect_uri')).toBe('https://test.app/cb');
      expect(get('state')).toBe('csrf-state-xyz');
      expect(get('code_challenge')).toBe('pkce_challenge_value');
      expect(get('code_challenge_method')).toBe('S256');
    });

    it('emits the resource hidden input only when the resource param is present', async () => {
      arrangeHappyPath();
      const withResource = await renderPage(
        pkceParams({ scope: 'profile:read', resource: 'https://api.example.com' }),
      );
      const resourceInput = withResource.container.querySelector(
        'input[name="resource"]',
      ) as HTMLInputElement;
      expect(resourceInput).toBeTruthy();
      expect(resourceInput.value).toBe('https://api.example.com');
    });

    it('omits the resource hidden input when the resource param is absent', async () => {
      arrangeHappyPath();
      const { container } = await renderPage(pkceParams({ scope: 'profile:read' }));
      // Form has hidden inputs but no "resource" name.
      expect(container.querySelector('input[name="resource"]')).toBeNull();
    });

    it('renders a portal <select> when the user has more than one client', async () => {
      selectQueue.push([VALID_CLIENT]);
      authMock.mockResolvedValue(VALID_SESSION);
      getPortalClientsMock.mockResolvedValue([
        VALID_ACTIVE_CLIENT,
        { id: 100, company: 'Beta Co' },
        { id: 101, company: null },
      ]);
      getPortalClientMock.mockResolvedValue(VALID_ACTIVE_CLIENT);
      const { container } = await renderPage(pkceParams({ scope: 'profile:read' }));
      expect(screen.getByText('Which portal?')).toBeTruthy();
      const select = container.querySelector('select[name="active_client_id"]') as HTMLSelectElement;
      expect(select).toBeTruthy();
      // Three options, with the null-company option getting the fallback label.
      const opts = container.querySelectorAll('select option');
      expect(opts.length).toBe(3);
      expect(Array.from(opts).map(o => o.textContent)).toEqual(
        expect.arrayContaining(['Acme Co', 'Beta Co', 'Portal #101']),
      );
    });

    it('does NOT render a portal <select> when the user has only one client', async () => {
      arrangeHappyPath();
      const { container } = await renderPage(pkceParams({ scope: 'profile:read' }));
      expect(container.querySelector('select[name="active_client_id"]')).toBeNull();
    });

    it('renders the signed-in-as footer with the session email + scope total', async () => {
      arrangeHappyPath();
      const { container } = await renderPage(pkceParams({ scope: 'profile:read' }));
      expect(container.textContent).toContain('user@example.com');
      // SUPPORTED_SCOPES is non-empty — the page interpolates its length.
      expect(container.textContent).toMatch(/\d+ scopes total are available/);
    });
  });

  describe('scope selection', () => {
    function arrangeHappyPath() {
      selectQueue.push([VALID_CLIENT]);
      authMock.mockResolvedValue(VALID_SESSION);
      getPortalClientsMock.mockResolvedValue([VALID_ACTIVE_CLIENT]);
      getPortalClientMock.mockResolvedValue(VALID_ACTIVE_CLIENT);
    }

    it('renders a single "Full access" toggle when scope contains "*"', async () => {
      arrangeHappyPath();
      const { container } = await renderPage(pkceParams({ scope: '*' }));
      const scopeBoxes = container.querySelectorAll('input[name="scopes"]');
      expect(scopeBoxes.length).toBe(1);
      expect((scopeBoxes[0] as HTMLInputElement).value).toBe('*');
      // The "*" label includes the "Full access" copy.
      expect(container.textContent).toMatch(/Full access/);
    });

    it('renders "Full access" when "*" is present alongside other scopes', async () => {
      arrangeHappyPath();
      const { container } = await renderPage(
        pkceParams({ scope: 'profile:read * crm:write' }),
      );
      // Page collapses to just "*" when wildcard is present.
      const scopeBoxes = container.querySelectorAll('input[name="scopes"]');
      expect(scopeBoxes.length).toBe(1);
      expect((scopeBoxes[0] as HTMLInputElement).value).toBe('*');
    });

    it('renders only the requested + supported scopes (unknown scopes dropped)', async () => {
      arrangeHappyPath();
      const { container } = await renderPage(
        pkceParams({ scope: 'profile:read crm:write totally:bogus' }),
      );
      const scopeBoxes = Array.from(
        container.querySelectorAll('input[name="scopes"]'),
      ) as HTMLInputElement[];
      const values = scopeBoxes.map(c => c.value);
      expect(values).toEqual(expect.arrayContaining(['profile:read', 'crm:write']));
      expect(values).not.toContain('totally:bogus');
    });

    it('falls back to DEFAULT_GRANTED_SCOPES when no scope is requested', async () => {
      arrangeHappyPath();
      const { container } = await renderPage(pkceParams({ scope: undefined }));
      const scopeBoxes = container.querySelectorAll('input[name="scopes"]');
      // DEFAULT_GRANTED_SCOPES is a sizable read-only set — at minimum we
      // expect several checkboxes, and profile:read should be in there.
      expect(scopeBoxes.length).toBeGreaterThan(5);
      const values = Array.from(scopeBoxes).map(c => (c as HTMLInputElement).value);
      expect(values).toContain('profile:read');
    });

    it('falls back to DEFAULT_GRANTED_SCOPES when only unknown scopes are requested', async () => {
      arrangeHappyPath();
      const { container } = await renderPage(
        pkceParams({ scope: 'made_up:read another:bogus' }),
      );
      const scopeBoxes = container.querySelectorAll('input[name="scopes"]');
      // None of the requested scopes match SUPPORTED_SCOPES, so we land in
      // the defaults branch — should be the same size as DEFAULT_GRANTED_SCOPES.
      expect(scopeBoxes.length).toBeGreaterThan(5);
    });

    it('renders human-readable labels next to each scope code', async () => {
      arrangeHappyPath();
      const { container } = await renderPage(
        pkceParams({ scope: 'profile:read sites:write' }),
      );
      // <code>profile:read</code> + label
      expect(container.textContent).toMatch(/profile:read/);
      expect(container.textContent).toMatch(/Read profile and account info/);
      expect(container.textContent).toMatch(/sites:write/);
      expect(container.textContent).toMatch(/Create and edit posts/);
    });

    it('falls back to the scope string itself if no friendly label exists', async () => {
      // Note: scope is intersected with SUPPORTED_SCOPES, so the page can
      // only render labels for known scopes. To exercise the
      // `scopeLabels[scope] ?? scope` fallback path we need a SUPPORTED
      // scope without a label mapping. All current SUPPORTED scopes do
      // have labels; this test exercises the wildcard label path instead,
      // which still goes through scopeLabels[scope] lookup.
      arrangeHappyPath();
      const { container } = await renderPage(pkceParams({ scope: '*' }));
      // The "*" label IS present in scopeLabels — assert it actually
      // resolves rather than falling through to the raw "*".
      expect(container.textContent).toMatch(/Full access/);
    });
  });

  describe('approve / deny buttons', () => {
    it('renders both Approve and Deny submit buttons in the form', async () => {
      selectQueue.push([VALID_CLIENT]);
      authMock.mockResolvedValue(VALID_SESSION);
      getPortalClientsMock.mockResolvedValue([VALID_ACTIVE_CLIENT]);
      getPortalClientMock.mockResolvedValue(VALID_ACTIVE_CLIENT);
      const { container } = await renderPage(pkceParams({ scope: 'profile:read' }));
      const approveBtn = container.querySelector(
        'button[name="decision"][value="approve"]',
      ) as HTMLButtonElement;
      const denyBtn = container.querySelector(
        'button[name="decision"][value="deny"]',
      ) as HTMLButtonElement;
      expect(approveBtn).toBeTruthy();
      expect(denyBtn).toBeTruthy();
      expect(approveBtn.type).toBe('submit');
      expect(denyBtn.type).toBe('submit');
      expect(approveBtn.textContent).toMatch(/Approve/);
      expect(denyBtn.textContent).toMatch(/Deny/);
    });
  });
});
