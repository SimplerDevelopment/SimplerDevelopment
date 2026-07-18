// @vitest-environment node
/**
 * Unit tests for the e-signature status state machine in
 * lib/esign/status-machine. The DB and provider-client are NOT
 * touched — these are pure-function checks.
 */

import { describe, it, expect } from 'vitest';
import {
  applyWebhookEvent,
  canCancel,
  canSend,
  canSign,
  isTerminal,
} from '@/lib/esign/status-machine';

describe('isTerminal', () => {
  it('treats signed/declined/canceled as terminal', () => {
    expect(isTerminal('signed')).toBe(true);
    expect(isTerminal('declined')).toBe(true);
    expect(isTerminal('canceled')).toBe(true);
  });

  it('treats not_sent / sent / viewed as non-terminal', () => {
    expect(isTerminal('not_sent')).toBe(false);
    expect(isTerminal('sent')).toBe(false);
    expect(isTerminal('viewed')).toBe(false);
  });

  it('treats null/undefined as non-terminal', () => {
    expect(isTerminal(null)).toBe(false);
    expect(isTerminal(undefined)).toBe(false);
  });
});

describe('canSend', () => {
  it('allows sending from not_sent / null / undefined', () => {
    expect(canSend('not_sent')).toBe(true);
    expect(canSend(null)).toBe(true);
    expect(canSend(undefined)).toBe(true);
  });

  it('allows re-sending after declined or canceled', () => {
    expect(canSend('declined')).toBe(true);
    expect(canSend('canceled')).toBe(true);
  });

  it('blocks sending while in-flight (sent / viewed)', () => {
    expect(canSend('sent')).toBe(false);
    expect(canSend('viewed')).toBe(false);
  });

  it('blocks sending after signed', () => {
    expect(canSend('signed')).toBe(false);
  });
});

describe('canSign', () => {
  it('only allows signing in sent or viewed', () => {
    expect(canSign('sent')).toBe(true);
    expect(canSign('viewed')).toBe(true);
  });

  it('blocks signing in any other state', () => {
    expect(canSign('not_sent')).toBe(false);
    expect(canSign('signed')).toBe(false);
    expect(canSign('declined')).toBe(false);
    expect(canSign('canceled')).toBe(false);
    expect(canSign(null)).toBe(false);
  });
});

describe('canCancel', () => {
  it('only allows cancel in sent or viewed', () => {
    expect(canCancel('sent')).toBe(true);
    expect(canCancel('viewed')).toBe(true);
    expect(canCancel('not_sent')).toBe(false);
    expect(canCancel('signed')).toBe(false);
    expect(canCancel('declined')).toBe(false);
    expect(canCancel('canceled')).toBe(false);
  });
});

describe('applyWebhookEvent', () => {
  it('promotes sent → viewed on signature_request_viewed', () => {
    expect(applyWebhookEvent('sent', 'signature_request_viewed', false)).toBe('viewed');
  });

  it('does not regress viewed back to sent on a viewed event', () => {
    expect(applyWebhookEvent('viewed', 'signature_request_viewed', false)).toBe('viewed');
  });

  it('promotes to signed on signature_request_signed only when is_complete is true', () => {
    expect(applyWebhookEvent('sent', 'signature_request_signed', false)).toBe('sent');
    expect(applyWebhookEvent('sent', 'signature_request_signed', true)).toBe('signed');
    expect(applyWebhookEvent('viewed', 'signature_request_signed', true)).toBe('signed');
  });

  it('always promotes to signed on signature_request_all_signed', () => {
    expect(applyWebhookEvent('sent', 'signature_request_all_signed', false)).toBe('signed');
    expect(applyWebhookEvent('viewed', 'signature_request_all_signed', false)).toBe('signed');
  });

  it('moves to declined on signature_request_declined', () => {
    expect(applyWebhookEvent('sent', 'signature_request_declined', false)).toBe('declined');
    expect(applyWebhookEvent('viewed', 'signature_request_declined', false)).toBe('declined');
  });

  it('moves to canceled on signature_request_canceled', () => {
    expect(applyWebhookEvent('sent', 'signature_request_canceled', false)).toBe('canceled');
  });

  it('terminal states are sticky and never re-opened by a webhook replay', () => {
    expect(applyWebhookEvent('signed', 'signature_request_viewed', false)).toBe('signed');
    expect(applyWebhookEvent('signed', 'signature_request_canceled', false)).toBe('signed');
    expect(applyWebhookEvent('declined', 'signature_request_signed', true)).toBe('declined');
    expect(applyWebhookEvent('canceled', 'signature_request_all_signed', true)).toBe('canceled');
  });

  it('unknown event types do not change status', () => {
    expect(applyWebhookEvent('sent', 'unknown_event', false)).toBe('sent');
    expect(applyWebhookEvent('viewed', 'something_else', false)).toBe('viewed');
  });

  it('treats null current status as not_sent (no change for non-promoting events)', () => {
    expect(applyWebhookEvent(null, 'signature_request_viewed', false)).toBe('not_sent');
    // The send-route is what advances not_sent → sent, never a webhook.
    expect(applyWebhookEvent(null, 'signature_request_signed', false)).toBe('not_sent');
  });
});
