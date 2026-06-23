import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPortalClient } from '@/lib/portal-client';
import { db } from '@/lib/db';
import { crmCompanies, crmContacts, crmDeals, crmPipelineStages, crmCustomFields, crmCustomFieldValues } from '@/lib/db/schema';
import { and, eq, desc, sql } from 'drizzle-orm';
import { geocodeAddress } from '@/lib/geocode';
import { validateCrmName } from '@/lib/crm/parse';

function parseCoordinate(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === '') return null;
  const n = typeof raw === 'number' ? raw : Number.parseFloat(String(raw));
  return Number.isFinite(n) ? n : null;
}

interface CompanyCoords {
  latitude: string | null;
  longitude: string | null;
}

async function loadCompanyCoords(companyId: number): Promise<CompanyCoords> {
  try {
    const rows = await db.execute(sql`
      SELECT latitude::text AS latitude, longitude::text AS longitude
      FROM crm_companies
      WHERE id = ${companyId}
      LIMIT 1
    `);
    const first = (rows as unknown as CompanyCoords[])[0];
    return first ?? { latitude: null, longitude: null };
  } catch {
    return { latitude: null, longitude: null };
  }
}

async function getAuthedClient() {
  const session = await auth();
  if (!session?.user?.id) return { error: NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 }) };
  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client) return { error: NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 }) };
  return { client, userId };
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const result = await getAuthedClient();
  if ('error' in result) return result.error;
  const { client } = result;

  const companyId = parseInt(id, 10);
  if (isNaN(companyId))
    return NextResponse.json({ success: false, message: 'Invalid ID' }, { status: 400 });

  const [company] = await db
    .select()
    .from(crmCompanies)
    .where(and(eq(crmCompanies.id, companyId), eq(crmCompanies.clientId, client.id)));

  if (!company)
    return NextResponse.json({ success: false, message: 'Company not found' }, { status: 404 });

  // Load lat/lng via raw SQL (columns not mirrored in Drizzle schema).
  const coords = await loadCompanyCoords(companyId);
  const companyWithCoords = {
    ...company,
    latitude: coords.latitude,
    longitude: coords.longitude,
  };

  // Get contacts for this company
  const contacts = await db
    .select({
      id: crmContacts.id,
      firstName: crmContacts.firstName,
      lastName: crmContacts.lastName,
      email: crmContacts.email,
      phone: crmContacts.phone,
      title: crmContacts.title,
      status: crmContacts.status,
    })
    .from(crmContacts)
    .where(eq(crmContacts.companyId, companyId))
    .orderBy(desc(crmContacts.createdAt));

  // Get deals for this company with stage name and contact name
  const deals = await db
    .select({
      id: crmDeals.id,
      title: crmDeals.title,
      value: crmDeals.value,
      status: crmDeals.status,
      expectedCloseDate: crmDeals.expectedCloseDate,
      contactName: crmContacts.firstName,
      contactLastName: crmContacts.lastName,
      stageName: crmPipelineStages.name,
    })
    .from(crmDeals)
    .leftJoin(crmContacts, eq(crmDeals.contactId, crmContacts.id))
    .leftJoin(crmPipelineStages, eq(crmDeals.stageId, crmPipelineStages.id))
    .where(eq(crmDeals.companyId, companyId))
    .orderBy(desc(crmDeals.createdAt));

  const dealsFormatted = deals.map(d => ({
    id: d.id,
    title: d.title,
    value: d.value ?? 0,
    status: d.status,
    expectedCloseDate: d.expectedCloseDate,
    contactName: d.contactName ? `${d.contactName} ${d.contactLastName ?? ''}`.trim() : null,
    stageName: d.stageName ?? 'Unknown',
  }));

  // Fetch custom field values
  const customFieldRows = await db
    .select({
      fieldId: crmCustomFields.id,
      fieldName: crmCustomFields.fieldName,
      fieldType: crmCustomFields.fieldType,
      value: crmCustomFieldValues.value,
    })
    .from(crmCustomFields)
    .leftJoin(
      crmCustomFieldValues,
      and(
        eq(crmCustomFieldValues.customFieldId, crmCustomFields.id),
        eq(crmCustomFieldValues.entityId, companyId),
        eq(crmCustomFieldValues.entityType, 'company')
      )
    )
    .where(
      and(
        eq(crmCustomFields.clientId, client.id),
        eq(crmCustomFields.entityType, 'company')
      )
    );

  const customFields: Record<number, { name: string; type: string; value: string | null }> = {};
  for (const row of customFieldRows) {
    customFields[row.fieldId] = { name: row.fieldName, type: row.fieldType, value: row.value };
  }

  return NextResponse.json({
    success: true,
    data: {
      company: companyWithCoords,
      contacts,
      deals: dealsFormatted,
      customFields,
    },
  });
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const result = await getAuthedClient();
  if ('error' in result) return result.error;
  const { client } = result;

  const companyId = parseInt(id, 10);
  if (isNaN(companyId))
    return NextResponse.json({ success: false, message: 'Invalid ID' }, { status: 400 });

  const [existing] = await db
    .select({ id: crmCompanies.id, address: crmCompanies.address })
    .from(crmCompanies)
    .where(and(eq(crmCompanies.id, companyId), eq(crmCompanies.clientId, client.id)));

  if (!existing)
    return NextResponse.json({ success: false, message: 'Company not found' }, { status: 404 });

  const body = await req.json();

  // Validate free-text inputs (see contacts/route.ts POST for rationale).
  for (const field of ['name', 'notes'] as const) {
    if (body[field] !== undefined) {
      const v = validateCrmName(body[field], field);
      if (!v.ok) {
        return NextResponse.json(
          { success: false, error: v.error, field },
          { status: 400 }
        );
      }
      body[field] = v.value;
    }
  }

  const updateData: Record<string, unknown> = { updatedAt: new Date() };
  let nextAddress: string | null = existing.address;
  let addressChanged = false;
  if (body.name !== undefined) {
    if (!body.name) {
      return NextResponse.json(
        { success: false, message: 'Company name is required' },
        { status: 400 }
      );
    }
    updateData.name = body.name;
  }
  if (body.domain !== undefined) updateData.domain = body.domain?.trim() || null;
  if (body.industry !== undefined) updateData.industry = body.industry?.trim() || null;
  if (body.size !== undefined) updateData.size = body.size || null;
  if (body.phone !== undefined) updateData.phone = body.phone?.trim() || null;
  if (body.address !== undefined) {
    nextAddress = body.address?.trim() || null;
    addressChanged = nextAddress !== existing.address;
    updateData.address = nextAddress;
  }
  if (body.website !== undefined) updateData.website = body.website?.trim() || null;
  if (body.logoUrl !== undefined) updateData.logoUrl = body.logoUrl?.trim() || null;
  if (body.notes !== undefined) updateData.notes = body.notes ?? null;

  const explicitLatProvided = body.latitude !== undefined;
  const explicitLngProvided = body.longitude !== undefined;
  const explicitLat = explicitLatProvided ? parseCoordinate(body.latitude) : null;
  const explicitLng = explicitLngProvided ? parseCoordinate(body.longitude) : null;

  const [updated] = await db
    .update(crmCompanies)
    .set(updateData)
    .where(eq(crmCompanies.id, companyId))
    .returning();

  // Determine final coordinates.
  // 1. If the user supplied explicit lat/lng, honor them (treat the pair as a
  //    unit; both must be provided to override).
  // 2. Otherwise, if the address changed and is non-empty, re-geocode.
  // 3. Otherwise, leave whatever is already in the DB alone.
  let finalLat: number | null = null;
  let finalLng: number | null = null;
  let shouldPersistCoords = false;

  if (explicitLatProvided && explicitLngProvided) {
    finalLat = explicitLat;
    finalLng = explicitLng;
    shouldPersistCoords = true;
  } else if (addressChanged && nextAddress) {
    try {
      const coords = await geocodeAddress(nextAddress);
      if (coords) {
        finalLat = coords.latitude;
        finalLng = coords.longitude;
        shouldPersistCoords = true;
      } else {
        // Address changed but geocoding produced no result — clear stale coords.
        finalLat = null;
        finalLng = null;
        shouldPersistCoords = true;
      }
    } catch (err) {
      console.error('[crm/companies] geocode failed:', err);
    }
  } else if (addressChanged && !nextAddress) {
    // Address cleared — clear coords too.
    shouldPersistCoords = true;
  }

  if (shouldPersistCoords) {
    try {
      await db.execute(sql`
        UPDATE crm_companies
        SET latitude = ${finalLat}, longitude = ${finalLng}
        WHERE id = ${companyId}
      `);
    } catch (err) {
      console.error('[crm/companies] failed to persist coordinates:', err);
    }
  }

  const finalCoords = shouldPersistCoords
    ? { latitude: finalLat, longitude: finalLng }
    : await loadCompanyCoords(companyId);

  return NextResponse.json({
    success: true,
    data: updated ? { ...updated, ...finalCoords } : updated,
  });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const result = await getAuthedClient();
  if ('error' in result) return result.error;
  const { client } = result;

  const companyId = parseInt(id, 10);
  if (isNaN(companyId))
    return NextResponse.json({ success: false, message: 'Invalid ID' }, { status: 400 });

  const [deleted] = await db
    .delete(crmCompanies)
    .where(and(eq(crmCompanies.id, companyId), eq(crmCompanies.clientId, client.id)))
    .returning();

  if (!deleted)
    return NextResponse.json({ success: false, message: 'Company not found' }, { status: 404 });

  return NextResponse.json({ success: true, data: deleted });
}
