import { NextResponse } from 'next/server';
import { authorizePortal, isAuthError } from '@/lib/portal-auth';
import {
  DataviewError,
  listSupportedTypes,
  runDataview,
  validateQuery,
} from '@/lib/brain/dataview';

/**
 * POST /api/portal/brain/dataview
 *
 * Body: a parsed dataview JSON query (see lib/brain/dataview.ts).
 * Returns: { success: true, data: { rows, columns } }
 *
 * Tenant scoping is enforced inside runDataview — the active client is read
 * from the portal session, never from the body.
 */
export async function POST(request: Request) {
  const auth = await authorizePortal({ action: 'read' });
  if (isAuthError(auth)) return auth.response;

  const raw = await request.json().catch(() => null);
  let query;
  try {
    query = validateQuery(raw);
  } catch (err) {
    if (err instanceof DataviewError) {
      return NextResponse.json(
        { success: false, message: err.message },
        { status: err.status },
      );
    }
    return NextResponse.json(
      { success: false, message: 'invalid dataview query' },
      { status: 400 },
    );
  }

  try {
    const result = await runDataview(auth.client.id, query);
    return NextResponse.json({ success: true, data: result });
  } catch (err) {
    if (err instanceof DataviewError) {
      return NextResponse.json(
        { success: false, message: err.message },
        { status: err.status },
      );
    }
    const message = err instanceof Error ? err.message : 'dataview query failed';
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}

export async function GET() {
  // Convenience: clients can introspect supported types.
  return NextResponse.json({
    success: true,
    data: { types: listSupportedTypes() },
  });
}
