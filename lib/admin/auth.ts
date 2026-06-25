import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';

/**
 * Shared staff-session guard for admin RSC pages and the admin layout.
 * Returns the session if the user is an authenticated staff member
 * (role === 'admin' | 'employee'), or null otherwise.
 */
export async function requireStaffSession() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const role = (session.user as { role?: string })?.role;
  if (role !== 'admin' && role !== 'employee') return null;
  return session;
}

/**
 * Route-handler auth guard for admin/editor-only API routes.
 * Returns { session } on success, or { error: 'unauth' | 'forbidden' } on failure.
 */
export async function requireAdminOrEditor() {
  const session = await auth();
  if (!session?.user?.id) return { error: 'unauth' as const };
  const role = (session.user as { role?: string })?.role;
  if (role !== 'admin' && role !== 'editor') return { error: 'forbidden' as const };
  return { session };
}

/**
 * Converts the result of requireAdminOrEditor() into an error NextResponse,
 * or returns null if the caller is authorized (proceed normally).
 */
export function gateResponse(result: Awaited<ReturnType<typeof requireAdminOrEditor>>) {
  if ('error' in result) {
    if (result.error === 'unauth') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
  }
  return null;
}
