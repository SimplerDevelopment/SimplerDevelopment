import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { kanbanCards, kanbanCardFiles, clients, projects } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { uploadToS3 } from '@/lib/s3/upload';

const MAX_SIZE = 20 * 1024 * 1024; // 20MB

async function authorizeCard(cardId: number, session: Awaited<ReturnType<typeof auth>>) {
  const [card] = await db.select().from(kanbanCards).where(eq(kanbanCards.id, cardId)).limit(1);
  if (!card) return null;
  const role = (session?.user as { role?: string })?.role;
  if (role === 'admin' || role === 'employee') return card;
  const userId = parseInt(session!.user!.id, 10);
  const [client] = await db.select().from(clients).where(eq(clients.userId, userId)).limit(1);
  if (!client) return null;
  const [proj] = await db.select().from(projects)
    .where(and(eq(projects.id, card.projectId), eq(projects.clientId, client.id)))
    .limit(1);
  return proj ? card : null;
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const cardId = parseInt(id, 10);

    const card = await authorizeCard(cardId, session);
    if (!card) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file) return NextResponse.json({ success: false, message: 'No file provided' }, { status: 400 });
    if (file.size > MAX_SIZE) return NextResponse.json({ success: false, message: 'File exceeds 20MB limit' }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await uploadToS3(buffer, file.name, file.type);

    const [record] = await db.insert(kanbanCardFiles).values({
      cardId,
      projectId: card.projectId,
      userId: parseInt(session.user.id, 10),
      originalName: file.name,
      storedFilename: result.storedFilename,
      mimeType: result.mimeType,
      fileSize: result.fileSize,
      url: result.url,
    }).returning();

    return NextResponse.json({ success: true, data: { ...record, userName: session.user.name ?? null } });
  } catch (err) {
    console.error('[POST /api/portal/cards/[id]/files]', err);
    return NextResponse.json({ success: false, message: 'Upload failed' }, { status: 500 });
  }
}
