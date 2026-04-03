import type { Block } from '@/types/blocks';
import type { EmailTemplateVariable } from '@/lib/db/schema';
import { EMAIL_EVENTS, getEventDefinition } from './website-email-events';
import { renderBlocksToEmailHtml } from './render-blocks-to-email';

export interface DefaultTemplate {
  event: string;
  name: string;
  subject: string;
  description: string;
  blocks: Block[];
  htmlContent: string;
  variables: EmailTemplateVariable[];
  isRequired: boolean;
}

function makeBlock(type: string, order: number, props: Record<string, unknown>): Block {
  return { id: `default-${type}-${order}`, type, order, ...props } as Block;
}

function orderConfirmationBlocks(): Block[] {
  return [
    makeBlock('email-header', 0, { alignment: 'center' }),
    makeBlock('heading', 1, { content: 'Order Confirmed', level: 1, alignment: 'center' }),
    makeBlock('text', 2, { content: 'Hi %%firstName%%, thank you for your order! We\'ve received your payment and your order is being processed.', alignment: 'left', size: 'base' }),
    makeBlock('divider', 3, { lineStyle: 'solid' }),
    makeBlock('heading', 4, { content: 'Order %%orderNumber%%', level: 3, alignment: 'left' }),
    makeBlock('text', 5, { content: '%%itemsHtml%%', alignment: 'left', size: 'base' }),
    makeBlock('divider', 6, { lineStyle: 'solid' }),
    makeBlock('text', 7, { content: '<strong>Subtotal:</strong> %%subtotal%%<br/><strong>Shipping:</strong> %%shippingTotal%%<br/><strong>Tax:</strong> %%taxTotal%%<br/><strong>Total:</strong> %%orderTotal%%', alignment: 'left', size: 'base' }),
    makeBlock('spacer', 8, { height: 'md' }),
    makeBlock('text', 9, { content: '<strong>Shipping to:</strong><br/>%%shippingAddress%%', alignment: 'left', size: 'sm' }),
    makeBlock('spacer', 10, { height: 'md' }),
    makeBlock('button', 11, { text: 'View Order', url: '%%orderUrl%%', variant: 'primary', size: 'md', alignment: 'center' }),
    makeBlock('email-footer', 12, { companyName: '%%siteName%%', showUnsubscribe: false }),
  ];
}

function shippingNotificationBlocks(): Block[] {
  return [
    makeBlock('email-header', 0, { alignment: 'center' }),
    makeBlock('heading', 1, { content: 'Your Order Has Shipped!', level: 1, alignment: 'center' }),
    makeBlock('text', 2, { content: 'Hi %%firstName%%, great news! Your order %%orderNumber%% is on its way.', alignment: 'left', size: 'base' }),
    makeBlock('divider', 3, { lineStyle: 'solid' }),
    makeBlock('text', 4, { content: '<strong>Shipping Method:</strong> %%shippingMethod%%<br/><strong>Tracking Number:</strong> %%trackingNumber%%<br/><strong>Estimated Delivery:</strong> %%estimatedDelivery%%', alignment: 'left', size: 'base' }),
    makeBlock('spacer', 5, { height: 'md' }),
    makeBlock('button', 6, { text: 'Track Your Package', url: '%%trackingUrl%%', variant: 'primary', size: 'md', alignment: 'center' }),
    makeBlock('spacer', 7, { height: 'sm' }),
    makeBlock('text', 8, { content: 'If you have any questions about your order, just reply to this email.', alignment: 'center', size: 'sm' }),
    makeBlock('email-footer', 9, { companyName: '%%siteName%%', showUnsubscribe: false }),
  ];
}

function deliveryConfirmationBlocks(): Block[] {
  return [
    makeBlock('email-header', 0, { alignment: 'center' }),
    makeBlock('heading', 1, { content: 'Your Order Has Been Delivered', level: 1, alignment: 'center' }),
    makeBlock('text', 2, { content: 'Hi %%firstName%%, your order %%orderNumber%% has been delivered. We hope you love it!', alignment: 'left', size: 'base' }),
    makeBlock('spacer', 3, { height: 'md' }),
    makeBlock('button', 4, { text: 'View Order', url: '%%orderUrl%%', variant: 'primary', size: 'md', alignment: 'center' }),
    makeBlock('spacer', 5, { height: 'sm' }),
    makeBlock('text', 6, { content: 'If anything isn\'t right with your order, please don\'t hesitate to reach out.', alignment: 'center', size: 'sm' }),
    makeBlock('email-footer', 7, { companyName: '%%siteName%%', showUnsubscribe: false }),
  ];
}

