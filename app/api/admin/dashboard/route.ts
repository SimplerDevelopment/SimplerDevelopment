import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getAdminDashboard } from '@/lib/admin/dashboard-cache';

// E2 perf — the 18-query fan-out + cache lives in lib/admin/dashboard-cache.ts
// so non-route files can invoke `revalidateAdminDashboard()` without taking a
// transitive import on a Next.js route module.
async function requireStaff() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const role = (session.user as { role?: string })?.role;
  if (role !== 'admin' && role !== 'employee') return null;
  return session;
}

export async function GET() {
  const session = await requireStaff();
  if (!session) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const data = await getAdminDashboard();
  return NextResponse.json({ success: true, data });
}
