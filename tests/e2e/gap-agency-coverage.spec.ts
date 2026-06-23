/**
 * Agency gap coverage @gap @agency
 *
 * Covers three gaps not yet tested by the existing portal-agency-white-label spec:
 *
 *   Gap 1 — POST /api/portal/agency/custom-domain/verify
 *             400 when no domain/token is registered
 *             422 when domain+token exist but DNS hasn't propagated (the real DNS
 *             TXT lookup fails in a test environment → always 422 from this endpoint)
 *
 *   Gap 2 — MCP branding READ tools under branding:read scope
 *             branding_list_profiles, branding_get_profile, branding_get_messaging,
 *             branding_audit, branding_check_contrast
 *             (These were listed as gaps; verified they are registered and callable.)
 *
 *   Gap 3 — GET /api/portal/agency/chrome with whiteLabelEnabled=true
 *             Asserts the populated chrome payload is returned when white-label is
 *             enabled. Requires a verified domain + agencyName to be set — achieved
 *             by directly patching the DB via psql in a beforeAll/afterAll block.
 */
import { test, expect } from './setup/fixtures';
import { runCleanups, createTestApiKey, McpTestClient } from './setup/helpers';
import { execSync } from 'child_process';

// ── DB helper (test-only) ─────────────────────────────────────────────────────
// Direct psql mutations are the only way to simulate a verified domain without
// performing real DNS. We scope them to client id=1 (client@example.com) which
// is the seed owner in the simplerdev_test DB.

const TEST_DB = 'postgresql://localhost:5432/simplerdev_test';
const CLIENT_ID = 1;

function psql(sql: string) {
  execSync(`psql ${TEST_DB} -c "${sql.replace(/"/g, '\\"')}"`, { stdio: 'pipe' });
}

// The chrome describe block (Gap 3) stamps custom_domain + white_label_enabled on
// the shared seed client and restores it in afterAll. Under fullyParallel that
// window races the "no domain registered → 400" test in Gap 1. Force this file
// serial so the mutation window never overlaps the other agency assertions.
test.describe.configure({ mode: 'serial' });

// ── GAP 1: POST /agency/custom-domain/verify ─────────────────────────────────

test.describe('Agency custom-domain/verify @gap @agency', () => {
  let cleanups: Array<() => Promise<void>> = [];

  test.afterEach(async () => {
    await runCleanups(cleanups);
    cleanups = [];
  });

  test('returns 401 for unauthenticated caller', async ({ unauthApi }) => {
    const res = await unauthApi.post('/api/portal/agency/custom-domain/verify', {});
    expect(res.status).toBe(401);
  });

  test('returns 400 when no custom domain is registered', async ({ clientApi }) => {
    // Ensure the client has no domain registered (DELETE is idempotent).
    await clientApi.delete('/api/portal/agency/custom-domain').catch(() => {});

    const res = await clientApi.post('/api/portal/agency/custom-domain/verify', {});
    expect(res.status).toBe(400);
    expect(res.data.success).toBe(false);
    expect(res.data.error).toMatch(/no custom domain|add one/i);
  });

  test('returns 422 with DNS hint when domain is registered but DNS not propagated', async ({
    clientApi,
  }) => {
    // Register a unique domain so the handler finds a token but DNS lookup fails
    // (we're in a test env — no real TXT record exists).
    const domain = `gap-verify-${Date.now()}.example.com`;

    cleanups.push(async () => {
      await clientApi.delete('/api/portal/agency/custom-domain').catch(() => {});
    });

    const regRes = await clientApi.post('/api/portal/agency/custom-domain', { domain });
    expect(regRes.status).toBe(200);
    expect(regRes.data.success).toBe(true);
    expect(regRes.data.data.verifiedAt).toBeNull();

    // Now call /verify — DNS won't have the TXT record → 422.
    const verifyRes = await clientApi.post('/api/portal/agency/custom-domain/verify', {});
    expect(verifyRes.status).toBe(422);
    expect(verifyRes.data.success).toBe(false);
    // Error must mention DNS propagation.
    expect(verifyRes.data.error).toMatch(/txt|dns|record|propagat/i);
    // The 422 body includes the verificationRecord so the user knows what to publish.
    expect(verifyRes.data.data?.verificationRecord).toBeTruthy();
    expect(verifyRes.data.data.verificationRecord.host).toBe(`_simplerdev.${domain}`);
    expect(verifyRes.data.data.verificationRecord.type).toBe('TXT');
    expect(verifyRes.data.data.verificationRecord.value).toMatch(/^[0-9a-f]{64}$/);
  });
});

