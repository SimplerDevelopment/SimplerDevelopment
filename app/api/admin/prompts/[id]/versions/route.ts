import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { promptRegistry, promptVersions } from '@/lib/db/schema';
import { eq, max } from 'drizzle-orm';
import { requireAdmin } from '../../_auth';
import { logPromptAudit } from '@/lib/ai/evals/audit';

export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/prompts/[id]/versions — create a new draft version.
 *
 * Body: { body: string; notes?: string }
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const promptId = parseInt(id, 10);
  if (Number.isNaN(promptId)) {
    return NextResponse.json({ success: false, message: 'Invalid prompt id' }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, message: 'Invalid JSON body' }, { status: 400 });
  }

  const { body: versionBody, notes } = body as { body?: unknown; notes?: unknown };

  if (typeof versionBody !== 'string' || versionBody.trim() === '') {
    return NextResponse.json({ success: false, message: 'body is required and must be a non-empty string' }, { status: 400 });
  }

  // 404 if prompt doesn't exist
  const [prompt] = await db.select({ id: promptRegistry.id }).from(promptRegistry).where(eq(promptRegistry.id, promptId)).limit(1);
  if (!prompt) {
    return NextResponse.json({ success: false, message: 'Prompt not found' }, { status: 404 });
  }

  // Determine next version number
  const [maxRow] = await db
    .select({ maxVersion: max(promptVersions.version) })
    .from(promptVersions)
    .where(eq(promptVersions.promptId, promptId));
  const nextVersion = (maxRow?.maxVersion ?? 0) + 1;

  const actorId = parseInt((session.user as { id: string }).id, 10);

  const [newVersion] = await db
    .insert(promptVersions)
    .values({
      promptId,
      version: nextVersion,
      body: versionBody,
      notes: typeof notes === 'string' ? notes : null,
      status: 'draft',
      createdBy: actorId,
    })
    .returning();

  await logPromptAudit({
    actorUserId: actorId,
    action: 'create_draft',
    promptId,
    versionId: newVersion.id,
    detail: { version: nextVersion },
  });

  return NextResponse.json({ success: true, data: { version: newVersion } }, { status: 201 });
}
