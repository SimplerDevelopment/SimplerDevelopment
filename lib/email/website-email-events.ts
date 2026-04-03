import type { EmailTemplateVariable } from '@/lib/db/schema';

export interface EmailEventDefinition {
  event: string;
  name: string;
  description: string;
  category: 'store' | 'account' | 'content' | 'booking';
  isRequired: boolean;
  defaultSubject: string;
  variables: EmailTemplateVariable[];
}

// -- Shared variables available to all templates --

const COMMON_VARIABLES: EmailTemplateVariable[] = [
  { key: 'siteName', label: 'Site Name', description: 'Website name', sampleValue: 'My Store' },
  { key: 'siteUrl', label: 'Site URL', description: 'Website URL', sampleValue: 'https://mystore.com' },
  { key: 'currentYear', label: 'Current Year', description: 'Current year for footers', sampleValue: '2026' },
];

const CUSTOMER_VARIABLES: EmailTemplateVariable[] = [
  { key: 'firstName', label: 'First Name', description: 'Customer first name', sampleValue: 'Jane' },
  { key: 'lastName', label: 'Last Name', description: 'Customer last name', sampleValue: 'Smith' },
  { key: 'fullName', label: 'Full Name', description: 'Customer full name', sampleValue: 'Jane Smith' },
  { key: 'email', label: 'Email', description: 'Customer email address', sampleValue: 'jane@example.com' },
];

const ORDER_VARIABLES: EmailTemplateVariable[] = [
  { key: 'orderNumber', label: 'Order Number', description: 'Order number (e.g. ORD-0042)', sampleValue: 'ORD-0042' },
  { key: 'orderDate', label: 'Order Date', description: 'Date the order was placed', sampleValue: 'April 2, 2026' },
  { key: 'orderTotal', label: 'Order Total', description: 'Formatted order total', sampleValue: '$149.99' },
  { key: 'subtotal', label: 'Subtotal', description: 'Subtotal before tax/shipping', sampleValue: '$129.99' },
  { key: 'shippingTotal', label: 'Shipping', description: 'Shipping cost', sampleValue: '$9.99' },
  { key: 'taxTotal', label: 'Tax', description: 'Tax amount', sampleValue: '$10.01' },
  { key: 'discountTotal', label: 'Discount', description: 'Discount amount', sampleValue: '$0.00' },
  { key: 'itemCount', label: 'Item Count', description: 'Number of items in order', sampleValue: '3' },
  { key: 'itemsHtml', label: 'Items (HTML)', description: 'HTML table of order line items', sampleValue: '<table>...</table>' },
  { key: 'shippingAddress', label: 'Shipping Address', description: 'Formatted shipping address', sampleValue: '123 Main St, City, ST 12345' },
  { key: 'billingAddress', label: 'Billing Address', description: 'Formatted billing address', sampleValue: '123 Main St, City, ST 12345' },
  { key: 'orderUrl', label: 'Order URL', description: 'Link to order status page', sampleValue: 'https://mystore.com/orders/ORD-0042' },
];

const SHIPPING_VARIABLES: EmailTemplateVariable[] = [
  { key: 'trackingNumber', label: 'Tracking Number', description: 'Shipment tracking number', sampleValue: '1Z999AA10123456784' },
  { key: 'trackingUrl', label: 'Tracking URL', description: 'Link to track the shipment', sampleValue: 'https://track.example.com/1Z999' },
  { key: 'shippingMethod', label: 'Shipping Method', description: 'Carrier/method name', sampleValue: 'USPS Priority Mail' },
  { key: 'estimatedDelivery', label: 'Est. Delivery', description: 'Estimated delivery date', sampleValue: 'April 5, 2026' },
];

// -- All event definitions --

