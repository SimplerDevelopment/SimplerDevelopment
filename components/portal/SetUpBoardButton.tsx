'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

const DEFAULT_COLUMNS = [
  { name: 'To Do', order: 1 },
  { name: 'In Progress', order: 2 },
  { name: 'Done', order: 3, isDone: true },
];

/**
 * Empty-board escape hatch: a fresh project has zero columns and KanbanBoard
 * (which owns the add-column UI) never mounts, so without this button the
 * Board tab is a dead end for self-serve clients (QAD-008).
 */
export default function SetUpBoardButton({ projectId }: { projectId: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setUp = async () => {
    setBusy(true);
    setError(null);
    try {
      for (const col of DEFAULT_COLUMNS) {
        const res = await fetch(`/api/portal/projects/${projectId}/columns`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(col),
        });
        if (!res.ok) throw new Error(`Failed to create column "${col.name}"`);
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to set up the board');
      setBusy(false);
    }
  };

  return (
    <div className="mt-4">
      <button
        onClick={setUp}
        disabled={busy}
        className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
      >
        <span className="material-icons text-base">dashboard_customize</span>
        {busy ? 'Setting up…' : 'Set up board'}
      </button>
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
    </div>
  );
}
