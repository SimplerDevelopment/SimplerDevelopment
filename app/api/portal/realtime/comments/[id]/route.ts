/**
 * Document comments — update / resolve / delete by id.
 *
 * PATCH  /api/portal/realtime/comments/:id
 *   body: { body?, anchor?, mentionedUserIds?, resolved? }
 *   Only the original author may edit body. Anyone with client access may
 *   resolve/unresolve a thread (resolution applies to the thread root).
 *
 * DELETE /api/portal/realtime/comments/:id
 *   Author-only. Deleting a thread root cascades to children via the same
 *   threadId; we delete every row whose threadId matches.
 */

import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { documentComments } from '@/lib/db/schema';
import type { CommentAnchor } from '@/lib/db/schema/collab';
import { getPortalClient } from '@/lib/portal-client';

async function loadOwnedComment(
  commentId: string,
  userId: number
): Promise<{
  comment: typeof documentComments.$inferSelect;
  clientId: number;
} | null> {
  const client = await getPortalClient(userId);
  if (!client) return null;
  const [row] = await db
    .select()
    .from(documentComments)
    .where(
      and(
        eq(documentComments.id, commentId),
        eq(documentComments.clientId, client.id)
      )
    )
    .limit(1);
  if (!row) return null;
  return { comment: row, clientId: client.id };
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      { success: false, message: 'Unauthorized' },
      { status: 401 }
    );
  }

  const { id } = await params;
  const userId = parseInt(session.user.id, 10);
  const loaded = await loadOwnedComment(id, userId);
  if (!loaded) {
    return NextResponse.json(
      { success: false, message: 'Not found' },
      { status: 404 }
    );
  }
  const { comment } = loaded;

  type Body = {
    body?: string;
    anchor?: CommentAnchor | null;
    mentionedUserIds?: number[];
    resolved?: boolean;
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

  // Body edits: author-only.
  const updates: Record<string, unknown> = { updatedAt: new Date() };

  if (body.body !== undefined) {
    if (comment.authorId !== userId) {
      return NextResponse.json(
        { success: false, message: 'Only the author may edit body' },
        { status: 403 }
      );
    }
    const text = body.body.toString().trim();
    if (!text) {
      return NextResponse.json(
        { success: false, message: 'Comment body required' },
        { status: 400 }
      );
    }
    updates.body = text;
  }
  if (body.anchor !== undefined) {
    if (comment.authorId !== userId) {
      return NextResponse.json(
        { success: false, message: 'Only the author may move anchor' },
        { status: 403 }
      );
    }
    updates.anchor = body.anchor;
  }
  if (body.mentionedUserIds !== undefined) {
    updates.mentionedUserIds = body.mentionedUserIds;
  }

  // Resolve / unresolve: applied to the thread root, callable by anyone with
  // client access.
  if (body.resolved !== undefined) {
    if (body.resolved) {
      updates.resolvedAt = new Date();
      updates.resolvedBy = userId;
    } else {
      updates.resolvedAt = null;
      updates.resolvedBy = null;
    }

    // Apply resolution to the thread root row, not necessarily the targeted row.
    const [root] = await db
      .update(documentComments)
      .set({
        resolvedAt: updates.resolvedAt as Date | null,
        resolvedBy: updates.resolvedBy as number | null,
        updatedAt: new Date(),
      })
      .where(eq(documentComments.id, comment.threadId))
      .returning();

    // If we ALSO had non-resolution updates, apply those to the original row.
    delete updates.resolvedAt;
    delete updates.resolvedBy;
    if (Object.keys(updates).length > 1) {
      const [self] = await db
        .update(documentComments)
        .set(updates)
        .where(eq(documentComments.id, id))
        .returning();
      return NextResponse.json({ success: true, data: self ?? root });
    }
    return NextResponse.json({ success: true, data: root });
  }

  if (Object.keys(updates).length === 1) {
    // Only updatedAt — nothing meaningful changed.
    return NextResponse.json({ success: true, data: comment });
  }

  const [row] = await db
    .update(documentComments)
    .set(updates)
    .where(eq(documentComments.id, id))
    .returning();

  return NextResponse.json({ success: true, data: row });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      { success: false, message: 'Unauthorized' },
      { status: 401 }
    );
  }

  const { id } = await params;
  const userId = parseInt(session.user.id, 10);
  const loaded = await loadOwnedComment(id, userId);
  if (!loaded) {
    return NextResponse.json(
      { success: false, message: 'Not found' },
      { status: 404 }
    );
  }

  const { comment, clientId } = loaded;
  if (comment.authorId !== userId) {
    return NextResponse.json(
      { success: false, message: 'Only the author may delete' },
      { status: 403 }
    );
  }

  // Deleting the thread root deletes the whole thread.
  if (comment.parentId === null) {
    await db
      .delete(documentComments)
      .where(
        and(
          eq(documentComments.threadId, comment.threadId),
          eq(documentComments.clientId, clientId)
        )
      );
  } else {
    await db
      .delete(documentComments)
      .where(
        and(
          eq(documentComments.id, id),
          eq(documentComments.clientId, clientId)
        )
      );
  }

  return NextResponse.json({ success: true });
}
