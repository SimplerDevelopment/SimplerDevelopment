import crypto from 'crypto';
import { db } from '@/lib/db';
import { apiKeys } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';

export function generateApiKey(): string {
  return `sd_live_${crypto.randomBytes(32).toString('hex')}`;
}

export async function validateApiKey(key: string, siteId: number) {
  const [record] = await db
    .select()
    .from(apiKeys)
    .where(and(eq(apiKeys.key, key), eq(apiKeys.websiteId, siteId), eq(apiKeys.active, true)))
    .limit(1);

  if (!record) return null;

  // Check expiry
  if (record.expiresAt && record.expiresAt < new Date()) return null;

  // Update lastUsedAt (fire and forget)
  db.update(apiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiKeys.id, record.id))
    .then(() => {})
    .catch(() => {});

  return record;
}

// Simple in-memory sliding window rate limiter
const rateLimitWindows = new Map<number, { count: number; resetAt: number }>();

const WINDOW_MS = 60_000; // 1 minute

export function checkRateLimit(keyId: number, limit: number): { allowed: boolean; remaining: number; resetAt: Date } {
  const now = Date.now();
  const window = rateLimitWindows.get(keyId);

  if (!window || now > window.resetAt) {
    rateLimitWindows.set(keyId, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true, remaining: limit - 1, resetAt: new Date(now + WINDOW_MS) };
  }

  window.count++;
  const remaining = Math.max(0, limit - window.count);
  return {
    allowed: window.count <= limit,
    remaining,
    resetAt: new Date(window.resetAt),
  };
}
