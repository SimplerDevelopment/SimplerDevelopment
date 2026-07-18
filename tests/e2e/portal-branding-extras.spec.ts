/**
 * Portal Branding (extras) API E2E Tests
 *
 * Covers /api/portal/branding/** routes (portal-level branding — distinct
 * from /api/portal/websites/[siteId]/branding which is covered by
 * portal-cms-branding.spec.ts).
 *
 * AI-bound endpoints (generate-block-copy, generate-messaging,
 * generate-theme, rewrite-field) are exercised at the validation level
 * only — we do not invoke the LLM. Those tests are tagged @ai.
 *
 * All tests are rerunnable. Unique names use Date.now().
 */
import { test, expect } from './setup/fixtures';

test.describe.configure({ mode: 'serial' });

test.describe('Portal Branding — List @branding @list', () => {
  test('GET /branding returns websites with branding fields', async ({ clientApi }) => {
    const res = await clientApi.get('/api/portal/branding');
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(Array.isArray(res.data.data)).toBe(true);
    // Each row should have website + branding shape (branding fields may be null)
    for (const row of res.data.data) {
      expect(row).toHaveProperty('id');
      expect(row).toHaveProperty('name');
      expect(row).toHaveProperty('domain');
    }
  });

  test('rejects unauthenticated', async ({ unauthApi }) => {
    const res = await unauthApi.get('/api/portal/branding');
    expect(res.status).toBe(401);
  });
});

test.describe('Portal Branding — Profiles CRUD @branding @profiles', () => {
  let profileId: number;
  const profileName = `Test Profile ${Date.now()}`;

  test('POST /branding/profiles creates a profile', async ({ clientApi }) => {
    const res = await clientApi.post('/api/portal/branding/profiles', {
      name: profileName,
      primaryColor: '#3b82f6',
      secondaryColor: '#1e40af',
      accentColor: '#f59e0b',
      headingFont: 'Inter',
      bodyFont: 'Roboto',
    });
    expect(res.status).toBe(201);
    expect(res.data.success).toBe(true);
    expect(res.data.data).toHaveProperty('id');
    expect(res.data.data.name).toBe(profileName);
    expect(res.data.data.primaryColor).toBe('#3b82f6');
    profileId = res.data.data.id;
  });

  test('POST /branding/profiles rejects missing name', async ({ clientApi }) => {
    const res = await clientApi.post('/api/portal/branding/profiles', {
      primaryColor: '#000000',
    });
    expect(res.status).toBe(400);
    expect(res.data.success).toBe(false);
  });

  test('POST /branding/profiles rejects empty name', async ({ clientApi }) => {
    const res = await clientApi.post('/api/portal/branding/profiles', {
      name: '   ',
    });
    expect(res.status).toBe(400);
    expect(res.data.success).toBe(false);
  });

  test('POST /branding/profiles rejects unauthenticated', async ({ unauthApi }) => {
    const res = await unauthApi.post('/api/portal/branding/profiles', {
      name: 'unauth',
    });
    expect(res.status).toBe(401);
  });

  test('GET /branding/profiles lists profiles', async ({ clientApi }) => {
    const res = await clientApi.get('/api/portal/branding/profiles');
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(Array.isArray(res.data.data)).toBe(true);
    const found = res.data.data.find((p: { id: number }) => p.id === profileId);
    expect(found).toBeTruthy();
    expect(found.name).toBe(profileName);
  });

  test('GET /branding/profiles rejects unauthenticated', async ({ unauthApi }) => {
    const res = await unauthApi.get('/api/portal/branding/profiles');
    expect(res.status).toBe(401);
  });

  test('GET /branding/profiles/[id] returns the profile', async ({ clientApi }) => {
    const res = await clientApi.get(`/api/portal/branding/profiles/${profileId}`);
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.data.id).toBe(profileId);
    expect(res.data.data.name).toBe(profileName);
  });

  test('GET /branding/profiles/[id] returns 404 for missing', async ({ clientApi }) => {
    const res = await clientApi.get('/api/portal/branding/profiles/99999999');
    expect(res.status).toBe(404);
    expect(res.data.success).toBe(false);
  });

  test('GET /branding/profiles/[id] rejects unauthenticated', async ({ unauthApi }) => {
    const res = await unauthApi.get(`/api/portal/branding/profiles/${profileId}`);
    expect(res.status).toBe(401);
  });

  test('PUT /branding/profiles/[id] updates the profile', async ({ clientApi }) => {
    const res = await clientApi.put(`/api/portal/branding/profiles/${profileId}`, {
      primaryColor: '#10b981',
      headingFont: 'Playfair Display',
      borderRadius: '12px',
      linkColor: '#0ea5e9',
    });
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.data.primaryColor).toBe('#10b981');
    expect(res.data.data.headingFont).toBe('Playfair Display');
    expect(res.data.data.borderRadius).toBe('12px');
    expect(res.data.data.linkColor).toBe('#0ea5e9');

    // Verify persistence
    const verify = await clientApi.get(`/api/portal/branding/profiles/${profileId}`);
    expect(verify.data.data.primaryColor).toBe('#10b981');
  });

  test('PUT /branding/profiles/[id] returns 404 for missing', async ({ clientApi }) => {
    const res = await clientApi.put('/api/portal/branding/profiles/99999999', {
      primaryColor: '#000000',
    });
    expect(res.status).toBe(404);
    expect(res.data.success).toBe(false);
  });

  test('PUT /branding/profiles/[id] rejects unauthenticated', async ({ unauthApi }) => {
    const res = await unauthApi.put(`/api/portal/branding/profiles/${profileId}`, {
      primaryColor: '#000000',
    });
    expect(res.status).toBe(401);
  });

  test('DELETE /branding/profiles/[id] rejects unauthenticated', async ({ unauthApi }) => {
    const res = await unauthApi.delete(`/api/portal/branding/profiles/${profileId}`);
    expect(res.status).toBe(401);
  });

  test('DELETE /branding/profiles/[id] removes the profile', async ({ clientApi }) => {
    const res = await clientApi.delete(`/api/portal/branding/profiles/${profileId}`);
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);

    const verify = await clientApi.get(`/api/portal/branding/profiles/${profileId}`);
    expect(verify.status).toBe(404);
  });

  test('DELETE /branding/profiles/[id] returns 404 for missing', async ({ clientApi }) => {
    const res = await clientApi.delete('/api/portal/branding/profiles/99999999');
    expect(res.status).toBe(404);
  });
});

