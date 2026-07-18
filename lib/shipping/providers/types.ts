// Shared types for shipping providers.
//
// The `CarrierProvider` interface is the contract every concrete provider
// (currently just EasyPost, but designed to admit Shippo / ShipStation /
// EasyShip later) must implement. Callers should depend on the interface
// and types in this module — not on EasyPost-specific shapes — so that the
// upstream storefront and admin code can swap providers via configuration.

export interface Address {
  name?: string;
  company?: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string; // ISO 2-letter
  phone?: string;
  email?: string;
}

export interface Parcel {
  lengthIn: number;
  widthIn: number;
  heightIn: number;
  weightOz: number;
}

export interface RateQuote {
  id: string;             // provider-specific rate identifier (e.g. EasyPost "rate_..." token)
  shipmentId: string;     // provider shipment id this rate belongs to
  carrier: string;        // 'USPS' | 'UPSDAP' | 'FedExDefault' | 'DHLExpress' | ...
  service: string;        // 'Priority' | 'Ground' | 'Express' | ...
  amountCents: number;
  currency: string;       // ISO, e.g. 'USD'
  estDeliveryDays: number | null;
}

export interface BuyLabelResult {
  shipmentId: string;
  trackingNumber: string;
  carrier: string;
  service: string;
  labelUrl: string;       // direct PDF/PNG URL
  labelCostCents: number;
}

export type TrackingStatus =
  | 'pre_transit' | 'in_transit' | 'out_for_delivery'
  | 'delivered'   | 'return_to_sender' | 'failure'
  | 'cancelled'   | 'error'      | 'unknown';

export interface ParsedWebhookEvent {
  eventId: string;
  eventType: string;
  shipmentId?: string;
  trackerId?: string;
  trackingNumber?: string;
  trackingStatus?: TrackingStatus;
  trackingEventAt?: string;   // ISO timestamp
  raw: unknown;
}

export interface GetRatesInput {
  from: Address;
  to: Address;
  parcel: Parcel;
  carrierFilter?: string[];
  serviceFilter?: string[];
}

export interface CarrierProvider {
  getRates(input: GetRatesInput): Promise<{ shipmentId: string; rates: RateQuote[] }>;
  buyLabel(input: { rateId: string; shipmentId: string }): Promise<BuyLabelResult>;
  refundLabel(input: { shipmentId: string }): Promise<{ refundStatus: string }>;
  parseWebhook(rawBody: string, signature: string | undefined): Promise<ParsedWebhookEvent>;
}

export class CarrierProviderError extends Error {
  constructor(
    public readonly code: 'auth' | 'rate' | 'config' | 'network' | 'invalid_input' | 'unknown',
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'CarrierProviderError';
  }
}
