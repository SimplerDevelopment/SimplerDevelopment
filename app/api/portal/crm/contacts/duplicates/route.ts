import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPortalClient } from '@/lib/portal-client';
import { db } from '@/lib/db';
import { crmContacts } from '@/lib/db/schema';
import { and, eq, or, sql } from 'drizzle-orm';

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
  const email = url.searchParams.get('email') || '';
  const phone = url.searchParams.get('phone') || '';
  const firstName = url.searchParams.get('firstName') || '';
  const lastName = url.searchParams.get('lastName') || '';

  if (!email && !phone && !firstName) {
    return NextResponse.json(
      { success: false, message: 'At least one search parameter (email, phone, or firstName) is required' },
      { status: 400 }
    );
  }

  const matchConditions = [];

  if (email) {
    matchConditions.push(sql`${crmContacts.email} = ${email}`);
  }
  if (phone) {
    matchConditions.push(sql`${crmContacts.phone} = ${phone}`);
  }
  if (firstName && lastName) {
    matchConditions.push(
      sql`(${crmContacts.firstName} ILIKE ${firstName.charAt(0) + '%'} AND ${crmContacts.lastName} ILIKE ${lastName.charAt(0) + '%'})`
    );
  }

  if (matchConditions.length === 0) {
    return NextResponse.json({ success: true, data: [] });
  }

  const duplicates = await db
    .select({
      id: crmContacts.id,
      firstName: crmContacts.firstName,
      lastName: crmContacts.lastName,
      email: crmContacts.email,
      phone: crmContacts.phone,
      title: crmContacts.title,
      status: crmContacts.status,
      createdAt: crmContacts.createdAt,
    })
    .from(crmContacts)
    .where(
      and(
        eq(crmContacts.clientId, client.id),
        or(...matchConditions)
      )
    )
    .limit(20);

  // Annotate each result with match reasons
  const results = duplicates.map((contact) => {
    const reasons: string[] = [];
    if (email && contact.email?.toLowerCase() === email.toLowerCase()) {
      reasons.push('exact_email');
    }
    if (phone && contact.phone === phone) {
      reasons.push('exact_phone');
    }
    if (
      firstName &&
      lastName &&
      contact.firstName?.charAt(0).toLowerCase() === firstName.charAt(0).toLowerCase() &&
      contact.lastName?.charAt(0).toLowerCase() === lastName.charAt(0).toLowerCase()
    ) {
      reasons.push('name_fuzzy');
    }
    return { ...contact, matchReasons: reasons };
  });

  // Sort by strength: exact_email first, then exact_phone, then name_fuzzy
  results.sort((a, b) => {
    const score = (reasons: string[]) => {
      let s = 0;
      if (reasons.includes('exact_email')) s += 100;
      if (reasons.includes('exact_phone')) s += 50;
      if (reasons.includes('name_fuzzy')) s += 10;
      return s;
    };
    return score(b.matchReasons) - score(a.matchReasons);
  });

  return NextResponse.json({ success: true, data: results });
}
