/**
 * GET /api/portal/brain/document-acks
 *
 * Cross-document feed — used by the portal's "My reading queue" view.
 *
 * Query:
 *   personId   — when omitted, resolves to the authenticated user's
 *                brain_people row (matched on brain_people.userId). When
 *                that lookup returns nothing, the response is empty +
 *                includes a `hint` explaining how to link the user to a
 *                brain_people row.
 *   documentId — when set, filter to that document only (otherwise
 *                cross-document).
 *   status     — 'open' | 'acknowledged' | 'all' (default 'all'). Only
 *                meaningful for the required-reads ("open") view; ignored
 *                when documentId is set.
 *   limit, offset — pagination.
 */
import { NextResponse } from 'next/server';
import { requireBrainEntitlement } from '@/lib/brain/entitlement';
import { db } from '@/lib/db';
import { brainPeople } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import {
  listRequiredReadsForPerson,
  listAcknowledgmentsForPerson,
  listAcknowledgmentsForDocument,
} from '@/lib/brain/document-acks';

function parseQueryInt(v: string | null): number | undefined {
  if (v == null) return undefined;
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

async function resolvePersonIdForUser(clientId: number, userId: number): Promise<number | null> {
  const [row] = await db
    .select({ id: brainPeople.id })
    .from(brainPeople)
    .where(and(eq(brainPeople.clientId, clientId), eq(brainPeople.userId, userId)))
    .limit(1);
  return row?.id ?? null;
}

export async function GET(request: Request) {
  const result = await requireBrainEntitlement({ action: 'read' });
  if ('response' in result) return result.response;

  const url = new URL(request.url);
  let personId = parseQueryInt(url.searchParams.get('personId'));
  const documentId = parseQueryInt(url.searchParams.get('documentId'));
  const limit = parseQueryInt(url.searchParams.get('limit'));
  const offsetRaw = parseInt(url.searchParams.get('offset') ?? '0', 10);
  const offset = Number.isFinite(offsetRaw) && offsetRaw >= 0 ? offsetRaw : 0;
  const statusRaw = url.searchParams.get('status');
  const status = statusRaw === 'open' || statusRaw === 'acknowledged' || statusRaw === 'all'
    ? statusRaw
    : 'all';

  // Default personId → the current user's brain_people row (when one exists).
  if (personId === undefined) {
    const resolved = await resolvePersonIdForUser(result.client.id, result.userId);
    if (resolved === null) {
      return NextResponse.json({
        success: true,
        data: {
          items: [],
          acknowledgments: [],
          personId: null,
          hint: 'The authenticated user is not linked to a brain_people row. Pass ?personId or attach a brain_people record (people.userId) to surface a reading queue.',
        },
      });
    }
    personId = resolved;
  }

  if (documentId !== undefined) {
    // Cross-document feed scoped to a single document — exposes that
    // person's acks for that document.
    const items = await listAcknowledgmentsForDocument(result.client.id, documentId, {
      personId,
      limit,
      offset,
    });
    return NextResponse.json({ success: true, data: { items, personId, documentId } });
  }

  // Default — the person's open + closed reading queue + their ack history.
  const [items, acknowledgments] = await Promise.all([
    listRequiredReadsForPerson(result.client.id, personId, { status, limit, offset }),
    listAcknowledgmentsForPerson(result.client.id, personId, { limit, offset }),
  ]);
  return NextResponse.json({ success: true, data: { items, acknowledgments, personId } });
}
