// Shared cron auth check for the plugin-registry crons. Accepts either the
// Vercel cron platform header (`x-vercel-cron: 1`) or a Bearer secret in the
// `Authorization` header matching `process.env.CRON_SECRET`. Mirrors the
// pattern used by app/api/cron/process-scheduled-automations/route.ts.

import type { NextRequest } from 'next/server';

export function isAuthorizedCron(req: NextRequest | Request): boolean {
  const isVercelCron = req.headers.get('x-vercel-cron') === '1';
  if (isVercelCron) return true;
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;
  const auth = req.headers.get('authorization');
  return auth === `Bearer ${cronSecret}`;
}
