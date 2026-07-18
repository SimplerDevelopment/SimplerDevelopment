// Server-component auth gate for the admin subtree.
// Resolves the staff session on the server and redirects unauthenticated or
// non-staff visitors to /admin/login BEFORE any HTML is sent to the client.
//
// REDIRECT-LOOP AVOIDANCE: /admin/login lives inside this layout's route tree.
// We read x-pathname (stamped by middleware.ts on every app-hostname response)
// to detect the login page and let it render without an auth check.
//
// HYDRATION-SAFETY: this layout must always return the SAME top-level element
// (`<AdminShellClient>`) regardless of which admin route is being rendered.
// Next's App Router treats a shared layout position as persistent/reusable
// across sibling page navigations — a layout that flips between two
// structurally different trees (a bare login-card div vs the full sidebar
// chrome) for the same segment is exactly what produces a "server rendered
// HTML didn't match the client" hydration error here. `app/portal/layout.tsx`
// (via PortalShell → PortalLayoutClient) sidesteps this the same way: the
// server layout always renders one persistent client component, and THAT
// component decides chrome-vs-bare internally via `usePathname()` (stable
// across SSR and hydration/soft-navigation because Next keeps it in sync with
// the current route). AdminShellClient now does the same — see that file for
// the isLoginPage branch.
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { requireStaffSession } from '@/lib/admin/auth';
import AdminShellClient from '@/components/admin/AdminShellClient';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const headerList = await headers();
  const pathname = headerList.get('x-pathname') ?? '';
  const isLoginPage = pathname === '/admin/login';

  // Skip the auth gate for /admin/login itself — checking auth here would
  // redirect back to /admin/login, creating an infinite loop. The JSX shape
  // returned below is unconditional (see HYDRATION-SAFETY note above).
  if (!isLoginPage) {
    const session = await requireStaffSession();
    if (!session) {
      redirect('/admin/login');
    }
  }

  return <AdminShellClient>{children}</AdminShellClient>;
}
