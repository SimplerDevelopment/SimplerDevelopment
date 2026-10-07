// @vitest-environment node
// Signature/routing tests only. Transactional payment effects are covered with
// real PostgreSQL in integration/api/storefront/payment-reservations.test.ts.
import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ constructEvent: vi.fn(), resolveSiteStripe: vi.fn(), processStorePayment: vi.fn() }));
vi.mock('stripe', () => ({ default: class Stripe { static errors = { StripeSignatureVerificationError: class extends Error {} }; } }));
vi.mock('@/lib/stripe', () => ({ getStripeClient: () => ({ webhooks: { constructEvent: mocks.constructEvent } }) }));
vi.mock('@/lib/stripe/site-stripe', () => ({ resolveSiteStripe: mocks.resolveSiteStripe, SiteStripeError: class extends Error {} }));
vi.mock('@/lib/store/payment-events', () => ({ processStorePayment: mocks.processStorePayment, StorePaymentError: class extends Error {} }));
import { POST } from '@/app/api/stripe/webhook/ecommerce/route';
const event = { id: 'evt_paid', type: 'payment_intent.succeeded', data: { object: { id: 'pi_paid', metadata: { websiteId: '12', orderId: '8' } } } };
function request(query = '?siteId=12') { return new Request(`http://localhost/api/stripe/webhook/ecommerce${query}`, { method: 'POST', headers: { 'stripe-signature': 'valid-signature' }, body: 'signed-body' }); }
beforeEach(() => {
  vi.clearAllMocks();
  process.env.STRIPE_ECOMMERCE_WEBHOOK_SECRET = 'whsec_platform';
  mocks.constructEvent.mockReturnValue(event);
  mocks.processStorePayment.mockResolvedValue(undefined);
  mocks.resolveSiteStripe.mockResolvedValue({ mode: 'connect', webhookSecret: 'whsec_site', stripe: { webhooks: { constructEvent: mocks.constructEvent } } });
});
describe('ecommerce webhook verified delivery', () => {
  it('validates the signature before delegating the canonical tenant and event', async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(mocks.constructEvent).toHaveBeenCalledWith('signed-body', 'valid-signature', 'whsec_platform');
    expect(mocks.processStorePayment).toHaveBeenCalledWith(event, 12);
  });
  it('rejects an invalid signature without claiming a payment event', async () => {
    mocks.constructEvent.mockImplementationOnce(() => { throw new Error('invalid signature'); });
    expect((await POST(request())).status).toBe(401);
    expect(mocks.processStorePayment).not.toHaveBeenCalled();
  });
  it('uses the per-site signing secret for BYOK', async () => {
    mocks.resolveSiteStripe.mockResolvedValueOnce({ mode: 'byok', webhookSecret: 'whsec_site', stripe: { webhooks: { constructEvent: mocks.constructEvent } } });
    expect((await POST(request())).status).toBe(200);
    expect(mocks.constructEvent).toHaveBeenCalledWith('signed-body', 'valid-signature', 'whsec_site');
  });
  it('derives the site from signed metadata on the Connect platform endpoint', async () => {
    expect((await POST(request(''))).status).toBe(200);
    expect(mocks.resolveSiteStripe).toHaveBeenCalledWith(12);
    expect(mocks.processStorePayment).toHaveBeenCalledWith(event, 12);
  });
  it('skips misrouted BYOK deliveries on the platform endpoint', async () => {
    mocks.resolveSiteStripe.mockResolvedValueOnce({ mode: 'byok' });
    expect((await POST(request(''))).status).toBe(200);
    expect(mocks.processStorePayment).not.toHaveBeenCalled();
  });
  it('fails retryably when the payment transaction fails instead of acknowledging lost effects', async () => {
    mocks.processStorePayment.mockRejectedValueOnce(new Error('database unavailable'));
    expect((await POST(request())).status).toBe(500);
  });
  it('cannot verify or process a delivery without a configured signing secret', async () => {
    delete process.env.STRIPE_ECOMMERCE_WEBHOOK_SECRET;
    expect((await POST(request())).status).toBe(500);
    expect(mocks.constructEvent).not.toHaveBeenCalled();
    expect(mocks.processStorePayment).not.toHaveBeenCalled();
  });
});
