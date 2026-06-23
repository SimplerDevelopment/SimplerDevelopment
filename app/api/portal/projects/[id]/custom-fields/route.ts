// Define-fields CRUD scoped to a project. Editor+ to mutate.

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { projectCustomFields, projects } from '@/lib/db/schema';
import { and, asc, eq } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';
import { isPortalStaff } from '@/lib/portal';
import { canUserEditProject } from '@/lib/portal/project-access';

const KINDS = ['text', 'number', 'date', 'select', 'multi_select', 'url', 'checkbox'] as const;

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'field';
}

async function authorize(projectId: number) {
  const session = await auth();
  if (!session?.user?.id) return null;
  const userId = parseInt(session.user.id, 10);
  const staff = await isPortalStaff();
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  if (!project) return null;
  if (!staff) {
    const client = await getPortalClient(userId);
    if (!client || client.id !== project.clientId) return null;
  }
  return {
    userId, project,
    canEdit: staff || (await canUserEditProject(userId, projectId)),
  };
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const projectId = parseInt(id, 10);
  const access = await authorize(projectId);
  if (!access) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  const rows = await db.select().from(projectCustomFields)
    .where(eq(projectCustomFields.projectId, projectId))
    .orderBy(asc(projectCustomFields.order), asc(projectCustomFields.id));

  return NextResponse.json({ success: true, data: rows });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const projectId = parseInt(id, 10);
  const access = await authorize(projectId);
  if (!access) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
  if (!access.canEdit) return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });

  const body = await req.json();
  const { name, kind, required, options } = body;
  if (!name?.trim()) return NextResponse.json({ success: false, message: 'name is required' }, { status: 400 });
  if (!KINDS.includes(kind)) return NextResponse.json({ success: false, message: `kind must be one of ${KINDS.join(', ')}` }, { status: 400 });

  // Auto-generate a unique key by slugifying the name and disambiguating
  // against existing keys for this project.
  const baseKey = slugify(name);
  const existing = await db.select({ key: projectCustomFields.key }).from(projectCustomFields)
    .where(eq(projectCustomFields.projectId, projectId));
  const usedKeys = new Set(existing.map(e => e.key));
  let key = baseKey;
  let suffix = 2;
  while (usedKeys.has(key)) {
    key = `${baseKey}_${suffix++}`;
  }

  // Determine ordering: end of list.
  const [maxRow] = await db.select({ max: projectCustomFields.order })
    .from(projectCustomFields)
    .where(eq(projectCustomFields.projectId, projectId))
    .orderBy(asc(projectCustomFields.order));
  const nextOrder = (maxRow?.max ?? -1) + existing.length;

  const opts = Array.isArray(options) ? options.filter(o => typeof o === 'string').slice(0, 50) : [];

  const [row] = await db.insert(projectCustomFields).values({
    projectId,
    key,
    name: name.trim().slice(0, 100),
    kind,
    required: required === true,
    options: opts,
    order: nextOrder,
    createdBy: access.userId,
  }).returning();

  return NextResponse.json({ success: true, data: row }, { status: 201 });
}
