// EasyPost carrier provider — `fetch`-based, no SDK.
//
// EasyPost uses HTTP Basic auth with the API key as username and an empty
// password. The same base URL handles test + production traffic; the mode
// is determined per-key (test keys begin `EZTK`, prod keys begin `EZAK`).
// We keep the `mode` field on the constructor so callers can persist /
// surface it in the admin UI even though the wire doesn't care.

import { createHmac, timingSafeEqual } from 'node:crypto';
import {
  CarrierProviderError,
  type BuyLabelResult,
  type CarrierProvider,
  type GetRatesInput,
  type ParsedWebhookEvent,
  type RateQuote,
  type TrackingStatus,
} from './types';

const EASYPOST_BASE_URL = 'https://api.easypost.com/v2';

export interface EasyPostProviderOptions {
  apiKey: string;
  mode: 'test' | 'production';
  webhookSecret?: string;
}

// ─── EasyPost wire types (only the fields we read) ──────────────────────────

interface EpRate {
  id: string;
  shipment_id?: string;
  carrier: string;
  service: string;
  rate: string;       // dollar amount as string, e.g. "8.55"
  currency: string;
  delivery_days?: number | null;
  est_delivery_days?: number | null;
}

interface EpShipmentResponse {
  id: string;
  rates: EpRate[];
}

interface EpPostageLabel {
  label_url: string;
}

interface EpBuyResponse {
  id: string;
  tracking_code: string;
  postage_label: EpPostageLabel;
  selected_rate: EpRate;
}

interface EpRefundResponse {
  refund_status: string;
}

interface EpWebhookBody {
  id: string;
  object?: string;
  description?: string;
  result?: {
    id?: string;
    shipment_id?: string;
    tracking_code?: string;
    status?: string;
    updated_at?: string;
  };
}

