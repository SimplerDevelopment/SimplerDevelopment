import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { suggestedProjects, clients, users } from '@/lib/db/schema';
import { eq, isNull, or } from 'drizzle-orm';

async function requireStaff() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const role = (session.user as { role?: string })?.role;
  if (role !== 'admin' && role !== 'employee') return null;
  return session;
}

export async function GET() {
  const session = await requireStaff();
  if (!session) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const data = await db
    .select({
      id: suggestedProjects.id,
      title: suggestedProjects.title,
      description: suggestedProjects.description,
      category: suggestedProjects.category,
      estimatedPrice: suggestedProjects.estimatedPrice,
      estimatedTimeline: suggestedProjects.estimatedTimeline,
      features: suggestedProjects.features,
      icon: suggestedProjects.icon,
      active: suggestedProjects.active,
      clientId: suggestedProjects.clientId,
      order: suggestedProjects.order,
      createdAt: suggestedProjects.createdAt,
      clientCompany: clients.company,
      clientName: users.name,
    })
    .from(suggestedProjects)
    .leftJoin(clients, eq(suggestedProjects.clientId, clients.id))
    .leftJoin(users, eq(clients.userId, users.id))
    .orderBy(suggestedProjects.order, suggestedProjects.createdAt);

  return NextResponse.json({ success: true, data });
}

export async function POST(req: Request) {
  const session = await requireStaff();
  if (!session) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  if (!body.title) return NextResponse.json({ success: false, message: 'title is required' }, { status: 400 });

  const userId = parseInt(session.user!.id!, 10);
  const [row] = await db.insert(suggestedProjects).values({
    title: body.title,
    description: body.description ?? null,
    category: body.category ?? 'development',
    estimatedPrice: body.estimatedPrice ?? null,
    estimatedTimeline: body.estimatedTimeline ?? null,
    features: body.features ?? [],
    icon: body.icon ?? 'rocket_launch',
    active: body.active ?? true,
    clientId: body.clientId ?? null,
    order: body.order ?? 0,
    surveyFields: body.surveyFields ?? [],
    createdBy: userId,
  }).returning();

  return NextResponse.json({ success: true, data: row });
}
