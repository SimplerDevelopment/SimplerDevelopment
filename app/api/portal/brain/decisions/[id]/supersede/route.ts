/**
 * REST: POST /api/portal/brain/decisions/[id]/supersede
 *
 * Replace the decision at `[id]` with a new one. Atomically:
 *   - inserts a new decision (status='accepted', source='manual')
 *   - sets old.supersededByDecisionId = new.id, old.status = 'superseded'
 *
 * Body matches the create input on /decisions (title, decision, rationale,
 * etc.). Returns 201 with `{ previous: { id, status }, current: <new row> }`.
 *
 * Cycle guard: if the old decision is already superseded or already
 * supersedes someone else (its chain is closed), responds 400.
 *
 * Phase 1 brain-restructure. See .planning/brain-restructure/PLAN.md.
 */
import { NextResponse } from 'next/server';
import { requireBrainEntitlement } from '@/lib/brain/entitlement';
import { supersedeDecision } from '@/lib/brain/decisions';
import type { BrainDecisionReversibility } from '@/lib/db/schema';

const ALLOWED_REVERSIBILITY: BrainDecisionReversibility[] = ['one_way', 'two_way'];
const ALLOWED_CONFIDENTIALITY = ['standard', 'restricted', 'confidential'] as const;

interface SupersedeBody {
  title?: unknown;
  context?: unknown;
  decision?: unknown;
  rationale?: unknown;
  alternativesConsidered?: unknown;
  reversibility?: unknown;
  decidedAt?: unknown;
  decisionMakerId?: unknown;
  anchors?: unknown;
  confidentialityLevel?: unknown;
  supersededByDecisionId?: unknown; // explicitly forbidden — surfaced as 400
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = await requireBrainEntitlement({ action: 'write' });
  if ('response' in result) return result.response;

  const { id } = await params;
  const oldId = parseInt(id, 10);
  if (!Number.isFinite(oldId)) {
    return NextResponse.json({ success: false, message: 'Invalid decision id' }, { status: 400 });
  }

  const raw = (await request.json().catch(() => null)) as SupersedeBody | null;
  if (!raw || typeof raw !== 'object') {
    return NextResponse.json({ success: false, message: 'Invalid body' }, { status: 400 });
  }

  if (raw.supersededByDecisionId !== undefined) {
    return NextResponse.json(
      { success: false, message: 'supersededByDecisionId is set automatically; do not pass it' },
      { status: 400 },
    );
  }

  if (typeof raw.title !== 'string' || !raw.title.trim()) {
    return NextResponse.json({ success: false, message: 'title is required' }, { status: 400 });
  }
  if (typeof raw.decision !== 'string' || !raw.decision.trim()) {
    return NextResponse.json({ success: false, message: 'decision is required' }, { status: 400 });
  }
  if (typeof raw.rationale !== 'string' || !raw.rationale.trim()) {
    return NextResponse.json({ success: false, message: 'rationale is required' }, { status: 400 });
  }

  const reversibility =
    typeof raw.reversibility === 'string' &&
    ALLOWED_REVERSIBILITY.includes(raw.reversibility as BrainDecisionReversibility)
      ? (raw.reversibility as BrainDecisionReversibility)
      : undefined;

  const confidentialityLevel =
    typeof raw.confidentialityLevel === 'string' &&
    (ALLOWED_CONFIDENTIALITY as readonly string[]).includes(raw.confidentialityLevel)
      ? (raw.confidentialityLevel as 'standard' | 'restricted' | 'confidential')
      : undefined;

  const anchorsRaw = (typeof raw.anchors === 'object' && raw.anchors !== null)
    ? (raw.anchors as Record<string, unknown>)
    : null;
  const anchors = anchorsRaw
    ? {
        meetingId: typeof anchorsRaw.meetingId === 'number' ? anchorsRaw.meetingId : undefined,
        noteId: typeof anchorsRaw.noteId === 'number' ? anchorsRaw.noteId : undefined,
        companyId: typeof anchorsRaw.companyId === 'number' ? anchorsRaw.companyId : undefined,
        dealId: typeof anchorsRaw.dealId === 'number' ? anchorsRaw.dealId : undefined,
      }
    : undefined;

  try {
    const created = await supersedeDecision(result.client.id, result.userId, oldId, {
      title: raw.title,
      context: typeof raw.context === 'string' ? raw.context : null,
      decision: raw.decision,
      rationale: raw.rationale,
      alternativesConsidered:
        typeof raw.alternativesConsidered === 'string' ? raw.alternativesConsidered : null,
      reversibility,
      decidedAt: typeof raw.decidedAt === 'string' ? raw.decidedAt : undefined,
      decisionMakerId:
        typeof raw.decisionMakerId === 'number' ? raw.decisionMakerId : undefined,
      anchors,
      confidentialityLevel,
    });
    return NextResponse.json(
      {
        success: true,
        data: {
          previous: { id: oldId, status: 'superseded' as const },
          current: created,
        },
      },
      { status: 201 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'supersede failed';
    const status = message === 'decision not found' ? 404 : 400;
    return NextResponse.json({ success: false, message }, { status });
  }
}
