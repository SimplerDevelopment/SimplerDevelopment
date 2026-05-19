/**
 * Magamommy weekly drop orchestrator.
 *
 * Runs the four-stage agent pipeline:
 *
 *    research  →  concept  →  design  →  publish
 *
 * State machine lives in `magamommy_drops`. Re-running the orchestrator for
 * the same `weekOf` is a no-op once `status === 'live'`. If a previous run
 * died mid-pipeline (e.g. cron timeout), the orchestrator picks up from the
 * next-pending stage by reading the row's persisted stage outputs (briefId,
 * conceptId, designId, productId).
 *
 * Invoked from:
 *   - `/api/cron/magamommy-weekly-drop/route.ts`  (Vercel cron, Monday 14:00 UTC)
 *   - `scripts/magamommy/run-weekly-drop.ts`      (manual trigger)
 */

import { db } from '@/lib/db';
import {
  magamommyDrops,
  clientWebsites,
  products,
} from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';

import { runResearcher } from './agents/researcher';
import { runConceptWriter } from './agents/concept-writer';
import { runDesigner } from './agents/designer';
import { runPublisher } from './agents/publisher';

export type DropStatus =
  | 'pending'
  | 'researching'
  | 'concepting'
  | 'designing'
  | 'publishing'
  | 'live'
  | 'failed';

export interface OrchestratorInput {
  /** Site to drop into. Looked up via the Magamommy domain/subdomain if omitted. */
  websiteId?: number;
  /** Drop week (Monday in UTC). Defaults to "this week's Monday". */
  weekOf?: Date;
  /** Forces a fresh drop even if one already exists for the week. Dev-only. */
  force?: boolean;
}

export interface OrchestratorOutput {
  dropId: number;
  status: DropStatus;
  websiteId: number;
  weekOf: string;
  briefId?: number;
  conceptId?: number;
  designId?: string;
  productId?: number;
  publicUrl?: string;
  error?: string;
  errorStage?: string;
  /** Per-stage timings in ms — useful for cron-tick budgeting. */
  timings?: Partial<Record<'research' | 'concept' | 'design' | 'publish', number>>;
}

