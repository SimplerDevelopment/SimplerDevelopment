// Extracted verbatim from ../page.tsx for PUX-187 — shared types + the
// statusColors map used by the order-detail page and its sub-components.

export interface OrderItem {
  id: number;
  productName: string;
  variantName?: string | null;
  sku?: string | null;
  quantity: number;
  unitPriceCents: number;
  totalCents: number;
  // Original column on order_items.designId — present when the customer
  // attached a saved design at checkout. May be set even when `design`
  // below is null (the design row was deleted after the order shipped).
  designId?: number | null;
  design?: {
    id: number;
    uuid: string | null;
    name: string | null;
    thumbnailUrl: string | null;
  } | null;
}

export interface Address {
  name?: string;
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
}

export interface StatusEvent {
  id: number;
  status: string;
  note?: string | null;
  createdAt: string;
}

export interface Order {
  id: number;
  orderNumber: string;
  status: string;
  paymentStatus?: string | null;
  customerName: string;
  customerEmail: string;
  customerPhone?: string | null;
  shippingAddress?: Address | null;
  billingAddress?: Address | null;
  items: OrderItem[];
  subtotalCents: number;
  shippingCents: number;
  taxCents: number;
  discountCents: number;
  totalCents: number;
  trackingNumber?: string | null;
  trackingUrl?: string | null;
  internalNotes?: string | null;
  statusHistory: StatusEvent[];
  createdAt: string;
  carrier?: string | null;
  shippingMethod?: string | null;
  labelUrl?: string | null;
  labelCostCents?: number | null;
  labelPurchasedAt?: string | null;
  easypostShipmentId?: string | null;
  printfulOrderId?: string | null;
  printfulFulfillmentStatus?: string | null;
  printfulFulfillmentError?: string | null;
  printfulSubmittedAt?: string | null;
}

export interface RateQuote {
  id: string;
  shipmentId: string;
  carrier: string;
  service: string;
  amountCents: number;
  currency: string;
  estDeliveryDays: number | null;
}

export interface ParcelSummary {
  lengthIn: number;
  widthIn: number;
  heightIn: number;
  weightOz: number;
}

export const statusColors: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  confirmed: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  processing: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400',
  shipped: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  delivered: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  cancelled: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  refunded: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
};
