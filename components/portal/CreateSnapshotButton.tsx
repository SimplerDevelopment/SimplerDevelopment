'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface CreateSnapshotButtonProps {
  siteId: number;
  siteName?: string;
}

/** Inline "Create snapshot" trigger for the site dashboard. POSTs to
 *  /api/portal/sites/[siteId]/export, then deep-links to the snapshots
 *  list so the user sees their new row immediately. */
export default function CreateSnapshotButton({ siteId, siteName }: CreateSnapshotButtonProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function handleClick() {
    if (busy) return;
    const defaultName = siteName ? `${siteName} snapshot` : 'Site snapshot';
    const name = window.prompt('Snapshot name', defaultName);
    if (!name) return;

    setBusy(true);
    try {
      const res = await fetch(`/api/portal/sites/${siteId}/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        alert(`Export failed: ${data.message || 'unknown error'}`);
        return;
      }
      router.push('/portal/snapshots');
    } catch (err) {
      alert(`Export failed: ${err instanceof Error ? err.message : 'unknown error'}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={busy}
      className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-md border border-border text-foreground hover:bg-accent disabled:opacity-50"
      title="Save this site as a portable snapshot"
    >
      <span className="material-icons text-base">photo_library</span>
      {busy ? 'Saving…' : 'Create snapshot'}
    </button>
  );
}
