// Unit tests for EasyPostProvider — fetch is fully stubbed so no network is
// hit. Each test resets the mock so we can swap the response per call.

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { createHmac } from 'node:crypto';
// Import directly from the implementation modules — not the barrel —
// because the barrel re-exports `resolveProvider`, which transitively
// imports `@/lib/db` and would require a live DATABASE_URL just to load.
import { EasyPostProvider } from '@/lib/shipping/providers/easypost';
import { CarrierProviderError, type GetRatesInput } from '@/lib/shipping/providers/types';

function fetchOk(body: unknown, status = 200) {
  return {
    ok: true,
    status,
    json: async () => body,
  } as unknown as Response;
}

function fetchErr(body: unknown, status: number) {
  return {
    ok: false,
    status,
    json: async () => body,
  } as unknown as Response;
}

const FROM = {
  name: 'SD HQ',
  line1: '123 Pine St',
  city: 'Burlington',
  state: 'VT',
  postalCode: '05401',
  country: 'US',
};
const TO = {
  name: 'Buyer',
  line1: '500 Market St',
  city: 'Philadelphia',
  state: 'PA',
  postalCode: '19106',
  country: 'US',
};
const PARCEL = { lengthIn: 10, widthIn: 8, heightIn: 4, weightOz: 16 };

const rateInput: GetRatesInput = { from: FROM, to: TO, parcel: PARCEL };

const sampleRatesResponse = {
  id: 'shp_test_123',
  rates: [
    {
      id: 'rate_a',
      shipment_id: 'shp_test_123',
      carrier: 'USPS',
      service: 'Priority',
      rate: '8.55',
      currency: 'USD',
      delivery_days: 3,
    },
    {
      id: 'rate_b',
      shipment_id: 'shp_test_123',
      carrier: 'USPS',
      service: 'GroundAdvantage',
      rate: '5.40',
      currency: 'USD',
      delivery_days: 5,
    },
    {
      id: 'rate_c',
      shipment_id: 'shp_test_123',
      carrier: 'UPSDAP',
      service: 'Ground',
      rate: '12.00',
      currency: 'USD',
      delivery_days: 4,
    },
  ],
};

