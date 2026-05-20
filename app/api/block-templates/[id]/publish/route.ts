import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { publishBlockTemplate } from '@/lib/sites/publish-block-template';

async function requireAdminOrEditor() {
  const session = await auth();
  if (!session?.user?.id) return { error: 'unauth' as const };
  const role = (session.user as { role?: string })?.role;
  if (role !== 'admin' && role !== 'editor') return { error: 'forbidden' as const, role };
  return { session, role };
}

function gateResponse(result: Awaited<ReturnType<typeof requireAdminOrEditor>>) {
  if ('error' in result) {
    if (result.error === 'unauth') {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
  }
  return null;
}

/**
 * Promote a single block template's draft to live. Mirrors MCP
 * `block_templates_publish`. pendingDelete → row deleted (refusing if any
 * global usages remain); ordinary draft → fields applied to live and
 * version bumped if `blocks` changed.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requireAdminOrEditor();
  const denied = gateResponse(gate);
  if (denied) return denied;

  const { id } = await params;
  const templateId = parseInt(id);
  if (isNaN(templateId)) {
    return NextResponse.json(
      { success: false, message: 'Invalid template ID' },
      { status: 400 },
    );
  }

  try {
    const result = await publishBlockTemplate(templateId);
    return NextResponse.json({ success: true, data: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Publish failed';
    return NextResponse.json({ success: false, message }, { status: 400 });
  }
}
