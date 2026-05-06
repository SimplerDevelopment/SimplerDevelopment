import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPortalClient } from '@/lib/portal-client';
import { db } from '@/lib/db';
import {
  crmContacts,
  crmCompanies,
  crmContactTags,
  crmTags,
} from '@/lib/db/schema';
import { and, eq, desc, sql, inArray } from 'drizzle-orm';
import { emitEvent } from '@/lib/automation';
import { notifyAllClientUsers } from '@/lib/crm/notifications';
import { buildCustomFieldFilters } from '@/lib/crm-custom-field-filter';

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json(
      { success: false, message: 'Unauthorized' },
      { status: 401 }
    );

  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client)
    return NextResponse.json(
      { success: false, message: 'Client not found' },
      { status: 404 }
    );

  const url = req.nextUrl;
  const search = url.searchParams.get('search') || '';
  const status = url.searchParams.get('status') || '';
  const companyId = url.searchParams.get('companyId') || '';
  const title = url.searchParams.get('title') || '';
  const tagId = url.searchParams.get('tagId') || '';
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
  const limit = Math.min(
    100,
    Math.max(1, parseInt(url.searchParams.get('limit') || '25', 10))
  );
  const offset = (page - 1) * limit;

  const conditions = [eq(crmContacts.clientId, client.id)];

  if (search) {
    conditions.push(
      sql`(${crmContacts.firstName} ILIKE ${'%' + search + '%'} OR ${crmContacts.lastName} ILIKE ${'%' + search + '%'} OR ${crmContacts.email} ILIKE ${'%' + search + '%'})`
    );
  }

  if (status) {
    conditions.push(eq(crmContacts.status, status));
  }

  if (companyId) {
    conditions.push(eq(crmContacts.companyId, parseInt(companyId, 10)));
  }

  if (title) {
    const titles = title
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    if (titles.length === 1) {
      conditions.push(eq(crmContacts.title, titles[0]));
    } else if (titles.length > 1) {
      conditions.push(inArray(crmContacts.title, titles));
    }
  }

  const ownerId = url.searchParams.get('ownerId') || '';
  if (ownerId) {
    conditions.push(eq(crmContacts.ownerId, parseInt(ownerId, 10)));
  }

  // If filtering by tag, get matching contact IDs first
  let tagContactIds: number[] | null = null;
  if (tagId) {
    const taggedContacts = await db
      .select({ contactId: crmContactTags.contactId })
      .from(crmContactTags)
      .where(eq(crmContactTags.tagId, parseInt(tagId, 10)));
    tagContactIds = taggedContacts.map((t) => t.contactId);
    if (tagContactIds.length === 0) {
      return NextResponse.json({
        success: true,
        data: { contacts: [], total: 0, page, limit },
      });
    }
    conditions.push(inArray(crmContacts.id, tagContactIds));
  }

  for (const cf of buildCustomFieldFilters(url.searchParams, crmContacts.id, 'contact')) {
    conditions.push(cf);
  }

  const where = and(...conditions);

  const [countResult] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(crmContacts)
    .where(where);

  const contacts = await db
    .select({
      id: crmContacts.id,
      clientId: crmContacts.clientId,
      companyId: crmContacts.companyId,
      firstName: crmContacts.firstName,
      lastName: crmContacts.lastName,
      email: crmContacts.email,
      phone: crmContacts.phone,
      linkedinUrl: crmContacts.linkedinUrl,
      title: crmContacts.title,
      source: crmContacts.source,
      status: crmContacts.status,
      avatarUrl: crmContacts.avatarUrl,
      address: crmContacts.address,
      notes: crmContacts.notes,
      lastContactedAt: crmContacts.lastContactedAt,
      score: crmContacts.score,
      ownerId: crmContacts.ownerId,
      createdAt: crmContacts.createdAt,
      updatedAt: crmContacts.updatedAt,
      companyName: crmCompanies.name,
    })
    .from(crmContacts)
    .leftJoin(crmCompanies, eq(crmContacts.companyId, crmCompanies.id))
    .where(where)
    .orderBy(desc(crmContacts.createdAt))
    .limit(limit)
    .offset(offset);

  // Fetch tags for these contacts
  const contactIds = contacts.map((c) => c.id);
  let contactTagsMap: Record<number, { id: number; name: string; color: string | null }[]> = {};
  if (contactIds.length > 0) {
    const tagRows = await db
      .select({
        contactId: crmContactTags.contactId,
        tagId: crmTags.id,
        tagName: crmTags.name,
        tagColor: crmTags.color,
      })
      .from(crmContactTags)
      .innerJoin(crmTags, eq(crmContactTags.tagId, crmTags.id))
      .where(inArray(crmContactTags.contactId, contactIds));

    for (const row of tagRows) {
      if (!contactTagsMap[row.contactId]) contactTagsMap[row.contactId] = [];
      contactTagsMap[row.contactId].push({
        id: row.tagId,
        name: row.tagName,
        color: row.tagColor,
      });
    }
  }

  const data = contacts.map((c) => ({
    ...c,
    tags: contactTagsMap[c.id] || [],
  }));

  return NextResponse.json({
    success: true,
    data: { contacts: data, total: countResult.total, page, limit },
  });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json(
      { success: false, message: 'Unauthorized' },
      { status: 401 }
    );

  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client)
    return NextResponse.json(
      { success: false, message: 'Client not found' },
      { status: 404 }
    );

  const body = await req.json();

  if (!body.firstName?.trim()) {
    return NextResponse.json(
      { success: false, message: 'First name is required' },
      { status: 400 }
    );
  }

  const [contact] = await db
    .insert(crmContacts)
    .values({
      clientId: client.id,
      companyId: body.companyId || null,
      firstName: body.firstName.trim(),
      lastName: body.lastName?.trim() || null,
      email: body.email?.trim() || null,
      phone: body.phone?.trim() || null,
      linkedinUrl: body.linkedinUrl?.trim() || null,
      title: body.title?.trim() || null,
      source: body.source?.trim() || null,
      status: body.status || 'active',
      avatarUrl: body.avatarUrl || null,
      address: body.address?.trim() || null,
      notes: body.notes?.trim() || null,
      ownerId: body.ownerId || null,
    })
    .returning();

  // Attach tags if provided
  if (body.tagIds && Array.isArray(body.tagIds) && body.tagIds.length > 0) {
    await db.insert(crmContactTags).values(
      body.tagIds.map((tagId: number) => ({
        contactId: contact.id,
        tagId,
      }))
    );
  }

  emitEvent('crm.contact.created', client.id, userId, { id: contact.id, name: `${contact.firstName} ${contact.lastName || ''}`.trim(), email: contact.email, phone: contact.phone, source: contact.source });

  // Notify other client members that a contact was created (skip the creator).
  const displayName = `${contact.firstName ?? ''} ${contact.lastName ?? ''}`.trim();
  const fallback = contact.email || `Contact #${contact.id}`;
  notifyAllClientUsers({
    clientId: client.id,
    excludeUserId: userId,
    type: 'contact_created',
    title: `New contact: ${displayName || fallback}`,
    entityType: 'contact',
    entityId: contact.id,
  }).catch((err) => {
    console.error('[notif] contact_created broadcast failed', err);
  });

  return NextResponse.json({ success: true, data: contact }, { status: 201 });
}
