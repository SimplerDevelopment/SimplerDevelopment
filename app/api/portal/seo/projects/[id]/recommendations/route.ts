// Recommendations — list (GET) and on-demand generation (POST). Generation
// is a real metered AI call, so it sits behind the write action; the route
// runs it inline (a few seconds) and returns the fresh list.

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { seoProjects, seoRecommendations } from '@/lib/db/schema';
import { and, desc, eq } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';
import { authorizePortal, isAuthError } from '@/lib/portal-auth';
import { generateRecommendations } from '@/lib/seo/recommendations';

export const maxDuration = 60;

type Params = { params: Promise<{ id: string }> };

async function ownedProject(clientId: number, idRaw: string) {
  const id = parseInt(idRaw, 10);
  if (!Number.isFinite(id)) return null;
  const [project] = await db
    .select()
    .from(seoProjects)
    .where(and(eq(seoProjects.id, id), eq(seoProjects.clientId, clientId)))
    .limit(1);
  return project ?? null;
}

export async function GET(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const authResult = await authorizePortal({ action: 'read', requireService: 'seo' });
  if (isAuthError(authResult)) return authResult.response;

  const client = await getPortalClient(parseInt(session.user.id, 10));
  if (!client) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const project = await ownedProject(client.id, (await params).id);
  if (!project) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  const rows = await db
    .select()
    .from(seoRecommendations)
    .where(and(eq(seoRecommendations.projectId, project.id), eq(seoRecommendations.clientId, client.id)))
    .orderBy(desc(seoRecommendations.opportunityScore));

  return NextResponse.json({ success: true, data: rows });
}

export async function POST(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const authResult = await authorizePortal({ action: 'write', requireService: 'seo' });
  if (isAuthError(authResult)) return authResult.response;

  const client = await getPortalClient(parseInt(session.user.id, 10));
  if (!client) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const project = await ownedProject(client.id, (await params).id);
  if (!project) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  try {
    const rows = await generateRecommendations(project);
    return NextResponse.json({ success: true, data: rows }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Recommendation generation failed';
    return NextResponse.json({ success: false, message }, { status: 502 });
  }
}