interface EpErrorEnvelope {
  error?: {
    code?: string;
    message?: string;
    errors?: unknown;
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function authHeader(apiKey: string): string {
  // HTTP Basic: username=apiKey, password='' → base64("apiKey:")
  // Use Buffer for broad Node compatibility (btoa exists on Node 18+ but
  // Buffer.toString('base64') is universal).
  const token = Buffer.from(`${apiKey}:`).toString('base64');
  return `Basic ${token}`;
}

function dollarsStringToCents(s: string): number {
  // EasyPost returns `rate` as a decimal string. Parse to a number with
  // banker-safe rounding (multiply first, then round) to avoid 0.1 + 0.2
  // floating drift on fractional cents.
  const n = Number.parseFloat(s);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

function mapStatus(status: string | undefined): TrackingStatus {
  switch (status) {
    case 'pre_transit':           return 'pre_transit';
    case 'in_transit':            return 'in_transit';
    case 'out_for_delivery':      return 'out_for_delivery';
    case 'delivered':             return 'delivered';
    case 'available_for_pickup':  return 'in_transit';
    case 'return_to_sender':      return 'return_to_sender';
    case 'failure':               return 'failure';
    case 'cancelled':             return 'cancelled';
    case 'error':                 return 'error';
    default:                      return 'unknown';
  }
}

// Translate a non-2xx EasyPost response into our typed CarrierProviderError.
async function throwForResponse(res: Response, fallbackMessage: string): Promise<never> {
  let body: EpErrorEnvelope | undefined;
  try {
    body = (await res.json()) as EpErrorEnvelope;
  } catch {
    // body might not be JSON (e.g. plain 5xx). Swallow and keep fallback message.
  }
  const msg = body?.error?.message ?? fallbackMessage;
  if (res.status === 401 || res.status === 403) {
    throw new CarrierProviderError('auth', msg, body);
  }
  if (res.status === 400 || res.status === 422) {
    throw new CarrierProviderError('invalid_input', msg, body);
  }
  if (res.status >= 500) {
    throw new CarrierProviderError('network', msg, body);
  }
  throw new CarrierProviderError('unknown', msg, body);
}

// ─── Provider ───────────────────────────────────────────────────────────────

export class EasyPostProvider implements CarrierProvider {
  private readonly apiKey: string;
  private readonly mode: 'test' | 'production';
  private readonly webhookSecret?: string;

  constructor(opts: EasyPostProviderOptions) {
    if (!opts.apiKey) {
      throw new CarrierProviderError('config', 'EasyPost apiKey is required');
    }
    this.apiKey = opts.apiKey;
    this.mode = opts.mode;
    this.webhookSecret = opts.webhookSecret;
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`${EASYPOST_BASE_URL}${path}`, {
        ...init,
        headers: {
          'Content-Type': 'application/json',
          Authorization: authHeader(this.apiKey),
          ...(init.headers ?? {}),
        },
      });
    } catch (err) {
      throw new CarrierProviderError('network', 'EasyPost request failed', err);
    }
    if (!res.ok) {
      await throwForResponse(res, `EasyPost ${init.method ?? 'GET'} ${path} failed (${res.status})`);
    }
    try {
      return (await res.json()) as T;
    } catch (err) {
      throw new CarrierProviderError('unknown', 'EasyPost returned non-JSON response', err);
    }
  }

  async getRates(input: GetRatesInput): Promise<{ shipmentId: string; rates: RateQuote[] }> {
    const body = {
      shipment: {
        from_address: input.from,
        to_address: input.to,
        parcel: {
          length: input.parcel.lengthIn,
          width: input.parcel.widthIn,
          height: input.parcel.heightIn,
          weight: input.parcel.weightOz,
        },
      },
    };

    const resp = await this.request<EpShipmentResponse>('/shipments', {
      method: 'POST',
      body: JSON.stringify(body),
    });

    const carrierFilter = input.carrierFilter?.length ? new Set(input.carrierFilter) : null;
    const serviceFilter = input.serviceFilter?.length ? new Set(input.serviceFilter) : null;

    const rates: RateQuote[] = (resp.rates ?? [])
      .filter((r) => (carrierFilter ? carrierFilter.has(r.carrier) : true))
      .filter((r) => (serviceFilter ? serviceFilter.has(r.service) : true))
      .map((r) => ({
        id: r.id,
        shipmentId: r.shipment_id ?? resp.id,
        carrier: r.carrier,
        service: r.service,
        amountCents: dollarsStringToCents(r.rate),
        currency: r.currency,
        estDeliveryDays:
          (r.delivery_days ?? r.est_delivery_days ?? null) as number | null,
      }));

    return { shipmentId: resp.id, rates };
  }

  async buyLabel(input: { rateId: string; shipmentId: string }): Promise<BuyLabelResult> {
    const resp = await this.request<EpBuyResponse>(
      `/shipments/${encodeURIComponent(input.shipmentId)}/buy`,
      {
        method: 'POST',
        body: JSON.stringify({ rate: { id: input.rateId } }),
      },
    );

    return {
      shipmentId: resp.id,
      trackingNumber: resp.tracking_code,
      carrier: resp.selected_rate.carrier,
      service: resp.selected_rate.service,
      labelUrl: resp.postage_label.label_url,
      labelCostCents: dollarsStringToCents(resp.selected_rate.rate),
    };
  }

  async refundLabel(input: { shipmentId: string }): Promise<{ refundStatus: string }> {
    const resp = await this.request<EpRefundResponse>(
      `/shipments/${encodeURIComponent(input.shipmentId)}/refund`,
      { method: 'POST' },
    );
    return { refundStatus: resp.refund_status };
  }

  async parseWebhook(rawBody: string, signature: string | undefined): Promise<ParsedWebhookEvent> {
    if (!this.webhookSecret) {
      throw new CarrierProviderError(
        'config',
        'EasyPost webhook secret is not configured',
      );
    }
    if (!signature) {
      throw new CarrierProviderError(
        'auth',
        'EasyPost webhook signature header missing',
      );
    }

    // EasyPost format: "hmac-sha256-hex=<hex>". Be tolerant of bare hex too.
    const provided = signature.includes('=')
      ? signature.slice(signature.indexOf('=') + 1).trim()
      : signature.trim();

    const expected = createHmac('sha256', this.webhookSecret)
      .update(rawBody)
      .digest('hex');

    let ok = false;
    try {
      const a = Buffer.from(expected, 'hex');
      const b = Buffer.from(provided, 'hex');
      ok = a.length === b.length && timingSafeEqual(a, b);
    } catch {
      ok = false;
    }
    if (!ok) {
      throw new CarrierProviderError('auth', 'EasyPost webhook HMAC verification failed');
    }

    let body: EpWebhookBody;
    try {
      body = JSON.parse(rawBody) as EpWebhookBody;
    } catch (err) {
      throw new CarrierProviderError('invalid_input', 'EasyPost webhook body is not JSON', err);
    }

    return {
      eventId: body.id,
      eventType: body.description ?? body.object ?? 'unknown',
      shipmentId: body.result?.shipment_id,
      trackerId: body.result?.id,
      trackingNumber: body.result?.tracking_code,
      trackingStatus: mapStatus(body.result?.status),
      trackingEventAt: body.result?.updated_at,
      raw: body,
    };
  }
}
