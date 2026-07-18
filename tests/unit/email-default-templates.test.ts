// @vitest-environment node
/**
 * Unit tests for `getDefaultTemplates` in lib/email/default-email-templates.ts.
 *
 * Verifies that every event in EMAIL_EVENTS gets a corresponding DefaultTemplate
 * with sane shape, that templates whose event key is registered in
 * TEMPLATE_BLOCKS have non-empty rendered html plus the expected block structure,
 * and that every %%placeholder%% in the rendered html corresponds to a declared
 * variable on the template (so we don't drift between blocks and the variable
 * schema).
 */
import { describe, it, expect } from 'vitest';
import { getDefaultTemplates } from '@/lib/email/default-email-templates';
import { EMAIL_EVENTS } from '@/lib/email/website-email-events';

const REGISTERED_EVENTS = new Set([
  'order.confirmed',
  'order.shipped',
  'order.delivered',
  'order.cancelled',
  'order.refunded',
  'payment.failed',
  'account.welcome',
  'account.password_reset',
  'booking.confirmed',
  'booking.cancelled',
]);

// Variables that every event implicitly has via COMMON_VARIABLES + CUSTOMER_VARIABLES,
// but a template body may still reference even if not on the event's explicit list.
// In practice every event in EMAIL_EVENTS does carry COMMON + CUSTOMER variables,
// so we just rely on the union of declared variables.

