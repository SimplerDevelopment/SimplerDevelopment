import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPortalClient } from '@/lib/portal-client';
import { db } from '@/lib/db';
import { crmContacts, crmCompanies, crmDeals, crmPipelines, crmPipelineStages } from '@/lib/db/schema';
import { and, eq, asc } from 'drizzle-orm';

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        fields.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
  }
  fields.push(current.trim());
  return fields;
}

type EntityType = 'contact' | 'company' | 'deal';

const REQUIRED_FIELDS: Record<EntityType, string[]> = {
  contact: ['firstName'],
  company: ['name'],
  deal: ['title'],
};

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

  let formData: globalThis.FormData;
  try {
    formData = await req.formData() as unknown as globalThis.FormData;
  } catch {
    return NextResponse.json(
      { success: false, message: 'File is required' },
      { status: 400 }
    );
  }
  const file = formData.get('file') as File | null;
  const entityType = formData.get('entityType') as string | null;
  const mappingStr = formData.get('mapping') as string | null;
  const skipDuplicates = formData.get('skipDuplicates') === '1';

  if (!file) {
    return NextResponse.json(
      { success: false, message: 'File is required' },
      { status: 400 }
    );
  }

  if (!entityType || !['contact', 'company', 'deal'].includes(entityType)) {
    return NextResponse.json(
      { success: false, message: 'entityType must be contact, company, or deal' },
      { status: 400 }
    );
  }

  let mapping: Record<string, string> = {};
  if (mappingStr) {
    try {
      mapping = JSON.parse(mappingStr);
    } catch {
      return NextResponse.json(
        { success: false, message: 'Invalid mapping JSON' },
        { status: 400 }
      );
    }
  }

  const text = await file.text();
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);

  if (lines.length < 2) {
    return NextResponse.json(
      { success: false, message: 'CSV must have a header row and at least one data row' },
      { status: 400 }
    );
  }

  const csvHeaders = parseCsvLine(lines[0]);

  // Build header-to-field index using mapping
  // If mapping is empty, assume CSV headers match field names directly
  const headerToField: Record<number, string> = {};
  for (let i = 0; i < csvHeaders.length; i++) {
    const csvHeader = csvHeaders[i];
    if (mapping[csvHeader]) {
      headerToField[i] = mapping[csvHeader];
    } else if (Object.keys(mapping).length === 0) {
      headerToField[i] = csvHeader;
    }
  }

  const type = entityType as EntityType;
  const requiredFields = REQUIRED_FIELDS[type];
  const errors: string[] = [];
  let imported = 0;
  let skipped = 0;

  // Parse all data rows
  const parsedRows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i]);
    const row: Record<string, string> = {};
    for (const [idxStr, field] of Object.entries(headerToField)) {
      const idx = parseInt(idxStr, 10);
      row[field] = values[idx] || '';
    }
    parsedRows.push(row);
  }

  // Validate required fields
  const validRows: Record<string, string>[] = [];
  for (let i = 0; i < parsedRows.length; i++) {
    const row = parsedRows[i];
    const missing = requiredFields.filter((f) => !row[f]?.trim());
    if (missing.length > 0) {
      errors.push(`Row ${i + 2}: missing required field(s): ${missing.join(', ')}`);
      skipped++;
      continue;
    }
    validRows.push(row);
  }

  // For contacts with skipDuplicates, check existing emails
  let existingEmails = new Set<string>();
  if (type === 'contact' && skipDuplicates) {
    const emailsToCheck = validRows
      .map((r) => r.email?.trim().toLowerCase())
      .filter(Boolean);
    if (emailsToCheck.length > 0) {
      const existing = await db
        .select({ email: crmContacts.email })
        .from(crmContacts)
        .where(eq(crmContacts.clientId, client.id));
      existingEmails = new Set(
        existing.map((e) => e.email?.toLowerCase()).filter(Boolean) as string[]
      );
    }
  }

  // Batch insert
  const BATCH_SIZE = 500;

  if (type === 'contact') {
    const toInsert = [];
    for (const row of validRows) {
      if (skipDuplicates && row.email?.trim()) {
        if (existingEmails.has(row.email.trim().toLowerCase())) {
          skipped++;
          continue;
        }
      }
      toInsert.push({
        clientId: client.id,
        firstName: row.firstName?.trim() || '',
        lastName: row.lastName?.trim() || null,
        email: row.email?.trim() || null,
        phone: row.phone?.trim() || null,
        title: row.title?.trim() || null,
        source: row.source?.trim() || null,
        status: row.status?.trim() || 'active',
        address: row.address?.trim() || null,
        notes: row.notes?.trim() || null,
      });
    }

    for (let i = 0; i < toInsert.length; i += BATCH_SIZE) {
      const batch = toInsert.slice(i, i + BATCH_SIZE);
      if (batch.length > 0) {
        await db.insert(crmContacts).values(batch);
        imported += batch.length;
      }
    }
  } else if (type === 'company') {
    const toInsert = validRows.map((row) => ({
      clientId: client.id,
      name: row.name?.trim() || '',
      domain: row.domain?.trim() || null,
      industry: row.industry?.trim() || null,
      size: row.size?.trim() || null,
      phone: row.phone?.trim() || null,
      website: row.website?.trim() || null,
      address: row.address?.trim() || null,
      notes: row.notes?.trim() || null,
    }));

    for (let i = 0; i < toInsert.length; i += BATCH_SIZE) {
      const batch = toInsert.slice(i, i + BATCH_SIZE);
      if (batch.length > 0) {
        await db.insert(crmCompanies).values(batch);
        imported += batch.length;
      }
    }
  } else if (type === 'deal') {
    // Get default pipeline and first stage for this client
    const [defaultPipeline] = await db.select({ id: crmPipelines.id })
      .from(crmPipelines)
      .where(eq(crmPipelines.clientId, client.id))
      .orderBy(asc(crmPipelines.id))
      .limit(1);

    if (!defaultPipeline) {
      return NextResponse.json(
        { success: false, message: 'No pipeline found. Create a pipeline before importing deals.' },
        { status: 400 }
      );
    }

    const [defaultStage] = await db.select({ id: crmPipelineStages.id })
      .from(crmPipelineStages)
      .where(eq(crmPipelineStages.pipelineId, defaultPipeline.id))
      .orderBy(asc(crmPipelineStages.sortOrder))
      .limit(1);

    if (!defaultStage) {
      return NextResponse.json(
        { success: false, message: 'No pipeline stages found. Add stages to your pipeline before importing deals.' },
        { status: 400 }
      );
    }

    const toInsert = validRows.map((row) => ({
      clientId: client.id,
      pipelineId: defaultPipeline.id,
      stageId: defaultStage.id,
      title: row.title?.trim() || '',
      value: row.value ? Math.round(parseFloat(row.value) * 100) || null : null,
      status: row.status?.trim() || 'open',
      priority: row.priority?.trim() || 'medium',
      notes: row.notes?.trim() || null,
      expectedCloseDate: row.expectedCloseDate
        ? new Date(row.expectedCloseDate)
        : null,
    }));

    for (let i = 0; i < toInsert.length; i += BATCH_SIZE) {
      const batch = toInsert.slice(i, i + BATCH_SIZE);
      if (batch.length > 0) {
        await db.insert(crmDeals).values(batch);
        imported += batch.length;
      }
    }
  }

  return NextResponse.json({
    success: true,
    data: { imported, skipped, errors },
  });
}