test.describe('Portal Branding — Defaults @branding @defaults', () => {
  test('GET /branding/defaults returns brand defaults context', async ({ clientApi }) => {
    const res = await clientApi.get('/api/portal/branding/defaults');
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.data).toBeTruthy();
    expect(typeof res.data.data).toBe('object');
  });

  test('GET /branding/defaults accepts profileId param', async ({ clientApi }) => {
    // Even with a non-existent profileId the endpoint should still resolve
    // (it falls back to the client's default messaging).
    const res = await clientApi.get('/api/portal/branding/defaults?profileId=99999999');
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
  });

  test('rejects unauthenticated', async ({ unauthApi }) => {
    const res = await unauthApi.get('/api/portal/branding/defaults');
    expect(res.status).toBe(401);
  });
});

test.describe('Portal Branding — Messaging @branding @messaging', () => {
  test('GET /branding/messaging returns the client default row (or null)', async ({ clientApi }) => {
    const res = await clientApi.get('/api/portal/branding/messaging');
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    // data is either an object or null
    if (res.data.data !== null) {
      expect(res.data.data).toHaveProperty('clientId');
    }
  });

  test('PUT /branding/messaging upserts client-default messaging', async ({ clientApi }) => {
    const tagline = `Tagline ${Date.now()}`;
    const res = await clientApi.put('/api/portal/branding/messaging', {
      companyName: 'Test Co',
      tagline,
      missionStatement: 'Mission text',
      toneOfVoice: 'Professional, Friendly',
    });
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.data.tagline).toBe(tagline);
    expect(res.data.data.companyName).toBe('Test Co');
  });

  test('PUT /branding/messaging is idempotent (upsert)', async ({ clientApi }) => {
    const taglineA = `Tag A ${Date.now()}`;
    const taglineB = `Tag B ${Date.now()}`;

    const a = await clientApi.put('/api/portal/branding/messaging', { tagline: taglineA });
    expect(a.status).toBe(200);

    const b = await clientApi.put('/api/portal/branding/messaging', { tagline: taglineB });
    expect(b.status).toBe(200);
    expect(b.data.data.tagline).toBe(taglineB);

    const verify = await clientApi.get('/api/portal/branding/messaging');
    expect(verify.data.data.tagline).toBe(taglineB);
  });

  test('rejects unauthenticated GET', async ({ unauthApi }) => {
    const res = await unauthApi.get('/api/portal/branding/messaging');
    expect(res.status).toBe(401);
  });

  test('rejects unauthenticated PUT', async ({ unauthApi }) => {
    const res = await unauthApi.put('/api/portal/branding/messaging', { tagline: 'x' });
    expect(res.status).toBe(401);
  });
});