describe('EasyPostProvider', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe('getRates', () => {
    it('maps a 3-rate EasyPost response into RateQuote[]', async () => {
      fetchMock.mockResolvedValueOnce(fetchOk(sampleRatesResponse));
      const p = new EasyPostProvider({ apiKey: 'EZTK_xxx', mode: 'test' });

      const result = await p.getRates(rateInput);

      // The wire-level request shape is what Wave 3 consumers will rely on.
      expect(fetchMock).toHaveBeenCalledOnce();
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('https://api.easypost.com/v2/shipments');
      expect(init.method).toBe('POST');
      expect((init.headers as Record<string, string>).Authorization)
        .toMatch(/^Basic /);
      const sentBody = JSON.parse(init.body as string);
      expect(sentBody.shipment.parcel).toEqual({
        length: 10, width: 8, height: 4, weight: 16,
      });
      expect(sentBody.shipment.from_address.city).toBe('Burlington');

      expect(result.shipmentId).toBe('shp_test_123');
      expect(result.rates).toHaveLength(3);
      expect(result.rates[0]).toEqual({
        id: 'rate_a',
        shipmentId: 'shp_test_123',
        carrier: 'USPS',
        service: 'Priority',
        amountCents: 855,
        currency: 'USD',
        estDeliveryDays: 3,
      });
      expect(result.rates[2].amountCents).toBe(1200);
    });

    it('applies carrierFilter client-side', async () => {
      fetchMock.mockResolvedValueOnce(fetchOk(sampleRatesResponse));
      const p = new EasyPostProvider({ apiKey: 'EZTK_xxx', mode: 'test' });

      const result = await p.getRates({ ...rateInput, carrierFilter: ['UPSDAP'] });

      expect(result.rates).toHaveLength(1);
      expect(result.rates[0].carrier).toBe('UPSDAP');
    });

    it('applies serviceFilter client-side', async () => {
      fetchMock.mockResolvedValueOnce(fetchOk(sampleRatesResponse));
      const p = new EasyPostProvider({ apiKey: 'EZTK_xxx', mode: 'test' });

      const result = await p.getRates({ ...rateInput, serviceFilter: ['Priority', 'Ground'] });

      expect(result.rates.map((r) => r.service).sort()).toEqual(['Ground', 'Priority']);
    });

    it('throws CarrierProviderError("auth") on 401', async () => {
      fetchMock.mockResolvedValueOnce(fetchErr({
        error: { code: 'UNAUTHORIZED', message: 'Bad key' },
      }, 401));
      const p = new EasyPostProvider({ apiKey: 'EZTK_bad', mode: 'test' });

      await expect(p.getRates(rateInput)).rejects.toMatchObject({
        name: 'CarrierProviderError',
        code: 'auth',
      });
    });

    it('throws CarrierProviderError("invalid_input") on 422 with EasyPost message', async () => {
      fetchMock.mockResolvedValueOnce(fetchErr({
        error: { code: 'SHIPMENT.INVALID', message: 'to_address.postal_code is required' },
      }, 422));
      const p = new EasyPostProvider({ apiKey: 'EZTK_xxx', mode: 'test' });

      await expect(p.getRates(rateInput)).rejects.toMatchObject({
        name: 'CarrierProviderError',
        code: 'invalid_input',
        message: 'to_address.postal_code is required',
      });
    });

    it('throws CarrierProviderError("network") on 5xx', async () => {
      fetchMock.mockResolvedValueOnce(fetchErr({ error: { message: 'oops' } }, 503));
      const p = new EasyPostProvider({ apiKey: 'EZTK_xxx', mode: 'test' });

      await expect(p.getRates(rateInput)).rejects.toMatchObject({ code: 'network' });
    });
  });

  describe('buyLabel', () => {
    it('returns labelUrl, tracking, and cost converted to cents', async () => {
      fetchMock.mockResolvedValueOnce(fetchOk({
        id: 'shp_test_123',
        tracking_code: '9400123456789',
        postage_label: { label_url: 'https://easypost-files.s3/label.pdf' },
        selected_rate: {
          id: 'rate_a', carrier: 'USPS', service: 'Priority',
          rate: '8.55', currency: 'USD',
        },
      }));
      const p = new EasyPostProvider({ apiKey: 'EZTK_xxx', mode: 'test' });

      const result = await p.buyLabel({ rateId: 'rate_a', shipmentId: 'shp_test_123' });

      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('https://api.easypost.com/v2/shipments/shp_test_123/buy');
      expect(init.method).toBe('POST');
      expect(JSON.parse(init.body as string)).toEqual({ rate: { id: 'rate_a' } });

      expect(result).toEqual({
        shipmentId: 'shp_test_123',
        trackingNumber: '9400123456789',
        carrier: 'USPS',
        service: 'Priority',
        labelUrl: 'https://easypost-files.s3/label.pdf',
        labelCostCents: 855,
      });
    });
  });

  describe('refundLabel', () => {
    it('returns the refund status from EasyPost', async () => {
      fetchMock.mockResolvedValueOnce(fetchOk({ refund_status: 'submitted' }));
      const p = new EasyPostProvider({ apiKey: 'EZTK_xxx', mode: 'test' });

      const result = await p.refundLabel({ shipmentId: 'shp_test_123' });

      expect(result).toEqual({ refundStatus: 'submitted' });
      expect(fetchMock.mock.calls[0][0])
        .toBe('https://api.easypost.com/v2/shipments/shp_test_123/refund');
    });
  });

  describe('parseWebhook', () => {
    const SECRET = 'whsec_test_super_secret';

    function signedBody(body: object): { raw: string; sig: string } {
      const raw = JSON.stringify(body);
      const hex = createHmac('sha256', SECRET).update(raw).digest('hex');
      return { raw, sig: `hmac-sha256-hex=${hex}` };
    }

    it('accepts a valid HMAC signature and maps a delivered tracker event', async () => {
      const body = {
        id: 'evt_abc',
        object: 'Event',
        description: 'tracker.updated',
        result: {
          id: 'trk_xyz',
          shipment_id: 'shp_test_123',
          tracking_code: '9400123456789',
          status: 'delivered',
          updated_at: '2026-05-19T12:34:56Z',
        },
      };
      const { raw, sig } = signedBody(body);
      const p = new EasyPostProvider({ apiKey: 'EZTK_xxx', mode: 'test', webhookSecret: SECRET });

      const parsed = await p.parseWebhook(raw, sig);

      expect(parsed.eventId).toBe('evt_abc');
      expect(parsed.eventType).toBe('tracker.updated');
      expect(parsed.shipmentId).toBe('shp_test_123');
      expect(parsed.trackerId).toBe('trk_xyz');
      expect(parsed.trackingNumber).toBe('9400123456789');
      expect(parsed.trackingStatus).toBe('delivered');
      expect(parsed.trackingEventAt).toBe('2026-05-19T12:34:56Z');
      expect(parsed.raw).toEqual(body);
    });

    it('maps return_to_sender directly', async () => {
      const body = {
        id: 'evt_rts',
        description: 'tracker.updated',
        result: { status: 'return_to_sender' },
      };
      const { raw, sig } = signedBody(body);
      const p = new EasyPostProvider({ apiKey: 'EZTK_xxx', mode: 'test', webhookSecret: SECRET });

      const parsed = await p.parseWebhook(raw, sig);

      expect(parsed.trackingStatus).toBe('return_to_sender');
    });

    it('rejects an invalid HMAC signature', async () => {
      const body = { id: 'evt_bad', result: { status: 'delivered' } };
      const raw = JSON.stringify(body);
      const wrongSig = 'hmac-sha256-hex=' + 'a'.repeat(64);
      const p = new EasyPostProvider({ apiKey: 'EZTK_xxx', mode: 'test', webhookSecret: SECRET });

      await expect(p.parseWebhook(raw, wrongSig)).rejects.toMatchObject({
        name: 'CarrierProviderError',
        code: 'auth',
      });
    });

    it('throws CarrierProviderError("config") when no webhookSecret is configured', async () => {
      const body = { id: 'evt_x', result: { status: 'delivered' } };
      const raw = JSON.stringify(body);
      // No webhookSecret in the constructor:
      const p = new EasyPostProvider({ apiKey: 'EZTK_xxx', mode: 'test' });

      await expect(p.parseWebhook(raw, 'hmac-sha256-hex=deadbeef')).rejects.toMatchObject({
        name: 'CarrierProviderError',
        code: 'config',
      });
    });
  });
});

describe('CarrierProviderError', () => {
  it('preserves code, message, and details', () => {
    const err = new CarrierProviderError('auth', 'nope', { foo: 1 });
    expect(err.name).toBe('CarrierProviderError');
    expect(err.code).toBe('auth');
    expect(err.message).toBe('nope');
    expect(err.details).toEqual({ foo: 1 });
    expect(err).toBeInstanceOf(Error);
  });
});
