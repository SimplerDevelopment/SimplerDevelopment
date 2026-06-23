import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { emailTemplates } from '@/lib/db/schema';
import { eq, or, desc } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';
import { authorizePortal, isAuthError } from '@/lib/portal-auth';
import { renderBlocksToEmailHtml } from '@/lib/email';
import { sanitizeRichHtml } from '@/lib/security/sanitize-html';

export async function GET() {
  const authResult = await authorizePortal({ action: 'read', requireService: 'email' });
  if (isAuthError(authResult)) return authResult.response;

  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false }, { status: 401 });
  const client = await getPortalClient(parseInt(session.user.id, 10));
  if (!client) return NextResponse.json({ success: false }, { status: 404 });

  const templates = await db.select()
    .from(emailTemplates)
    .where(or(eq(emailTemplates.clientId, client.id), eq(emailTemplates.isGlobal, true)))
    .orderBy(desc(emailTemplates.updatedAt));

  return NextResponse.json({ success: true, data: templates });
}

export async function POST(req: Request) {
  const authResult = await authorizePortal({ action: 'write', requireService: 'email' });
  if (isAuthError(authResult)) return authResult.response;

  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false }, { status: 401 });
  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client) return NextResponse.json({ success: false }, { status: 404 });

  const { name, description, category, subject, htmlContent, blockContent } = await req.json();

  let finalHtml = htmlContent?.trim() || '';
  if (blockContent?.blocks) {
    finalHtml = renderBlocksToEmailHtml(blockContent.blocks);
  }
  // Strip <script>/<iframe>/<object>/<embed>/event handlers before storing.
  // sanitizeRichHtml keeps inline styles + classes for email-safe rendering.
  if (finalHtml) finalHtml = sanitizeRichHtml(finalHtml);

  if (!name?.trim() || !finalHtml) {
    return NextResponse.json({ success: false, message: 'name and content are required' }, { status: 400 });
  }

  const [template] = await db.insert(emailTemplates).values({
    clientId: client.id,
    name: name.trim(),
    description: description?.trim() || null,
    category: category || 'custom',
    subject: subject?.trim() || null,
    htmlContent: finalHtml,
    blockContent: blockContent ?? null,
    createdBy: userId,
  }).returning();

  return NextResponse.json({ success: true, data: template }, { status: 201 });
}
