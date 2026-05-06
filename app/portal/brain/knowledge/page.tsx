'use client';

/**
 * Brain knowledge — IDE-style three-pane shell.
 *
 *   ┌──────────────┬──────────────────────────┬──────────────┐
 *   │  search…  +  │  Title    [edit|⊐|◉]    │ Outline ⌃   │
 *   │  filters…    │  ────────────────        │ Backlinks    │
 *   │  pinned ☐    │  metadata ▼              │ Fields       │
 *   │  tags  ▼     │                          │              │
 *   │ ────────     │  MarkdownEditor          │  …active     │
 *   │ ▾ Daily      │                          │   panel      │
 *   │ ▾ Discoveries│                          │              │
 *   │ ▾ Competitors│                          │              │
 *   │   …          │                          │              │
 *   └──────────────┴──────────────────────────┴──────────────┘
 *
 * Selection lives in the URL: `?id=N`. Switching notes is push-state, so
 * browser back/forward works. The right pane is collapsible — when
 * collapsed the shell renders a thin rail of icons that re-opens it.
 *
 * The standalone deep-link page at `/portal/brain/knowledge/[id]` stays
 * around as the "zen mode" (no list rail). The header's "open_in_full"
 * icon switches to it.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import type { EditorView } from '@codemirror/view';
import NoteListPane from '@/components/brain/NoteListPane';
import NoteEditorPane from '@/components/brain/NoteEditorPane';
import NoteOutlinePanel from '@/components/brain/NoteOutlinePanel';
import NoteBacklinksPanel from '@/components/brain/NoteBacklinksPanel';
import NoteCustomFieldsPanel from '@/components/brain/NoteCustomFieldsPanel';
import NoteHistoryPanel from '@/components/brain/NoteHistoryPanel';
import CommandPalette from '@/components/brain/CommandPalette';
import { pushRecentNoteId } from '@/lib/brain/recent-notes';

type SidePanel = 'outline' | 'backlinks' | 'fields' | 'history';
type MobileTab = 'list' | 'editor' | 'side';

interface BrainNote {
  id: number;
  title: string;
}

const MOBILE_TABS: Array<{ id: MobileTab; icon: string; label: string }> = [
  { id: 'list',   icon: 'list',         label: 'List' },
  { id: 'editor', icon: 'edit_note',    label: 'Editor' },
  { id: 'side',   icon: 'view_sidebar', label: 'Side' },
];

const SIDE_TABS: Array<{ id: SidePanel; icon: string; label: string }> = [
  { id: 'outline',   icon: 'segment', label: 'Outline' },
  { id: 'backlinks', icon: 'link',    label: 'Backlinks' },
  { id: 'fields',    icon: 'tune',    label: 'Fields' },
  { id: 'history',   icon: 'history', label: 'History' },
];

export default function BrainKnowledgePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const idParam = searchParams.get('id');
  const selectedId = idParam ? parseInt(idParam, 10) : null;

  const [refreshTick, setRefreshTick] = useState(0);
  const [activePanel, setActivePanel] = useState<SidePanel>('outline');
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [body, setBody] = useState('');
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [mobileTab, setMobileTab] = useState<MobileTab>('list');
  const editorViewRef = useRef<EditorView | null>(null);
  const isNarrow = useIsNarrow();

  const handleSelect = useCallback((id: number) => {
    pushRecentNoteId(id);
    const params = new URLSearchParams(searchParams.toString());
    params.set('id', String(id));
    router.push(`/portal/brain/knowledge?${params.toString()}`, { scroll: false });
    setMobileTab('editor');
  }, [router, searchParams]);

  const handleCreate = useCallback(async () => {
    const r = await fetch('/api/portal/brain/knowledge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Untitled', body: '' }),
    });
    const json = await r.json().catch(() => ({}));
    if (r.ok && json.success) {
      const created = json.data as BrainNote;
      setRefreshTick(t => t + 1);
      handleSelect(created.id);
    }
  }, [handleSelect]);

  const handleSaved = useCallback(() => {
    // Bump the list pane so the just-saved row gets the new title / updatedAt.
    setRefreshTick(t => t + 1);
  }, []);

  const handleTemplateApplied = useCallback((id: number) => {
    setRefreshTick(t => t + 1);
    handleSelect(id);
  }, [handleSelect]);

  const handleDeleted = useCallback((deletedId: number) => {
    setRefreshTick(t => t + 1);
    if (selectedId === deletedId) {
      const params = new URLSearchParams(searchParams.toString());
      params.delete('id');
      router.push(`/portal/brain/knowledge${params.toString() ? `?${params.toString()}` : ''}`, { scroll: false });
    }
  }, [selectedId, router, searchParams]);

  const handleEditorReady = useCallback((view: EditorView | null) => {
    editorViewRef.current = view;
  }, []);

  const getEditorView = useCallback(() => editorViewRef.current, []);

  // Reset the active panel to outline whenever the note changes — backlinks/
  // fields panels for the previous note shouldn't bleed over.
  useEffect(() => {
    setActivePanel('outline');
  }, [selectedId]);

  // Global Cmd-K / Ctrl-K to open the palette.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="fixed inset-0 top-[var(--portal-header-height,3.5rem)]">
      {isNarrow ? (
        <div className="h-full flex flex-col">
          <div className="flex-1 min-h-0 overflow-hidden pb-[calc(3rem+env(safe-area-inset-bottom))]">
            <div className={`h-full ${mobileTab === 'list' ? 'block' : 'hidden'}`}>
              <NoteListPane
                selectedId={selectedId}
                onSelect={handleSelect}
                onCreate={handleCreate}
                onTemplateApplied={handleTemplateApplied}
                refreshTick={refreshTick}
              />
            </div>
            <div className={`h-full ${mobileTab === 'editor' ? 'block' : 'hidden'}`}>
              <NoteEditorPane
                noteId={selectedId}
                onEditorReady={handleEditorReady}
                onSaved={handleSaved}
                onDeleted={handleDeleted}
                onBodyChange={setBody}
                onCreate={handleCreate}
              />
            </div>
            <div className={`h-full ${mobileTab === 'side' ? 'block' : 'hidden'}`}>
              <SidePanelHost
                noteId={selectedId}
                body={body}
                getEditorView={getEditorView}
                active={activePanel}
                onChangeActive={setActivePanel}
                onCollapse={() => setMobileTab('editor')}
              />
            </div>
          </div>
          <nav
            role="tablist"
            aria-label="Knowledge pane"
            className="fixed inset-x-0 bottom-0 z-30 flex border-t border-border bg-card pb-[env(safe-area-inset-bottom)]"
          >
            {MOBILE_TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={mobileTab === t.id}
                onClick={() => setMobileTab(t.id)}
                className={`flex-1 inline-flex flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-medium transition-colors ${
                  mobileTab === t.id
                    ? 'text-primary'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <span className="material-icons text-[20px]">{t.icon}</span>
                <span>{t.label}</span>
              </button>
            ))}
          </nav>
        </div>
      ) : (
        <PanelGroup direction="horizontal" autoSaveId="brain.knowledge.shell">
          <Panel
            defaultSize={20}
            minSize={14}
            maxSize={40}
            className="overflow-hidden"
          >
            <NoteListPane
              selectedId={selectedId}
              onSelect={handleSelect}
              onCreate={handleCreate}
              onTemplateApplied={handleTemplateApplied}
              refreshTick={refreshTick}
            />
          </Panel>

          <PanelResizeHandle className="w-px bg-border hover:bg-primary/40 transition-colors data-[resize-handle-active]:bg-primary" />

          <Panel defaultSize={rightCollapsed ? 80 : 55} minSize={30}>
            <NoteEditorPane
              noteId={selectedId}
              onEditorReady={handleEditorReady}
              onSaved={handleSaved}
              onDeleted={handleDeleted}
              onBodyChange={setBody}
              onCreate={handleCreate}
            />
          </Panel>

          {!rightCollapsed && (
            <>
              <PanelResizeHandle className="w-px bg-border hover:bg-primary/40 transition-colors data-[resize-handle-active]:bg-primary" />
              <Panel
                defaultSize={25}
                minSize={16}
                maxSize={40}
                className="overflow-hidden"
              >
                <SidePanelHost
                  noteId={selectedId}
                  body={body}
                  getEditorView={getEditorView}
                  active={activePanel}
                  onChangeActive={setActivePanel}
                  onCollapse={() => setRightCollapsed(true)}
                />
              </Panel>
            </>
          )}

          {rightCollapsed && (
            <CollapsedRightRail
              active={activePanel}
              onSelect={(id) => { setActivePanel(id); setRightCollapsed(false); }}
            />
          )}
        </PanelGroup>
      )}
      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        onCreate={handleCreate}
        selectedNoteId={selectedId}
      />
    </div>
  );
}

function SidePanelHost({
  noteId,
  body,
  getEditorView,
  active,
  onChangeActive,
  onCollapse,
}: {
  noteId: number | null;
  body: string;
  getEditorView: () => EditorView | null;
  active: SidePanel;
  onChangeActive: (p: SidePanel) => void;
  onCollapse: () => void;
}) {
  return (
    <div className="h-full flex flex-col bg-card border-l border-border min-w-0">
      <div className="flex border-b border-border bg-muted/30 min-w-0">
        <div className="flex-1 flex overflow-x-auto scrollbar-thin">
          {SIDE_TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={active === t.id}
              onClick={() => onChangeActive(t.id)}
              title={t.label}
              className={`shrink-0 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors ${
                active === t.id
                  ? 'text-foreground bg-background border-b-2 border-primary'
                  : 'text-muted-foreground hover:text-foreground hover:bg-background/60'
              }`}
            >
              <span className="material-icons text-sm">{t.icon}</span>
              <span className="hidden xl:inline">{t.label}</span>
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={onCollapse}
          title="Collapse panel"
          aria-label="Collapse right panel"
          className="shrink-0 px-2 py-2 text-muted-foreground hover:text-foreground hover:bg-background/60"
        >
          <span className="material-icons text-sm">chevron_right</span>
        </button>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto">
        {noteId === null ? (
          <div className="p-6 text-center text-xs text-muted-foreground">
            Pick a note to see its outline, backlinks, and fields.
          </div>
        ) : (
          <>
            {active === 'outline' && (
              <NoteOutlinePanel body={body} getEditorView={getEditorView} />
            )}
            {active === 'backlinks' && (
              <NoteBacklinksPanel noteId={noteId} />
            )}
            {active === 'history' && (
              <NoteHistoryPanel noteId={noteId} />
            )}
            {active === 'fields' && (
              <NoteCustomFieldsPanel noteId={noteId} />
            )}
          </>
        )}
      </div>
    </div>
  );
}

function useIsNarrow(): boolean {
  const [isNarrow, setIsNarrow] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia('(max-width: 767px)');
    const update = () => setIsNarrow(mql.matches);
    update();
    mql.addEventListener('change', update);
    return () => mql.removeEventListener('change', update);
  }, []);
  return isNarrow;
}

function CollapsedRightRail({
  active,
  onSelect,
}: {
  active: SidePanel;
  onSelect: (p: SidePanel) => void;
}) {
  return (
    <div className="border-l border-border bg-card w-9 flex flex-col items-center py-2 gap-1">
      {SIDE_TABS.map(t => (
        <button
          key={t.id}
          type="button"
          onClick={() => onSelect(t.id)}
          title={t.label}
          aria-label={t.label}
          className={`h-7 w-7 inline-flex items-center justify-center rounded transition-colors ${
            active === t.id
              ? 'bg-primary/10 text-primary'
              : 'text-muted-foreground hover:bg-muted/60'
          }`}
        >
          <span className="material-icons text-base">{t.icon}</span>
        </button>
      ))}
    </div>
  );
}
