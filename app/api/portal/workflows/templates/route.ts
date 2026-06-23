import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { authorizePortal, isAuthError } from '@/lib/portal-auth';
import { WORKFLOW_TEMPLATES } from '@/lib/workflows/templates';

// GET /api/portal/workflows/templates — list seed templates the user can
// clone into a fresh draft workflow via POST /api/portal/workflows.
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

  const authResult = await authorizePortal({ action: 'read' });
  if (isAuthError(authResult)) return authResult.response;

  // Slim payload — UI only needs id/icon/name/description/trigger.kind for the
  // picker. Full graph stays server-side until a clone is requested.
  const data = WORKFLOW_TEMPLATES.map((t) => ({
    id: t.id,
    icon: t.icon,
    name: t.name,
    description: t.description,
    triggerKind: t.trigger.kind,
    nodeCount: t.graph.nodes.length,
  }));

  return NextResponse.json({ success: true, data });
}
