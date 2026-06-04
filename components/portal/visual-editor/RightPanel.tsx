'use client';

import dynamic from 'next/dynamic';
import { DynamicPropertyPanel } from '../DynamicPropertyPanel';
import { StyleVariantsButton } from '@/components/blocks/visual/StyleVariantsButton';
import type { Block, ColumnsBlock } from '@/types/blocks';
import type { Breakpoint } from '@/types/responsive';
import type { ComponentManifestEntry } from '@/types/visual-editor';
import { ElementStyleEditor } from './ElementStyleEditor';
import { BLOCK_ICON_MAP } from './_lib/block-icon-map';

/**
 * Lazy-load the heavy per-block content editor. BlockContentEditor is 2000+ LoC
 * and statically imports HtmlRenderEditor (1700 LoC, pulls @codemirror/lang-html
 * + @dnd-kit). Splitting the chunk shaves a couple hundred KB of JS off the
 * initial editor route — the form panel is only needed once a block is selected
 * AND the user is on the Content tab.
 */
const EditorPanelSkeleton = () => (
  <div className="space-y-2 animate-pulse">
    <div className="h-3 w-20 bg-muted rounded" />
    <div className="h-8 bg-muted rounded" />
    <div className="h-3 w-16 bg-muted rounded" />
    <div className="h-8 bg-muted rounded" />
  </div>
);

const BlockContentEditor = dynamic(
  () => import('./BlockContentEditor').then((m) => ({ default: m.BlockContentEditor })),
  { ssr: false, loading: () => <EditorPanelSkeleton /> },
);

/**
 * Right side panel — collapsible chrome that hosts the per-block content/style
 * editor, the multi-select bulk actions + style merge, and the no-selection
 * placeholder.
 *
 * `selectedCustomManifest` flips the content tab from BlockContentEditor (the
 * giant per-type form) to DynamicPropertyPanel (driven by the custom-component
 * input manifest). The bulk-style merge preserves nested `style`,
 * `elementStyles`, and `responsive` slots — a flat spread would clobber a
 * card-grid's per-card overrides.
 */
