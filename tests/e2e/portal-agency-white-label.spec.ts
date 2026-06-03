/**
 * Portal Agency / White-Label Platform — mutation lifecycle E2E (@critical).
 *
 * Golden-path spec exercising:
 *   1. GET agency branding → read baseline values
 *   2. PATCH branding → set agencyName + agencyLogoUrl + agencyPrimaryColor, assert persistence
 *   3. POST custom-domain → assert PENDING/unverified state with a TXT verification token issued
 *   4. Attempt to enable white-label BEFORE domain verified → assert 422 rejection
 *   5. GET /agency/chrome → assert empty payload while whiteLabelEnabled=false
 *   6. DELETE custom-domain + PATCH branding null → restore prior state
 *
 * No real DNS resolution is performed. The spec asserts the pending verification
 * branch only (verifiedAt is null, verificationRecord contains host/type/value).
 *
 * Cleanup restores the clients row to its prior state via DELETE /custom-domain
 * and PATCH /branding with baseline values.
 */
import { test, expect } from './setup/fixtures';
import { runCleanups } from './setup/helpers';

const PREFIX = 'AGENCY-WL-';

test.describe('Portal Agency — white-label platform lifecycle @agency @mutations @critical', () => {
  let cleanups: Array<() => Promise<void>> = [];
  // Multiple sequential round-trips; bump from default 60s.
  test.setTimeout(180_000);

  test.afterEach(async () => {
    await runCleanups(cleanups);
    cleanups = [];
  });

  // ── 1. Branding read + partial update lifecycle ───────────────────────────

  test('GET /agency/branding returns success with branding fields', async ({ clientApi }) => {
    const res = await clientApi.get('/api/portal/agency/branding');
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    // Fields may be null on a fresh seed but the keys must be present.
    const d = res.data.data;
    expect(d).toHaveProperty('agencyName');
    expect(d).toHaveProperty('agencyLogoUrl');
    expect(d).toHaveProperty('agencyPrimaryColor');
    expect(d).toHaveProperty('whiteLabelEnabled');
  });

  test('PATCH /agency/branding rejects empty body', async ({ clientApi }) => {
    const res = await clientApi.patch('/api/portal/agency/branding', {});
    expect(res.status).toBe(400);
    expect(res.data.success).toBe(false);
  });

  test('PATCH /agency/branding → set agencyName + logoUrl + color → persists, then restore', async ({
    clientApi,
  }) => {
    // Capture baseline so afterEach can restore it.
    const baseline = await clientApi.get('/api/portal/agency/branding');
    expect(baseline.status).toBe(200);
    const prior = baseline.data.data as {
      agencyName: string | null;
      agencyLogoUrl: string | null;
      agencyPrimaryColor: string | null;
    };

    cleanups.push(async () => {
      await clientApi
        .patch('/api/portal/agency/branding', {
          agencyName: prior.agencyName,
          agencyLogoUrl: prior.agencyLogoUrl,
          agencyPrimaryColor: prior.agencyPrimaryColor,
        })
        .catch(() => {});
    });

    const ts = Date.now();
    const newName = `${PREFIX}Agency-${ts}`;
    const newLogo = `https://cdn.example.com/logos/${ts}.png`;
    const newColor = '#7c3aed';

    const patch = await clientApi.patch('/api/portal/agency/branding', {
      agencyName: newName,
      agencyLogoUrl: newLogo,
      agencyPrimaryColor: newColor,
    });
    expect(patch.status).toBe(200);
    expect(patch.data.success).toBe(true);
    expect(patch.data.data.agencyName).toBe(newName);
    expect(patch.data.data.agencyLogoUrl).toBe(newLogo);
    expect(patch.data.data.agencyPrimaryColor).toBe(newColor);

    // Verify persistence via a fresh GET.
    const verify = await clientApi.get('/api/portal/agency/branding');
    expect(verify.status).toBe(200);
    expect(verify.data.data.agencyName).toBe(newName);
    expect(verify.data.data.agencyLogoUrl).toBe(newLogo);
    expect(verify.data.data.agencyPrimaryColor).toBe(newColor);
  });

  test('PATCH /agency/branding null values clear individual fields', async ({ clientApi }) => {
    const baseline = await clientApi.get('/api/portal/agency/branding');
    expect(baseline.status).toBe(200);
    const prior = baseline.data.data as {
      agencyName: string | null;
      agencyLogoUrl: string | null;
      agencyPrimaryColor: string | null;
    };

    cleanups.push(async () => {
      await clientApi
        .patch('/api/portal/agency/branding', {
          agencyName: prior.agencyName,
          agencyLogoUrl: prior.agencyLogoUrl,
          agencyPrimaryColor: prior.agencyPrimaryColor,
        })
        .catch(() => {});
    });

    // First set a name so we can null it.
    await clientApi.patch('/api/portal/agency/branding', {
      agencyName: `${PREFIX}ToNull-${Date.now()}`,
    });

    const nullPatch = await clientApi.patch('/api/portal/agency/branding', {
      agencyName: null,
    });
    expect(nullPatch.status).toBe(200);
    expect(nullPatch.data.success).toBe(true);
    expect(nullPatch.data.data.agencyName).toBeNull();
  });

  // ── 2. Custom-domain POST → assert pending/unverified state ───────────────

  test('GET /agency/custom-domain returns current domain state', async ({ clientApi }) => {
    const res = await clientApi.get('/api/portal/agency/custom-domain');
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    // verifiedAt may or may not be set; just verify envelope shape.
    expect(res.data.data).toHaveProperty('customDomain');
    expect(res.data.data).toHaveProperty('verifiedAt');
    expect(res.data.data).toHaveProperty('whiteLabelEnabled');
  });

  test('POST /agency/custom-domain → domain starts UNVERIFIED with TXT record token', async ({
    clientApi,
  }) => {
    // Use a timestamped domain so concurrent runs never collide.
    const domain = `portal-test-${Date.now()}.example.com`;

    cleanups.push(async () => {
      await clientApi.delete('/api/portal/agency/custom-domain').catch(() => {});
    });

    const post = await clientApi.post('/api/portal/agency/custom-domain', { domain });
    expect(post.status).toBe(200);
    expect(post.data.success).toBe(true);

    const d = post.data.data;
    // Domain stored (normalised — no protocol).
    expect(d.customDomain).toBe(domain);
    // Must start unverified.
    expect(d.verifiedAt).toBeNull();
    // whiteLabelEnabled must be false after a fresh registration.
    expect(d.whiteLabelEnabled).toBe(false);
    // Verification record hints must be present and well-formed.
    expect(d.verificationRecord).toBeTruthy();
    // Host is the `_simplerdev.<domain>` TXT lookup name (see lib/agency/dns-verify).
    expect(d.verificationRecord.host).toBe(`_simplerdev.${domain}`);
    expect(d.verificationRecord.type).toBe('TXT');
    // Token is 32 random bytes hex-encoded → exactly 64 lowercase hex chars.
    expect(d.verificationRecord.value).toMatch(/^[0-9a-f]{64}$/);
  });

  test('POST /agency/custom-domain → re-POST resets verifiedAt + whiteLabelEnabled', async ({
    clientApi,
  }) => {
    const domain = `portal-reset-${Date.now()}.example.com`;

    cleanups.push(async () => {
      await clientApi.delete('/api/portal/agency/custom-domain').catch(() => {});
    });

    // First registration.
    const first = await clientApi.post('/api/portal/agency/custom-domain', { domain });
    expect(first.status).toBe(200);
    expect(first.data.data.verifiedAt).toBeNull();
    const firstToken = first.data.data.verificationRecord.value as string;
    expect(firstToken).toMatch(/^[0-9a-f]{64}$/);

    // Second registration of the same domain — token is re-issued, state resets.
    // Re-claiming your OWN domain is allowed (handler short-circuits the
    // cross-client 409 when existing.id === ctx.client.id).
    const second = await clientApi.post('/api/portal/agency/custom-domain', { domain });
    expect(second.status).toBe(200);
    expect(second.data.data.customDomain).toBe(domain);
    expect(second.data.data.verifiedAt).toBeNull();
    expect(second.data.data.whiteLabelEnabled).toBe(false);
    // A fresh token must be minted on re-POST, not the prior one.
    const secondToken = second.data.data.verificationRecord.value as string;
    expect(secondToken).toMatch(/^[0-9a-f]{64}$/);
    expect(secondToken).not.toBe(firstToken);
  });

  test('DELETE /agency/custom-domain removes domain and forces whiteLabelEnabled=false', async ({
    clientApi,
  }) => {
    const domain = `portal-del-${Date.now()}.example.com`;

    // Register a domain first.
    const post = await clientApi.post('/api/portal/agency/custom-domain', { domain });
    expect(post.status).toBe(200);

    const del = await clientApi.delete('/api/portal/agency/custom-domain');
    expect(del.status).toBe(200);
    expect(del.data.success).toBe(true);

    // Domain state is cleared.
    const check = await clientApi.get('/api/portal/agency/custom-domain');
    expect(check.status).toBe(200);
    expect(check.data.data.customDomain).toBeNull();
    expect(check.data.data.whiteLabelEnabled).toBe(false);
  });

  // ── 3. White-label toggle gate (pre-verification) ─────────────────────────

  test('POST /agency/white-label → enabling rejected (422) when domain is unverified', async ({
    clientApi,
  }) => {
    // Register a fresh unverified domain so the gate is unambiguous.
    const domain = `portal-wl-gate-${Date.now()}.example.com`;
    cleanups.push(async () => {
      await clientApi.delete('/api/portal/agency/custom-domain').catch(() => {});
    });

    const domainPost = await clientApi.post('/api/portal/agency/custom-domain', { domain });
    expect(domainPost.status).toBe(200);
    expect(domainPost.data.data.verifiedAt).toBeNull();

    // Attempt to enable white-label before verification.
    const toggle = await clientApi.post('/api/portal/agency/white-label', { enabled: true });
    expect(toggle.status).toBe(422);
    expect(toggle.data.success).toBe(false);
    // The error message must mention verification / custom domain.
    expect(toggle.data.error).toMatch(/verify|domain/i);
  });

  test('POST /agency/white-label → disabling is always allowed (even when already off)', async ({
    clientApi,
  }) => {
    // Disabling is unconditionally permitted, no domain or name required.
    const toggle = await clientApi.post('/api/portal/agency/white-label', { enabled: false });
    expect(toggle.status).toBe(200);
    expect(toggle.data.success).toBe(true);
    expect(toggle.data.data.whiteLabelEnabled).toBe(false);
  });

  // ── 4. Chrome endpoint ────────────────────────────────────────────────────

  test('GET /agency/chrome returns empty/minimal payload when whiteLabelEnabled=false', async ({
    clientApi,
  }) => {
    // First ensure white-label is off (disabling is always safe).
    await clientApi.post('/api/portal/agency/white-label', { enabled: false });

    const chrome = await clientApi.get('/api/portal/agency/chrome');
    expect(chrome.status).toBe(200);
    expect(chrome.data.success).toBe(true);
    // When white-label is disabled the public chrome payload is empty.
    const d = chrome.data.data;
    expect(d.whiteLabelEnabled).toBe(false);
  });

  // ── 5. Unauthenticated rejection ──────────────────────────────────────────

  test('GET /agency/branding rejects unauthenticated (401)', async ({ unauthApi }) => {
    const res = await unauthApi.get('/api/portal/agency/branding');
    expect(res.status).toBe(401);
  });

  test('PATCH /agency/branding rejects unauthenticated (401)', async ({ unauthApi }) => {
    const res = await unauthApi.patch('/api/portal/agency/branding', {
      agencyName: 'Unauthorized Attempt',
    });
    expect(res.status).toBe(401);
  });

  test('POST /agency/custom-domain rejects unauthenticated (401)', async ({ unauthApi }) => {
    const res = await unauthApi.post('/api/portal/agency/custom-domain', {
      domain: `portal-unauth-${Date.now()}.example.com`,
    });
    expect(res.status).toBe(401);
  });

  test('POST /agency/white-label rejects unauthenticated (401)', async ({ unauthApi }) => {
    const res = await unauthApi.post('/api/portal/agency/white-label', { enabled: false });
    expect(res.status).toBe(401);
  });

  // ── 6. Full golden-path lifecycle (flow summary) ──────────────────────────

  test(
    'golden-path: read baseline → update branding → register domain → assert pending → ' +
      'reject white-label toggle → clean up',
    async ({ clientApi }) => {
      // Step 1: Capture baseline branding for restore.
      const baselineBranding = await clientApi.get('/api/portal/agency/branding');
      expect(baselineBranding.status).toBe(200);
      const priorBranding = baselineBranding.data.data as {
        agencyName: string | null;
        agencyLogoUrl: string | null;
        agencyPrimaryColor: string | null;
      };

      cleanups.push(async () => {
        await clientApi.delete('/api/portal/agency/custom-domain').catch(() => {});
        await clientApi
          .patch('/api/portal/agency/branding', {
            agencyName: priorBranding.agencyName,
            agencyLogoUrl: priorBranding.agencyLogoUrl,
            agencyPrimaryColor: priorBranding.agencyPrimaryColor,
          })
          .catch(() => {});
      });

      // Step 2: Update branding — set agency name, logo, primary color.
      const ts = Date.now();
      const agencyName = `${PREFIX}GoldenPath-${ts}`;
      const patchRes = await clientApi.patch('/api/portal/agency/branding', {
        agencyName,
        agencyLogoUrl: `https://cdn.example.com/${ts}.png`,
        agencyPrimaryColor: '#0f172a',
      });
      expect(patchRes.status).toBe(200);
      expect(patchRes.data.success).toBe(true);
      expect(patchRes.data.data.agencyName).toBe(agencyName);

      // Verify persistence.
      const getAfterPatch = await clientApi.get('/api/portal/agency/branding');
      expect(getAfterPatch.data.data.agencyName).toBe(agencyName);

      // Step 3: Register a custom domain.
      const domain = `portal-gp-${ts}.example.com`;
      const domainRes = await clientApi.post('/api/portal/agency/custom-domain', { domain });
      expect(domainRes.status).toBe(200);
      expect(domainRes.data.success).toBe(true);

      const domainData = domainRes.data.data;
      // Domain stored, starts unverified.
      expect(domainData.customDomain).toBe(domain);
      expect(domainData.verifiedAt).toBeNull();
      expect(domainData.whiteLabelEnabled).toBe(false);

      // TXT verification record must be issued.
      expect(domainData.verificationRecord).toBeTruthy();
      expect(domainData.verificationRecord.host).toBe(`_simplerdev.${domain}`);
      expect(domainData.verificationRecord.type).toBe('TXT');
      // 32-byte hex token — exactly 64 lowercase hex chars.
      expect(domainData.verificationRecord.value).toMatch(/^[0-9a-f]{64}$/);

      // Step 4: Attempt to enable white-label before domain is verified — must be rejected.
      const wlToggle = await clientApi.post('/api/portal/agency/white-label', { enabled: true });
      expect(wlToggle.status).toBe(422);
      expect(wlToggle.data.success).toBe(false);
      expect(wlToggle.data.error).toMatch(/verify|domain/i);

      // Step 5: Confirm chrome endpoint still shows whiteLabelEnabled=false.
      const chrome = await clientApi.get('/api/portal/agency/chrome');
      expect(chrome.status).toBe(200);
      expect(chrome.data.data.whiteLabelEnabled).toBe(false);

      // Cleanup is handled by afterEach via the lambda pushed in Step 1.
    },
  );
});