describe('getDefaultTemplates', () => {
  const templates = getDefaultTemplates();

  it('returns one template per event in EMAIL_EVENTS, in order', () => {
    expect(templates).toHaveLength(EMAIL_EVENTS.length);
    for (let i = 0; i < EMAIL_EVENTS.length; i++) {
      expect(templates[i].event).toBe(EMAIL_EVENTS[i].event);
    }
  });

  it('copies name/subject/description/variables/isRequired from the event definition', () => {
    for (const t of templates) {
      const evt = EMAIL_EVENTS.find(e => e.event === t.event);
      expect(evt).toBeDefined();
      expect(t.name).toBe(evt!.name);
      expect(t.subject).toBe(evt!.defaultSubject);
      expect(t.description).toBe(evt!.description);
      expect(t.variables).toBe(evt!.variables);
      expect(t.isRequired).toBe(evt!.isRequired);
    }
  });

  it('returns a fresh array on each call (not a cached reference)', () => {
    const a = getDefaultTemplates();
    const b = getDefaultTemplates();
    expect(a).not.toBe(b);
    // Block arrays should also be freshly constructed (factory functions invoked again).
    const aOrder = a.find(t => t.event === 'order.confirmed')!;
    const bOrder = b.find(t => t.event === 'order.confirmed')!;
    expect(aOrder.blocks).not.toBe(bOrder.blocks);
  });

  it('has DefaultTemplate shape for every entry', () => {
    for (const t of templates) {
      expect(typeof t.event).toBe('string');
      expect(t.event.length).toBeGreaterThan(0);
      expect(typeof t.name).toBe('string');
      expect(t.name.length).toBeGreaterThan(0);
      expect(typeof t.subject).toBe('string');
      expect(t.subject.length).toBeGreaterThan(0);
      expect(typeof t.description).toBe('string');
      expect(t.description.length).toBeGreaterThan(0);
      expect(Array.isArray(t.blocks)).toBe(true);
      expect(typeof t.htmlContent).toBe('string');
      expect(Array.isArray(t.variables)).toBe(true);
      expect(typeof t.isRequired).toBe('boolean');
    }
  });

  it('provides non-empty blocks + htmlContent for every event registered in TEMPLATE_BLOCKS', () => {
    for (const t of templates) {
      if (REGISTERED_EVENTS.has(t.event)) {
        expect(t.blocks.length).toBeGreaterThan(0);
        expect(t.htmlContent.length).toBeGreaterThan(0);
      }
    }
  });

  it('every block carries id, type, and a numeric order; orders are contiguous from 0', () => {
    for (const t of templates) {
      if (!REGISTERED_EVENTS.has(t.event)) continue;
      const orders = t.blocks.map(b => b.order);
      expect(orders).toEqual([...orders].sort((a, b) => a - b));
      expect(orders[0]).toBe(0);
      expect(orders[orders.length - 1]).toBe(t.blocks.length - 1);
      for (const b of t.blocks) {
        expect(typeof b.id).toBe('string');
        expect(b.id.length).toBeGreaterThan(0);
        expect(typeof b.type).toBe('string');
        expect(b.type.length).toBeGreaterThan(0);
        expect(typeof b.order).toBe('number');
      }
    }
  });

  it('every populated template starts with email-header and ends with email-footer', () => {
    for (const t of templates) {
      if (!REGISTERED_EVENTS.has(t.event)) continue;
      expect(t.blocks[0].type).toBe('email-header');
      expect(t.blocks[t.blocks.length - 1].type).toBe('email-footer');
    }
  });

  it('every populated template contains at least one heading', () => {
    for (const t of templates) {
      if (!REGISTERED_EVENTS.has(t.event)) continue;
      const hasHeading = t.blocks.some(b => b.type === 'heading');
      expect(hasHeading).toBe(true);
    }
  });

  it('every %%placeholder%% in block content is a declared variable on the template', () => {
    const placeholderRe = /%%(\w+)%%/g;
    for (const t of templates) {
      if (!REGISTERED_EVENTS.has(t.event)) continue;
      const declared = new Set(t.variables.map(v => v.key));
      const seen = new Set<string>();
      for (const block of t.blocks) {
        // Pull placeholders out of any string field on the block props.
        for (const value of Object.values(block as Record<string, unknown>)) {
          if (typeof value !== 'string') continue;
          let m: RegExpExecArray | null;
          placeholderRe.lastIndex = 0;
          while ((m = placeholderRe.exec(value)) !== null) {
            seen.add(m[1]);
          }
        }
      }
      for (const key of seen) {
        expect(declared.has(key), `event ${t.event} references %%${key}%% but it is not declared in variables`).toBe(true);
      }
    }
  });

  it('rendered htmlContent contains the heading text for each populated template', () => {
    const expected: Record<string, string> = {
      'order.confirmed': 'Order Confirmed',
      'order.shipped': 'Your Order Has Shipped!',
      'order.delivered': 'Your Order Has Been Delivered',
      'order.cancelled': 'Order Cancelled',
      'order.refunded': 'Refund Issued',
      'payment.failed': 'Payment Failed',
      'account.welcome': 'Welcome to %%siteName%%!',
      'account.password_reset': 'Reset Your Password',
      'booking.confirmed': 'Booking Confirmed',
      'booking.cancelled': 'Booking Cancelled',
    };
    for (const t of templates) {
      if (!REGISTERED_EVENTS.has(t.event)) continue;
      const headingText = expected[t.event];
      expect(headingText).toBeDefined();
      expect(t.htmlContent).toContain(headingText);
    }
  });

  it('order.confirmed includes itemsHtml, orderNumber, orderTotal placeholders', () => {
    const t = templates.find(x => x.event === 'order.confirmed')!;
    expect(t).toBeDefined();
    const allStrings = t.blocks.flatMap(b => Object.values(b as Record<string, unknown>).filter(v => typeof v === 'string') as string[]).join('\n');
    expect(allStrings).toContain('%%itemsHtml%%');
    expect(allStrings).toContain('%%orderNumber%%');
    expect(allStrings).toContain('%%orderTotal%%');
    expect(allStrings).toContain('%%shippingAddress%%');
    // Has a primary CTA button to view the order.
    const button = t.blocks.find(b => b.type === 'button') as Record<string, unknown> | undefined;
    expect(button).toBeDefined();
    expect(button!.url).toBe('%%orderUrl%%');
    expect(button!.variant).toBe('primary');
  });

  it('order.shipped includes shipping + tracking variables and a tracking CTA', () => {
    const t = templates.find(x => x.event === 'order.shipped')!;
    const allStrings = t.blocks.flatMap(b => Object.values(b as Record<string, unknown>).filter(v => typeof v === 'string') as string[]).join('\n');
    expect(allStrings).toContain('%%trackingNumber%%');
    expect(allStrings).toContain('%%shippingMethod%%');
    expect(allStrings).toContain('%%estimatedDelivery%%');
    const button = t.blocks.find(b => b.type === 'button') as Record<string, unknown> | undefined;
    expect(button!.url).toBe('%%trackingUrl%%');
    expect(button!.text).toBe('Track Your Package');
  });

  it('order.cancelled mentions cancellationReason and uses an outline button', () => {
    const t = templates.find(x => x.event === 'order.cancelled')!;
    const allStrings = t.blocks.flatMap(b => Object.values(b as Record<string, unknown>).filter(v => typeof v === 'string') as string[]).join('\n');
    expect(allStrings).toContain('%%cancellationReason%%');
    const button = t.blocks.find(b => b.type === 'button') as Record<string, unknown> | undefined;
    expect(button!.variant).toBe('outline');
  });

  it('order.refunded mentions refundAmount and links to the order', () => {
    const t = templates.find(x => x.event === 'order.refunded')!;
    const allStrings = t.blocks.flatMap(b => Object.values(b as Record<string, unknown>).filter(v => typeof v === 'string') as string[]).join('\n');
    expect(allStrings).toContain('%%refundAmount%%');
    expect(allStrings).toContain('%%orderNumber%%');
    const button = t.blocks.find(b => b.type === 'button') as Record<string, unknown> | undefined;
    expect(button!.url).toBe('%%orderUrl%%');
  });

  it('payment.failed has a retry CTA pointing at retryUrl', () => {
    const t = templates.find(x => x.event === 'payment.failed')!;
    const button = t.blocks.find(b => b.type === 'button') as Record<string, unknown> | undefined;
    expect(button).toBeDefined();
    expect(button!.url).toBe('%%retryUrl%%');
    expect(button!.text).toBe('Retry Payment');
    expect(button!.variant).toBe('primary');
    expect(button!.size).toBe('lg');
  });

  it('account.welcome has a Start Shopping CTA pointing at siteUrl', () => {
    const t = templates.find(x => x.event === 'account.welcome')!;
    const button = t.blocks.find(b => b.type === 'button') as Record<string, unknown> | undefined;
    expect(button!.url).toBe('%%siteUrl%%');
    expect(button!.text).toBe('Start Shopping');
    expect(button!.size).toBe('lg');
  });

  it('account.password_reset includes resetUrl and references expiry/safety language', () => {
    const t = templates.find(x => x.event === 'account.password_reset')!;
    const allStrings = t.blocks.flatMap(b => Object.values(b as Record<string, unknown>).filter(v => typeof v === 'string') as string[]).join('\n');
    expect(allStrings).toContain('%%resetUrl%%');
    expect(allStrings.toLowerCase()).toContain('expires');
    const button = t.blocks.find(b => b.type === 'button') as Record<string, unknown> | undefined;
    expect(button!.text).toBe('Reset Password');
  });

  it('booking.confirmed includes booking details and a cancel CTA', () => {
    const t = templates.find(x => x.event === 'booking.confirmed')!;
    const allStrings = t.blocks.flatMap(b => Object.values(b as Record<string, unknown>).filter(v => typeof v === 'string') as string[]).join('\n');
    expect(allStrings).toContain('%%bookingService%%');
    expect(allStrings).toContain('%%bookingDate%%');
    expect(allStrings).toContain('%%bookingDuration%%');
    const button = t.blocks.find(b => b.type === 'button') as Record<string, unknown> | undefined;
    expect(button!.url).toBe('%%cancelUrl%%');
    expect(button!.variant).toBe('outline');
  });

  it('booking.cancelled includes booking service/date and a rebook CTA', () => {
    const t = templates.find(x => x.event === 'booking.cancelled')!;
    const allStrings = t.blocks.flatMap(b => Object.values(b as Record<string, unknown>).filter(v => typeof v === 'string') as string[]).join('\n');
    expect(allStrings).toContain('%%bookingService%%');
    expect(allStrings).toContain('%%bookingDate%%');
    const button = t.blocks.find(b => b.type === 'button') as Record<string, unknown> | undefined;
    expect(button!.url).toBe('%%siteUrl%%');
    expect(button!.text).toBe('Book Again');
  });

  it('every populated template uses %%firstName%% in the salutation', () => {
    for (const t of templates) {
      if (!REGISTERED_EVENTS.has(t.event)) continue;
      const allStrings = t.blocks.flatMap(b => Object.values(b as Record<string, unknown>).filter(v => typeof v === 'string') as string[]).join('\n');
      expect(allStrings).toContain('%%firstName%%');
    }
  });

  it('every email-footer uses %%siteName%% as companyName and disables unsubscribe (transactional)', () => {
    for (const t of templates) {
      if (!REGISTERED_EVENTS.has(t.event)) continue;
      const footer = t.blocks.find(b => b.type === 'email-footer') as Record<string, unknown> | undefined;
      expect(footer).toBeDefined();
      expect(footer!.companyName).toBe('%%siteName%%');
      expect(footer!.showUnsubscribe).toBe(false);
    }
  });

  it('block ids follow the default-${type}-${order} convention and are unique within a template', () => {
    for (const t of templates) {
      if (!REGISTERED_EVENTS.has(t.event)) continue;
      const ids = new Set<string>();
      for (const b of t.blocks) {
        expect(b.id).toBe(`default-${b.type}-${b.order}`);
        expect(ids.has(b.id)).toBe(false);
        ids.add(b.id);
      }
    }
  });

  it('htmlContent for each populated template contains the customer salutation token', () => {
    for (const t of templates) {
      if (!REGISTERED_EVENTS.has(t.event)) continue;
      // After rendering, the %%firstName%% placeholder should still be present
      // (it's resolved at send time, not template-build time).
      expect(t.htmlContent).toContain('%%firstName%%');
    }
  });
});