/** "Monday of the current ISO week" in UTC, midnight. */
export function thisMondayUTC(now: Date = new Date()): Date {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const dow = d.getUTCDay(); // 0 = Sun, 1 = Mon, ..., 6 = Sat
  const offset = (dow + 6) % 7; // 0 if Mon, 6 if Sun
  d.setUTCDate(d.getUTCDate() - offset);
  return d;
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function resolveMagamommyContext(websiteIdHint?: number): Promise<{
  clientId: number;
  websiteId: number;
  templateProductId: number;
}> {
  let websiteId = websiteIdHint;
  let clientId: number | undefined;

  if (websiteId) {
    const [row] = await db
      .select({ id: clientWebsites.id, clientId: clientWebsites.clientId })
      .from(clientWebsites)
      .where(eq(clientWebsites.id, websiteId))
      .limit(1);
    if (!row) throw new Error(`[orchestrator] website ${websiteId} not found`);
    clientId = row.clientId;
  } else {
    const [siteByDomain] = await db
      .select({ id: clientWebsites.id, clientId: clientWebsites.clientId })
      .from(clientWebsites)
      .where(eq(clientWebsites.domain, 'magamommy.com'))
      .limit(1);

    let site = siteByDomain;
    if (!site) {
      [site] = await db
        .select({ id: clientWebsites.id, clientId: clientWebsites.clientId })
        .from(clientWebsites)
        .where(eq(clientWebsites.subdomain, 'magamommy'))
        .limit(1);
    }

    if (!site) {
      throw new Error('[orchestrator] Magamommy website not found — run scripts/magamommy/bootstrap-tenant.ts first');
    }
    clientId = site.clientId;
    websiteId = site.id;
  }

  // Find the template product — created by bootstrap as archived/isDesignable.
  const [template] = await db
    .select({ id: products.id })
    .from(products)
    .where(and(
      eq(products.websiteId, websiteId),
      eq(products.slug, 'heavyweight-tee-template'),
    ))
    .limit(1);
  if (!template) {
    throw new Error('[orchestrator] template product "heavyweight-tee-template" missing — rerun bootstrap');
  }

  return { clientId: clientId!, websiteId, templateProductId: template.id };
}

async function getOrCreateDropRow(websiteId: number, weekOfStr: string, force: boolean): Promise<{
  id: number;
  status: DropStatus;
  briefId: number | null;
  conceptId: number | null;
  designId: string | null;
  productId: number | null;
}> {
  const existing = await db.select()
    .from(magamommyDrops)
    .where(and(eq(magamommyDrops.websiteId, websiteId), eq(magamommyDrops.weekOf, weekOfStr)))
    .limit(1);

  if (existing.length > 0) {
    const row = existing[0];
    if (row.status === 'live' && !force) {
      return {
        id: row.id,
        status: row.status as DropStatus,
        briefId: row.briefId,
        conceptId: row.conceptId,
        designId: row.designId,
        productId: row.productId,
      };
    }
    if (force) {
      await db.update(magamommyDrops)
        .set({ status: 'pending', error: null, errorStage: null, updatedAt: new Date() })
        .where(eq(magamommyDrops.id, row.id));
    }
    return {
      id: row.id,
      status: force ? 'pending' : row.status as DropStatus,
      briefId: force ? null : row.briefId,
      conceptId: force ? null : row.conceptId,
      designId: force ? null : row.designId,
      productId: force ? null : row.productId,
    };
  }

  const [inserted] = await db.insert(magamommyDrops).values({
    websiteId,
    weekOf: weekOfStr,
    status: 'pending',
  }).returning();
  return {
    id: inserted.id,
    status: 'pending',
    briefId: null,
    conceptId: null,
    designId: null,
    productId: null,
  };
}

async function setStatus(dropId: number, status: DropStatus, fields: Partial<{
  briefId: number;
  conceptId: number;
  designId: string;
  productId: number;
  error: string;
  errorStage: string;
}> = {}) {
  await db.update(magamommyDrops)
    .set({ status, updatedAt: new Date(), ...fields })
    .where(eq(magamommyDrops.id, dropId));
}

export async function runWeeklyDrop(input: OrchestratorInput = {}): Promise<OrchestratorOutput> {
  const ctx = await resolveMagamommyContext(input.websiteId);
  const weekOf = input.weekOf ?? thisMondayUTC();
  const weekOfStr = ymd(weekOf);
  const drop = await getOrCreateDropRow(ctx.websiteId, weekOfStr, input.force ?? false);

  console.log(`[orchestrator] drop #${drop.id} week=${weekOfStr} status=${drop.status} website=${ctx.websiteId}`);

  if (drop.status === 'live') {
    console.log(`[orchestrator] drop #${drop.id} already live, returning cached state`);
    return {
      dropId: drop.id,
      status: 'live',
      websiteId: ctx.websiteId,
      weekOf: weekOfStr,
      briefId: drop.briefId ?? undefined,
      conceptId: drop.conceptId ?? undefined,
      designId: drop.designId ?? undefined,
      productId: drop.productId ?? undefined,
    };
  }

  const timings: OrchestratorOutput['timings'] = {};

  try {
    // ── Stage 1: research ──────────────────────────────────────────────────
    let briefId = drop.briefId;
    if (!briefId) {
      await setStatus(drop.id, 'researching');
      const t0 = Date.now();
      const out = await runResearcher({ websiteId: ctx.websiteId, clientId: ctx.clientId, weekOf });
      timings.research = Date.now() - t0;
      briefId = out.briefId;
      await setStatus(drop.id, 'researching', { briefId });
      console.log(`[orchestrator] research done in ${timings.research}ms, briefId=${briefId}`);
    }

    // ── Stage 2: concept ───────────────────────────────────────────────────
    let conceptId = drop.conceptId;
    if (!conceptId) {
      await setStatus(drop.id, 'concepting', { briefId });
      const t0 = Date.now();
      const out = await runConceptWriter({ websiteId: ctx.websiteId, clientId: ctx.clientId, briefId });
      timings.concept = Date.now() - t0;
      conceptId = out.conceptId;
      await setStatus(drop.id, 'concepting', { conceptId });
      console.log(`[orchestrator] concept done in ${timings.concept}ms, conceptId=${conceptId}`);
    }

    // ── Stage 3: design ────────────────────────────────────────────────────
    let designId = drop.designId;
    if (!designId) {
      await setStatus(drop.id, 'designing', { conceptId });
      const t0 = Date.now();
      const out = await runDesigner({
        websiteId: ctx.websiteId,
        clientId: ctx.clientId,
        conceptId,
        templateProductId: ctx.templateProductId,
      });
      timings.design = Date.now() - t0;
      designId = out.designId;
      await setStatus(drop.id, 'designing', { designId });
      console.log(`[orchestrator] design done in ${timings.design}ms, designId=${designId}`);
    }

    // ── Stage 4: publish ───────────────────────────────────────────────────
    let productId = drop.productId;
    let publicUrl: string | undefined;
    if (!productId) {
      await setStatus(drop.id, 'publishing', { designId });
      const t0 = Date.now();
      const out = await runPublisher({
        websiteId: ctx.websiteId,
        conceptId,
        designId,
        templateProductId: ctx.templateProductId,
        weekOf,
      });
      timings.publish = Date.now() - t0;
      productId = out.productId;
      publicUrl = out.publicUrl;
      console.log(`[orchestrator] publish done in ${timings.publish}ms, productId=${productId}, url=${publicUrl}`);
    }

    await setStatus(drop.id, 'live', { productId });

    return {
      dropId: drop.id,
      status: 'live',
      websiteId: ctx.websiteId,
      weekOf: weekOfStr,
      briefId: briefId ?? undefined,
      conceptId: conceptId ?? undefined,
      designId: designId ?? undefined,
      productId: productId ?? undefined,
      publicUrl,
      timings,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const stage = guessStage(message);
    console.error(`[orchestrator] FAILED at stage=${stage}: ${message}`);
    await setStatus(drop.id, 'failed', { error: message.slice(0, 2000), errorStage: stage });
    return {
      dropId: drop.id,
      status: 'failed',
      websiteId: ctx.websiteId,
      weekOf: weekOfStr,
      error: message,
      errorStage: stage,
      timings,
    };
  }
}

function guessStage(message: string): string {
  if (message.includes('[researcher]') || message.includes('research')) return 'research';
  if (message.includes('[concept-writer]') || message.includes('concept')) return 'concept';
  if (message.includes('[designer]') || message.includes('design')) return 'design';
  if (message.includes('[publisher]') || message.includes('publish')) return 'publish';
  return 'unknown';
}
