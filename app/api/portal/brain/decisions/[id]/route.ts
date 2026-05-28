/**
 * REST: /api/portal/brain/decisions/[id]
 *
 *   GET    — fetch a decision + its supersedes chain (ancestors + descendants).
 *   PATCH  — partial update via {@link updateDecision} allowlist. Mutating
 *            rationale / decision / reversibility → 400 (use supersede).
 *   DELETE — soft-reject (status='rejected'). No hard delete.
 *
 * Envelope: { success: true, data } / { success: false, message }
 *
 * Phase 1 brain-restructure. See .planning/brain-restructure/PLAN.md.
 */
import { NextResponse } from 'next/server';
import { requireBrainEntitlement } from '@/lib/brain/entitlement';
import {
  getDecisionById,
  softRejectDecision,
  updateDecision,
} from '@/lib/brain/decisions';

const ALLOWED_CONFIDENTIALITY = ['standard', 'restricted', 'confidential'] as const;

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = await requireBrainEntitlement({ action: 'read' });
  if ('response' in result) return result.response;

  const { id } = await params;
  const decisionId = parseInt(id, 10);
  if (!Number.isFinite(decisionId)) {
    return NextResponse.json({ success: false, message: 'Invalid decision id' }, { status: 400 });
  }

  const found = await getDecisionById(result.client.id, decisionId);
  if (!found) {
    return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
  }

  return NextResponse.json({
    success: true,
    data: {
      decision: found.decision,
      ancestors: found.ancestors,
      descendants: found.descendants,
    },
  });
}

interface PatchBody {
  title?: unknown;
  context?: unknown;
  decisionMakerId?: unknown;
  anchors?: unknown;
  confidentialityLevel?: unknown;
  alternativesConsidered?: unknown;
  // Forbidden — surfaced verbatim by the lib helper.
  decision?: unknown;
  rationale?: unknown;
  reversibility?: unknown;
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = await requireBrainEntitlement({ action: 'write' });
  if ('response' in result) return result.response;

  const { id } = await params;
  const decisionId = parseInt(id, 10);
  if (!Number.isFinite(decisionId)) {
    return NextResponse.json({ success: false, message: 'Invalid decision id' }, { status: 400 });
  }

  const raw = (await request.json().catch(() => null)) as PatchBody | null;
  if (!raw || typeof raw !== 'object') {
    return NextResponse.json({ success: false, message: 'Invalid body' }, { status: 400 });
  }

  // The lib helper throws on forbidden mutation keys — keep the route handler
  // thin and forward the message.
  const patch: Record<string, unknown> = {};
  if (raw.title !== undefined) {
    if (typeof raw.title !== 'string' || !raw.title.trim()) {
      return NextResponse.json({ success: false, message: 'title must be a non-empty string' }, { status: 400 });
    }
    patch.title = raw.title;
  }
  if (raw.context !== undefined) {
    patch.context = raw.context === null
      ? null
      : (typeof raw.context === 'string' ? raw.context : undefined);
  }
  if (raw.decisionMakerId !== undefined) {
    patch.decisionMakerId = raw.decisionMakerId === null
      ? null
      : (typeof raw.decisionMakerId === 'number' ? raw.decisionMakerId : undefined);
  }
  if (raw.alternativesConsidered !== undefined) {
    patch.alternativesConsidered = raw.alternativesConsidered === null
      ? null
      : (typeof raw.alternativesConsidered === 'string' ? raw.alternativesConsidered : undefined);
  }
  if (raw.confidentialityLevel !== undefined) {
    if (
      typeof raw.confidentialityLevel === 'string' &&
      (ALLOWED_CONFIDENTIALITY as readonly string[]).includes(raw.confidentialityLevel)
    ) {
      patch.confidentialityLevel = raw.confidentialityLevel;
    }
  }
  if (raw.anchors !== undefined) {
    if (raw.anchors === null || typeof raw.anchors !== 'object') {
      return NextResponse.json({ success: false, message: 'anchors must be an object' }, { status: 400 });
    }
    const a = raw.anchors as Record<string, unknown>;
    const anchors: Record<string, number | null | undefined> = {};
    if (a.meetingId !== undefined) anchors.meetingId = a.meetingId === null ? null : (typeof a.meetingId === 'number' ? a.meetingId : undefined);
    if (a.noteId !== undefined) anchors.noteId = a.noteId === null ? null : (typeof a.noteId === 'number' ? a.noteId : undefined);
    if (a.companyId !== undefined) anchors.companyId = a.companyId === null ? null : (typeof a.companyId === 'number' ? a.companyId : undefined);
    if (a.dealId !== undefined) anchors.dealId = a.dealId === null ? null : (typeof a.dealId === 'number' ? a.dealId : undefined);
    patch.anchors = anchors;
  }

  // Forbidden keys propagate as-is so the lib helper rejects them with its
  // canonical error message.
  if (raw.decision !== undefined) patch.decision = raw.decision;
  if (raw.rationale !== undefined) patch.rationale = raw.rationale;
  if (raw.reversibility !== undefined) patch.reversibility = raw.reversibility;

  try {
    const updated = await updateDecision(
      result.client.id,
      result.userId,
      decisionId,
      patch as Parameters<typeof updateDecision>[3],
    );
    if (!updated) {
      return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
    }
    return NextResponse.json({ success: true, data: { decision: updated } });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'update failed';
    return NextResponse.json({ success: false, message }, { status: 400 });
  }
}

interface DeleteBody {
  reason?: unknown;
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = await requireBrainEntitlement({ action: 'write' });
  if ('response' in result) return result.response;

  const { id } = await params;
  const decisionId = parseInt(id, 10);
  if (!Number.isFinite(decisionId)) {
    return NextResponse.json({ success: false, message: 'Invalid decision id' }, { status: 400 });
  }

  // Body is optional — a DELETE may not have one. Parse defensively.
  let reason: string | undefined;
  try {
    const raw = (await request.json().catch(() => null)) as DeleteBody | null;
    if (raw && typeof raw.reason === 'string') reason = raw.reason;
  } catch {
    // Ignore — DELETE bodies are optional.
  }

  const updated = await softRejectDecision(result.client.id, result.userId, decisionId, reason);
  if (!updated) {
    return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
  }
  return NextResponse.json({ success: true, data: { id: decisionId, status: 'rejected' } });
}
