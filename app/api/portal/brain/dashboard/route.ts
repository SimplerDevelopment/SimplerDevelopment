import { NextResponse } from 'next/server';
import { authorizePortal, isAuthError } from '@/lib/portal-auth';
import { getDashboardSummary } from '@/lib/brain/dashboard';

export async function GET() {
  const result = await authorizePortal({ action: 'read' });
  if (isAuthError(result)) return result.response;

  const summary = await getDashboardSummary(result.client.id);
  return NextResponse.json({ success: true, data: summary });
}
