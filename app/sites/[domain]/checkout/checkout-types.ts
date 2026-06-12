import { loadStripe } from '@stripe/stripe-js/pure';
import type { Stripe as StripeClient } from '@stripe/stripe-js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CartItem {
  id: number;
  productId: number;
  variantId: number | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  productName: string;
  variantName: string | null;
  image: string | null;
}

export interface ShippingRate {
  id: number | string;
  name: string;
  rateType: string;
  price: number;
  freeAbove: number | null;
  minDeliveryDays: number | null;
  maxDeliveryDays: number | null;
}

export interface CheckoutResult {
  clientSecret: string;
  publishableKey: string | null;
  orderId: number;
  orderNumber: string;
  total: number;
  currency: string;
}

export interface ContactForm {
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  customerNote: string;
  line1: string;
  line2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  discountCode: string;
}

export interface CheckoutPageClientProps {
  siteId: number;
  domain: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function formatPrice(cents: number, currency = 'USD') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100);
}

// Lazily construct Stripe promise keyed by publishable key so we don't
// create a new instance on every render.
const stripeCache = new Map<string, Promise<StripeClient | null>>();
export function getStripePromise(pk: string): Promise<StripeClient | null> {
  if (!stripeCache.has(pk)) {
    stripeCache.set(pk, loadStripe(pk));
  }
  return stripeCache.get(pk)!;
}
