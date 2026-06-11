// E2 perf — converted from a 'use client' page that fetched the enriched
// clients list in useEffect (waterfall: HTML → JS → fetch → render). The
// page itself is now an RSC that calls `listAdminClients` directly. Only the
// interactive bits (search/filter state + the create form) live in the child
// client component AdminClientsView.

import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { listAdminClients } from '@/lib/admin/clients-list';
import { AdminClientsView } from './AdminClientsView';

async function requireStaffSession() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const role = (session.user as { role?: string })?.role;
  if (role !== 'admin' && role !== 'employee') return null;
  return session;
}

export default async function AdminClientsPage() {
  const session = await requireStaffSession();
  if (!session) {
    redirect('/portal/login');
  }

  const { data } = await listAdminClients({ limit: 100 });

  // Server-rendered data is plain JSON; createdAt is a Date — serialize it.
  const initialClients = data.map(c => ({
    ...c,
    createdAt: c.createdAt.toISOString(),
  }));

  return <AdminClientsView initialClients={initialClients} />;
}
