import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPortalClient } from '@/lib/portal-client';
import { db } from '@/lib/db';
import { userDashboardPreferences } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { DASHBOARD_WIDGETS, type DashboardWidgetPrefs } from '@/lib/dashboard/widgets';

const KNOWN_IDS = new Set(DASHBOARD_WIDGETS.map((w) => w.id));

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === 'string');
}

function validateWidgetIds(ids: string[]): boolean {
  return ids.every((id) => KNOWN_IDS.has(id as Parameters<typeof KNOWN_IDS.has>[0]));
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client)
    return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });

  const [row] = await db
    .select({ prefs: userDashboardPreferences.prefs })
    .from(userDashboardPreferences)
    .where(
      and(
        eq(userDashboardPreferences.userId, userId),
        eq(userDashboardPreferences.clientId, client.id),
      ),
    )
    .limit(1);

  return NextResponse.json({ success: true, data: (row?.prefs as DashboardWidgetPrefs) ?? {} });
}

export async function PUT(request: Request) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client)
    return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, message: 'Invalid JSON' }, { status: 400 });
  }

  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return NextResponse.json({ success: false, message: 'Invalid request body' }, { status: 400 });
  }

  const { order, hidden, collapsed } = body as Record<string, unknown>;

  // Validate each optional array — must be arrays of known widget ids if present
  if (order !== undefined) {
    if (!isStringArray(order) || !validateWidgetIds(order)) {
      return NextResponse.json(
        { success: false, message: 'order contains unknown widget ids' },
        { status: 400 },
      );
    }
  }
  if (hidden !== undefined) {
    if (!isStringArray(hidden) || !validateWidgetIds(hidden)) {
      return NextResponse.json(
        { success: false, message: 'hidden contains unknown widget ids' },
        { status: 400 },
      );
    }
  }
  if (collapsed !== undefined) {
    if (!isStringArray(collapsed) || !validateWidgetIds(collapsed)) {
      return NextResponse.json(
        { success: false, message: 'collapsed contains unknown widget ids' },
        { status: 400 },
      );
    }
  }

  const prefs: DashboardWidgetPrefs = {};
  if (order !== undefined) prefs.order = order as string[];
  if (hidden !== undefined) prefs.hidden = hidden as string[];
  if (collapsed !== undefined) prefs.collapsed = collapsed as string[];

  await db
    .insert(userDashboardPreferences)
    .values({
      userId,
      clientId: client.id,
      prefs,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [userDashboardPreferences.userId, userDashboardPreferences.clientId],
      set: {
        prefs,
        updatedAt: new Date(),
      },
    });

  return NextResponse.json({ success: true });
}
