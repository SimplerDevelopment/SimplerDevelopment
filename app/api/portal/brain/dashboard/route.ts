import { NextResponse } from 'next/server';
import { requireBrainEntitlement } from '@/lib/brain/entitlement';
import { getDashboardSummary } from '@/lib/brain/dashboard';

export async function GET() {
  const result = await requireBrainEntitlement({ action: 'read' });
  if ('response' in result) return result.response;

  const summary = await getDashboardSummary(result.client.id);
  return NextResponse.json({ success: true, data: summary });
}