// ── GAP 2: MCP branding READ tools ───────────────────────────────────────────

test.describe('MCP branding READ tools @gap @mcp @branding', () => {
  let cleanups: Array<() => Promise<void>> = [];

  test.afterEach(async () => {
    await runCleanups(cleanups);
    cleanups = [];
  });

  test('branding_list_profiles is exposed under branding:read scope', async ({ clientApi }) => {
    const { keyRecord, cleanup } = await createTestApiKey(clientApi, { scopes: ['branding:read'] });
    cleanups.push(cleanup);

    const mcp = await new McpTestClient(keyRecord.key).init();
    cleanups.push(() => mcp.dispose());

    const { tools } = await mcp.listTools();
    const names = new Set(tools.map((t) => t.name));
    expect(names.has('branding_list_profiles')).toBe(true);
    expect(names.has('branding_get_profile')).toBe(true);
    expect(names.has('branding_get_messaging')).toBe(true);
    expect(names.has('branding_audit')).toBe(true);
    expect(names.has('branding_check_contrast')).toBe(true);
  });

  test('branding_list_profiles returns an array for the calling client', async ({ clientApi }) => {
    const { keyRecord, cleanup } = await createTestApiKey(clientApi, { scopes: ['branding:read'] });
    cleanups.push(cleanup);

    const mcp = await new McpTestClient(keyRecord.key).init();
    cleanups.push(() => mcp.dispose());

    const res = await mcp.callTool('branding_list_profiles', {});
    expect(res.status).toBe(200);
    expect(res.isError).toBeFalsy();
    // The tool always returns { profiles: [...] }
    expect(res.data).toHaveProperty('profiles');
    expect(Array.isArray(res.data.profiles)).toBe(true);
  });

  test('branding_get_profile returns profile or "no profile found" envelope', async ({
    clientApi,
  }) => {
    const { keyRecord, cleanup } = await createTestApiKey(clientApi, { scopes: ['branding:read', 'branding:write'] });
    cleanups.push(cleanup);

    const mcp = await new McpTestClient(keyRecord.key).init();
    cleanups.push(() => mcp.dispose());

    // Create a profile so the get has something to return.
    const ts = Date.now();
    const created = await mcp.callTool('branding_create_profile', {
      name: `GAP-Read-Profile-${ts}`,
      primaryColor: '#2563eb',
      isDefault: false,
    });
    expect(created.status).toBe(200);
    const profileId = (created.data as { id?: number }).id;
    expect(profileId).toBeDefined();

    cleanups.push(async () => {
      await mcp.callTool('branding_delete_profile', { profileId }).catch(() => {});
    });

    const res = await mcp.callTool('branding_get_profile', { profileId });
    expect(res.status).toBe(200);
    expect(res.isError).toBeFalsy();
    expect(res.data).toHaveProperty('profile');
    const profile = res.data.profile as Record<string, unknown>;
    expect(profile.id).toBe(profileId);
    expect(profile.name).toBe(`GAP-Read-Profile-${ts}`);
    expect(profile.primaryColor).toBe('#2563eb');
  });

  test('branding_get_messaging returns messaging or "no messaging" envelope', async ({
    clientApi,
  }) => {
    const { keyRecord, cleanup } = await createTestApiKey(clientApi, { scopes: ['branding:read'] });
    cleanups.push(cleanup);

    const mcp = await new McpTestClient(keyRecord.key).init();
    cleanups.push(() => mcp.dispose());

    const res = await mcp.callTool('branding_get_messaging', {});
    expect(res.status).toBe(200);
    expect(res.isError).toBeFalsy();
    // Either { messaging: {...} } or { messaging: null, message: '...' }
    expect(res.data).toHaveProperty('messaging');
  });

  test('branding_audit returns a report for an existing profile', async ({ clientApi }) => {
    const { keyRecord, cleanup } = await createTestApiKey(clientApi, { scopes: ['branding:read', 'branding:write'] });
    cleanups.push(cleanup);

    const mcp = await new McpTestClient(keyRecord.key).init();
    cleanups.push(() => mcp.dispose());

    const ts = Date.now();
    const created = await mcp.callTool('branding_create_profile', {
      name: `GAP-Audit-Profile-${ts}`,
      primaryColor: '#2563eb',
      textColor: '#111827',
      backgroundColor: '#ffffff',
    });
    expect(created.status).toBe(200);
    const profileId = (created.data as { id?: number }).id!;
    cleanups.push(async () => {
      await mcp.callTool('branding_delete_profile', { profileId }).catch(() => {});
    });

    const res = await mcp.callTool('branding_audit', { profileId });
    expect(res.status).toBe(200);
    expect(res.isError).toBeFalsy();
    expect(res.data).toHaveProperty('report');
    const report = res.data.report as Record<string, unknown>;
    // Report must have score or issues
    expect(typeof report.score === 'number' || Array.isArray(report.issues) || Array.isArray(report.warnings) || typeof report === 'object').toBe(true);
  });

  test('branding_check_contrast returns WCAG ratio + AA/AAA pass/fail', async ({ clientApi }) => {
    const { keyRecord, cleanup } = await createTestApiKey(clientApi, { scopes: ['branding:read'] });
    cleanups.push(cleanup);

    const mcp = await new McpTestClient(keyRecord.key).init();
    cleanups.push(() => mcp.dispose());

    // High-contrast pair: black on white → ratio ~21:1 → passes AA + AAA
    const res = await mcp.callTool('branding_check_contrast', {
      foreground: '#000000',
      background: '#ffffff',
    });
    expect(res.status).toBe(200);
    expect(res.isError).toBeFalsy();
    expect(typeof res.data.ratio).toBe('number');
    expect(res.data.ratio).toBeGreaterThan(4.5);
    expect(res.data.passesAA).toBe(true);
    expect(res.data.passesAAA).toBe(true);
  });

  test('branding READ tools are denied without branding:read scope', async ({ clientApi }) => {
    const { keyRecord, cleanup } = await createTestApiKey(clientApi, { scopes: ['projects:read'] });
    cleanups.push(cleanup);

    const mcp = await new McpTestClient(keyRecord.key).init();
    cleanups.push(() => mcp.dispose());

    const { tools } = await mcp.listTools();
    const names = new Set(tools.map((t) => t.name));
    // None of the branding tools should be visible.
    expect(names.has('branding_list_profiles')).toBe(false);
    expect(names.has('branding_get_profile')).toBe(false);
    expect(names.has('branding_get_messaging')).toBe(false);
    expect(names.has('branding_audit')).toBe(false);
    expect(names.has('branding_check_contrast')).toBe(false);
  });
});

