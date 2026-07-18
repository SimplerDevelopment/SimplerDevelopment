/**
 * ProjectFilesArtifactsTab — hosts the "Files" and "Artifacts" sub-views under
 * one consolidated project tab (PUX-012).
 *
 * Files = uploaded binaries attached to cards (ProjectFilesTab).
 * Artifacts = links to other platform resources — websites, decks, proposals,
 * surveys, etc. (ProjectArtifactsTab). Semantically distinct, so this wrapper
 * just hosts both behind a segmented control and a local sub-tab — it does
 * NOT merge their internals or shared state.
 */
'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import ProjectFilesTab from '@/components/portal/ProjectFilesTab';

// Kept as a dynamic import here (moved from page.tsx) to preserve the
// original bundle-splitting intent — the Artifacts chunk only ships once the
// sub-tab is actually selected.
const ProjectArtifactsTab = dynamic(() => import('@/components/portal/ProjectArtifactsTab'), {
  loading: () => <div className="p-8 text-sm text-muted-foreground">Loading artifacts…</div>,
});

type SubTab = 'files' | 'artifacts';

const SUB_TABS: { key: SubTab; label: string; icon: string }[] = [
  { key: 'files', label: 'Files', icon: 'folder' },
  { key: 'artifacts', label: 'Artifacts', icon: 'attachment' },
];

interface Props {
  projectId: number;
  canEdit: boolean;
}

export default function ProjectFilesArtifactsTab({ projectId, canEdit }: Props) {
  const [subTab, setSubTab] = useState<SubTab>('files');

  return (
    <div className="space-y-4">
      {/* Segmented control */}
      <div className="inline-flex items-center gap-1 p-1 rounded-lg bg-muted">
        {SUB_TABS.map(t => (
          <button
            key={t.key}
            type="button"
            onClick={() => setSubTab(t.key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              subTab === t.key
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <span className="material-icons text-base">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>

      {subTab === 'files' ? (
        <ProjectFilesTab projectId={projectId} />
      ) : (
        <ProjectArtifactsTab projectId={projectId} canEdit={canEdit} />
      )}
    </div>
  );
}
