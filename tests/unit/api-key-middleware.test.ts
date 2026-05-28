/**
 * @vitest-environment node
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextResponse } from 'next/server';

// Mock @/lib/api-keys so we never touch the DB or real rate-limiter state.
const validateApiKey = vi.fn();
const checkRateLimit = vi.fn();
vi.mock('@/lib/api-keys', () => ({
  validateApiKey: (...args: unknown[]) => validateApiKey(...args),
  checkRateLimit: (...args: unknown[]) => checkRateLimit(...args),
}));

// Avoid pulling in a real DB connection if anything transitively imports it.
vi.mock('@/lib/db', () => ({ db: {} }));

import { withApiKeyAndCors } from '@/lib/api-key-middleware';

type Ctx = { params: Promise<{ siteId: string; [key: string]: string }> };

function ctx(siteId: string): Ctx {
  return { params: Promise.resolve({ siteId }) };
}

function makeRequest(
  init: { method?: string; headers?: Record<string, string> } = {},
): Request {
  return new Request('https://example.com/api/test', {
    method: init.method ?? 'GET',
    headers: init.headers ?? {},
  });
}

describe('withApiKeyAndCors', () => {
  beforeEach(() => {
    validateApiKey.mockReset();
    checkRateLimit.mockReset();
  });

  it('responds to OPTIONS preflight with 204 + CORS headers without invoking the handler', async () => {
    const handler = vi.fn();
    const wrapped = withApiKeyAndCors(handler);

    const res = await wrapped(makeRequest({ method: 'OPTIONS' }), ctx('123'));

    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(res.headers.get('Access-Control-Allow-Methods')).toBe('GET, POST, OPTIONS');
    expect(res.headers.get('Access-Control-Allow-Headers')).toBe(
      'Content-Type, Authorization, x-api-key',
    );
    expect(handler).not.toHaveBeenCalled();
    expect(validateApiKey).not.toHaveBeenCalled();
  });

  it('skips API-key validation when no auth/x-api-key header is present and calls handler', async () => {
    const handlerResponse = NextResponse.json({ ok: true }, { status: 200 });
    const handler = vi.fn().mockResolvedValue(handlerResponse);
    const wrapped = withApiKeyAndCors(handler);

    const res = await wrapped(makeRequest({}), ctx('42'));

    expect(handler).toHaveBeenCalledTimes(1);
    expect(validateApiKey).not.toHaveBeenCalled();
    expect(checkRateLimit).not.toHaveBeenCalled();
    expect(res.status).toBe(200);
    // CORS headers should be merged onto the handler's response.
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(await res.json()).toEqual({ ok: true });
  });

  it('ignores Authorization header that does not start with "Bearer sd_live_"', async () => {
    const handler = vi.fn().mockResolvedValue(NextResponse.json({ ok: true }));
    const wrapped = withApiKeyAndCors(handler);

    await wrapped(
      makeRequest({ headers: { authorization: 'Bearer some-jwt-token' } }),
      ctx('1'),
    );

    expect(validateApiKey).not.toHaveBeenCalled();
    expect(handler).toHaveBeenCalled();
  });

  it('ignores x-api-key header that does not start with "sd_live_"', async () => {
    const handler = vi.fn().mockResolvedValue(NextResponse.json({ ok: true }));
    const wrapped = withApiKeyAndCors(handler);

    await wrapped(makeRequest({ headers: { 'x-api-key': 'sd_test_abc' } }), ctx('1'));

    expect(validateApiKey).not.toHaveBeenCalled();
    expect(handler).toHaveBeenCalled();
  });

  it('extracts the key from "Authorization: Bearer sd_live_..." and validates it', async () => {
    validateApiKey.mockResolvedValueOnce({ id: 99, rateLimitPerMinute: 120 });
    checkRateLimit.mockReturnValueOnce({
      allowed: true,
      remaining: 119,
      resetAt: new Date(Date.now() + 60_000),
    });
    const handler = vi.fn().mockResolvedValue(NextResponse.json({ ok: true }, { status: 200 }));
    const wrapped = withApiKeyAndCors(handler);

    const res = await wrapped(
      makeRequest({ headers: { authorization: 'Bearer sd_live_abc123' } }),
      ctx('7'),
    );

    expect(validateApiKey).toHaveBeenCalledWith('sd_live_abc123', 7);
    expect(checkRateLimit).toHaveBeenCalledWith(99, 120);
    expect(handler).toHaveBeenCalled();
    expect(res.status).toBe(200);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });

  it('extracts the key from "x-api-key: sd_live_..." when no Bearer header is set', async () => {
    validateApiKey.mockResolvedValueOnce({ id: 5, rateLimitPerMinute: null });
    checkRateLimit.mockReturnValueOnce({
      allowed: true,
      remaining: 59,
      resetAt: new Date(Date.now() + 60_000),
    });
    const handler = vi.fn().mockResolvedValue(NextResponse.json({ ok: true }));
    const wrapped = withApiKeyAndCors(handler);

    await wrapped(
      makeRequest({ headers: { 'x-api-key': 'sd_live_xyz' } }),
      ctx('11'),
    );

    expect(validateApiKey).toHaveBeenCalledWith('sd_live_xyz', 11);
    // Falls back to default limit of 60 when rateLimitPerMinute is null.
    expect(checkRateLimit).toHaveBeenCalledWith(5, 60);
  });

  it('returns 401 + CORS when validateApiKey returns null (invalid/unknown key)', async () => {
    validateApiKey.mockResolvedValueOnce(null);
    const handler = vi.fn();
    const wrapped = withApiKeyAndCors(handler);

    const res = await wrapped(
      makeRequest({ headers: { authorization: 'Bearer sd_live_bogus' } }),
      ctx('3'),
    );

    expect(res.status).toBe(401);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(await res.json()).toEqual({ success: false, message: 'Invalid API key' });
    expect(checkRateLimit).not.toHaveBeenCalled();
    expect(handler).not.toHaveBeenCalled();
  });

  it('returns 429 with Retry-After + X-RateLimit headers when rate limit is exceeded', async () => {
    validateApiKey.mockResolvedValueOnce({ id: 17, rateLimitPerMinute: 30 });
    const resetAt = new Date(Date.now() + 45_000);
    checkRateLimit.mockReturnValueOnce({ allowed: false, remaining: 0, resetAt });
    const handler = vi.fn();
    const wrapped = withApiKeyAndCors(handler);

    const res = await wrapped(
      makeRequest({ headers: { 'x-api-key': 'sd_live_rate' } }),
      ctx('9'),
    );

    expect(res.status).toBe(429);
    expect(handler).not.toHaveBeenCalled();
    expect(res.headers.get('X-RateLimit-Limit')).toBe('30');
    expect(res.headers.get('X-RateLimit-Remaining')).toBe('0');
    const retryAfter = Number(res.headers.get('Retry-After'));
    expect(retryAfter).toBeGreaterThanOrEqual(0);
    expect(retryAfter).toBeLessThanOrEqual(46);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(await res.json()).toEqual({ success: false, message: 'Rate limit exceeded' });
  });

  it('uses default rate limit (60) when record.rateLimitPerMinute is nullish on 429 path', async () => {
    validateApiKey.mockResolvedValueOnce({ id: 22, rateLimitPerMinute: null });
    checkRateLimit.mockReturnValueOnce({
      allowed: false,
      remaining: 0,
      resetAt: new Date(Date.now() + 10_000),
    });
    const wrapped = withApiKeyAndCors(vi.fn());

    const res = await wrapped(
      makeRequest({ headers: { authorization: 'Bearer sd_live_x' } }),
      ctx('2'),
    );

    expect(checkRateLimit).toHaveBeenCalledWith(22, 60);
    expect(res.headers.get('X-RateLimit-Limit')).toBe('60');
  });

  it('parses siteId as a base-10 integer when forwarding to validateApiKey', async () => {
    validateApiKey.mockResolvedValueOnce({ id: 1, rateLimitPerMinute: 60 });
    checkRateLimit.mockReturnValueOnce({
      allowed: true,
      remaining: 59,
      resetAt: new Date(),
    });
    const handler = vi.fn().mockResolvedValue(NextResponse.json({ ok: true }));
    const wrapped = withApiKeyAndCors(handler);

    await wrapped(
      makeRequest({ headers: { authorization: 'Bearer sd_live_k' } }),
      ctx('042'),
    );

    expect(validateApiKey).toHaveBeenCalledWith('sd_live_k', 42);
  });

  it('merges CORS headers onto the handler response while preserving handler headers + status', async () => {
    const handler = vi.fn().mockResolvedValue(
      NextResponse.json(
        { hello: 'world' },
        { status: 201, headers: { 'X-Custom': 'kept' } },
      ),
    );
    const wrapped = withApiKeyAndCors(handler);

    const res = await wrapped(makeRequest({}), ctx('1'));

    expect(res.status).toBe(201);
    expect(res.headers.get('X-Custom')).toBe('kept');
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(await res.json()).toEqual({ hello: 'world' });
  });

  it('prefers Bearer-style Authorization key over x-api-key when both are present', async () => {
    validateApiKey.mockResolvedValueOnce({ id: 1, rateLimitPerMinute: 60 });
    checkRateLimit.mockReturnValueOnce({
      allowed: true,
      remaining: 59,
      resetAt: new Date(),
    });
    const handler = vi.fn().mockResolvedValue(NextResponse.json({ ok: true }));
    const wrapped = withApiKeyAndCors(handler);

    await wrapped(
      makeRequest({
        headers: {
          authorization: 'Bearer sd_live_bearer',
          'x-api-key': 'sd_live_xkey',
        },
      }),
      ctx('1'),
    );

    expect(validateApiKey).toHaveBeenCalledWith('sd_live_bearer', 1);
  });
});
