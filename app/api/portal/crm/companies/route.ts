import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPortalClient } from '@/lib/portal-client';
import { db } from '@/lib/db';
import { crmCompanies, crmContacts, crmDeals } from '@/lib/db/schema';
import { and, eq, desc, sql } from 'drizzle-orm';
import { geocodeAddress } from '@/lib/geocode';

function parseCoordinate(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === '') return null;
  const n = typeof raw === 'number' ? raw : Number.parseFloat(String(raw));
  return Number.isFinite(n) ? n : null;
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client)
    return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });

  const search = req.nextUrl.searchParams.get('search') || '';

  const conditions = [eq(crmCompanies.clientId, client.id)];
  if (search) {
    conditions.push(
      sql`(${crmCompanies.name} ILIKE ${'%' + search + '%'} OR ${crmCompanies.domain} ILIKE ${'%' + search + '%'})`
    );
  }

  const companies = await db
    .select({
      id: crmCompanies.id,
      clientId: crmCompanies.clientId,
      name: crmCompanies.name,
      domain: crmCompanies.domain,
      industry: crmCompanies.industry,
      size: crmCompanies.size,
      phone: crmCompanies.phone,
      website: crmCompanies.website,
      address: crmCompanies.address,
      notes: crmCompanies.notes,
      createdAt: crmCompanies.createdAt,
      latitude: sql<string | null>`crm_companies.latitude::text`.as('latitude'),
      longitude: sql<string | null>`crm_companies.longitude::text`.as('longitude'),
      contactCount: sql<number>`(SELECT COUNT(*) FROM crm_contacts WHERE company_id = ${crmCompanies.id})`.as('contact_count'),
      totalDealValue: sql<number>`COALESCE((SELECT SUM(value) FROM crm_deals WHERE company_id = ${crmCompanies.id}), 0)`.as('total_deal_value'),
    })
    .from(crmCompanies)
    .where(and(...conditions))
    .orderBy(desc(crmCompanies.createdAt));

  return NextResponse.json({ success: true, data: companies });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client)
    return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });

  const body = await req.json();

  if (!body.name?.trim()) {
    return NextResponse.json(
      { success: false, message: 'Company name is required' },
      { status: 400 }
    );
  }

  const address = body.address?.trim() || null;
  const explicitLat = parseCoordinate(body.latitude);
  const explicitLng = parseCoordinate(body.longitude);

  let latitude: number | null = explicitLat;
  let longitude: number | null = explicitLng;

  // Auto-geocode when address is provided and the user has not supplied coords.
  if (address && (latitude === null || longitude === null)) {
    try {
      const coords = await geocodeAddress(address);
      if (coords) {
        latitude = latitude ?? coords.latitude;
        longitude = longitude ?? coords.longitude;
      }
    } catch (err) {
      console.error('[crm/companies] geocode failed:', err);
    }
  }

  const [company] = await db
    .insert(crmCompanies)
    .values({
      clientId: client.id,
      name: body.name.trim(),
      domain: body.domain?.trim() || null,
      industry: body.industry?.trim() || null,
      size: body.size || null,
      phone: body.phone?.trim() || null,
      address,
      website: body.website?.trim() || null,
      notes: body.notes?.trim() || null,
    })
    .returning();

  // The crm_companies table has latitude/longitude columns that are not
  // currently mirrored in the typed Drizzle schema; write to them via raw SQL
  // so we don't have to touch lib/db/schema.ts.
  if (company && (latitude !== null || longitude !== null)) {
    try {
      await db.execute(sql`
        UPDATE crm_companies
        SET latitude = ${latitude}, longitude = ${longitude}
        WHERE id = ${company.id}
      `);
    } catch (err) {
      console.error('[crm/companies] failed to persist coordinates:', err);
    }
  }

  return NextResponse.json(
    {
      success: true,
      data: company ? { ...company, latitude, longitude } : company,
    },
    { status: 201 }
  );
}
