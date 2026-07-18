import { describe, it, expect } from 'vitest';
import {
  EMAIL_EVENTS,
  getEventDefinition,
  getEventsByCategory,
  getRequiredEvents,
  replaceVariables,
  buildSampleData,
  type EmailEventDefinition,
} from '@/lib/email/website-email-events';

describe('lib/email/website-email-events', () => {
  describe('EMAIL_EVENTS registry', () => {
    it('exports a non-empty array of event definitions', () => {
      expect(Array.isArray(EMAIL_EVENTS)).toBe(true);
      expect(EMAIL_EVENTS.length).toBeGreaterThan(0);
    });

    it('every event has a unique `event` key', () => {
      const keys = EMAIL_EVENTS.map((e) => e.event);
      const uniq = new Set(keys);
      expect(uniq.size).toBe(keys.length);
    });

    it('every definition has all required fields populated', () => {
      for (const def of EMAIL_EVENTS) {
        expect(typeof def.event).toBe('string');
        expect(def.event.length).toBeGreaterThan(0);
        expect(typeof def.name).toBe('string');
        expect(def.name.length).toBeGreaterThan(0);
        expect(typeof def.description).toBe('string');
        expect(def.description.length).toBeGreaterThan(0);
        expect(['store', 'account', 'content', 'booking']).toContain(def.category);
        expect(typeof def.isRequired).toBe('boolean');
        expect(typeof def.defaultSubject).toBe('string');
        expect(def.defaultSubject.length).toBeGreaterThan(0);
        expect(Array.isArray(def.variables)).toBe(true);
        expect(def.variables.length).toBeGreaterThan(0);
      }
    });

    it('every variable in every event has key/label/description/sampleValue', () => {
      for (const def of EMAIL_EVENTS) {
        for (const v of def.variables) {
          expect(typeof v.key).toBe('string');
          expect(v.key.length).toBeGreaterThan(0);
          expect(typeof v.label).toBe('string');
          expect(v.label.length).toBeGreaterThan(0);
          expect(typeof v.description).toBe('string');
          expect(typeof v.sampleValue).toBe('string');
        }
      }
    });

    it('contains the expected canonical store events', () => {
      const events = EMAIL_EVENTS.map((e) => e.event);
      expect(events).toContain('order.confirmed');
      expect(events).toContain('order.shipped');
      expect(events).toContain('order.delivered');
      expect(events).toContain('order.cancelled');
      expect(events).toContain('order.refunded');
      expect(events).toContain('payment.failed');
    });

    it('contains the expected account events', () => {
      const events = EMAIL_EVENTS.map((e) => e.event);
      expect(events).toContain('account.welcome');
      expect(events).toContain('account.password_reset');
    });

    it('contains the expected booking events', () => {
      const events = EMAIL_EVENTS.map((e) => e.event);
      expect(events).toContain('booking.confirmed');
      expect(events).toContain('booking.cancelled');
    });

    it('every event includes the common siteName/siteUrl/currentYear variables', () => {
      for (const def of EMAIL_EVENTS) {
        const keys = def.variables.map((v) => v.key);
        expect(keys).toContain('siteName');
        expect(keys).toContain('siteUrl');
        expect(keys).toContain('currentYear');
      }
    });

    it('order.shipped includes both order and shipping variables', () => {
      const def = EMAIL_EVENTS.find((e) => e.event === 'order.shipped')!;
      const keys = def.variables.map((v) => v.key);
      expect(keys).toContain('orderNumber');
      expect(keys).toContain('trackingNumber');
      expect(keys).toContain('trackingUrl');
      expect(keys).toContain('shippingMethod');
      expect(keys).toContain('estimatedDelivery');
    });

    it('order.cancelled includes cancellationReason', () => {
      const def = EMAIL_EVENTS.find((e) => e.event === 'order.cancelled')!;
      const keys = def.variables.map((v) => v.key);
      expect(keys).toContain('cancellationReason');
    });

    it('order.refunded includes refundAmount', () => {
      const def = EMAIL_EVENTS.find((e) => e.event === 'order.refunded')!;
      const keys = def.variables.map((v) => v.key);
      expect(keys).toContain('refundAmount');
    });

    it('payment.failed includes retryUrl', () => {
      const def = EMAIL_EVENTS.find((e) => e.event === 'payment.failed')!;
      const keys = def.variables.map((v) => v.key);
      expect(keys).toContain('retryUrl');
    });

    it('account.password_reset includes resetUrl', () => {
      const def = EMAIL_EVENTS.find((e) => e.event === 'account.password_reset')!;
      const keys = def.variables.map((v) => v.key);
      expect(keys).toContain('resetUrl');
    });

    it('booking.confirmed includes booking-specific variables', () => {
      const def = EMAIL_EVENTS.find((e) => e.event === 'booking.confirmed')!;
      const keys = def.variables.map((v) => v.key);
      expect(keys).toContain('bookingDate');
      expect(keys).toContain('bookingService');
      expect(keys).toContain('bookingDuration');
      expect(keys).toContain('cancelUrl');
    });

    it('booking.cancelled includes bookingDate and bookingService', () => {
      const def = EMAIL_EVENTS.find((e) => e.event === 'booking.cancelled')!;
      const keys = def.variables.map((v) => v.key);
      expect(keys).toContain('bookingDate');
      expect(keys).toContain('bookingService');
    });

    it('defaultSubject uses %%token%% placeholder syntax where applicable', () => {
      const orderConfirmed = EMAIL_EVENTS.find((e) => e.event === 'order.confirmed')!;
      expect(orderConfirmed.defaultSubject).toContain('%%orderNumber%%');
      const welcome = EMAIL_EVENTS.find((e) => e.event === 'account.welcome')!;
      expect(welcome.defaultSubject).toContain('%%siteName%%');
    });
  });

  describe('getEventDefinition', () => {
    it('returns the matching definition for a known event', () => {
      const def = getEventDefinition('order.confirmed');
      expect(def).toBeDefined();
      expect(def!.event).toBe('order.confirmed');
      expect(def!.name).toBe('Order Confirmation');
      expect(def!.category).toBe('store');
      expect(def!.isRequired).toBe(true);
    });

    it('returns undefined for an unknown event key', () => {
      expect(getEventDefinition('does.not.exist')).toBeUndefined();
    });

    it('returns undefined for an empty string', () => {
      expect(getEventDefinition('')).toBeUndefined();
    });

    it('is case-sensitive', () => {
      expect(getEventDefinition('Order.Confirmed')).toBeUndefined();
      expect(getEventDefinition('ORDER.CONFIRMED')).toBeUndefined();
    });

    it('returns a reference into EMAIL_EVENTS (same object identity)', () => {
      const def = getEventDefinition('order.shipped');
      const direct = EMAIL_EVENTS.find((e) => e.event === 'order.shipped');
      expect(def).toBe(direct);
    });
  });

  describe('getEventsByCategory', () => {
    it('returns only store events for "store"', () => {
      const result = getEventsByCategory('store');
      expect(result.length).toBeGreaterThan(0);
      for (const def of result) {
        expect(def.category).toBe('store');
      }
    });

    it('returns only account events for "account"', () => {
      const result = getEventsByCategory('account');
      expect(result.length).toBeGreaterThan(0);
      for (const def of result) {
        expect(def.category).toBe('account');
      }
    });

    it('returns only booking events for "booking"', () => {
      const result = getEventsByCategory('booking');
      expect(result.length).toBeGreaterThan(0);
      for (const def of result) {
        expect(def.category).toBe('booking');
      }
    });

    it('returns empty array for an unknown category', () => {
      const result = getEventsByCategory('nonexistent-category');
      expect(result).toEqual([]);
    });

    it('returns empty array for "content" (no content events currently defined)', () => {
      const result = getEventsByCategory('content');
      expect(result).toEqual([]);
    });

    it('store + account + booking totals match EMAIL_EVENTS length', () => {
      const total =
        getEventsByCategory('store').length +
        getEventsByCategory('account').length +
        getEventsByCategory('booking').length +
        getEventsByCategory('content').length;
      expect(total).toBe(EMAIL_EVENTS.length);
    });
  });

  describe('getRequiredEvents', () => {
    it('returns only events flagged isRequired', () => {
      const required = getRequiredEvents();
      expect(required.length).toBeGreaterThan(0);
      for (const def of required) {
        expect(def.isRequired).toBe(true);
      }
    });

    it('includes order.confirmed and account.welcome', () => {
      const required = getRequiredEvents();
      const events = required.map((e) => e.event);
      expect(events).toContain('order.confirmed');
      expect(events).toContain('account.welcome');
    });

    it('does not include order.refunded (not required)', () => {
      const required = getRequiredEvents();
      const events = required.map((e) => e.event);
      expect(events).not.toContain('order.refunded');
    });

    it('does not include booking events (not required)', () => {
      const required = getRequiredEvents();
      const events = required.map((e) => e.event);
      expect(events).not.toContain('booking.confirmed');
      expect(events).not.toContain('booking.cancelled');
    });
  });

  describe('replaceVariables', () => {
    it('replaces a single %%token%% with its value', () => {
      const out = replaceVariables('Hello %%name%%!', { name: 'Jane' });
      expect(out).toBe('Hello Jane!');
    });

    it('replaces multiple distinct tokens', () => {
      const out = replaceVariables('%%greeting%% %%name%%, order %%orderNumber%%', {
        greeting: 'Hi',
        name: 'Jane',
        orderNumber: 'ORD-0042',
      });
      expect(out).toBe('Hi Jane, order ORD-0042');
    });

    it('replaces repeated tokens', () => {
      const out = replaceVariables('%%x%%-%%x%%-%%x%%', { x: 'a' });
      expect(out).toBe('a-a-a');
    });

    it('leaves unmatched tokens as-is', () => {
      const out = replaceVariables('Hello %%name%%, %%unknown%%', { name: 'Jane' });
      expect(out).toBe('Hello Jane, %%unknown%%');
    });

    it('returns the input unchanged when no tokens are present', () => {
      const out = replaceVariables('No tokens here.', { name: 'Jane' });
      expect(out).toBe('No tokens here.');
    });

    it('returns the input unchanged when the data object is empty', () => {
      const out = replaceVariables('Hello %%name%%', {});
      expect(out).toBe('Hello %%name%%');
    });

    it('treats an empty-string value as a valid replacement (not a fallback)', () => {
      const out = replaceVariables('Hello %%name%%!', { name: '' });
      expect(out).toBe('Hello !');
    });

    it('does not treat tokens with hyphens or special chars as matches (\\w+ only)', () => {
      // %%hello-world%% does NOT match the \w+ regex (- is not a word char),
      // so it stays as-is.
      const out = replaceVariables('%%hello-world%%', { 'hello-world': 'x' });
      expect(out).toBe('%%hello-world%%');
    });

    it('matches alphanumeric and underscore token keys', () => {
      const out = replaceVariables('%%snake_case%% %%CamelCase%% %%num123%%', {
        snake_case: 'a',
        CamelCase: 'b',
        num123: 'c',
      });
      expect(out).toBe('a b c');
    });

    it('does not match a single %% with no token', () => {
      const out = replaceVariables('Just %% percent %% signs', {});
      expect(out).toBe('Just %% percent %% signs');
    });

    it('handles the empty string input', () => {
      expect(replaceVariables('', { x: 'y' })).toBe('');
    });

    it('returns a new string (does not mutate input)', () => {
      const input = 'Hello %%name%%';
      const out = replaceVariables(input, { name: 'Jane' });
      expect(input).toBe('Hello %%name%%');
      expect(out).toBe('Hello Jane');
    });
  });

  describe('buildSampleData', () => {
    it('returns a record keyed by variable.key with sampleValue values', () => {
      const data = buildSampleData([
        { key: 'firstName', label: 'First', description: 'd', sampleValue: 'Jane' },
        { key: 'orderNumber', label: 'Order #', description: 'd', sampleValue: 'ORD-1' },
      ]);
      expect(data).toEqual({ firstName: 'Jane', orderNumber: 'ORD-1' });
    });

    it('returns an empty object for empty input', () => {
      expect(buildSampleData([])).toEqual({});
    });

    it('later entries with the same key overwrite earlier ones', () => {
      const data = buildSampleData([
        { key: 'k', label: 'L1', description: 'd', sampleValue: 'first' },
        { key: 'k', label: 'L2', description: 'd', sampleValue: 'second' },
      ]);
      expect(data.k).toBe('second');
    });

    it('produces data usable by replaceVariables', () => {
      const def = getEventDefinition('order.confirmed')!;
      const data = buildSampleData(def.variables);
      const rendered = replaceVariables(def.defaultSubject, data);
      // defaultSubject is 'Order %%orderNumber%% confirmed' and the sample value is 'ORD-0042'
      expect(rendered).toBe('Order ORD-0042 confirmed');
    });

    it('round-trips every event: subject + sample data renders without leaving %%tokens%%', () => {
      // For each event, building sample data from its declared variables and
      // applying it to its defaultSubject should resolve every token in the subject.
      for (const def of EMAIL_EVENTS) {
        const data = buildSampleData(def.variables);
        const rendered = replaceVariables(def.defaultSubject, data);
        expect(rendered).not.toMatch(/%%\w+%%/);
      }
    });
  });

  describe('type contract', () => {
    it('EmailEventDefinition shape is satisfied by every entry', () => {
      // Compile-time check; at runtime we just confirm the array is typed.
      const sample: EmailEventDefinition = EMAIL_EVENTS[0];
      expect(sample).toBeDefined();
    });
  });
});
