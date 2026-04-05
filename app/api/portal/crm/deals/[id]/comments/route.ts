import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPortalClient } from '@/lib/portal-client';
import { db } from '@/lib/db';
import { crmDeals, crmDealComments, users } from '@/lib/db/schema';
import { and, eq, desc } from 'drizzle-orm';
import { uploadToS3 } from '@/lib/s3/upload';

async function getAuthedDeal(dealId: number) {
  const session = await auth();
  if (!session?.user?.id) return { error: NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 }) };
  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client) return { error: NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 }) };

  const [deal] = await db.select({ id: crmDeals.id }).from(crmDeals)
    .where(and(eq(crmDeals.id, dealId), eq(crmDeals.clientId, client.id)));
  if (!deal) return { error: NextResponse.json({ success: false, message: 'Deal not found' }, { status: 404 }) };

  return { client, userId, deal };
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const dealId = parseInt(id, 10);
  if (isNaN(dealId)) return NextResponse.json({ success: false, message: 'Invalid ID' }, { status: 400 });

  const result = await getAuthedDeal(dealId);
  if ('error' in result) return result.error;

  const comments = await db
    .select({
      id: crmDealComments.id,
      dealId: crmDealComments.dealId,
      authorId: crmDealComments.authorId,
      body: crmDealComments.body,
      attachments: crmDealComments.attachments,
      createdAt: crmDealComments.createdAt,
      updatedAt: crmDealComments.updatedAt,
      authorName: users.name,
    })
    .from(crmDealComments)
    .leftJoin(users, eq(crmDealComments.authorId, users.id))
    .where(eq(crmDealComments.dealId, dealId))
    .orderBy(desc(crmDealComments.createdAt));

  return NextResponse.json({ success: true, data: comments });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const dealId = parseInt(id, 10);
  if (isNaN(dealId)) return NextResponse.json({ success: false, message: 'Invalid ID' }, { status: 400 });

  const result = await getAuthedDeal(dealId);
  if ('error' in result) return result.error;

  const contentType = req.headers.get('content-type') || '';

  let body: string;
  const attachments: { url: string; filename: string; mimeType: string; fileSize: number }[] = [];

  if (contentType.includes('multipart/form-data')) {
    const formData = await req.formData() as unknown as globalThis.FormData;
    body = (formData.get('body') as string) || '';
    const files = formData.getAll('files');

    for (const file of files) {
      if (file instanceof Blob) {
        const buffer = Buffer.from(await file.arrayBuffer());
        const filename = (file as unknown as File).name || `attachment-${Date.now()}`;
        const key = `crm/deals/${dealId}/comments/${Date.now()}-${filename}`;
        const result2 = await uploadToS3(buffer, key, file.type);
        attachments.push({ url: result2.url, filename, mimeType: file.type, fileSize: buffer.length });
      }
    }
  } else {
    const json = await req.json();
    body = json.body || '';
  }

  if (!body.trim() && attachments.length === 0) {
    return NextResponse.json({ success: false, message: 'Comment body or attachments required' }, { status: 400 });
  }

  const [comment] = await db
    .insert(crmDealComments)
    .values({
      dealId,
      authorId: result.userId,
      body: body.trim(),
      attachments,
    })
    .returning();

  // Fetch with author name
  const [full] = await db
    .select({
      id: crmDealComments.id,
      dealId: crmDealComments.dealId,
      authorId: crmDealComments.authorId,
      body: crmDealComments.body,
      attachments: crmDealComments.attachments,
      createdAt: crmDealComments.createdAt,
      updatedAt: crmDealComments.updatedAt,
      authorName: users.name,
    })
    .from(crmDealComments)
    .leftJoin(users, eq(crmDealComments.authorId, users.id))
    .where(eq(crmDealComments.id, comment.id));

  return NextResponse.json({ success: true, data: full }, { status: 201 });
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const dealId = parseInt(id, 10);
  if (isNaN(dealId)) return NextResponse.json({ success: false, message: 'Invalid ID' }, { status: 400 });

  const result = await getAuthedDeal(dealId);
  if ('error' in result) return result.error;

  const body = await req.json();
  const [deleted] = await db
    .delete(crmDealComments)
    .where(and(
      eq(crmDealComments.id, body.commentId),
      eq(crmDealComments.dealId, dealId),
      eq(crmDealComments.authorId, result.userId),
    ))
    .returning();

  if (!deleted) return NextResponse.json({ success: false, message: 'Comment not found or not yours' }, { status: 404 });

  return NextResponse.json({ success: true, data: deleted });
}
