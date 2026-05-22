import { redirect } from 'next/navigation';
import { getPublishingSession } from '@/lib/publishing/active-client';

export const dynamic = 'force-dynamic';

// Permissions shell — PUB-10 replaces this with the per-user permissions
// matrix UI. Gate: owners + admins + staff only.
export default async function PublishingPermissionsPage() {
  const session = await getPublishingSession();
  const canManage =
    session.isStaff || session.role === 'owner' || session.role === 'admin';
  if (!canManage) redirect('/portal/publishing/board');

  return (
    <section className="rounded-lg border border-dashed border-gray-300 dark:border-gray-700 p-8 text-center">
      <span className="material-symbols-outlined text-4xl text-gray-400">lock</span>
      <h2 className="mt-2 text-lg font-medium">Permissions</h2>
      <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
        PUB-10 will host the per-user stage / action grant matrix here.
      </p>
    </section>
  );
}
