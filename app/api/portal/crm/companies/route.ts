import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPortalClient } from '@/lib/portal-client';
import { db } from '@/lib/db';
import { crmCompanies, crmContacts, crmDeals } from '@/lib/db/schema';
import { and, eq, desc, sql } from 'drizzle-orm';
import { buildCustomFieldFilters } from '@/lib/crm-custom-field-filter';
import { geocodeAddress } from '@/lib/geocode';
import { validateCrmName } from '@/lib/crm/parse';

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

  const url = req.nextUrl;
  const search = url.searchParams.get('search') || '';
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
  const limit = Math.min(
    5000,
    Math.max(1, parseInt(url.searchParams.get('limit') || '25', 10))
  );
  const offset = (page - 1) * limit;

  const conditions = [eq(crmCompanies.clientId, client.id)];
  if (search) {
    conditions.push(
      sql`(${crmCompanies.name} ILIKE ${'%' + search + '%'} OR ${crmCompanies.domain} ILIKE ${'%' + search + '%'})`
    );
  }

  for (const cf of buildCustomFieldFilters(url.searchParams, crmCompanies.id, 'company')) {
    conditions.push(cf);
  }

  const where = and(...conditions);

  const [countResult] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(crmCompanies)
    .where(where);

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
      logoUrl: crmCompanies.logoUrl,
      notes: crmCompanies.notes,
      latitude: crmCompanies.latitude,
      longitude: crmCompanies.longitude,
      createdAt: crmCompanies.createdAt,
      // Fully-qualify the outer table in correlated subqueries — Drizzle emits
      // unqualified "id" from ${crmCompanies.id} in this position, which would
      // resolve to crm_contacts.id inside the subquery. Also cast bigint
      // aggregates so node-postgres returns JS numbers instead of strings.
      contactCount: sql<number>`(SELECT COUNT(*)::int FROM crm_contacts WHERE crm_contacts.company_id = crm_companies.id)`.as('contact_count'),
      totalDealValue: sql<number>`COALESCE((SELECT SUM(value) FROM crm_deals WHERE crm_deals.company_id = crm_companies.id), 0)::float8`.as('total_deal_value'),
    })
    .from(crmCompanies)
    .where(where)
    .orderBy(desc(crmCompanies.createdAt))
    .limit(limit)
    .offset(offset);

  return NextResponse.json({
    success: true,
    data: { companies, total: countResult.total, page, limit },
  });
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

  // Validate free-text inputs that flow into CSV / email merge / PDF.
  const name = validateCrmName(body.name, 'name');
  if (!name.ok) {
    return NextResponse.json(
      { success: false, error: name.error, field: 'name' },
      { status: 400 }
    );
  }
  if (name.value === null) {
    return NextResponse.json(
      { success: false, message: 'Company name is required' },
      { status: 400 }
    );
  }
  const notes = validateCrmName(body.notes, 'notes');
  if (!notes.ok) {
    return NextResponse.json(
      { success: false, error: notes.error, field: 'notes' },
      { status: 400 }
    );
  }

  const address = body.address?.trim() || null;
  const explicitLat = parseCoordinate(body.latitude);
  const explicitLng = parseCoordinate(body.longitude);
  let latitude: number | null = explicitLat;
  let longitude: number | null = explicitLng;

  // Auto-geocode when address is provided and the user did not supply coords.
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
      name: name.value,
      domain: body.domain?.trim() || null,
      industry: body.industry?.trim() || null,
      size: body.size || null,
      phone: body.phone?.trim() || null,
      address,
      website: body.website?.trim() || null,
      logoUrl: body.logoUrl?.trim() || null,
      notes: notes.value,
      // Drizzle's numeric() accepts string | null for input.
      latitude: latitude !== null ? String(latitude) : null,
      longitude: longitude !== null ? String(longitude) : null,
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