function orderCancelledBlocks(): Block[] {
  return [
    makeBlock('email-header', 0, { alignment: 'center' }),
    makeBlock('heading', 1, { content: 'Order Cancelled', level: 1, alignment: 'center' }),
    makeBlock('text', 2, { content: 'Hi %%firstName%%, your order %%orderNumber%% has been cancelled.', alignment: 'left', size: 'base' }),
    makeBlock('text', 3, { content: '<strong>Reason:</strong> %%cancellationReason%%', alignment: 'left', size: 'base' }),
    makeBlock('text', 4, { content: 'If a payment was made, a refund will be issued to your original payment method within 5-10 business days.', alignment: 'left', size: 'base' }),
    makeBlock('spacer', 5, { height: 'md' }),
    makeBlock('button', 6, { text: 'View Order Details', url: '%%orderUrl%%', variant: 'outline', size: 'md', alignment: 'center' }),
    makeBlock('email-footer', 7, { companyName: '%%siteName%%', showUnsubscribe: false }),
  ];
}

function paymentFailedBlocks(): Block[] {
  return [
    makeBlock('email-header', 0, { alignment: 'center' }),
    makeBlock('heading', 1, { content: 'Payment Failed', level: 1, alignment: 'center' }),
    makeBlock('text', 2, { content: 'Hi %%firstName%%, we were unable to process the payment for your order %%orderNumber%%.', alignment: 'left', size: 'base' }),
    makeBlock('text', 3, { content: 'Please update your payment method to complete the purchase. Your items are reserved for 24 hours.', alignment: 'left', size: 'base' }),
    makeBlock('spacer', 4, { height: 'md' }),
    makeBlock('button', 5, { text: 'Retry Payment', url: '%%retryUrl%%', variant: 'primary', size: 'lg', alignment: 'center' }),
    makeBlock('spacer', 6, { height: 'sm' }),
    makeBlock('text', 7, { content: 'If you need help, reply to this email and we\'ll assist you.', alignment: 'center', size: 'sm' }),
    makeBlock('email-footer', 8, { companyName: '%%siteName%%', showUnsubscribe: false }),
  ];
}

function welcomeBlocks(): Block[] {
  return [
    makeBlock('email-header', 0, { alignment: 'center' }),
    makeBlock('heading', 1, { content: 'Welcome to %%siteName%%!', level: 1, alignment: 'center' }),
    makeBlock('text', 2, { content: 'Hi %%firstName%%, thanks for creating an account. We\'re excited to have you!', alignment: 'left', size: 'base' }),
    makeBlock('text', 3, { content: 'You can now browse our store, track your orders, and enjoy a personalized shopping experience.', alignment: 'left', size: 'base' }),
    makeBlock('spacer', 4, { height: 'md' }),
    makeBlock('button', 5, { text: 'Start Shopping', url: '%%siteUrl%%', variant: 'primary', size: 'lg', alignment: 'center' }),
    makeBlock('email-footer', 6, { companyName: '%%siteName%%', showUnsubscribe: false }),
  ];
}

function passwordResetBlocks(): Block[] {
  return [
    makeBlock('email-header', 0, { alignment: 'center' }),
    makeBlock('heading', 1, { content: 'Reset Your Password', level: 1, alignment: 'center' }),
    makeBlock('text', 2, { content: 'Hi %%firstName%%, we received a request to reset your password. Click the button below to choose a new one.', alignment: 'left', size: 'base' }),
    makeBlock('spacer', 3, { height: 'md' }),
    makeBlock('button', 4, { text: 'Reset Password', url: '%%resetUrl%%', variant: 'primary', size: 'lg', alignment: 'center' }),
    makeBlock('spacer', 5, { height: 'md' }),
    makeBlock('text', 6, { content: 'If you didn\'t request this, you can safely ignore this email. The link expires in 1 hour.', alignment: 'left', size: 'sm' }),
    makeBlock('email-footer', 7, { companyName: '%%siteName%%', showUnsubscribe: false }),
  ];
}