test.describe('Portal Branding — Audit @branding @audit', () => {
  let auditProfileId: number;

  test.beforeAll(async ({ clientApi }) => {
    const res = await clientApi.post('/api/portal/branding/profiles', {
      name: `Audit Profile ${Date.now()}`,
      primaryColor: '#2563eb',
      secondaryColor: '#1e40af',
      accentColor: '#f59e0b',
      backgroundColor: '#ffffff',
      textColor: '#111827',
      headingFont: 'Inter',
      bodyFont: 'Roboto',
    });
    auditProfileId = res.data.data.id;
  });

  test.afterAll(async ({ clientApi }) => {
    if (auditProfileId) {
      await clientApi.delete(`/api/portal/branding/profiles/${auditProfileId}`);
    }
  });

  test('POST /branding/audit returns a deterministic audit report', async ({ clientApi }) => {
    const res = await clientApi.post('/api/portal/branding/audit', {
      profileId: auditProfileId,
    });
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.report).toBeTruthy();
  });

  test('POST /branding/audit rejects missing profileId', async ({ clientApi }) => {
    const res = await clientApi.post('/api/portal/branding/audit', {});
    expect(res.status).toBe(400);
    expect(res.data.success).toBe(false);
  });

  test('POST /branding/audit rejects invalid profileId', async ({ clientApi }) => {
    const res = await clientApi.post('/api/portal/branding/audit', {
      profileId: 'not-a-number',
    });
    expect(res.status).toBe(400);
    expect(res.data.success).toBe(false);
  });

  test('POST /branding/audit returns 404 for missing profile', async ({ clientApi }) => {
    const res = await clientApi.post('/api/portal/branding/audit', {
      profileId: 99999999,
    });
    expect(res.status).toBe(404);
    expect(res.data.success).toBe(false);
  });

  test('rejects unauthenticated', async ({ unauthApi }) => {
    const res = await unauthApi.post('/api/portal/branding/audit', {
      profileId: 1,
    });
    expect(res.status).toBe(401);
  });
});

/**
 * AI-bound endpoints below — exercised at the validation/auth boundary
 * only. We do not invoke the LLM (would require ANTHROPIC_API_KEY and
 * cost tokens). Tests are tagged @ai so the suite can opt-out.
 */

test.describe('Portal Branding — Generate Block Copy @branding @ai @generate', () => {
  test('POST rejects missing blockType', async ({ clientApi }) => {
    const res = await clientApi.post('/api/portal/branding/generate-block-copy', {});
    expect(res.status).toBe(400);
    expect(res.data.success).toBe(false);
  });

  test('POST rejects non-string blockType', async ({ clientApi }) => {
    const res = await clientApi.post('/api/portal/branding/generate-block-copy', {
      blockType: 123,
    });
    expect(res.status).toBe(400);
    expect(res.data.success).toBe(false);
  });

  test('rejects unauthenticated', async ({ unauthApi }) => {
    const res = await unauthApi.post('/api/portal/branding/generate-block-copy', {
      blockType: 'hero',
    });
    expect(res.status).toBe(401);
  });
});

test.describe('Portal Branding — Generate Messaging @branding @ai @generate', () => {
  test('POST rejects missing description', async ({ clientApi }) => {
    const res = await clientApi.post('/api/portal/branding/generate-messaging', {});
    expect(res.status).toBe(400);
    expect(res.data.success).toBe(false);
  });

  test('POST rejects empty description', async ({ clientApi }) => {
    const res = await clientApi.post('/api/portal/branding/generate-messaging', {
      description: '   ',
    });
    expect(res.status).toBe(400);
    expect(res.data.success).toBe(false);
  });

  test('rejects unauthenticated', async ({ unauthApi }) => {
    const res = await unauthApi.post('/api/portal/branding/generate-messaging', {
      description: 'A SaaS company',
    });
    expect(res.status).toBe(401);
  });
});

test.describe('Portal Branding — Generate Theme @branding @ai @generate', () => {
  test('POST rejects missing description', async ({ clientApi }) => {
    const res = await clientApi.post('/api/portal/branding/generate-theme', {});
    expect(res.status).toBe(400);
    expect(res.data.success).toBe(false);
  });

  test('POST rejects empty description', async ({ clientApi }) => {
    const res = await clientApi.post('/api/portal/branding/generate-theme', {
      description: '   ',
    });
    expect(res.status).toBe(400);
    expect(res.data.success).toBe(false);
  });

  test('rejects unauthenticated', async ({ unauthApi }) => {
    const res = await unauthApi.post('/api/portal/branding/generate-theme', {
      description: 'A modern fintech brand',
    });
    expect(res.status).toBe(401);
  });
});

test.describe('Portal Branding — Rewrite Field @branding @ai @generate', () => {
  test('POST rejects missing fieldName', async ({ clientApi }) => {
    const res = await clientApi.post('/api/portal/branding/rewrite-field', {
      prompt: 'Make it punchier',
    });
    expect(res.status).toBe(400);
    expect(res.data.success).toBe(false);
  });

  test('POST rejects missing prompt', async ({ clientApi }) => {
    const res = await clientApi.post('/api/portal/branding/rewrite-field', {
      fieldName: 'tagline',
    });
    expect(res.status).toBe(400);
    expect(res.data.success).toBe(false);
  });

  test('POST rejects empty prompt', async ({ clientApi }) => {
    const res = await clientApi.post('/api/portal/branding/rewrite-field', {
      fieldName: 'tagline',
      prompt: '   ',
    });
    expect(res.status).toBe(400);
    expect(res.data.success).toBe(false);
  });

  test('rejects unauthenticated', async ({ unauthApi }) => {
    const res = await unauthApi.post('/api/portal/branding/rewrite-field', {
      fieldName: 'tagline',
      prompt: 'Make it punchier',
    });
    expect(res.status).toBe(401);
  });
});
