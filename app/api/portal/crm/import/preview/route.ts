import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPortalClient } from '@/lib/portal-client';

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

  if (!file) {
    return NextResponse.json(
      { success: false, message: 'File is required' },
      { status: 400 }
    );
  }

  const text = await file.text();
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);

  if (lines.length === 0) {
    return NextResponse.json(
      { success: false, message: 'CSV file is empty' },
      { status: 400 }
    );
  }

  const headers = parseCsvLine(lines[0]);
  const sampleRows: string[][] = [];

  for (let i = 1; i < Math.min(lines.length, 6); i++) {
    sampleRows.push(parseCsvLine(lines[i]));
  }

  return NextResponse.json({
    success: true,
    data: { headers, sampleRows },
  });
}
