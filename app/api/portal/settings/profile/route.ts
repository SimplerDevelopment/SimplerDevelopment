import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { users, clients } from '@/lib/db/schema';
import { getPortalClient } from '@/lib/portal-client';
import { eq } from 'drizzle-orm';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client) return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });

  const [user] = await db.select({ name: users.name, email: users.email }).from(users).where(eq(users.id, userId)).limit(1);
  if (!user) return NextResponse.json({ success: false, message: 'User not found' }, { status: 404 });

  return NextResponse.json({
    success: true,
    data: {
      name: user.name,
      email: user.email,
      company: client.company ?? '',
      phone: client.phone ?? '',
      website: client.website ?? '',
      address: client.address ?? '',
      emailPrefix: client.emailPrefix ?? '',
    },
  });
}

export async function PATCH(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client) return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });

  const body = await req.json();
  const { name, email, company, phone, website, address, emailPrefix } = body;

  if (!name?.trim()) return NextResponse.json({ success: false, message: 'Name is required' }, { status: 400 });
  if (!email?.trim()) return NextResponse.json({ success: false, message: 'Email is required' }, { status: 400 });

  // Check email uniqueness if changed
  const [current] = await db.select({ email: users.email }).from(users).where(eq(users.id, userId)).limit(1);
  if (email.trim() !== current?.email) {
    const [conflict] = await db.select({ id: users.id }).from(users).where(eq(users.email, email.trim())).limit(1);
    if (conflict) return NextResponse.json({ success: false, message: 'Email already in use' }, { status: 400 });
  }

  await Promise.all([
    db.update(users).set({ name: name.trim(), email: email.trim(), updatedAt: new Date() }).where(eq(users.id, userId)),
    db.update(clients).set({
      company: company?.trim() || null,
      phone: phone?.trim() || null,
      website: website?.trim() || null,
      address: address?.trim() || null,
      ...(emailPrefix !== undefined ? { emailPrefix: emailPrefix?.trim().toLowerCase().replace(/[^a-z0-9-]/g, '') || null } : {}),
      updatedAt: new Date(),
    }).where(eq(clients.id, client.id)),
  ]);

  return NextResponse.json({ success: true, message: 'Profile updated' });
}
