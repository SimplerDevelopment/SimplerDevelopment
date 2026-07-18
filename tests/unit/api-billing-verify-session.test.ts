// @vitest-environment node
/**
 * Unit tests for `POST /api/portal/billing/modules/verify-session` (OBQA-014).
 *
 * The route retrieves a Stripe Checkout session server-side (with the
 * subscription expanded) when the buyer lands back from Checkout, and if it
 * completed AND its live subscription is active/trialing, activates the
 * purchased modules immediately via activateModuleSubscription — the
 * checkout.session.completed webhook becomes the backstop rather than the
 * primary writer. Tenancy-critical: the session's own metadata must name the
 * calling client; the route must never trust a caller-supplied id alone.
 * Replay guard: a session stays 'complete' forever, so a cancelled
 * subscription must not restore modules via an old session_id.
 *
 * Mocks: @/lib/portal-auth (authorizePortal/isAuthError), the Stripe SDK
 * (checkout.sessions.retrieve), and @/lib/billing/activate-modules
 * (activateModuleSubscription) — no DB, no network.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { assertMockUsed } from '../helpers/assertMockUsed';

// ---------------------------------------------------------------------------
// Mocks (must be declared before importing the route under test)
// ---------------------------------------------------------------------------

const authorizePortalMock = vi.fn();
const isAuthErrorMock = vi.fn(
  (r: unknown) => Boolean(r && typeof r === 'object' && 'response' in (r as Record<string, unknown>)),
);
vi.mock('@/lib/portal-auth', () => ({
  authorizePortal: (...args: unknown[]) => authorizePortalMock(...args),
  isAuthError: (r: unknown) => isAuthErrorMock(r),
}));

const activateModuleSubscriptionMock = vi.fn();
vi.mock('@/lib/billing/activate-modules', () => ({
  activateModuleSubscription: (...args: unknown[]) => activateModuleSubscriptionMock(...args),
}));

const stripeSessionsRetrieveMock = vi.fn();
vi.mock('stripe', () => {
  class Stripe {
    checkout = {
      sessions: {
        retrieve: (...args: unknown[]) => stripeSessionsRetrieveMock(...args),
      },
    };
  }
  return { default: Stripe };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ACTIVE_CLIENT = { id: 42 };

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/portal/billing/modules/verify-session', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.resetModules();
  authorizePortalMock.mockReset();
  authorizePortalMock.mockResolvedValue({ client: ACTIVE_CLIENT, userId: 1, role: 'owner' });
  isAuthErrorMock.mockClear();
  activateModuleSubscriptionMock.mockReset();
  activateModuleSubscriptionMock.mockResolvedValue({ newlyActivated: true, creditsGranted: true });
  stripeSessionsRetrieveMock.mockReset();
  process.env.STRIPE_SECRET_KEY = 'sk_test_dummy';
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/portal/billing/modules/verify-session — authorization', () => {
  it('returns the authorizePortal error response when authorization fails', async () => {
    const authError = {
      response: new Response(JSON.stringify({ success: false, message: 'Permission denied' }), {
        status: 403,
      }),
    };
    authorizePortalMock.mockResolvedValue(authError);

    const { POST } = await import('@/app/api/portal/billing/modules/verify-session/route');
    const res = await POST(makeRequest({ sessionId: 'cs_test_123' }));

    expect(res.status).toBe(403);
    expect(authorizePortalMock).toHaveBeenCalledWith({ action: 'admin' });
    expect(stripeSessionsRetrieveMock).not.toHaveBeenCalled();
    expect(activateModuleSubscriptionMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/portal/billing/modules/verify-session — stripe-less instances', () => {
  it('returns activated:false without touching Stripe when STRIPE_SECRET_KEY is unset', async () => {
    delete process.env.STRIPE_SECRET_KEY;

    const { POST } = await import('@/app/api/portal/billing/modules/verify-session/route');
    const res = await POST(makeRequest({ sessionId: 'cs_test_123' }));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ success: true, data: { activated: false } });
    expect(stripeSessionsRetrieveMock).not.toHaveBeenCalled();
    expect(activateModuleSubscriptionMock).not.toHaveBeenCalled();
    assertMockUsed(authorizePortalMock, 'authorizePortal');
  });
});

describe('POST /api/portal/billing/modules/verify-session — request body validation', () => {
  it('returns 400 for an invalid JSON body', async () => {
    const { POST } = await import('@/app/api/portal/billing/modules/verify-session/route');
    const res = await POST(makeRequest('not-json'));

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.message).toMatch(/invalid json/i);
  });

  it('returns 400 when sessionId is missing', async () => {
    const { POST } = await import('@/app/api/portal/billing/modules/verify-session/route');
    const res = await POST(makeRequest({}));

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.message).toMatch(/missing checkout session/i);
  });

  it('returns 400 when sessionId does not start with cs_', async () => {
    const { POST } = await import('@/app/api/portal/billing/modules/verify-session/route');
    const res = await POST(makeRequest({ sessionId: 'evt_abc123' }));

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.message).toMatch(/missing checkout session/i);
    expect(stripeSessionsRetrieveMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/portal/billing/modules/verify-session — unknown session', () => {
  it('returns 404 when stripe.checkout.sessions.retrieve throws', async () => {
    stripeSessionsRetrieveMock.mockRejectedValue(new Error('No such checkout session'));

    const { POST } = await import('@/app/api/portal/billing/modules/verify-session/route');
    const res = await POST(makeRequest({ sessionId: 'cs_test_unknown' }));

    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.message).toMatch(/unknown checkout session/i);
    expect(activateModuleSubscriptionMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/portal/billing/modules/verify-session — metadata / tenancy guard', () => {
  it('returns 403 when session metadata.type is not module_subscription', async () => {
    stripeSessionsRetrieveMock.mockResolvedValue({
      status: 'complete',
      metadata: { type: 'ecommerce_order', clientId: '42' },
    });

    const { POST } = await import('@/app/api/portal/billing/modules/verify-session/route');
    const res = await POST(makeRequest({ sessionId: 'cs_test_wrongtype' }));

    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.message).toMatch(/does not belong to your account/i);
    expect(activateModuleSubscriptionMock).not.toHaveBeenCalled();
  });

  it('returns 403 when the session metadata.clientId does not match the active client', async () => {
    // Two different client ids: the calling (active) client is 42; the
    // checkout session was minted for client 99. Must never activate.
    authorizePortalMock.mockResolvedValue({ client: { id: 42 }, userId: 1, role: 'owner' });
    stripeSessionsRetrieveMock.mockResolvedValue({
      status: 'complete',
      metadata: { type: 'module_subscription', clientId: '99', serviceIds: '10' },
      subscription: { id: 'sub_other_tenant', status: 'active' },
      customer: 'cus_other_tenant',
    });

    const { POST } = await import('@/app/api/portal/billing/modules/verify-session/route');
    const res = await POST(makeRequest({ sessionId: 'cs_test_crosstenant' }));

    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.message).toMatch(/does not belong to your account/i);
    expect(activateModuleSubscriptionMock).not.toHaveBeenCalled();
    assertMockUsed(authorizePortalMock, 'authorizePortal');
  });
});

describe('POST /api/portal/billing/modules/verify-session — non-complete session', () => {
  it('returns activated:false and does not activate when the session has not completed', async () => {
    stripeSessionsRetrieveMock.mockResolvedValue({
      status: 'open',
      metadata: { type: 'module_subscription', clientId: '42' },
    });

    const { POST } = await import('@/app/api/portal/billing/modules/verify-session/route');
    const res = await POST(makeRequest({ sessionId: 'cs_test_open' }));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ success: true, data: { activated: false, checkoutStatus: 'open' } });
    expect(activateModuleSubscriptionMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/portal/billing/modules/verify-session — subscription replay guard', () => {
  it('does not activate when the expanded subscription is no longer live (canceled)', async () => {
    // Replaying an old success-URL session_id after cancelling must not
    // restore the paid modules — the session stays 'complete' forever, but
    // entitlement follows the live subscription.
    stripeSessionsRetrieveMock.mockResolvedValue({
      status: 'complete',
      metadata: { type: 'module_subscription', clientId: '42', serviceIds: '10' },
      subscription: { id: 'sub_dead', status: 'canceled' },
      customer: 'cus_abc',
    });

    const { POST } = await import('@/app/api/portal/billing/modules/verify-session/route');
    const res = await POST(makeRequest({ sessionId: 'cs_test_canceled' }));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({
      success: true,
      data: { activated: false, subscriptionStatus: 'canceled' },
    });
    expect(activateModuleSubscriptionMock).not.toHaveBeenCalled();
  });

  it('does not activate when the subscription is missing (null)', async () => {
    stripeSessionsRetrieveMock.mockResolvedValue({
      status: 'complete',
      metadata: { type: 'module_subscription', clientId: '42', serviceIds: '10' },
      subscription: null,
      customer: 'cus_abc',
    });

    const { POST } = await import('@/app/api/portal/billing/modules/verify-session/route');
    const res = await POST(makeRequest({ sessionId: 'cs_test_nosub' }));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({
      success: true,
      data: { activated: false, subscriptionStatus: null },
    });
    expect(activateModuleSubscriptionMock).not.toHaveBeenCalled();
  });

  it('does not activate when the subscription came back unexpanded (string)', async () => {
    stripeSessionsRetrieveMock.mockResolvedValue({
      status: 'complete',
      metadata: { type: 'module_subscription', clientId: '42', serviceIds: '10' },
      subscription: 'sub_unexpanded',
      customer: 'cus_abc',
    });

    const { POST } = await import('@/app/api/portal/billing/modules/verify-session/route');
    const res = await POST(makeRequest({ sessionId: 'cs_test_stringsub' }));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({
      success: true,
      data: { activated: false, subscriptionStatus: null },
    });
    expect(activateModuleSubscriptionMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/portal/billing/modules/verify-session — happy path', () => {
  it('retrieves the session with the subscription expanded, parses comma-separated serviceIds, and activates', async () => {
    stripeSessionsRetrieveMock.mockResolvedValue({
      status: 'complete',
      metadata: { type: 'module_subscription', clientId: '42', serviceIds: '10,20,30', trial: '1' },
      subscription: { id: 'sub_abc123', status: 'active' },
      customer: 'cus_abc123',
    });
    activateModuleSubscriptionMock.mockResolvedValue({ newlyActivated: true, creditsGranted: true });

    const { POST } = await import('@/app/api/portal/billing/modules/verify-session/route');
    const res = await POST(makeRequest({ sessionId: 'cs_test_happy' }));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({
      success: true,
      data: { activated: true, newlyActivated: true, creditsGranted: true },
    });

    expect(stripeSessionsRetrieveMock).toHaveBeenCalledTimes(1);
    expect(stripeSessionsRetrieveMock).toHaveBeenCalledWith('cs_test_happy', {
      expand: ['subscription'],
    });

    expect(activateModuleSubscriptionMock).toHaveBeenCalledTimes(1);
    expect(activateModuleSubscriptionMock).toHaveBeenCalledWith({
      clientId: 42,
      serviceIds: [10, 20, 30],
      stripeSubscriptionId: 'sub_abc123', // taken from the expanded object's id
      stripeCustomerId: 'cus_abc123',
      markTrialUsed: true,
    });
  });

  it('falls back to the singular metadata.serviceId when serviceIds is absent', async () => {
    stripeSessionsRetrieveMock.mockResolvedValue({
      status: 'complete',
      metadata: { type: 'module_subscription', clientId: '42', serviceId: '15' },
      subscription: { id: 'sub_single', status: 'active' },
      customer: 'cus_single',
    });

    const { POST } = await import('@/app/api/portal/billing/modules/verify-session/route');
    const res = await POST(makeRequest({ sessionId: 'cs_test_single' }));

    expect(res.status).toBe(200);
    expect(activateModuleSubscriptionMock).toHaveBeenCalledWith(
      expect.objectContaining({ serviceIds: [15], markTrialUsed: false }),
    );
  });

  it('accepts a trialing subscription and passes null customer id when customer is not a string', async () => {
    stripeSessionsRetrieveMock.mockResolvedValue({
      status: 'complete',
      metadata: { type: 'module_subscription', clientId: '42', serviceIds: '10' },
      subscription: { id: 'sub_trialing', status: 'trialing' },
      customer: null,
    });

    const { POST } = await import('@/app/api/portal/billing/modules/verify-session/route');
    const res = await POST(makeRequest({ sessionId: 'cs_test_trialing' }));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.activated).toBe(true);
    expect(activateModuleSubscriptionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        stripeSubscriptionId: 'sub_trialing',
        stripeCustomerId: null,
        markTrialUsed: false,
      }),
    );
  });
});
