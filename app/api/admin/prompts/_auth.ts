import { auth } from '@/lib/auth';

/**
 * Staff guard for the Prompt Eval Dashboard admin API — mirrors the inline
 * guard used across `app/api/admin/*` (admin or employee role). Eval/registry
 * data is admin-plane only; never reachable from portal-tenant routes.
 *
 * ponytail: reuses the existing admin role gate. The spec calls for a stricter
 * super-admin guard on the Phase-4 WRITE ops (promote/rollback/edit); add it
 * there when those land — this slice is read + mock-run only.
 */
export async function requireStaff() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const role = (session.user as { role?: string })?.role;
  if (role !== 'admin' && role !== 'employee') return null;
  return session;
}

/**
 * Stricter gate for WRITE ops (create draft, promote, rollback, edit schedule,
 * edit cases) — admins only, not employees. There is no dedicated super-admin
 * role in this codebase; `admin` is the elevated tier (employees are read-staff
 * for these high-blast-radius infra-prompt mutations).
 */
export async function requireAdmin() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const role = (session.user as { role?: string })?.role;
  if (role !== 'admin') return null;
  return session;
}
