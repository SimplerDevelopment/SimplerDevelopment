// @vitest-environment node
/**
 * Unit tests for four small API routes (batch 24c):
 *   - app/api/portal/brain/settings/route.ts            (GET, PUT)
 *   - app/api/portal/brain/promotion-targets/route.ts   (GET)
 *   - app/api/portal/brain/adapters/route.ts            (GET)
 *   - app/api/portal/brain/saved-searches/route.ts      (GET, POST)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextResponse } from 'next/server';

// ---------------------------------------------------------------------------
// Shared mocks
// ---------------------------------------------------------------------------

const requireBrainEntitlementMock = vi.fn();
vi.mock('@/lib/brain/entitlement', () => ({
  requireBrainEntitlement: (...args: unknown[]) => requireBrainEntitlementMock(...args),
}));

const getOrCreateBrainProfileMock = vi.fn();
const updateBrainProfileMock = vi.fn();
const applyIndustryTemplateDefaultsMock = vi.fn();
vi.mock('@/lib/brain/profiles', () => ({
  getOrCreateBrainProfile: (...args: unknown[]) => getOrCreateBrainProfileMock(...args),
  updateBrainProfile: (...args: unknown[]) => updateBrainProfileMock(...args),
  applyIndustryTemplateDefaults: (...args: unknown[]) => applyIndustryTemplateDefaultsMock(...args),
}));

const listIndustryTemplatesMock = vi.fn();
const getIndustryTemplateMock = vi.fn();
vi.mock('@/lib/brain/industry-templates', () => ({
  listIndustryTemplates: (...args: unknown[]) => listIndustryTemplatesMock(...args),
  getIndustryTemplate: (...args: unknown[]) => getIndustryTemplateMock(...args),
}));

const listPromotionTargetsMock = vi.fn();
vi.mock('@/lib/brain/tasks', () => ({
  listPromotionTargets: (...args: unknown[]) => listPromotionTargetsMock(...args),
}));

const listEnabledAdaptersMock = vi.fn();
vi.mock('@/lib/brain/meeting-sources', () => ({
  listEnabledAdapters: (...args: unknown[]) => listEnabledAdaptersMock(...args),
}));

const listSavedSearchesMock = vi.fn();
const createSavedSearchMock = vi.fn();
vi.mock('@/lib/brain/saved-searches', () => ({
  listSavedSearches: (...args: unknown[]) => listSavedSearchesMock(...args),
  createSavedSearch: (...args: unknown[]) => createSavedSearchMock(...args),
}));

// industry-templates default fixture is loaded at top-level on the
// settings route, so we set a stable list before imports happen
listIndustryTemplatesMock.mockReturnValue([
  { id: 'generic', name: 'Generic' },
  { id: 'wealth-advisory', name: 'Wealth Advisory' },
]);

// ---- modules under test (loaded AFTER mocks) ----
const settingsRoute = await import('@/app/api/portal/brain/settings/route');
const promotionTargetsRoute = await import('@/app/api/portal/brain/promotion-targets/route');
const adaptersRoute = await import('@/app/api/portal/brain/adapters/route');
const savedSearchesRoute = await import('@/app/api/portal/brain/saved-searches/route');

// ---- helpers ----
function makeReq(url: string, init?: RequestInit): Request {
  return new Request(url, init);
}

const FAIL_RESPONSE = NextResponse.json(
  { success: false, code: 'BRAIN_NOT_ENTITLED' },
  { status: 402 },
);

beforeEach(() => {
  requireBrainEntitlementMock.mockReset();
  getOrCreateBrainProfileMock.mockReset();
  updateBrainProfileMock.mockReset();
  applyIndustryTemplateDefaultsMock.mockReset();
  listIndustryTemplatesMock.mockReset();
  getIndustryTemplateMock.mockReset();
  listPromotionTargetsMock.mockReset();
  listEnabledAdaptersMock.mockReset();
  listSavedSearchesMock.mockReset();
  createSavedSearchMock.mockReset();

  // re-prime templates list (used in PUT validation)
  listIndustryTemplatesMock.mockReturnValue([
    { id: 'generic', name: 'Generic' },
    { id: 'wealth-advisory', name: 'Wealth Advisory' },
  ]);
});

// ===========================================================================
// brain/settings
// ===========================================================================

describe('GET /api/portal/brain/settings', () => {
  it('returns the entitlement response when not entitled', async () => {
    requireBrainEntitlementMock.mockResolvedValue({ response: FAIL_RESPONSE });
    const res = await settingsRoute.GET();
    expect(res.status).toBe(402);
  });

  it('returns the brain profile + template + available templates', async () => {
    requireBrainEntitlementMock.mockResolvedValue({
      client: { id: 5, company: 'Acme' },
      userId: 1,
      role: 'admin',
    });
    getOrCreateBrainProfileMock.mockResolvedValue({ id: 9, industryTemplate: 'generic' });
    getIndustryTemplateMock.mockReturnValue({ id: 'generic', name: 'Generic' });

    const res = await settingsRoute.GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.profile).toEqual({ id: 9, industryTemplate: 'generic' });
    expect(body.data.template).toEqual({ id: 'generic', name: 'Generic' });
    expect(Array.isArray(body.data.availableTemplates)).toBe(true);
    expect(getOrCreateBrainProfileMock).toHaveBeenCalledWith(5, 'Acme');
  });

  it('falls back to "Company Brain" when client has no company name', async () => {
    requireBrainEntitlementMock.mockResolvedValue({
      client: { id: 7, company: null },
      userId: 1,
      role: 'admin',
    });
    getOrCreateBrainProfileMock.mockResolvedValue({ id: 9, industryTemplate: 'generic' });
    getIndustryTemplateMock.mockReturnValue({ id: 'generic', name: 'Generic' });

    await settingsRoute.GET();
    expect(getOrCreateBrainProfileMock).toHaveBeenCalledWith(7, 'Company Brain');
  });
});

describe('PUT /api/portal/brain/settings', () => {
  it('returns the entitlement response when not entitled', async () => {
    requireBrainEntitlementMock.mockResolvedValue({ response: FAIL_RESPONSE });
    const res = await settingsRoute.PUT(
      makeReq('http://x/api/portal/brain/settings', { method: 'PUT', body: '{}' }),
    );
    expect(res.status).toBe(402);
  });

  it('returns 400 when the body is not a JSON object', async () => {
    requireBrainEntitlementMock.mockResolvedValue({
      client: { id: 5, company: 'Acme' },
      userId: 1,
      role: 'admin',
    });
    const res = await settingsRoute.PUT(
      makeReq('http://x/api/portal/brain/settings', {
        method: 'PUT',
        body: 'not-json',
        headers: { 'content-type': 'application/json' },
      }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).success).toBe(false);
  });

  it('returns 400 when industryTemplate is unknown', async () => {
    requireBrainEntitlementMock.mockResolvedValue({
      client: { id: 5, company: 'Acme' },
      userId: 1,
      role: 'admin',
    });
    getOrCreateBrainProfileMock.mockResolvedValue({ id: 9, industryTemplate: 'generic' });
    const res = await settingsRoute.PUT(
      makeReq('http://x/api/portal/brain/settings', {
        method: 'PUT',
        body: JSON.stringify({ industryTemplate: 'made-up' }),
        headers: { 'content-type': 'application/json' },
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toMatch(/industry template/i);
  });

  it('returns 400 when defaultConfidentiality is invalid', async () => {
    requireBrainEntitlementMock.mockResolvedValue({
      client: { id: 5, company: 'Acme' },
      userId: 1,
      role: 'admin',
    });
    getOrCreateBrainProfileMock.mockResolvedValue({ id: 9, industryTemplate: 'generic' });
    const res = await settingsRoute.PUT(
      makeReq('http://x/api/portal/brain/settings', {
        method: 'PUT',
        body: JSON.stringify({ defaultConfidentiality: 'top-secret' }),
        headers: { 'content-type': 'application/json' },
      }),
    );
    expect(res.status).toBe(400);
  });

  it('applies updates and template defaults when industryTemplate changes', async () => {
    requireBrainEntitlementMock.mockResolvedValue({
      client: { id: 5, company: 'Acme' },
      userId: 1,
      role: 'admin',
    });
    getOrCreateBrainProfileMock.mockResolvedValue({ id: 9, industryTemplate: 'generic' });

    const initialUpdated = { id: 9, industryTemplate: 'generic', name: 'Brain' };
    const afterTemplate = { id: 9, industryTemplate: 'wealth-advisory', name: 'Brain' };
    updateBrainProfileMock.mockResolvedValue(initialUpdated);
    applyIndustryTemplateDefaultsMock.mockResolvedValue(afterTemplate);
    getIndustryTemplateMock.mockReturnValue({ id: 'wealth-advisory', name: 'Wealth Advisory' });

    const res = await settingsRoute.PUT(
      makeReq('http://x/api/portal/brain/settings', {
        method: 'PUT',
        body: JSON.stringify({
          name: '   Brain Profile   ',
          industryTemplate: 'wealth-advisory',
          enabled: true,
          autoProcessEmail: false,
          autoLinkCrm: true,
          defaultConfidentiality: 'restricted',
          enabledModules: { tasks: true },
          serviceLines: ['planning', 42, 'tax'],
        }),
        headers: { 'content-type': 'application/json' },
      }),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.profile).toEqual(afterTemplate);
    expect(body.data.template).toEqual({ id: 'wealth-advisory', name: 'Wealth Advisory' });

    expect(updateBrainProfileMock).toHaveBeenCalledTimes(1);
    const [, patch] = updateBrainProfileMock.mock.calls[0];
    expect(patch.name).toBe('Brain Profile');
    expect(patch.enabled).toBe(true);
    expect(patch.autoProcessEmail).toBe(false);
    expect(patch.autoLinkCrm).toBe(true);
    expect(patch.defaultConfidentiality).toBe('restricted');
    expect(patch.enabledModules).toEqual({ tasks: true });
    // serviceLines filtered to strings only
    expect(patch.serviceLines).toEqual(['planning', 'tax']);

    expect(applyIndustryTemplateDefaultsMock).toHaveBeenCalledWith(5, 'wealth-advisory');
  });

  it('returns null template when updateBrainProfile yields null', async () => {
    requireBrainEntitlementMock.mockResolvedValue({
      client: { id: 5, company: 'Acme' },
      userId: 1,
      role: 'admin',
    });
    getOrCreateBrainProfileMock.mockResolvedValue({ id: 9, industryTemplate: 'generic' });
    updateBrainProfileMock.mockResolvedValue(null);

    const res = await settingsRoute.PUT(
      makeReq('http://x/api/portal/brain/settings', {
        method: 'PUT',
        body: JSON.stringify({ name: 'Hi' }),
        headers: { 'content-type': 'application/json' },
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.profile).toBeNull();
    expect(body.data.template).toBeNull();
  });
});

// ===========================================================================
// brain/promotion-targets
// ===========================================================================

describe('GET /api/portal/brain/promotion-targets', () => {
  it('returns the entitlement response when not entitled', async () => {
    requireBrainEntitlementMock.mockResolvedValue({ response: FAIL_RESPONSE });
    const res = await promotionTargetsRoute.GET();
    expect(res.status).toBe(402);
  });

  it('returns the promotion targets for the active client', async () => {
    requireBrainEntitlementMock.mockResolvedValue({
      client: { id: 42, company: 'Acme' },
      userId: 1,
      role: 'read',
    });
    listPromotionTargetsMock.mockResolvedValue({
      projects: [{ id: 1, name: 'P' }],
      labels: [],
    });

    const res = await promotionTargetsRoute.GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toEqual({ projects: [{ id: 1, name: 'P' }], labels: [] });
    expect(listPromotionTargetsMock).toHaveBeenCalledWith(42);
  });
});

// ===========================================================================
// brain/adapters
// ===========================================================================

describe('GET /api/portal/brain/adapters', () => {
  it('returns the entitlement response when not entitled', async () => {
    requireBrainEntitlementMock.mockResolvedValue({ response: FAIL_RESPONSE });
    const res = await adaptersRoute.GET();
    expect(res.status).toBe(402);
  });

  it('returns the enabled adapters mapped to the public shape', async () => {
    requireBrainEntitlementMock.mockResolvedValue({
      client: { id: 12, company: 'Acme' },
      userId: 1,
      role: 'read',
    });
    getOrCreateBrainProfileMock.mockResolvedValue({ id: 9 });
    listEnabledAdaptersMock.mockResolvedValue([
      {
        id: 'paste',
        label: 'Paste',
        description: 'paste text',
        icon: 'clipboard',
        // extra internal fields that must NOT leak
        secret: 'hidden',
        run: () => null,
      },
      {
        id: 'upload',
        label: 'Upload',
        description: 'upload file',
        icon: 'upload',
      },
    ]);

    const res = await adaptersRoute.GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toEqual([
      { id: 'paste', label: 'Paste', description: 'paste text', icon: 'clipboard' },
      { id: 'upload', label: 'Upload', description: 'upload file', icon: 'upload' },
    ]);
    // confirm the internal fields are stripped
    expect(body.data[0]).not.toHaveProperty('secret');
    expect(body.data[0]).not.toHaveProperty('run');

    expect(getOrCreateBrainProfileMock).toHaveBeenCalledWith(12, 'Acme');
  });

  it('uses "Company Brain" fallback when client.company is empty', async () => {
    requireBrainEntitlementMock.mockResolvedValue({
      client: { id: 12, company: '' },
      userId: 1,
      role: 'read',
    });
    getOrCreateBrainProfileMock.mockResolvedValue({ id: 9 });
    listEnabledAdaptersMock.mockResolvedValue([]);

    await adaptersRoute.GET();
    expect(getOrCreateBrainProfileMock).toHaveBeenCalledWith(12, 'Company Brain');
  });
});

// ===========================================================================
// brain/saved-searches
// ===========================================================================

describe('GET /api/portal/brain/saved-searches', () => {
  it('returns the entitlement response when not entitled', async () => {
    requireBrainEntitlementMock.mockResolvedValue({ response: FAIL_RESPONSE });
    const res = await savedSearchesRoute.GET(
      makeReq('http://x/api/portal/brain/saved-searches'),
    );
    expect(res.status).toBe(402);
  });

  it('returns team-only items when userId=shared', async () => {
    requireBrainEntitlementMock.mockResolvedValue({
      client: { id: 5, company: 'Acme' },
      userId: 7,
      role: 'read',
    });
    listSavedSearchesMock.mockResolvedValue([{ id: 1, userId: null, name: 'Team' }]);

    const res = await savedSearchesRoute.GET(
      makeReq('http://x/api/portal/brain/saved-searches?userId=shared'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.items).toEqual([{ id: 1, userId: null, name: 'Team' }]);
    expect(listSavedSearchesMock).toHaveBeenCalledWith(5, { userId: null });
  });

  it('returns only the caller\'s personal items when userId=mine', async () => {
    requireBrainEntitlementMock.mockResolvedValue({
      client: { id: 5, company: 'Acme' },
      userId: 7,
      role: 'read',
    });
    // The route filters results down to userId === result.userId
    listSavedSearchesMock.mockResolvedValue([
      { id: 1, userId: 7, name: 'Mine' },
      { id: 2, userId: null, name: 'Team' },
      { id: 3, userId: 8, name: 'Someone else' },
    ]);

    const res = await savedSearchesRoute.GET(
      makeReq('http://x/api/portal/brain/saved-searches?userId=mine'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.items).toEqual([{ id: 1, userId: 7, name: 'Mine' }]);
    expect(listSavedSearchesMock).toHaveBeenCalledWith(5, { userId: 7 });
  });

  it('returns the caller-scoped list (no client filtering) by default', async () => {
    requireBrainEntitlementMock.mockResolvedValue({
      client: { id: 5, company: 'Acme' },
      userId: 7,
      role: 'read',
    });
    listSavedSearchesMock.mockResolvedValue([
      { id: 1, userId: 7, name: 'Mine' },
      { id: 2, userId: null, name: 'Team' },
    ]);

    const res = await savedSearchesRoute.GET(
      makeReq('http://x/api/portal/brain/saved-searches'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.items).toHaveLength(2);
    expect(listSavedSearchesMock).toHaveBeenCalledWith(5, { userId: 7 });
  });
});

describe('POST /api/portal/brain/saved-searches', () => {
  it('returns the entitlement response when not entitled', async () => {
    requireBrainEntitlementMock.mockResolvedValue({ response: FAIL_RESPONSE });
    const res = await savedSearchesRoute.POST(
      makeReq('http://x/api/portal/brain/saved-searches', {
        method: 'POST',
        body: '{}',
      }),
    );
    expect(res.status).toBe(402);
  });

  it('returns 400 when the body is not JSON', async () => {
    requireBrainEntitlementMock.mockResolvedValue({
      client: { id: 5, company: 'Acme' },
      userId: 7,
      role: 'write',
    });
    const res = await savedSearchesRoute.POST(
      makeReq('http://x/api/portal/brain/saved-searches', {
        method: 'POST',
        body: 'not-json',
        headers: { 'content-type': 'application/json' },
      }),
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 when name is missing', async () => {
    requireBrainEntitlementMock.mockResolvedValue({
      client: { id: 5, company: 'Acme' },
      userId: 7,
      role: 'write',
    });
    const res = await savedSearchesRoute.POST(
      makeReq('http://x/api/portal/brain/saved-searches', {
        method: 'POST',
        body: JSON.stringify({ filters: {} }),
        headers: { 'content-type': 'application/json' },
      }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/name is required/);
  });

  it('returns 400 when filters is not an object', async () => {
    requireBrainEntitlementMock.mockResolvedValue({
      client: { id: 5, company: 'Acme' },
      userId: 7,
      role: 'write',
    });
    const res = await savedSearchesRoute.POST(
      makeReq('http://x/api/portal/brain/saved-searches', {
        method: 'POST',
        body: JSON.stringify({ name: 'A', filters: null }),
        headers: { 'content-type': 'application/json' },
      }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/filters/);
  });

  it('creates a personal search by default', async () => {
    requireBrainEntitlementMock.mockResolvedValue({
      client: { id: 5, company: 'Acme' },
      userId: 7,
      role: 'write',
    });
    createSavedSearchMock.mockResolvedValue({ id: 99, name: 'Mine' });

    const res = await savedSearchesRoute.POST(
      makeReq('http://x/api/portal/brain/saved-searches', {
        method: 'POST',
        body: JSON.stringify({
          name: 'Mine',
          filters: { search: 'foo', tags: ['a', 1, 'b'], pinnedOnly: true, sort: 'updated' },
          icon: 'star',
          sortOrder: 3,
        }),
        headers: { 'content-type': 'application/json' },
      }),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toEqual({ id: 99, name: 'Mine' });

    expect(createSavedSearchMock).toHaveBeenCalledTimes(1);
    const [arg] = createSavedSearchMock.mock.calls[0];
    expect(arg.clientId).toBe(5);
    expect(arg.userId).toBe(7);
    expect(arg.name).toBe('Mine');
    expect(arg.icon).toBe('star');
    expect(arg.sortOrder).toBe(3);
    expect(arg.createdBy).toBe(7);
    expect(arg.filters).toEqual({
      search: 'foo',
      tags: ['a', 'b'],
      pinnedOnly: true,
      sort: 'updated',
    });
  });

  it('creates a shared (team) search when scope=shared', async () => {
    requireBrainEntitlementMock.mockResolvedValue({
      client: { id: 5, company: 'Acme' },
      userId: 7,
      role: 'write',
    });
    createSavedSearchMock.mockResolvedValue({ id: 101 });

    const res = await savedSearchesRoute.POST(
      makeReq('http://x/api/portal/brain/saved-searches', {
        method: 'POST',
        body: JSON.stringify({
          name: 'Team',
          filters: {},
          scope: 'shared',
        }),
        headers: { 'content-type': 'application/json' },
      }),
    );

    expect(res.status).toBe(200);
    const [arg] = createSavedSearchMock.mock.calls[0];
    expect(arg.userId).toBeNull();
    expect(arg.createdBy).toBe(7);
    // default icon when omitted
    expect(arg.icon).toBe('bookmark');
    // default sortOrder when omitted
    expect(arg.sortOrder).toBe(0);
  });

  it('returns 500 when createSavedSearch throws', async () => {
    requireBrainEntitlementMock.mockResolvedValue({
      client: { id: 5, company: 'Acme' },
      userId: 7,
      role: 'write',
    });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    createSavedSearchMock.mockRejectedValue(new Error('db boom'));

    const res = await savedSearchesRoute.POST(
      makeReq('http://x/api/portal/brain/saved-searches', {
        method: 'POST',
        body: JSON.stringify({ name: 'X', filters: {} }),
        headers: { 'content-type': 'application/json' },
      }),
    );

    expect(res.status).toBe(500);
    expect((await res.json()).message).toBe('db boom');
  });
});
