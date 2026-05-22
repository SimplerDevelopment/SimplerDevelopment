/**
 * Read-only org-unit membership view for a person. Writes (attach/detach a
 * person to an org unit) are owned by Wave 2b's
 * `/api/portal/brain/org-units/[id]/members` route — this endpoint exists so
 * the People UI can pull a person's units without round-tripping through the
 * org-units tree.
 */
import { NextResponse } from 'next/server';
import { requireBrainEntitlement } from '@/lib/brain/entitlement';
import { getPersonById } from '@/lib/brain/people';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = await requireBrainEntitlement({ action: 'read' });
  if ('response' in result) return result.response;

  const { id } = await params;
  const personId = parseInt(id, 10);
  if (Number.isNaN(personId)) {
    return NextResponse.json({ success: false, message: 'Invalid person id' }, { status: 400 });
  }

  const person = await getPersonById(result.client.id, personId);
  if (!person) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  return NextResponse.json({ success: true, data: { items: person.orgUnits } });
}
