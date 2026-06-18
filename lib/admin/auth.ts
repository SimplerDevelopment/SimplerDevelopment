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
