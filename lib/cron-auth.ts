// A scheduling header identifies a caller's intent, not its identity. Both
// Vercel and self-hosted schedulers must send the configured bearer secret.

import type { NextRequest } from 'next/server';
import { timingSafeEqual } from 'node:crypto';

export function isAuthorizedCron(req: NextRequest | Request): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;
  const actual = Buffer.from(req.headers.get('authorization') ?? '');
  const expected = Buffer.from(`Bearer ${cronSecret}`);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
