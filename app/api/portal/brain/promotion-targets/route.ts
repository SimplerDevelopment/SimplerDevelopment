import { NextResponse } from 'next/server';
import { requireBrainEntitlement } from '@/lib/brain/entitlement';
import { listPromotionTargets } from '@/lib/brain/tasks';

export async function GET() {
  const result = await requireBrainEntitlement({ action: 'read' });
  if ('response' in result) return result.response;

  const projects = await listPromotionTargets(result.client.id);
  return NextResponse.json({ success: true, data: projects });
}
