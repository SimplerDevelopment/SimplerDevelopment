import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { agentActionCaptures, agentAuditLogs } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { requireAdmin } from '../../prompts/_auth';
import { decryptApiKey } from '@/lib/crypto/api-key';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * GET /api/admin/agent-captures/[id] — decrypt one high-risk-tool argument
 * capture for post-incident forensic reconstruction.
 *
 * Per `vault/04 - Decisions/ADR high-risk-agent-arg-capture.md` (AAF-001):
 *   - Restricted to the strictest existing staff tier (`requireAdmin` —
 *     admin, not employee; this codebase has no separate "super-admin" role,
 *     `admin` IS the elevated tier, mirrored from
 *     `app/api/admin/prompts/[id]/promote/route.ts`, the other
 *     highest-blast-radius admin write in the codebase).
 *   - Every read is itself audit-logged BEFORE the decrypted payload is
 *     returned — there is no un-audited read path. The audit write is
 *     awaited (NOT fire-and-forget like the capture write itself): if it
 *     fails, the read fails closed rather than leaking plaintext with no
 *     trail.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const captureId = parseInt(id, 10);
  if (Number.isNaN(captureId)) {
    return NextResponse.json({ success: false, message: 'Invalid capture id' }, { status: 400 });
  }

  const [capture] = await db
    .select()
    .from(agentActionCaptures)
    .where(eq(agentActionCaptures.id, captureId))
    .limit(1);
  if (!capture) {
    return NextResponse.json({ success: false, message: 'Capture not found' }, { status: 404 });
  }

  let args: unknown;
  try {
    args = JSON.parse(decryptApiKey(capture.ciphertext));
  } catch (err) {
    console.error('[agent-captures] decrypt failed:', err);
    return NextResponse.json({ success: false, message: 'Decrypt failed' }, { status: 500 });
  }

  // Audit the read itself — CRITICAL, not fire-and-forget: no un-audited
  // read path per the ADR. If this write fails, fail the request closed
  // rather than return decrypted args with no trail.
  const actorId = parseInt((session.user as { id: string }).id, 10);
  try {
    await db.insert(agentAuditLogs).values({
      clientId: capture.clientId,
      runId: null,
      apiKeyId: null,
      userId: Number.isNaN(actorId) ? null : actorId,
      toolName: 'audit:capture_decrypt',
      inputsSummary: { captureId: capture.id, capturedTool: capture.toolName },
      outputSummary: `Decrypted agent_action_captures#${capture.id} (${capture.toolName})`,
      status: 'success',
      durationMs: null,
    });
  } catch (err) {
    console.error('[agent-captures] failed to audit-log decrypt read:', err);
    return NextResponse.json({ success: false, message: 'Failed to record access audit' }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    data: {
      toolName: capture.toolName,
      args,
      createdAt: capture.createdAt,
    },
  });
}
