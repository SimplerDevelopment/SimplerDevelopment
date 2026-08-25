// Idempotency + identity normalization helpers.
//
// Every external webhook is at-least-once; a single `externalMessageId` must
// never produce two messages, contacts, conversations, or outbox rows. These
// helpers normalize the inputs so unique constraints can do their job.

import type { ChannelIdentity, IdentityKind } from './types';

const PHONE_NON_DIGITS = /[^0-9]/g;

/**
 * Normalize an identity value so it matches reliably across providers:
 * - phone → E.164 (digits only, `+` preserved, leading `0` folded when possible)
 * - email → lowercase + trimmed
 * - everything else → trimmed as-is (provider ids are opaque)
 */
export function normalizeIdentity(kind: IdentityKind, raw: string): string {
  const trimmed = raw.trim();
  if (kind === 'email') return trimmed.toLowerCase();
  if (kind === 'phone') return toE164(trimmed);
  return trimmed;
}

/** Best-effort E.164. Keeps `+`, strips everything else, drops a leading 0. */
export function toE164(value: string): string {
  let digits = value.replace(PHONE_NON_DIGITS, '');
  if (digits.startsWith('0')) digits = digits.replace(/^0+/, '');
  if (digits.length > 0 && !digits.startsWith('+')) digits = `+${digits}`;
  return digits;
}

/** Deterministic idempotency key for an inbound provider message. */
export function inboundIdempotencyKey(connectionId: number, externalMessageId: string): string {
  return `${connectionId}:${externalMessageId}`;
}

/** Deterministic idempotency key for an outbound send. */
export function outboundIdempotencyKey(connectionId: number, idempotencyKey: string): string {
  return `${connectionId}:${idempotencyKey}`;
}

/** True when two identities refer to the same normalized handle. */
export function identitiesEqual(a: ChannelIdentity, b: ChannelIdentity): boolean {
  return a.kind === b.kind && normalizeIdentity(a.kind, a.value) === normalizeIdentity(b.kind, b.value);
}
