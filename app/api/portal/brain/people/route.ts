import { NextResponse } from 'next/server';
import { requireBrainEntitlement } from '@/lib/brain/entitlement';
import { listPeople, createPerson, type ListPeopleOpts } from '@/lib/brain/people';
import type { BrainPersonStatus } from '@/lib/db/schema/brain';

const ALLOWED_STATUS: BrainPersonStatus[] = ['active', 'inactive', 'departed'];

export async function GET(request: Request) {
  const result = await requireBrainEntitlement({ action: 'read' });
  if ('response' in result) return result.response;

  const url = new URL(request.url);
  const statusRaw = url.searchParams.get('status');
  const orgUnitId = url.searchParams.get('orgUnitId');
  const expertiseTagId = url.searchParams.get('expertiseTagId');
  const managerId = url.searchParams.get('managerId');
  const search = url.searchParams.get('search');
  const limitRaw = url.searchParams.get('limit');
  const offsetRaw = url.searchParams.get('offset');

  const opts: ListPeopleOpts = {};
  if (statusRaw) {
    if (!ALLOWED_STATUS.includes(statusRaw as BrainPersonStatus)) {
      return NextResponse.json(
        { success: false, message: `Invalid status. Allowed: ${ALLOWED_STATUS.join(', ')}` },
        { status: 400 },
      );
    }
    opts.status = statusRaw as BrainPersonStatus;
  }
  if (orgUnitId !== null) {
    const n = parseInt(orgUnitId, 10);
    if (Number.isNaN(n)) {
      return NextResponse.json({ success: false, message: 'Invalid orgUnitId' }, { status: 400 });
    }
    opts.orgUnitId = n;
  }
  if (expertiseTagId !== null) {
    const n = parseInt(expertiseTagId, 10);
    if (Number.isNaN(n)) {
      return NextResponse.json({ success: false, message: 'Invalid expertiseTagId' }, { status: 400 });
    }
    opts.expertiseTagId = n;
  }
  if (managerId !== null) {
    const n = parseInt(managerId, 10);
    if (Number.isNaN(n)) {
      return NextResponse.json({ success: false, message: 'Invalid managerId' }, { status: 400 });
    }
    opts.managerId = n;
  }
  if (search) opts.search = search;
  if (limitRaw !== null) opts.limit = parseInt(limitRaw, 10);
  if (offsetRaw !== null) opts.offset = parseInt(offsetRaw, 10);

  const items = await listPeople(result.client.id, opts);
  return NextResponse.json({ success: true, data: { items } });
}

export async function POST(request: Request) {
  const result = await requireBrainEntitlement({ action: 'write' });
  if ('response' in result) return result.response;

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object' || typeof body.fullName !== 'string' || !body.fullName.trim()) {
    return NextResponse.json({ success: false, message: 'fullName is required' }, { status: 400 });
  }
  if (body.status !== undefined && !ALLOWED_STATUS.includes(body.status)) {
    return NextResponse.json(
      { success: false, message: `Invalid status. Allowed: ${ALLOWED_STATUS.join(', ')}` },
      { status: 400 },
    );
  }

  try {
    const person = await createPerson(result.client.id, result.userId, {
      fullName: body.fullName,
      email: typeof body.email === 'string' ? body.email : undefined,
      userId: typeof body.userId === 'number' ? body.userId : undefined,
      managerId: typeof body.managerId === 'number' ? body.managerId : undefined,
      title: typeof body.title === 'string' ? body.title : undefined,
      startDate: body.startDate ? new Date(body.startDate) : undefined,
      endDate: body.endDate ? new Date(body.endDate) : undefined,
      status: ALLOWED_STATUS.includes(body.status) ? body.status : undefined,
      notes: typeof body.notes === 'string' ? body.notes : undefined,
      profileUrls: Array.isArray(body.profileUrls) ? body.profileUrls : undefined,
    });
    return NextResponse.json({ success: true, data: person });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create person';
    return NextResponse.json({ success: false, message }, { status: 400 });
  }
}
