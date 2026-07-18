import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { promptAuditLog, users } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';
import { requireStaff } from '../../_auth';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/prompts/[id]/audit — audit log for a prompt.
 *
 * Returns the 200 most recent audit entries for this prompt, newest-first,
 * with the actor user's id / email / name joined in.
 * Requires staff (read-only access; employees may view).
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireStaff();
  if (!session) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const promptId = parseInt(id, 10);
  if (Number.isNaN(promptId)) {
    return NextResponse.json({ success: false, message: 'Invalid prompt id' }, { status: 400 });
  }

  const rows = await db
    .select({
      id: promptAuditLog.id,
      action: promptAuditLog.action,
      versionId: promptAuditLog.versionId,
      detail: promptAuditLog.detail,
      createdAt: promptAuditLog.createdAt,
      actorId: users.id,
      actorEmail: users.email,
      actorName: users.name,
    })
    .from(promptAuditLog)
    .leftJoin(users, eq(promptAuditLog.actorUserId, users.id))
    .where(eq(promptAuditLog.promptId, promptId))
    .orderBy(desc(promptAuditLog.createdAt))
    .limit(200);

  const data = rows.map((r) => ({
    id: r.id,
    action: r.action,
    versionId: r.versionId,
    detail: r.detail,
    createdAt: r.createdAt,
    actor: r.actorId != null
      ? { id: r.actorId, email: r.actorEmail, name: r.actorName }
      : null,
  }));

  return NextResponse.json({ success: true, data });
}
