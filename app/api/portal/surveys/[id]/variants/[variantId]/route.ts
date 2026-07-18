/**
 * Per-survey A/B variant item.
 *
 * GET    — fetch a single variant.
 * PATCH  — update name / fields / weight / enabled (any subset).
 * DELETE — drop the variant. `survey_responses.variant_id` is FK'd
 *          ON DELETE SET NULL so historical responses survive with a null
 *          bucket label.
 *
 * Tenant-scoped via the survey → client check.
 */

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { surveys, surveyVariants } from '@/lib/db/schema';
import type { SurveyFieldDef } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';
import { authorizePortal, isAuthError } from '@/lib/portal-auth';

async function loadVariantForClient(surveyId: number, variantId: number, clientId: number) {
  const [survey] = await db.select().from(surveys)
    .where(and(eq(surveys.id, surveyId), eq(surveys.clientId, clientId))).limit(1);
  if (!survey) return null;

  const [variant] = await db.select().from(surveyVariants)
    .where(and(eq(surveyVariants.id, variantId), eq(surveyVariants.surveyId, surveyId))).limit(1);
  if (!variant) return null;

  return { survey, variant };
}

function clampWeight(input: unknown): number | null {
  if (input === undefined) return null;
  const n = typeof input === 'number' ? input : parseInt(String(input ?? ''), 10);
  if (!Number.isFinite(n)) return null;
  return Math.max(1, Math.min(10000, Math.round(n)));
}

function sanitizeFields(input: unknown): SurveyFieldDef[] | null {
  if (input === undefined) return null;
  if (!Array.isArray(input)) return [];
  return input as SurveyFieldDef[];
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; variantId: string }> },
) {
  const { id, variantId } = await params;
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const authResult = await authorizePortal({ action: 'read', requireService: 'surveys' });
  if (isAuthError(authResult)) return authResult.response;

  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client) return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });

  const found = await loadVariantForClient(parseInt(id, 10), parseInt(variantId, 10), client.id);
  if (!found) return NextResponse.json({ success: false, message: 'Variant not found' }, { status: 404 });

  return NextResponse.json({ success: true, data: found.variant });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; variantId: string }> },
) {
  const { id, variantId } = await params;
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const authResult = await authorizePortal({ action: 'write', requireService: 'surveys' });
  if (isAuthError(authResult)) return authResult.response;

  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client) return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });

  const found = await loadVariantForClient(parseInt(id, 10), parseInt(variantId, 10), client.id);
  if (!found) return NextResponse.json({ success: false, message: 'Variant not found' }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  // Drizzle's typed `set()` rejects an indexed dictionary, so we collect the
  // fields we want to mutate via narrow conditional spreads.
  const updates: Partial<typeof surveyVariants.$inferInsert> = {};

  if (typeof body?.name === 'string') {
    const trimmed = body.name.trim();
    if (!trimmed) return NextResponse.json({ success: false, message: 'Name cannot be empty' }, { status: 400 });
    if (trimmed.length > 100) return NextResponse.json({ success: false, message: 'Name must be 100 characters or fewer' }, { status: 400 });
    updates.name = trimmed;
  }

  const fields = sanitizeFields(body?.fields);
  if (fields !== null) updates.fields = fields;

  const weight = clampWeight(body?.weight);
  if (weight !== null) updates.weight = weight;

  if (typeof body?.enabled === 'boolean') updates.enabled = body.enabled;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ success: false, message: 'No fields to update' }, { status: 400 });
  }

  const [row] = await db.update(surveyVariants).set(updates)
    .where(eq(surveyVariants.id, found.variant.id))
    .returning();

  return NextResponse.json({ success: true, data: row });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; variantId: string }> },
) {
  const { id, variantId } = await params;
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const authResult = await authorizePortal({ action: 'write', requireService: 'surveys' });
  if (isAuthError(authResult)) return authResult.response;

  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client) return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });

  const found = await loadVariantForClient(parseInt(id, 10), parseInt(variantId, 10), client.id);
  if (!found) return NextResponse.json({ success: false, message: 'Variant not found' }, { status: 404 });

  await db.delete(surveyVariants).where(eq(surveyVariants.id, found.variant.id));

  return NextResponse.json({ success: true });
}