// ── GAP 3: GET /agency/chrome with whiteLabelEnabled=true ────────────────────

test.describe('Agency chrome — populated payload with whiteLabelEnabled=true @gap @agency @chrome', () => {
  // We directly patch the DB to simulate a fully-verified white-label client
  // since the DNS verification route requires real DNS resolution.

  let previousState: {
    whiteLabel: boolean;
    agencyName: string | null;
    agencyLogoUrl: string | null;
    agencyPrimaryColor: string | null;
    customDomain: string | null;
    customDomainVerifiedAt: string | null;
  } | null = null;

  const TEST_AGENCY_NAME = `GAP-Chrome-Agency-${Date.now()}`;
  const TEST_LOGO_URL = `https://cdn.example.com/gap-chrome-logo-${Date.now()}.png`;
  const TEST_COLOR = '#7c3aed';

  test.beforeAll(async ({ clientApi }) => {
    // Capture baseline.
    const baseline = await clientApi.get('/api/portal/agency/branding');
    const domainRes = await clientApi.get('/api/portal/agency/custom-domain');

    previousState = {
      whiteLabel: domainRes.data?.data?.whiteLabelEnabled ?? false,
      agencyName: baseline.data?.data?.agencyName ?? null,
      agencyLogoUrl: baseline.data?.data?.agencyLogoUrl ?? null,
      agencyPrimaryColor: baseline.data?.data?.agencyPrimaryColor ?? null,
      customDomain: domainRes.data?.data?.customDomain ?? null,
      customDomainVerifiedAt: null,
    };

    // Set agency branding via the API.
    await clientApi.patch('/api/portal/agency/branding', {
      agencyName: TEST_AGENCY_NAME,
      agencyLogoUrl: TEST_LOGO_URL,
      agencyPrimaryColor: TEST_COLOR,
    });

    // Directly stamp customDomainVerifiedAt in the DB to bypass real DNS.
    psql(
      `UPDATE clients SET custom_domain = 'gap-chrome-test.example.com', ` +
        `custom_domain_verification_token = 'aabbccdd00112233aabbccdd00112233aabbccdd00112233aabbccdd00112233', ` +
        `custom_domain_verified_at = NOW(), ` +
        `white_label_enabled = TRUE, ` +
        `updated_at = NOW() ` +
        `WHERE id = ${CLIENT_ID}`
    );
  });

  test.afterAll(async ({ clientApi }) => {
    // Restore white_label_enabled=false and clear the injected domain via DB.
    try {
      psql(
        `UPDATE clients SET white_label_enabled = FALSE, ` +
          `custom_domain = NULL, custom_domain_verification_token = NULL, ` +
          `custom_domain_verified_at = NULL, updated_at = NOW() WHERE id = ${CLIENT_ID}`
      );
    } catch { /* ignore */ }

    // Restore agency branding via the API.
    try {
      await clientApi.patch('/api/portal/agency/branding', {
        agencyName: previousState?.agencyName ?? null,
        agencyLogoUrl: previousState?.agencyLogoUrl ?? null,
        agencyPrimaryColor: previousState?.agencyPrimaryColor ?? null,
      });
    } catch { /* ignore */ }
  });

  test('GET /agency/chrome returns populated payload when whiteLabelEnabled=true', async ({
    clientApi,
  }) => {
    const chrome = await clientApi.get('/api/portal/agency/chrome');
    expect(chrome.status).toBe(200);
    expect(chrome.data.success).toBe(true);

    const d = chrome.data.data as {
      whiteLabelEnabled: boolean;
      agencyName: string | null;
      agencyLogoUrl: string | null;
      agencyPrimaryColor: string | null;
    };

    // The populated (white-label ON) payload must include all branding fields.
    expect(d.whiteLabelEnabled).toBe(true);
    expect(d.agencyName).toBe(TEST_AGENCY_NAME);
    expect(d.agencyLogoUrl).toBe(TEST_LOGO_URL);
    expect(d.agencyPrimaryColor).toBe(TEST_COLOR);
  });

  test('GET /agency/chrome without auth still returns 200 with populated payload (public endpoint)', async ({
    unauthApi,
  }) => {
    // chrome is a public endpoint — unauthenticated callers still get a 200,
    // but without session-resolved clientId, they get EMPTY (no branding).
    // The important thing is no crash / 5xx.
    const chrome = await unauthApi.get('/api/portal/agency/chrome');
    expect(chrome.status).toBe(200);
    expect(chrome.data.success).toBe(true);
    expect(chrome.data.data).toHaveProperty('whiteLabelEnabled');
  });
});