export const EMAIL_EVENTS: EmailEventDefinition[] = [
  // Store / eCommerce
  {
    event: 'order.confirmed',
    name: 'Order Confirmation',
    description: 'Sent when a customer places an order and payment is successful.',
    category: 'store',
    isRequired: true,
    defaultSubject: 'Order %%orderNumber%% confirmed',
    variables: [...COMMON_VARIABLES, ...CUSTOMER_VARIABLES, ...ORDER_VARIABLES],
  },
  {
    event: 'order.shipped',
    name: 'Shipping Notification',
    description: 'Sent when an order is marked as shipped with tracking info.',
    category: 'store',
    isRequired: true,
    defaultSubject: 'Your order %%orderNumber%% has shipped',
    variables: [...COMMON_VARIABLES, ...CUSTOMER_VARIABLES, ...ORDER_VARIABLES, ...SHIPPING_VARIABLES],
  },
  {
    event: 'order.delivered',
    name: 'Delivery Confirmation',
    description: 'Sent when an order is marked as delivered.',
    category: 'store',
    isRequired: true,
    defaultSubject: 'Your order %%orderNumber%% has been delivered',
    variables: [...COMMON_VARIABLES, ...CUSTOMER_VARIABLES, ...ORDER_VARIABLES],
  },
  {
    event: 'order.cancelled',
    name: 'Order Cancelled',
    description: 'Sent when an order is cancelled by the store or customer.',
    category: 'store',
    isRequired: true,
    defaultSubject: 'Order %%orderNumber%% has been cancelled',
    variables: [
      ...COMMON_VARIABLES, ...CUSTOMER_VARIABLES, ...ORDER_VARIABLES,
      { key: 'cancellationReason', label: 'Reason', description: 'Cancellation reason', sampleValue: 'Customer requested cancellation' },
    ],
  },
  {
    event: 'order.refunded',
    name: 'Refund Issued',
    description: 'Sent when a refund is processed for an order.',
    category: 'store',
    isRequired: false,
    defaultSubject: 'Refund issued for order %%orderNumber%%',
    variables: [
      ...COMMON_VARIABLES, ...CUSTOMER_VARIABLES, ...ORDER_VARIABLES,
      { key: 'refundAmount', label: 'Refund Amount', description: 'Formatted refund amount', sampleValue: '$49.99' },
    ],
  },
  {
    event: 'payment.failed',
    name: 'Payment Failed',
    description: 'Sent when a payment attempt fails.',
    category: 'store',
    isRequired: true,
    defaultSubject: 'Payment failed for order %%orderNumber%%',
    variables: [
      ...COMMON_VARIABLES, ...CUSTOMER_VARIABLES, ...ORDER_VARIABLES,
      { key: 'retryUrl', label: 'Retry URL', description: 'Link to retry payment', sampleValue: 'https://mystore.com/checkout/retry' },
    ],
  },
  // Account
  {
    event: 'account.welcome',
    name: 'Welcome Email',
    description: 'Sent when a new customer account is created.',
    category: 'account',
    isRequired: true,
    defaultSubject: 'Welcome to %%siteName%%!',
    variables: [...COMMON_VARIABLES, ...CUSTOMER_VARIABLES],
  },
  {
    event: 'account.password_reset',
    name: 'Password Reset',
    description: 'Sent when a customer requests a password reset.',
    category: 'account',
    isRequired: true,
    defaultSubject: 'Reset your %%siteName%% password',
    variables: [
      ...COMMON_VARIABLES, ...CUSTOMER_VARIABLES,
      { key: 'resetUrl', label: 'Reset URL', description: 'Password reset link', sampleValue: 'https://mystore.com/reset?token=abc123' },
    ],
  },
  // Booking
  {
    event: 'booking.confirmed',
    name: 'Booking Confirmation',
    description: 'Sent when a booking is confirmed.',
    category: 'booking',
    isRequired: false,
    defaultSubject: 'Your booking is confirmed',
    variables: [
      ...COMMON_VARIABLES, ...CUSTOMER_VARIABLES,
      { key: 'bookingDate', label: 'Date', description: 'Booking date and time', sampleValue: 'April 5, 2026 at 2:00 PM' },
      { key: 'bookingService', label: 'Service', description: 'Service/appointment name', sampleValue: 'Consultation' },
      { key: 'bookingDuration', label: 'Duration', description: 'Appointment length', sampleValue: '30 minutes' },
      { key: 'cancelUrl', label: 'Cancel URL', description: 'Link to cancel the booking', sampleValue: 'https://mystore.com/booking/cancel/abc' },
    ],
  },
  {
    event: 'booking.cancelled',
    name: 'Booking Cancelled',
    description: 'Sent when a booking is cancelled.',
    category: 'booking',
    isRequired: false,
    defaultSubject: 'Your booking has been cancelled',
    variables: [
      ...COMMON_VARIABLES, ...CUSTOMER_VARIABLES,
      { key: 'bookingDate', label: 'Date', description: 'Original booking date', sampleValue: 'April 5, 2026 at 2:00 PM' },
      { key: 'bookingService', label: 'Service', description: 'Service name', sampleValue: 'Consultation' },
    ],
  },
];

export function getEventDefinition(event: string): EmailEventDefinition | undefined {
  return EMAIL_EVENTS.find(e => e.event === event);
}

export function getEventsByCategory(category: string): EmailEventDefinition[] {
  return EMAIL_EVENTS.filter(e => e.category === category);
}

export function getRequiredEvents(): EmailEventDefinition[] {
  return EMAIL_EVENTS.filter(e => e.isRequired);
}

/**
 * Replace %%variable%% tokens in a string with values from a data object.
 * Unmatched tokens are left as-is (visible in preview, replaced at send time).
 */
export function replaceVariables(template: string, data: Record<string, string>): string {
  return template.replace(/%%(\w+)%%/g, (match, key) => {
    return data[key] !== undefined ? data[key] : match;
  });
}

/**
 * Build sample data from variable definitions for preview rendering.
 */
export function buildSampleData(variables: EmailTemplateVariable[]): Record<string, string> {
  const data: Record<string, string> = {};
  for (const v of variables) {
    data[v.key] = v.sampleValue;
  }
  return data;
}
