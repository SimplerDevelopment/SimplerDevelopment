/**
 * Document comments — list / create.
 *
 * GET  /api/portal/realtime/comments?entityType=post&entityId=123
 * POST /api/portal/realtime/comments
 *   body: { entityType, entityId, body, threadId?, parentId?, anchor?, mentionedUserIds? }
 *
 * Tenancy: every query is scoped to the active portal client. Cross-client
 * reads return 404 — never leak.
 */

import { NextResponse } from 'next/server';
import { and, asc, eq, sql } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { documentComments } from '@/lib/db/schema';
import type { CommentAnchor } from '@/lib/db/schema/collab';
import { getPortalClient } from '@/lib/portal-client';

const ENTITY_TYPES = ['post', 'deck', 'email'] as const;
type EntityType = (typeof ENTITY_TYPES)[number];

function parseEntityType(v: string | null): EntityType | null {
  if (v === 'post' || v === 'deck' || v === 'email') return v;
  return null;
}

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      { success: false, message: 'Unauthorized' },
      { status: 401 }
    );
  }

  const url = new URL(req.url);
  const entityType = parseEntityType(url.searchParams.get('entityType'));
  const entityId = url.searchParams.get('entityId');

  if (!entityType || !entityId) {
    return NextResponse.json(
      {
        success: false,
        message: 'Missing or invalid entityType/entityId',
      },
      { status: 400 }
    );
  }

  const client = await getPortalClient(parseInt(session.user.id, 10));
  if (!client) {
    return NextResponse.json(
      { success: false, message: 'No portal client' },
      { status: 403 }
    );
  }

  const rows = await db
    .select()
    .from(documentComments)
    .where(
      and(
        eq(documentComments.clientId, client.id),
        eq(documentComments.entityType, entityType),
        eq(documentComments.entityId, entityId)
      )
    )
    .orderBy(asc(documentComments.createdAt));

  return NextResponse.json({ success: true, data: rows });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      { success: false, message: 'Unauthorized' },
      { status: 401 }
    );
  }

  type Body = {
    entityType?: string;
    entityId?: string | number;
    body?: string;
    threadId?: string | null;
    parentId?: string | null;
    anchor?: CommentAnchor | null;
    mentionedUserIds?: number[];
  };

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json(
      { success: false, message: 'Invalid JSON' },
      { status: 400 }
    );
  }

  const entityType = parseEntityType(body.entityType ?? null);
  const entityId = body.entityId !== undefined ? String(body.entityId) : '';
  const text = (body.body ?? '').toString().trim();

  if (!entityType || !entityId) {
    return NextResponse.json(
      { success: false, message: 'Missing entityType or entityId' },
      { status: 400 }
    );
  }
  if (!text) {
    return NextResponse.json(
      { success: false, message: 'Comment body required' },
      { status: 400 }
    );
  }

  const client = await getPortalClient(parseInt(session.user.id, 10));
  if (!client) {
    return NextResponse.json(
      { success: false, message: 'No portal client' },
      { status: 403 }
    );
  }

  const userId = parseInt(session.user.id, 10);

  // If replying, validate the thread root exists in this client + entity.
  let threadId = body.threadId ?? null;
  let parentId = body.parentId ?? null;

  if (threadId) {
    const [parent] = await db
      .select({ id: documentComments.id, threadId: documentComments.threadId })
      .from(documentComments)
      .where(
        and(
          eq(documentComments.threadId, threadId),
          eq(documentComments.clientId, client.id),
          eq(documentComments.entityType, entityType),
          eq(documentComments.entityId, entityId)
        )
      )
      .limit(1);
    if (!parent) {
      return NextResponse.json(
        { success: false, message: 'Thread not found' },
        { status: 404 }
      );
    }
  } else {
    // Root insert — generate UUID via gen_random_uuid() and use it for both
    // id and threadId so root.threadId === root.id.
    const [{ uuid: rootId }] = await db.execute<{ uuid: string }>(
      sql`select gen_random_uuid() as uuid`
    );
    threadId = rootId;
    parentId = null;

    const [row] = await db
      .insert(documentComments)
      .values({
        id: rootId,
        clientId: client.id,
        entityType,
        entityId,
        threadId: rootId,
        parentId: null,
        authorId: userId,
        body: text,
        mentionedUserIds: body.mentionedUserIds ?? [],
        anchor: body.anchor ?? null,
      })
      .returning();
    return NextResponse.json({ success: true, data: row });
  }

  // Reply path.
  const [row] = await db
    .insert(documentComments)
    .values({
      clientId: client.id,
      entityType,
      entityId,
      threadId,
      parentId,
      authorId: userId,
      body: text,
      mentionedUserIds: body.mentionedUserIds ?? [],
      anchor: body.anchor ?? null,
    })
    .returning();

  return NextResponse.json({ success: true, data: row });
}
