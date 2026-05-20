import { NextResponse } from 'next/server';
import { withCronHealth } from '@/lib/cron-health';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { brainNoteTemplates } from '@/lib/db/schema';
import { applyTemplate } from '@/lib/brain/template';
import { createNote, getNoteBySourceUrl } from '@/lib/brain/notes';
import { isBrainEntitled } from '@/lib/brain/entitlement';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Cron: materialize today's "daily" note for every tenant that has one or
 * more `trigger='daily'` templates configured.
 *
 * Idempotent on `(clientId, source_url)` where source_url is
 * `daily://<templateId>/<YYYY-MM-DD>` — re-running on the same UTC day skips
 * any note that's already been created. Timezones are intentionally ignored
 * for now (everything in UTC); per-tenant tz support can layer on later
 * without changing the dedupe key as long as we keep YYYY-MM-DD in tenant tz.
 *
 * Auth: Vercel cron header OR `Authorization: Bearer ${CRON_SECRET}`.
 *
 * Suggested schedule: 6:05 UTC daily (`5 6 * * *`).
 */
async function _GET(req: Request) {
  const isVercelCron = req.headers.get('x-vercel-cron') === '1';
  if (!isVercelCron) {
    const cronSecret = process.env.CRON_SECRET;
    const auth = req.headers.get('authorization');
    if (!cronSecret || auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }
  }

  const today = new Date();
  const yyyy = today.getUTCFullYear();
  const mm = String(today.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(today.getUTCDate()).padStart(2, '0');
  const dateKey = `${yyyy}-${mm}-${dd}`;

  // Pull all enabled daily templates across all tenants in a single round-trip.
  // Volume here is bounded by tenant count × small N templates per tenant —
  // safe to keep in memory. If this ever grows we can shard by client_id.
  const templates = await db.select().from(brainNoteTemplates).where(and(
    eq(brainNoteTemplates.trigger, 'daily'),
    eq(brainNoteTemplates.enabled, true),
  ));

  let created = 0;
  let skipped = 0;
  let skippedUnentitled = 0;
  let failed = 0;
  const failures: { templateId: number; clientId: number; reason: string }[] = [];

  // Tiny per-run cache so we only hit the entitlement query once per client,
  // even if a tenant has multiple daily templates configured.
  const entitlementCache = new Map<number, boolean>();
  async function tenantEntitled(clientId: number): Promise<boolean> {
    const cached = entitlementCache.get(clientId);
    if (cached !== undefined) return cached;
    const ok = await isBrainEntitled(clientId);
    entitlementCache.set(clientId, ok);
    return ok;
  }

  for (const tpl of templates) {
    const sourceUrl = `daily://${tpl.id}/${dateKey}`;
    try {
      // Per-tenant entitlement gate — this cron is unauthenticated (Vercel
      // cron header / shared secret) so we cannot use the request-scoped
      // `requireBrainEntitlement`. Defense-in-depth: if a tenant churned but
      // still has `enabled=true` daily templates lying around, do not write
      // new notes on their behalf. Use the explicit-clientId helper.
      if (!(await tenantEntitled(tpl.clientId))) {
        skippedUnentitled++;
        continue;
      }

      const existing = await getNoteBySourceUrl(tpl.clientId, sourceUrl);
      if (existing) { skipped++; continue; }

      const body = await applyTemplate(tpl.body, {
        today,
        clientId: tpl.clientId,
      });

      const tags = Array.from(new Set([...(tpl.defaultTags ?? []), 'daily']));

      await createNote({
        clientId: tpl.clientId,
        title: tpl.name === 'Today' ? `Today — ${dateKey}` : `${tpl.name} — ${dateKey}`,
        body,
        tags,
        // No 'template' value in the existing source enum — 'document_import'
        // is the closest fit for "machine-generated from a stored body".
        source: 'document_import',
        sourceUrl,
        createdBy: tpl.createdBy ?? null,
      });
      created++;
    } catch (err) {
      failed++;
      const reason = (err as Error).message ?? 'unknown';
      failures.push({ templateId: tpl.id, clientId: tpl.clientId, reason });
      console.error(`[brain-daily-notes] template=${tpl.id} client=${tpl.clientId} failed: ${reason}`);
    }
  }

  return NextResponse.json({
    success: true,
    date: dateKey,
    examined: templates.length,
    created,
    skipped,
    skippedUnentitled,
    failed,
    failures: failures.slice(0, 20),
  });
}

export const GET = withCronHealth(
  { name: 'api-cron:brain-daily-notes', area: 'api-cron' },
  _GET,
);

// Accept POST for manual triggers from scripts.
export const POST = GET;
