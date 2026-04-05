import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPortalClient } from '@/lib/portal-client';
import { db } from '@/lib/db';
import {
  crmContacts,
  crmCompanies,
  crmDeals,
  crmPipelineStages,
} from '@/lib/db/schema';
import { and, eq, desc, sql } from 'drizzle-orm';

function escapeCsvField(value: unknown): string {
  if (value == null) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers.map(escapeCsvField).join(',')];
  for (const row of rows) {
    lines.push(row.map(escapeCsvField).join(','));
  }
  return lines.join('\n');
}

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
  const entityType = url.searchParams.get('entityType');
  const search = url.searchParams.get('search') || '';
  const status = url.searchParams.get('status') || '';

  if (!entityType || !['contact', 'company', 'deal'].includes(entityType)) {
    return NextResponse.json(
      { success: false, message: 'entityType must be contact, company, or deal' },
      { status: 400 }
    );
  }

  let csvContent = '';

  if (entityType === 'contact') {
    const conditions = [eq(crmContacts.clientId, client.id)];
    if (search) {
      conditions.push(
        sql`(${crmContacts.firstName} ILIKE ${'%' + search + '%'} OR ${crmContacts.lastName} ILIKE ${'%' + search + '%'} OR ${crmContacts.email} ILIKE ${'%' + search + '%'})`
      );
    }
    if (status) {
      conditions.push(eq(crmContacts.status, status));
    }

    const rows = await db
      .select({
        firstName: crmContacts.firstName,
        lastName: crmContacts.lastName,
        email: crmContacts.email,
        phone: crmContacts.phone,
        title: crmContacts.title,
        companyName: crmCompanies.name,
        status: crmContacts.status,
        source: crmContacts.source,
        score: crmContacts.score,
        createdAt: crmContacts.createdAt,
      })
      .from(crmContacts)
      .leftJoin(crmCompanies, eq(crmContacts.companyId, crmCompanies.id))
      .where(and(...conditions))
      .orderBy(desc(crmContacts.createdAt));

    csvContent = toCsv(
      ['firstName', 'lastName', 'email', 'phone', 'title', 'company', 'status', 'source', 'score', 'createdAt'],
      rows.map((r) => [
        r.firstName,
        r.lastName,
        r.email,
        r.phone,
        r.title,
        r.companyName,
        r.status,
        r.source,
        r.score,
        r.createdAt,
      ])
    );
  } else if (entityType === 'company') {
    const conditions = [eq(crmCompanies.clientId, client.id)];
    if (search) {
      conditions.push(
        sql`(${crmCompanies.name} ILIKE ${'%' + search + '%'} OR ${crmCompanies.domain} ILIKE ${'%' + search + '%'})`
      );
    }

    const rows = await db
      .select({
        name: crmCompanies.name,
        domain: crmCompanies.domain,
        industry: crmCompanies.industry,
        size: crmCompanies.size,
        phone: crmCompanies.phone,
        website: crmCompanies.website,
        address: crmCompanies.address,
        createdAt: crmCompanies.createdAt,
      })
      .from(crmCompanies)
      .where(and(...conditions))
      .orderBy(desc(crmCompanies.createdAt));

    csvContent = toCsv(
      ['name', 'domain', 'industry', 'size', 'phone', 'website', 'address', 'createdAt'],
      rows.map((r) => [
        r.name,
        r.domain,
        r.industry,
        r.size,
        r.phone,
        r.website,
        r.address,
        r.createdAt,
      ])
    );
  } else if (entityType === 'deal') {
    const conditions = [eq(crmDeals.clientId, client.id)];
    if (search) {
      conditions.push(sql`${crmDeals.title} ILIKE ${'%' + search + '%'}`);
    }
    if (status) {
      conditions.push(eq(crmDeals.status, status));
    }

    const rows = await db
      .select({
        title: crmDeals.title,
        value: crmDeals.value,
        status: crmDeals.status,
        priority: crmDeals.priority,
        stageName: crmPipelineStages.name,
        contactFirstName: crmContacts.firstName,
        contactLastName: crmContacts.lastName,
        companyName: crmCompanies.name,
        expectedCloseDate: crmDeals.expectedCloseDate,
        createdAt: crmDeals.createdAt,
      })
      .from(crmDeals)
      .leftJoin(crmContacts, eq(crmDeals.contactId, crmContacts.id))
      .leftJoin(crmCompanies, eq(crmDeals.companyId, crmCompanies.id))
      .leftJoin(crmPipelineStages, eq(crmDeals.stageId, crmPipelineStages.id))
      .where(and(...conditions))
      .orderBy(desc(crmDeals.createdAt));

    csvContent = toCsv(
      ['title', 'value', 'status', 'priority', 'stageName', 'contactName', 'companyName', 'expectedCloseDate', 'createdAt'],
      rows.map((r) => [
        r.title,
        r.value,
        r.status,
        r.priority,
        r.stageName,
        [r.contactFirstName, r.contactLastName].filter(Boolean).join(' '),
        r.companyName,
        r.expectedCloseDate,
        r.createdAt,
      ])
    );
  }

  const filename = `crm-${entityType}s-${new Date().toISOString().slice(0, 10)}.csv`;

  return new NextResponse(csvContent, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
