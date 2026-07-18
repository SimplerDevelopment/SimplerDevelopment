// @vitest-environment node
/**
 * Unit tests for verifyWebhookSignature in lib/esign/dropbox-sign.
 *
 * The DropboxSign webhook verifier is HMAC-SHA256(secret, raw_body),
 * hex-encoded, constant-time compared against the request header.
 * These tests exercise the pure HMAC path with synthetic inputs.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createHmac } from 'crypto';

const TEST_SECRET = 'test_secret_12345';
const ORIGINAL_API_KEY = process.env.DROPBOX_SIGN_API_KEY;
const ORIGINAL_WEBHOOK_SECRET = process.env.DROPBOX_SIGN_WEBHOOK_SECRET;

// Each test imports fresh because verifyWebhookSignature reads env at call time.
async function importVerifier() {
  const mod = await import('@/lib/esign/dropbox-sign');
  return mod.verifyWebhookSignature;
}

function sign(body: string, secret: string): string {
  return createHmac('sha256', secret).update(body, 'utf8').digest('hex');
}

describe('verifyWebhookSignature', () => {
  beforeEach(() => {
    process.env.DROPBOX_SIGN_API_KEY = 'unused-api-key';
    process.env.DROPBOX_SIGN_WEBHOOK_SECRET = TEST_SECRET;
  });

  afterEach(() => {
    if (ORIGINAL_API_KEY === undefined) delete process.env.DROPBOX_SIGN_API_KEY;
    else process.env.DROPBOX_SIGN_API_KEY = ORIGINAL_API_KEY;
    if (ORIGINAL_WEBHOOK_SECRET === undefined) delete process.env.DROPBOX_SIGN_WEBHOOK_SECRET;
    else process.env.DROPBOX_SIGN_WEBHOOK_SECRET = ORIGINAL_WEBHOOK_SECRET;
  });

  it('accepts a correctly-signed payload', async () => {
    const verify = await importVerifier();
    const body = '{"event":{"event_type":"signature_request_signed"}}';
    const sig = sign(body, TEST_SECRET);
    expect(await verify(body, sig)).toBe(true);
  });

  it('rejects a tampered payload', async () => {
    const verify = await importVerifier();
    const body = '{"event":{"event_type":"signature_request_signed"}}';
    const sig = sign(body, TEST_SECRET);
    const tampered = body.replace('signed', 'declined');
    expect(await verify(tampered, sig)).toBe(false);
  });

  it('rejects a wrong-secret signature', async () => {
    const verify = await importVerifier();
    const body = 'arbitrary-body';
    const sig = sign(body, 'wrong-secret');
    expect(await verify(body, sig)).toBe(false);
  });

  it('rejects an empty header', async () => {
    const verify = await importVerifier();
    expect(await verify('any-body', '')).toBe(false);
    expect(await verify('any-body', null)).toBe(false);
    expect(await verify('any-body', undefined)).toBe(false);
  });

  it('rejects when no webhook secret is configured', async () => {
    delete process.env.DROPBOX_SIGN_WEBHOOK_SECRET;
    delete process.env.DROPBOX_SIGN_API_KEY;
    const verify = await importVerifier();
    const body = 'x';
    const sig = sign(body, 'something');
    expect(await verify(body, sig)).toBe(false);
  });

  it('falls back to DROPBOX_SIGN_API_KEY when no webhook secret is set', async () => {
    delete process.env.DROPBOX_SIGN_WEBHOOK_SECRET;
    process.env.DROPBOX_SIGN_API_KEY = 'fallback-key';
    const verify = await importVerifier();
    const body = 'fallback-body';
    const sig = sign(body, 'fallback-key');
    expect(await verify(body, sig)).toBe(true);
  });

  it('is case-insensitive on the header (lowercased before compare)', async () => {
    const verify = await importVerifier();
    const body = 'case-test';
    const sig = sign(body, TEST_SECRET);
    expect(await verify(body, sig.toUpperCase())).toBe(true);
  });

  it('does length-mismatch reject before timingSafeEqual', async () => {
    const verify = await importVerifier();
    const body = 'short';
    expect(await verify(body, 'abcdef')).toBe(false);
  });
});
