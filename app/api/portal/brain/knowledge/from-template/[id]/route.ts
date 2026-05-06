import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { authorizePortal, isAuthError } from '@/lib/portal-auth';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { getTemplate } from '@/lib/brain/templates';
import { applyTemplate } from '@/lib/brain/template';
import { createNote } from '@/lib/brain/notes';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = await authorizePortal({ action: 'write' });
  if (isAuthError(result)) return result.response;

  const { id } = await params;
  const templateId = parseInt(id, 10);
  if (Number.isNaN(templateId)) {
    return NextResponse.json({ success: false, message: 'Invalid template id' }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const titleOverride = body && typeof body === 'object' && typeof body.titleOverride === 'string'
    ? body.titleOverride.trim()
    : '';

  const template = await getTemplate(result.client.id, templateId);
  if (!template) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  // Pull the actor's display name so {{userName}} resolves; fall back to email.
  const [actor] = await db.select({ name: users.name, email: users.email }).from(users)
    .where(eq(users.id, result.userId))
    .limit(1);
  const userName = actor?.name?.trim() || actor?.email || null;

  const appliedBody = await applyTemplate(template.body, {
    today: new Date(),
    clientId: result.client.id,
    userName,
  });

  const tags = Array.from(new Set([
    ...(template.defaultTags ?? []),
    `from_template:${template.id}`,
  ]));

  const note = await createNote({
    clientId: result.client.id,
    title: titleOverride || template.name,
    body: appliedBody,
    tags,
    source: 'manual',
    createdBy: result.userId,
  });

  return NextResponse.json({ success: true, data: note });
}
