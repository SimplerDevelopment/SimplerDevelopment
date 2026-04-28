import { NextResponse } from 'next/server';
import { authorizePortal, isAuthError } from '@/lib/portal-auth';
import { listPromotionTargets } from '@/lib/brain/tasks';

export async function GET() {
  const result = await authorizePortal({ action: 'read' });
  if (isAuthError(result)) return result.response;

  const projects = await listPromotionTargets(result.client.id);
  return NextResponse.json({ success: true, data: projects });
}
