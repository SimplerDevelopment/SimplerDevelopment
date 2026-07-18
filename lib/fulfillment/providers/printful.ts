// Printful fulfillment provider — `fetch`-based, no SDK.
//
// Printful v2 REST API: https://api.printful.com
// Auth: Bearer token in Authorization header.
// Tenant scoping: X-PF-Store-Id header on every request.

import { createHmac, timingSafeEqual } from 'node:crypto';

const PRINTFUL_BASE_URL = 'https://api.printful.com';

// ─── Public types ────────────────────────────────────────────────────────────

export interface PrintfulProviderOptions {
  apiKey: string;
  storeId: string;
}

export interface PrintfulRecipient {
  name: string;
  address1: string;
  address2?: string;
  city: string;
  state_code: string;
  country_code: string;
  zip: string;
  email?: string;
  phone?: string;
}

export interface PrintfulOrderItem {
  variant_id: number;
  quantity: number;
  files: Array<{ type: string; url: string }>;
  name?: string;
  retail_price?: string;
}

export interface PrintfulShippingRate {
  id: string;
  name: string;
  rate: string;
  currency: string;
  minDeliveryDays?: number | null;
  maxDeliveryDays?: number | null;
}

export interface PrintfulOrder {
  id: number;
  status: string;
  external_id?: string;
  shipping: string;
  recipient: PrintfulRecipient;
  items: PrintfulOrderItem[];
  costs?: {
    subtotal: string;
    discount: string;
    shipping: string;
    tax: string;
    total: string;
  };
}

export interface PrintfulWebhookEvent {
  type: string;
  created: number;
  retries: number;
  store: number;
  data: Record<string, unknown>;
}

export class PrintfulProviderError extends Error {
  constructor(
    public readonly code: 'auth' | 'invalid_input' | 'network' | 'config' | 'unknown',
    message: string,
    public readonly raw?: unknown,
  ) {
    super(message);
    this.name = 'PrintfulProviderError';
  }
}

// ─── Wire types (internal — only fields we read) ─────────────────────────────

interface PfEnvelope<T> {
  code: number;
  result: T;
  error?: { reason: string; message: string };
}

interface PfRateItem {
  id: string;
  name: string;
  rate: string;
  currency: string;
  minDeliveryDays?: number | null;
  maxDeliveryDays?: number | null;
}

interface PfErrorEnvelope {
  code?: number;
  result?: string;
  error?: { reason?: string; message?: string };
}

// ─── Provider ────────────────────────────────────────────────────────────────

export class PrintfulProvider {
  private readonly apiKey: string;
  private readonly storeId: string;

  constructor(opts: PrintfulProviderOptions) {
    if (!opts.apiKey) {
      throw new PrintfulProviderError('config', 'Printful apiKey is required');
    }
    if (!opts.storeId) {
      throw new PrintfulProviderError('config', 'Printful storeId is required');
    }
    this.apiKey = opts.apiKey;
    this.storeId = opts.storeId;
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`${PRINTFUL_BASE_URL}${path}`, {
        ...init,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
          'X-PF-Store-Id': this.storeId,
          ...(init.headers ?? {}),
        },
      });
    } catch (err) {
      throw new PrintfulProviderError('network', 'Printful request failed', err);
    }

    if (!res.ok) {
      await throwForResponse(res, `Printful ${init.method ?? 'GET'} ${path} failed (${res.status})`);
    }

    try {
      return (await res.json()) as T;
    } catch (err) {
      throw new PrintfulProviderError('unknown', 'Printful returned non-JSON response', err);
    }
  }

  async estimateShipping(
    recipient: PrintfulRecipient,
    items: Array<{ variantId: number; quantity: number }>,
  ): Promise<PrintfulShippingRate[]> {
    const body = {
      recipient,
      items: items.map((i) => ({
        variant_id: i.variantId,
        quantity: i.quantity,
        // A nominal retail value is required by the rates endpoint.
        value: '25.00',
      })),
    };

    const resp = await this.request<PfEnvelope<PfRateItem[]>>('/v2/shipping/rates', {
      method: 'POST',
      body: JSON.stringify(body),
    });

    return (resp.result ?? []).map((r) => ({
      id: r.id,
      name: r.name,
      rate: r.rate,
      currency: r.currency,
      minDeliveryDays: r.minDeliveryDays ?? null,
      maxDeliveryDays: r.maxDeliveryDays ?? null,
    }));
  }

  async createOrder(params: {
    recipient: PrintfulRecipient;
    items: PrintfulOrderItem[];
    externalId: string;
    shippingMethod: string;
    confirm: boolean;
  }): Promise<PrintfulOrder> {
    const url = params.confirm ? '/v2/orders?confirm=true' : '/v2/orders';
    const body = {
      external_id: params.externalId,
      shipping: params.shippingMethod,
      recipient: params.recipient,
      items: params.items,
    };

    const resp = await this.request<PfEnvelope<PrintfulOrder>>(url, {
      method: 'POST',
      body: JSON.stringify(body),
    });

    return resp.result;
  }

  async getOrder(printfulOrderId: number): Promise<PrintfulOrder> {
    const resp = await this.request<PfEnvelope<PrintfulOrder>>(
      `/v2/orders/${encodeURIComponent(String(printfulOrderId))}`,
      { method: 'GET' },
    );
    return resp.result;
  }

  async cancelOrder(printfulOrderId: number): Promise<void> {
    await this.request<PfEnvelope<unknown>>(
      `/v2/orders/${encodeURIComponent(String(printfulOrderId))}`,
      { method: 'DELETE' },
    );
  }

  async parseWebhook(
    rawBody: string,
    secret: string | undefined,
    signature: string | undefined,
  ): Promise<PrintfulWebhookEvent> {
    if (secret) {
      if (!signature) {
        throw new PrintfulProviderError('auth', 'Printful webhook signature header missing');
      }

      const expected = createHmac('sha256', secret).update(rawBody).digest('hex');

      let ok = false;
      try {
        const a = Buffer.from(expected, 'hex');
        const b = Buffer.from(signature.trim(), 'hex');
        ok = a.length === b.length && timingSafeEqual(a, b);
      } catch {
        ok = false;
      }

      if (!ok) {
        throw new PrintfulProviderError('auth', 'Printful webhook HMAC verification failed');
      }
    } else {
      // No secret configured — skip verification but surface in logs.
      console.warn('[PrintfulProvider] Webhook secret not configured; skipping HMAC verification.');
    }

    let event: PrintfulWebhookEvent;
    try {
      event = JSON.parse(rawBody) as PrintfulWebhookEvent;
    } catch (err) {
      throw new PrintfulProviderError('invalid_input', 'Printful webhook body is not JSON', err);
    }

    return event;
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function throwForResponse(res: Response, fallbackMessage: string): Promise<never> {
  let body: PfErrorEnvelope | undefined;
  try {
    body = (await res.json()) as PfErrorEnvelope;
  } catch {
    // Non-JSON error body — keep fallback.
  }
  const msg = body?.error?.message ?? body?.result ?? fallbackMessage;
  if (res.status === 401 || res.status === 403) {
    throw new PrintfulProviderError('auth', msg, body);
  }
  if (res.status === 400 || res.status === 422) {
    throw new PrintfulProviderError('invalid_input', msg, body);
  }
  if (res.status >= 500) {
    throw new PrintfulProviderError('network', msg, body);
  }
  throw new PrintfulProviderError('unknown', msg, body);
}