export function RightPanel({
  rightCollapsed,
  setRightCollapsed,
  isMultiSelect,
  selectedBlockIds,
  selectedBlock,
  selectedCustomManifest,
  blocks,
  rightPanelTab,
  setRightPanelTab,
  siteId,
  currentViewport,
  onBlocksChange,
  handleUpdateBlock,
  onDeleteBlock,
  bulkDuplicate,
  bulkGroup,
  bulkDelete,
  noSelectionPanel,
}: {
  rightCollapsed: boolean;
  setRightCollapsed: (v: boolean | ((prev: boolean) => boolean)) => void;
  isMultiSelect: boolean;
  selectedBlockIds: string[];
  selectedBlock: Block | null | undefined;
  selectedCustomManifest: ComponentManifestEntry | null | undefined;
  blocks: Block[];
  rightPanelTab: 'content' | 'style';
  setRightPanelTab: (v: 'content' | 'style') => void;
  siteId?: number;
  currentViewport: Breakpoint;
  onBlocksChange: (blocks: Block[]) => void;
  handleUpdateBlock: (blockId: string, updates: Partial<Block>) => void;
  onDeleteBlock: (blockId: string) => void;
  bulkDuplicate: () => void;
  bulkGroup: () => void;
  bulkDelete: () => void;
  noSelectionPanel?: React.ReactNode;
}) {
  return (
    <div className={`flex-shrink-0 transition-all duration-200 ${
      rightCollapsed
        ? 'w-0 relative'
        // Below md the expanded panel is a fixed overlay (doesn't squeeze the
        // iframe to negative width on phones); at md+ it stays inline as before.
        : 'fixed inset-y-0 right-0 z-30 w-80 max-w-[90vw] md:relative md:inset-y-auto md:max-w-none'
    }`}>
      <button
        onClick={() => setRightCollapsed((v) => !v)}
        className="absolute top-1/2 -translate-y-1/2 -left-3.5 z-30 w-7 h-10 flex items-center justify-center rounded-l-md bg-card border border-r-0 border-border text-muted-foreground hover:text-foreground hover:bg-accent transition-colors shadow-sm"
        title={rightCollapsed ? 'Expand panel' : 'Collapse panel'}
      >
        <span className="material-icons text-sm">{rightCollapsed ? 'chevron_left' : 'chevron_right'}</span>
      </button>
      <div className="h-full border-l border-border bg-card flex flex-col overflow-hidden">
        {!rightCollapsed && (
          <>
            {isMultiSelect ? (
              <MultiSelectPane
                count={selectedBlockIds.length}
                selectedBlock={selectedBlock}
                blocks={blocks}
                selectedBlockIds={selectedBlockIds}
                currentViewport={currentViewport}
                onBlocksChange={onBlocksChange}
                bulkDuplicate={bulkDuplicate}
                bulkGroup={bulkGroup}
                bulkDelete={bulkDelete}
              />
            ) : selectedBlock ? (
              <SingleBlockPane
                selectedBlock={selectedBlock}
                selectedCustomManifest={selectedCustomManifest}
                rightPanelTab={rightPanelTab}
                setRightPanelTab={setRightPanelTab}
                siteId={siteId}
                currentViewport={currentViewport}
                onDeleteBlock={onDeleteBlock}
                handleUpdateBlock={handleUpdateBlock}
              />
            ) : noSelectionPanel ? (
              <div className="flex-1 overflow-y-auto p-4">{noSelectionPanel}</div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-center p-6 text-muted-foreground">
                <span className="material-icons text-3xl mb-2">touch_app</span>
                <p className="text-sm">Click a block to edit</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function MultiSelectPane({
  count,
  selectedBlock,
  blocks,
  selectedBlockIds,
  currentViewport,
  onBlocksChange,
  bulkDuplicate,
  bulkGroup,
  bulkDelete,
}: {
  count: number;
  selectedBlock: Block | null | undefined;
  blocks: Block[];
  selectedBlockIds: string[];
  currentViewport: Breakpoint;
  onBlocksChange: (blocks: Block[]) => void;
  bulkDuplicate: () => void;
  bulkGroup: () => void;
  bulkDelete: () => void;
}) {
  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <span className="material-icons text-base text-primary">select_all</span>
          <span className="text-sm font-semibold text-foreground">{count} blocks selected</span>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Shift+click to extend, {'⌘'}+click to toggle
        </p>
      </div>

      {/* Bulk action buttons */}
      <div className="px-4 py-3 border-b border-border shrink-0">
        <div className="flex gap-2">
          <button type="button" onClick={bulkDuplicate} className="flex items-center gap-1.5 flex-1 justify-center rounded border border-border px-2 py-1.5 text-xs hover:bg-accent transition-colors">
            <span className="material-icons text-sm text-muted-foreground">content_copy</span>
            Duplicate
          </button>
          <button type="button" onClick={bulkGroup} className="flex items-center gap-1.5 flex-1 justify-center rounded border border-border px-2 py-1.5 text-xs hover:bg-accent transition-colors">
            <span className="material-icons text-sm text-muted-foreground">crop_free</span>
            Group
          </button>
          <button type="button" onClick={bulkDelete} className="flex items-center gap-1.5 justify-center rounded border border-border px-2 py-1.5 text-xs hover:bg-destructive/10 transition-colors">
            <span className="material-icons text-sm text-destructive">delete</span>
          </button>
        </div>
      </div>

      {/* Full style editor — changes apply to all selected blocks */}
      <div className="flex-1 overflow-y-auto p-4">
        {selectedBlock && (
          <ElementStyleEditor
            block={selectedBlock}
            onChange={(updates) => {
              const updatedBlocks = applyMergedUpdatesToTree(blocks, selectedBlockIds, updates);
              onBlocksChange(updatedBlocks);
            }}
            currentViewport={currentViewport}
          />
        )}
      </div>
    </div>
  );
}

/**
 * Recursively merge a partial block update into every selected block at any
 * depth. Style, elementStyles, and responsive get shallow-merged into their
 * existing counterparts so per-element/per-breakpoint overrides survive a
 * bulk style change. Other top-level properties get a flat overwrite.
 */
function applyMergedUpdatesToTree(blocks: Block[], selectedBlockIds: string[], updates: Partial<Block>): Block[] {
  const mergeUpdates = (block: Block, upd: Partial<Block>): Block => {
    const merged = { ...block } as Record<string, unknown>;
    if (upd.style) {
      merged.style = { ...((block.style || {}) as Record<string, unknown>), ...upd.style };
    }
    if ((upd as Record<string, unknown>).elementStyles) {
      const existing = (block as unknown as Record<string, unknown>).elementStyles as Record<string, Record<string, unknown>> || {};
      const incoming = (upd as unknown as Record<string, unknown>).elementStyles as Record<string, Record<string, unknown>>;
      const result = { ...existing };
      for (const key of Object.keys(incoming)) {
        result[key] = { ...(existing[key] || {}), ...incoming[key] };
      }
      merged.elementStyles = result;
    }
    if ((upd as Record<string, unknown>).responsive) {
      const existing = (block as unknown as Record<string, unknown>).responsive as Record<string, unknown> || {};
      const incoming = (upd as unknown as Record<string, unknown>).responsive as Record<string, unknown>;
      const result = { ...existing };
      for (const key of Object.keys(incoming)) {
        result[key] = { ...((existing[key] as Record<string, unknown>) || {}), ...(incoming[key] as Record<string, unknown>) };
      }
      merged.responsive = result;
    }
    for (const key of Object.keys(upd)) {
      if (key !== 'style' && key !== 'elementStyles' && key !== 'responsive') {
        merged[key] = (upd as Record<string, unknown>)[key];
      }
    }
    return merged as unknown as Block;
  };

  const applyToTree = (blockList: Block[]): Block[] => {
    return blockList.map((b) => {
      if (selectedBlockIds.includes(b.id)) {
        return mergeUpdates(b, updates);
      }
      if (b.type === 'columns') {
        const col = b as ColumnsBlock;
        return { ...col, columns: col.columns.map((c) => ({ ...c, blocks: applyToTree(c.blocks) })) } as Block;
      }
      if (b.type === 'section' && 'blocks' in b) {
        const sec = b as Block & { blocks: Block[] };
        return { ...sec, blocks: applyToTree(sec.blocks) } as Block;
      }
      if (b.type === 'tabs' && 'tabs' in b) {
        const tabs = b as Block & { tabs: { id: string; label: string; blocks: Block[] }[] };
        return { ...tabs, tabs: tabs.tabs.map((t) => ({ ...t, blocks: applyToTree(t.blocks) })) } as Block;
      }
      return b;
    });
  };

  return applyToTree(blocks);
}

function SingleBlockPane({
  selectedBlock,
  selectedCustomManifest,
  rightPanelTab,
  setRightPanelTab,
  siteId,
  currentViewport,
  onDeleteBlock,
  handleUpdateBlock,
}: {
  selectedBlock: Block;
  selectedCustomManifest: ComponentManifestEntry | null | undefined;
  rightPanelTab: 'content' | 'style';
  setRightPanelTab: (v: 'content' | 'style') => void;
  siteId?: number;
  currentViewport: Breakpoint;
  onDeleteBlock: (blockId: string) => void;
  handleUpdateBlock: (blockId: string, updates: Partial<Block>) => void;
}) {
  return (
    <>
      {/* Block header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <span className="material-icons text-base text-muted-foreground">{BLOCK_ICON_MAP[selectedBlock.type] || 'widgets'}</span>
          <span className="text-sm font-semibold text-foreground capitalize">{selectedBlock.type.replace('-', ' ')}</span>
        </div>
        <div className="flex items-center gap-1">
          {selectedBlock.required ? (
            <span className="p-1 text-muted-foreground/40" title="Required block">
              <span className="material-icons text-base">lock</span>
            </span>
          ) : (
            <button type="button" onClick={() => onDeleteBlock(selectedBlock.id)} className="p-1 text-muted-foreground hover:text-destructive" title="Delete">
              <span className="material-icons text-base">delete</span>
            </button>
          )}
        </div>
      </div>

      {/* Anchor ID field (universal to all blocks) */}
      <div className="px-4 py-2 border-b border-border shrink-0">
        <label className="flex items-center gap-1.5 text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">
          <span className="material-icons text-xs">link</span>
          Anchor ID
        </label>
        <div className="flex items-center gap-1 bg-background border border-border rounded-lg px-2 py-1 focus-within:ring-2 focus-within:ring-primary/40">
          <span className="text-xs text-muted-foreground select-none">#</span>
          <input
            type="text"
            value={selectedBlock.anchor || ''}
            onChange={(e) => handleUpdateBlock(selectedBlock.id, { anchor: e.target.value.replace(/[^a-zA-Z0-9-_]/g, '').toLowerCase() } as Partial<Block>)}
            placeholder="my-section"
            className="flex-1 min-w-0 bg-transparent text-xs text-foreground outline-none font-mono"
          />
        </div>
        <p className="text-[10px] text-muted-foreground/70 mt-1">
          Used for #jumplink URLs like /page#{selectedBlock.anchor || 'my-section'}
        </p>
      </div>

      {/* Content / Style tabs */}
      <div className="flex border-b border-border shrink-0">
        <button type="button" onClick={() => setRightPanelTab('content')}
          className={`flex-1 py-2 text-xs font-medium ${rightPanelTab === 'content' ? 'text-primary border-b-2 border-primary' : 'text-muted-foreground hover:text-foreground'}`}
        >Content</button>
        <button type="button" onClick={() => setRightPanelTab('style')}
          className={`flex-1 py-2 text-xs font-medium ${rightPanelTab === 'style' ? 'text-primary border-b-2 border-primary' : 'text-muted-foreground hover:text-foreground'}`}
        >Style</button>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-4">
        {rightPanelTab === 'content' ? (
          selectedCustomManifest ? (
            <DynamicPropertyPanel
              inputs={selectedCustomManifest.inputs}
              values={{ ...selectedCustomManifest.defaultProps, ...(selectedBlock as unknown as Record<string, unknown>) }}
              onChange={(name, value) => handleUpdateBlock(selectedBlock.id, { [name]: value } as Partial<Block>)}
              siteId={siteId}
            />
          ) : (
            <BlockContentEditor block={selectedBlock} onUpdate={(updates) => handleUpdateBlock(selectedBlock.id, updates)} siteId={siteId} />
          )
        ) : (
          <>
            {siteId !== undefined && (
              <StyleVariantsButton
                block={selectedBlock}
                siteId={siteId}
                onApply={(delta) => handleUpdateBlock(selectedBlock.id, delta as Partial<Block>)}
              />
            )}
            <ElementStyleEditor
              block={selectedBlock}
              onChange={(updates) => handleUpdateBlock(selectedBlock.id, updates)}
              currentViewport={currentViewport}
            />
          </>
        )}
      </div>
    </>
  );
}
