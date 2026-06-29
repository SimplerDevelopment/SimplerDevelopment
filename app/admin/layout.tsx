// Server-component auth gate for the admin subtree.
// Resolves the staff session on the server and redirects unauthenticated or
// non-staff visitors to /admin/login BEFORE any HTML is sent to the client.
//
// REDIRECT-LOOP AVOIDANCE: /admin/login lives inside this layout's route tree.
// We read x-pathname (stamped by middleware.ts on every app-hostname response)
// to detect the login page and let it render without an auth check. The login
// page itself renders a centered card via its own client component — no chrome
// needed.
//
// All sidebar chrome (collapse state, localStorage, CustomEvent) lives in
// AdminShellClient (a 'use client' component) which this layout renders as its
// output wrapper.

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

  // Always render the login page without auth gating — checking auth here
  // would redirect back to /admin/login, creating an infinite loop.
  if (isLoginPage) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        {children}
      </div>
    );
  }

  const session = await requireStaffSession();
  if (!session) {
    redirect('/admin/login');
  }

  return <AdminShellClient>{children}</AdminShellClient>;
}
