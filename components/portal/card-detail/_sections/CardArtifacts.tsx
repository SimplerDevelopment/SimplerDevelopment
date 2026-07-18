/**
 * Linked artifacts (websites, decks, surveys, …) for the card, with picker.
 */
'use client';

import { ARTIFACT_ICONS, ARTIFACT_LABELS, artifactUrl } from '../_lib/format';
import type { Artifact, AvailableArtifact } from '../_lib/types';

interface Props {
  artifacts: Artifact[];
  artifactsLoaded: boolean;
  availableArtifacts: AvailableArtifact[];
  canEdit: boolean;
  showArtifactPicker: boolean;
  setShowArtifactPicker: (v: boolean | ((prev: boolean) => boolean)) => void;
  artifactTypeFilter: string;
  setArtifactTypeFilter: (v: string) => void;
  addArtifact: (type: string, id: number) => void;
  toggleArtifactPin: (artifactDbId: number, pinned: boolean) => void;
  removeArtifact: (artifactDbId: number) => void;
}

export function CardArtifacts({
  artifacts,
  artifactsLoaded,
  availableArtifacts,
  canEdit,
  showArtifactPicker,
  setShowArtifactPicker,
  artifactTypeFilter,
  setArtifactTypeFilter,
  addArtifact,
  toggleArtifactPin,
  removeArtifact,
}: Props) {
  const filteredAvailable = availableArtifacts
    .filter(a => !artifactTypeFilter || a.type === artifactTypeFilter)
    .filter(a => !artifacts.some(linked => linked.artifactType === a.type && linked.artifactId === a.id));

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Artifacts {artifacts.length > 0 && `(${artifacts.length})`}
        </h3>
        {canEdit && (
          <button
            onClick={() => setShowArtifactPicker(v => !v)}
            className="flex items-center gap-1 text-xs text-primary hover:text-primary/80"
          >
            <span className="material-icons text-sm">{showArtifactPicker ? 'close' : 'add'}</span>
            {showArtifactPicker ? 'Close' : 'Link Artifact'}
          </button>
        )}
      </div>

      {showArtifactPicker && canEdit && (
        <div className="mb-3 p-3 rounded-lg border border-border bg-background/50 space-y-2">
          <div className="flex flex-wrap gap-1">
            <button
              onClick={() => setArtifactTypeFilter('')}
              className={`px-2 py-1 rounded text-xs font-medium transition-colors ${!artifactTypeFilter ? 'bg-primary text-primary-foreground' : 'bg-accent text-foreground hover:bg-accent/80'}`}
            >
              All
            </button>
            {Object.entries(ARTIFACT_LABELS).map(([type, label]) => (
              <button
                key={type}
                onClick={() => setArtifactTypeFilter(type)}
                className={`px-2 py-1 rounded text-xs font-medium transition-colors ${artifactTypeFilter === type ? 'bg-primary text-primary-foreground' : 'bg-accent text-foreground hover:bg-accent/80'}`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="max-h-48 overflow-y-auto space-y-1">
            {filteredAvailable.map(a => (
              <button
                key={`${a.type}-${a.id}`}
                onClick={() => addArtifact(a.type, a.id)}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs hover:bg-accent text-left"
              >
                <span className="material-icons text-sm text-muted-foreground">
                  {ARTIFACT_ICONS[a.type] || 'attachment'}
                </span>
                <span className="flex-1 truncate">{a.title}</span>
                <span className="text-[10px] text-muted-foreground ml-auto shrink-0">
                  {ARTIFACT_LABELS[a.type]}
                </span>
              </button>
            ))}
            {filteredAvailable.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-4">
                No available artifacts
                {artifactTypeFilter ? ` of type "${ARTIFACT_LABELS[artifactTypeFilter]}"` : ''}
              </p>
            )}
          </div>
        </div>
      )}

      {artifactsLoaded && artifacts.length === 0 && !showArtifactPicker && (
        <p className="text-xs text-muted-foreground italic">No artifacts linked.</p>
      )}

      {artifacts.length > 0 && (
        <div className="space-y-2">
          {artifacts.map(a => {
            const url = artifactUrl(a.artifactType, a.artifactId);
            return (
              <div
                key={a.id}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg border transition-colors ${a.pinned ? 'bg-primary/5 border-primary/20' : 'bg-card border-border'}`}
              >
                <span className="material-icons text-lg text-muted-foreground">
                  {ARTIFACT_ICONS[a.artifactType] || 'attachment'}
                </span>
                {url ? (
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 min-w-0 group"
                    title="Open artifact"
                  >
                    <p className="text-sm font-medium text-foreground truncate group-hover:text-primary group-hover:underline">
                      {a.displayTitle}
                    </p>
                    <p className="text-[10px] text-muted-foreground">{ARTIFACT_LABELS[a.artifactType]}</p>
                  </a>
                ) : (
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{a.displayTitle}</p>
                    <p className="text-[10px] text-muted-foreground">{ARTIFACT_LABELS[a.artifactType]}</p>
                  </div>
                )}
                {url && (
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1 rounded text-muted-foreground hover:text-primary hover:bg-accent transition-colors"
                    title="Open in new tab"
                  >
                    <span className="material-icons text-sm">open_in_new</span>
                  </a>
                )}
                {canEdit && (
                  <>
                    <button
                      onClick={() => toggleArtifactPin(a.id, !a.pinned)}
                      className={`p-1 rounded transition-colors ${a.pinned ? 'text-primary hover:bg-primary/10' : 'text-muted-foreground hover:bg-accent'}`}
                      title={a.pinned ? 'Unpin' : 'Pin'}
                    >
                      <span className="material-icons text-sm">push_pin</span>
                    </button>
                    <button
                      onClick={() => removeArtifact(a.id)}
                      className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                      title="Remove"
                    >
                      <span className="material-icons text-sm">close</span>
                    </button>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