function refundIssuedBlocks(): Block[] {
  return [
    makeBlock('email-header', 0, { alignment: 'center' }),
    makeBlock('heading', 1, { content: 'Refund Issued', level: 1, alignment: 'center' }),
    makeBlock('text', 2, { content: 'Hi %%firstName%%, a refund of <strong>%%refundAmount%%</strong> has been issued for your order %%orderNumber%%.', alignment: 'left', size: 'base' }),
    makeBlock('text', 3, { content: 'The refund will appear on your original payment method within 5-10 business days, depending on your bank.', alignment: 'left', size: 'base' }),
    makeBlock('divider', 4, { lineStyle: 'solid' }),
    makeBlock('text', 5, { content: '<strong>Order:</strong> %%orderNumber%%<br/><strong>Refund Amount:</strong> %%refundAmount%%', alignment: 'left', size: 'base' }),
    makeBlock('spacer', 6, { height: 'md' }),
    makeBlock('button', 7, { text: 'View Order', url: '%%orderUrl%%', variant: 'outline', size: 'md', alignment: 'center' }),
    makeBlock('spacer', 8, { height: 'sm' }),
    makeBlock('text', 9, { content: 'If you have any questions about your refund, just reply to this email.', alignment: 'center', size: 'sm' }),
    makeBlock('email-footer', 10, { companyName: '%%siteName%%', showUnsubscribe: false }),
  ];
}

function bookingConfirmedBlocks(): Block[] {
  return [
    makeBlock('email-header', 0, { alignment: 'center' }),
    makeBlock('heading', 1, { content: 'Booking Confirmed', level: 1, alignment: 'center' }),
    makeBlock('text', 2, { content: 'Hi %%firstName%%, your booking has been confirmed! Here are the details:', alignment: 'left', size: 'base' }),
    makeBlock('divider', 3, { lineStyle: 'solid' }),
    makeBlock('text', 4, { content: '<strong>Service:</strong> %%bookingService%%<br/><strong>Date & Time:</strong> %%bookingDate%%<br/><strong>Duration:</strong> %%bookingDuration%%', alignment: 'left', size: 'base' }),
    makeBlock('spacer', 5, { height: 'md' }),
    makeBlock('text', 6, { content: 'Need to make changes? You can cancel your booking using the link below.', alignment: 'left', size: 'base' }),
    makeBlock('button', 7, { text: 'Cancel Booking', url: '%%cancelUrl%%', variant: 'outline', size: 'md', alignment: 'center' }),
    makeBlock('spacer', 8, { height: 'sm' }),
    makeBlock('text', 9, { content: 'We look forward to seeing you!', alignment: 'center', size: 'sm' }),
    makeBlock('email-footer', 10, { companyName: '%%siteName%%', showUnsubscribe: false }),
  ];
}

function bookingCancelledBlocks(): Block[] {
  return [
    makeBlock('email-header', 0, { alignment: 'center' }),
    makeBlock('heading', 1, { content: 'Booking Cancelled', level: 1, alignment: 'center' }),
    makeBlock('text', 2, { content: 'Hi %%firstName%%, your booking has been cancelled.', alignment: 'left', size: 'base' }),
    makeBlock('divider', 3, { lineStyle: 'solid' }),
    makeBlock('text', 4, { content: '<strong>Service:</strong> %%bookingService%%<br/><strong>Original Date:</strong> %%bookingDate%%', alignment: 'left', size: 'base' }),
    makeBlock('spacer', 5, { height: 'md' }),
    makeBlock('text', 6, { content: 'If you\'d like to rebook, you can schedule a new appointment anytime.', alignment: 'left', size: 'base' }),
    makeBlock('button', 7, { text: 'Book Again', url: '%%siteUrl%%', variant: 'primary', size: 'md', alignment: 'center' }),
    makeBlock('email-footer', 8, { companyName: '%%siteName%%', showUnsubscribe: false }),
  ];
}

const TEMPLATE_BLOCKS: Record<string, () => Block[]> = {
  'order.confirmed': orderConfirmationBlocks,
  'order.shipped': shippingNotificationBlocks,
  'order.delivered': deliveryConfirmationBlocks,
  'order.cancelled': orderCancelledBlocks,
  'order.refunded': refundIssuedBlocks,
  'payment.failed': paymentFailedBlocks,
  'account.welcome': welcomeBlocks,
  'account.password_reset': passwordResetBlocks,
  'booking.confirmed': bookingConfirmedBlocks,
  'booking.cancelled': bookingCancelledBlocks,
};

export function getDefaultTemplates(): DefaultTemplate[] {
  return EMAIL_EVENTS.map(eventDef => {
    const blocksFn = TEMPLATE_BLOCKS[eventDef.event];
    const blocks = blocksFn ? blocksFn() : [];
    const htmlContent = blocks.length > 0 ? renderBlocksToEmailHtml(blocks) : '';

    return {
      event: eventDef.event,
      name: eventDef.name,
      subject: eventDef.defaultSubject,
      description: eventDef.description,
      blocks,
      htmlContent,
      variables: eventDef.variables,
      isRequired: eventDef.isRequired,
    };
  });
}
