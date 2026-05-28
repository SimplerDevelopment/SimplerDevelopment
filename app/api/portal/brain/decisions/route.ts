/**
 * REST: /api/portal/brain/decisions
 *
 *   GET  — list decisions for the active tenant. Filters: status (single or
 *          repeated), reversibility, decisionMakerId, dateFrom/dateTo (ISO),
 *          supersededOnly, topicId (deferred — see lib/brain/decisions.ts),
 *          limit (≤100), offset.
 *   POST — create a new decision (status='accepted', source='manual').
 *
 * Envelope: { success: true, data } / { success: false, message }
 *
 * Phase 1 brain-restructure. See .planning/brain-restructure/PLAN.md.
 */
import { NextResponse } from 'next/server';
import { requireBrainEntitlement } from '@/lib/brain/entitlement';
import {
  createDecision,
  listDecisions,
  type ListDecisionsOpts,
} from '@/lib/brain/decisions';
import type {
  BrainDecisionReversibility,
  BrainDecisionStatus,
} from '@/lib/db/schema';

const ALLOWED_STATUSES: BrainDecisionStatus[] = [
  'proposed',
  'accepted',
  'superseded',
  'rejected',
];
const ALLOWED_REVERSIBILITY: BrainDecisionReversibility[] = ['one_way', 'two_way'];
const ALLOWED_CONFIDENTIALITY = ['standard', 'restricted', 'confidential'] as const;

function parseIntParam(v: string | null): number | undefined {
  if (v === null) return undefined;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : undefined;
}

function parseDateParam(v: string | null): Date | undefined {
  if (v === null || !v.trim()) return undefined;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export async function GET(request: Request) {
  const result = await requireBrainEntitlement({ action: 'read' });
  if ('response' in result) return result.response;

  const url = new URL(request.url);

  const statusParams = url.searchParams.getAll('status');
  const validStatuses = statusParams.filter((s): s is BrainDecisionStatus =>
    ALLOWED_STATUSES.includes(s as BrainDecisionStatus),
  );
  const reversibilityRaw = url.searchParams.get('reversibility');
  const reversibility =
    reversibilityRaw && ALLOWED_REVERSIBILITY.includes(reversibilityRaw as BrainDecisionReversibility)
      ? (reversibilityRaw as BrainDecisionReversibility)
      : undefined;

  // Clamp limit to 100 per the brief.
  const limitRaw = parseIntParam(url.searchParams.get('limit'));
  const offsetRaw = parseIntParam(url.searchParams.get('offset'));
  const limit = limitRaw === undefined ? 50 : Math.max(1, Math.min(limitRaw, 100));
  const offset = offsetRaw === undefined ? 0 : Math.max(0, offsetRaw);

  const opts: ListDecisionsOpts = {
    status: validStatuses.length === 0 ? undefined
      : validStatuses.length === 1 ? validStatuses[0]
      : validStatuses,
    reversibility,
    decisionMakerId: parseIntParam(url.searchParams.get('decisionMakerId')),
    dateFrom: parseDateParam(url.searchParams.get('dateFrom')),
    dateTo: parseDateParam(url.searchParams.get('dateTo')),
    supersededOnly: url.searchParams.get('supersededOnly') === 'true',
    topicId: parseIntParam(url.searchParams.get('topicId')),
    limit,
    offset,
  };

  const items = await listDecisions(result.client.id, opts);
  return NextResponse.json({ success: true, data: { items, limit, offset } });
}

interface PostBody {
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
}

export async function POST(request: Request) {
  const result = await requireBrainEntitlement({ action: 'write' });
  if ('response' in result) return result.response;

  const raw = (await request.json().catch(() => null)) as PostBody | null;
  if (!raw || typeof raw !== 'object') {
    return NextResponse.json({ success: false, message: 'Invalid body' }, { status: 400 });
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
    const decision = await createDecision(result.client.id, result.userId, {
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
    return NextResponse.json({ success: true, data: { decision } }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'create failed';
    return NextResponse.json({ success: false, message }, { status: 400 });
  }
}
